"use strict";

exports.__esModule = true;
exports.default = void 0;

var _router = _interopRequireDefault(require("./router"));

var _http = _interopRequireDefault(require("http"));

var _https = _interopRequireDefault(require("https"));

var urlUtils = _interopRequireWildcard(require("../utils/url"));

var _readFileRelative = require("read-file-relative");

var _http2 = require("../utils/http");

var _requestPipeline = require("../request-pipeline");

var _createShadowStylesheet = _interopRequireDefault(require("../shadow-ui/create-shadow-stylesheet"));

var _agent = require("../request-pipeline/destination-request/agent");

var _serviceRoutes = _interopRequireDefault(require("./service-routes"));

var _builtinHeaderNames = _interopRequireDefault(require("../request-pipeline/builtin-header-names"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const SESSION_IS_NOT_OPENED_ERR = 'Session is not opened in proxy';

function parseAsJson(msg) {
  try {
    return JSON.parse(msg.toString());
  } catch (err) {
    return null;
  }
}

function createServerInfo(hostname, port, crossDomainPort, protocol) {
  return {
    hostname: hostname,
    port: port,
    crossDomainPort: crossDomainPort,
    protocol: protocol,
    domain: `${protocol}//${hostname}:${port}`
  };
}

class Proxy extends _router.default {
  constructor(hostname, port1, port2, options = {}) {
    super(options);

    _defineProperty(this, "openSessions", new Map());

    _defineProperty(this, "server1Info", void 0);

    _defineProperty(this, "server2Info", void 0);

    _defineProperty(this, "server1", void 0);

    _defineProperty(this, "server2", void 0);

    _defineProperty(this, "sockets", void 0);

    const {
      ssl,
      developmentMode
    } = options;
    const protocol = ssl ? 'https:' : 'http:';
    this.server1Info = createServerInfo(hostname, port1, port2, protocol);
    this.server2Info = createServerInfo(hostname, port2, port1, protocol);

    if (ssl) {
      this.server1 = _https.default.createServer(ssl, (req, res) => this._onRequest(req, res, this.server1Info));
      this.server2 = _https.default.createServer(ssl, (req, res) => this._onRequest(req, res, this.server2Info));
    } else {
      this.server1 = _http.default.createServer((req, res) => this._onRequest(req, res, this.server1Info));
      this.server2 = _http.default.createServer((req, res) => this._onRequest(req, res, this.server2Info));
    }

    this.server1.on('upgrade', (req, socket, head) => this._onUpgradeRequest(req, socket, head, this.server1Info));
    this.server2.on('upgrade', (req, socket, head) => this._onUpgradeRequest(req, socket, head, this.server2Info));
    this.server1.listen(port1);
    this.server2.listen(port2);
    this.sockets = new Set(); // BUG: GH-89

    this._startSocketsCollecting();

    this._registerServiceRoutes(developmentMode);
  }

  _closeSockets() {
    this.sockets.forEach(socket => socket.destroy());
  }

  _startSocketsCollecting() {
    const handler = socket => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    };

    this.server1.on('connection', handler);
    this.server2.on('connection', handler);
  }

  _registerServiceRoutes(developmentMode) {
    const developmentModeSuffix = developmentMode ? '' : '.min';
    const hammerheadFileName = `hammerhead${developmentModeSuffix}.js`;
    const hammerheadScriptContent = (0, _readFileRelative.readSync)(`../client/${hammerheadFileName}`);
    const transportWorkerFileName = `transport-worker${developmentModeSuffix}.js`;
    const transportWorkerContent = (0, _readFileRelative.readSync)(`../client/${transportWorkerFileName}`);
    this.GET(_serviceRoutes.default.hammerhead, {
      contentType: 'application/x-javascript',
      content: hammerheadScriptContent
    });
    this.GET(_serviceRoutes.default.transportWorker, {
      contentType: 'application/x-javascript',
      content: transportWorkerContent
    });
    this.POST(_serviceRoutes.default.messaging, (req, res, serverInfo) => this._onServiceMessage(req, res, serverInfo));
    this.GET(_serviceRoutes.default.task, (req, res, serverInfo) => this._onTaskScriptRequest(req, res, serverInfo, false));
    this.GET(_serviceRoutes.default.iframeTask, (req, res, serverInfo) => this._onTaskScriptRequest(req, res, serverInfo, true));
  }

  async _onServiceMessage(req, res, serverInfo) {
    const body = await (0, _http2.fetchBody)(req);
    const msg = parseAsJson(body);
    const session = msg && this.openSessions.get(msg.sessionId);

    if (session) {
      try {
        const result = await session.handleServiceMessage(msg, serverInfo);
        (0, _http2.respondWithJSON)(res, result, false);
      } catch (err) {
        (0, _http2.respond500)(res, err.toString());
      }
    } else (0, _http2.respond500)(res, SESSION_IS_NOT_OPENED_ERR);
  }

  _onTaskScriptRequest(req, res, serverInfo, isIframe) {
    const referer = req.headers[_builtinHeaderNames.default.referer];
    const refererDest = referer && urlUtils.parseProxyUrl(referer);
    const session = refererDest && this.openSessions.get(refererDest.sessionId);
    const windowId = refererDest && refererDest.windowId;

    if (session) {
      res.setHeader(_builtinHeaderNames.default.contentType, 'application/x-javascript');
      (0, _http2.addPreventCachingHeaders)(res);
      const taskScript = session.getTaskScript({
        referer,
        cookieUrl: refererDest.destUrl,
        serverInfo,
        isIframe,
        withPayload: true,
        windowId
      });
      res.end(taskScript);
    } else (0, _http2.respond500)(res, SESSION_IS_NOT_OPENED_ERR);
  }

  _onRequest(req, res, serverInfo) {
    // NOTE: Not a service request, execute the proxy pipeline.
    if (!this._route(req, res, serverInfo)) (0, _requestPipeline.run)(req, res, serverInfo, this.openSessions);
  }

  _onUpgradeRequest(req, socket, head, serverInfo) {
    if (head && head.length) socket.unshift(head);

    this._onRequest(req, socket, serverInfo);
  }

  _processStaticContent(handler) {
    if (handler.isShadowUIStylesheet) handler.content = (0, _createShadowStylesheet.default)(handler.content);
  } // API


  close() {
    this.server1.close();
    this.server2.close();

    this._closeSockets();

    (0, _agent.resetKeepAliveConnections)();
  }

  openSession(url, session, externalProxySettings) {
    session.proxy = this;
    this.openSessions.set(session.id, session);
    if (externalProxySettings) session.setExternalProxySettings(externalProxySettings);
    url = urlUtils.prepareUrl(url);
    return urlUtils.getProxyUrl(url, {
      proxyHostname: this.server1Info.hostname,
      proxyPort: this.server1Info.port,
      proxyProtocol: this.server1Info.protocol,
      sessionId: session.id,
      windowId: session.windowId
    });
  }

  closeSession(session) {
    session.proxy = null;
    this.openSessions.delete(session.id);
  }

}

exports.default = Proxy;
module.exports = exports.default;