"use strict";

exports.__esModule = true;
exports.default = void 0;

var _http = _interopRequireDefault(require("http"));

var _https = _interopRequireDefault(require("https"));

var _lodash = require("lodash");

var _semver = _interopRequireDefault(require("semver"));

var requestAgent = _interopRequireWildcard(require("./agent"));

var _events = require("events");

var _webauth = require("webauth");

var _connectionResetGuard = _interopRequireDefault(require("../connection-reset-guard"));

var _messages = require("../../messages");

var _headerTransforms = require("../header-transforms");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const TUNNELING_SOCKET_ERR_RE = /tunneling socket could not be established/i;
const TUNNELING_AUTHORIZE_ERR_RE = /statusCode=407/i;
const SOCKET_HANG_UP_ERR_RE = /socket hang up/i;
const IS_DNS_ERR_MSG_RE = /ECONNREFUSED|ENOTFOUND|EPROTO/;
const IS_DNS_ERR_CODE_RE = /ECONNRESET/; // NOTE: Starting from 8.6 version, Node.js changes behavior related with sending requests
// to sites using SSL2 and SSL3 protocol versions. It affects the https core module
// and can break a proxying of some sites. This is why, we are forced to use the special hack.
// For details, see https://github.com/nodejs/node/issues/16196

const IS_NODE_VERSION_GREATER_THAN_8_5 = _semver.default.gt(process.version, '8.5.0');

class DestinationRequest extends _events.EventEmitter {
  constructor(opts) {
    super();

    _defineProperty(this, "req", void 0);

    _defineProperty(this, "hasResponse", false);

    _defineProperty(this, "credentialsSent", false);

    _defineProperty(this, "aborted", false);

    _defineProperty(this, "opts", void 0);

    _defineProperty(this, "isHttps", void 0);

    _defineProperty(this, "protocolInterface", void 0);

    this.opts = opts;
    this.isHttps = opts.protocol === 'https:';
    this.protocolInterface = this.isHttps ? _https.default : _http.default; // NOTE: Ignore SSL auth.

    if (this.isHttps) {
      opts.rejectUnauthorized = false;
      if (IS_NODE_VERSION_GREATER_THAN_8_5) opts.ecdhCurve = 'auto';
    }

    requestAgent.assign(this.opts);

    this._send();
  }

  _send(waitForData) {
    (0, _connectionResetGuard.default)(() => {
      const timeout = this.opts.isAjax ? DestinationRequest.AJAX_TIMEOUT : DestinationRequest.TIMEOUT;
      const storedHeaders = this.opts.headers; // NOTE: The headers are converted to raw headers because some sites ignore headers in a lower case. (GH-1380)
      // We also need to restore the request option headers to a lower case because headers may change
      // if a request is unauthorized, so there can be duplicated headers, for example, 'www-authenticate' and 'WWW-Authenticate'.

      this.opts.headers = (0, _headerTransforms.transformHeadersCaseToRaw)(this.opts.headers, this.opts.rawHeaders);
      this.req = this.protocolInterface.request(this.opts, res => {
        if (waitForData) {
          res.on('data', _lodash.noop);
          res.once('end', () => this._onResponse(res));
        }
      });
      this.opts.headers = storedHeaders;
      if (!waitForData) this.req.on('response', res => this._onResponse(res));
      this.req.on('error', err => this._onError(err));
      this.req.on('upgrade', (res, socket, head) => this._onUpgrade(res, socket, head));
      this.req.setTimeout(timeout, () => this._onTimeout());
      this.req.write(this.opts.body);
      this.req.end();
    });
  }

  _shouldResendWithCredentials(res) {
    if (res.statusCode === 401 && this.opts.credentials) {
      const authInfo = (0, _webauth.getAuthInfo)(res); // NOTE: If we get 401 status code after credentials are sent, we should stop trying to authenticate.

      if (!authInfo.isChallengeMessage && this.credentialsSent) return false;
      return authInfo.canAuthorize;
    }

    return false;
  }

  _onResponse(res) {
    if (this._shouldResendWithCredentials(res)) this._resendWithCredentials(res);else if (!this.isHttps && this.opts.proxy && res.statusCode === 407) this._fatalError(_messages.MESSAGE.cantAuthorizeToProxy, this.opts.proxy.host);else {
      this.hasResponse = true;
      this.emit('response', res);
    }
  }

  _onUpgrade(res, socket, head) {
    if (head && head.length) socket.unshift(head);

    this._onResponse(res);
  }

  async _resendWithCredentials(res) {
    (0, _webauth.addCredentials)(this.opts.credentials, this.opts, res, this.protocolInterface);
    this.credentialsSent = true; // NOTE: NTLM authentication requires using the same socket for the "negotiate" and "authenticate" requests.
    // So, before sending the "authenticate" message, we should wait for data from the "challenge" response. It
    // will mean that the socket is free.

    this._send((0, _webauth.requiresResBody)(res));
  }

  _fatalError(msg, url) {
    if (!this.aborted) {
      this.aborted = true;
      this.req.abort();
      this.emit('fatalError', (0, _messages.getText)(msg, url || this.opts.url));
    }
  }

  _isDNSErr(err) {
    return err.message && IS_DNS_ERR_MSG_RE.test(err.message) || !this.aborted && !this.hasResponse && err.code && IS_DNS_ERR_CODE_RE.test(err.code);
  }

  _isTunnelingErr(err) {
    return this.isHttps && this.opts.proxy && err.message && TUNNELING_SOCKET_ERR_RE.test(err.message);
  }

  _isSocketHangUpErr(err) {
    return err.message && SOCKET_HANG_UP_ERR_RE.test(err.message) && // NOTE: At this moment, we determinate the socket hand up error by internal stack trace.
    // TODO: After what we will change minimal node.js version up to 8 need to rethink this code.
    err.stack && (err.stack.includes('createHangUpError') || err.stack.includes('connResetException'));
  }

  _onTimeout() {
    // NOTE: this handler is also called if we get an error response (for example, 404). So, we should check
    // for the response presence before raising the timeout error.
    if (!this.hasResponse) this._fatalError(_messages.MESSAGE.destRequestTimeout);
  }

  _onError(err) {
    if (this._isSocketHangUpErr(err)) this.emit('socketHangUp');else if (requestAgent.shouldRegressHttps(err, this.opts)) {
      requestAgent.regressHttps(this.opts);

      this._send();
    } else if (this._isTunnelingErr(err)) {
      if (TUNNELING_AUTHORIZE_ERR_RE.test(err.message)) this._fatalError(_messages.MESSAGE.cantAuthorizeToProxy, this.opts.proxy.host);else this._fatalError(_messages.MESSAGE.cantEstablishTunnelingConnection, this.opts.proxy.host);
    } else if (this._isDNSErr(err)) {
      if (!this.isHttps && this.opts.proxy) this._fatalError(_messages.MESSAGE.cantEstablishProxyConnection, this.opts.proxy.host);else this._fatalError(_messages.MESSAGE.cantResolveUrl);
    } else this.emit('error', err);
  }

}

exports.default = DestinationRequest;

_defineProperty(DestinationRequest, "TIMEOUT", 25 * 1000);

_defineProperty(DestinationRequest, "AJAX_TIMEOUT", 2 * 60 * 1000);

module.exports = exports.default;