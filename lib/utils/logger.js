"use strict";

exports.__esModule = true;
exports.default = void 0;

var _debug = _interopRequireDefault(require("debug"));

var _errToString = _interopRequireDefault(require("./err-to-string"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getIncorrectErrorTypeMessage(err) {
  const errType = typeof err;
  return `The "${(0, _errToString.default)(err)}" error of the "${errType}" type was passed. Make sure that service message handlers throw errors of the Error type.`;
}

_debug.default.formatters.i = ctx => {
  const stringifiedInfoArr = [];
  const contentInfo = ctx.contentInfo;
  if (ctx.isPage) stringifiedInfoArr.push('isPage');
  if (ctx.isIframe) stringifiedInfoArr.push('isIframe');
  if (ctx.isAjax) stringifiedInfoArr.push('isAjax');
  if (ctx.isWebSocket) stringifiedInfoArr.push('isWebSocket');
  if (contentInfo.isCSS) stringifiedInfoArr.push('isCSS');
  if (contentInfo.isScript) stringifiedInfoArr.push('isScript');
  if (contentInfo.isManifest) stringifiedInfoArr.push('isManifest');
  if (contentInfo.isFileDownload) stringifiedInfoArr.push('isFileDownload');
  if (ctx.contentInfo.isNotModified) stringifiedInfoArr.push('isNotModified');
  if (contentInfo.isRedirect) stringifiedInfoArr.push('isRedirect');
  if (contentInfo.isIframeWithImageSrc) stringifiedInfoArr.push('isIframeWithImageSrc');
  if (contentInfo.charset) stringifiedInfoArr.push('charset: ' + contentInfo.charset.get());
  stringifiedInfoArr.push('encoding: ' + contentInfo.encoding);
  stringifiedInfoArr.push('requireProcessing: ' + contentInfo.requireProcessing);
  return `{ ${stringifiedInfoArr.join(', ')} }`;
};

const hammerhead = (0, _debug.default)('hammerhead');
const proxyLogger = hammerhead.extend('proxy');
const destinationLogger = hammerhead.extend('destination');
const cachedDestinationLogger = destinationLogger.extend('cached');
const destinationSocketLogger = destinationLogger.extend('socket');
const serviceMsgLogger = hammerhead.extend('service-message');
const proxy = {
  onRequest: ctx => {
    proxyLogger('Proxy request %s %s %s %j', ctx.requestId, ctx.req.method, ctx.req.url, ctx.req.headers);
  },
  onResponse: (ctx, headers) => {
    proxyLogger('Proxy response %s %d %j', ctx.requestId, ctx.destRes.statusCode, headers);
  },
  onRequestError: ctx => {
    proxyLogger('Proxy error: request to proxy cannot be dispatched %s, responding 404', ctx.requestId);
  },
  onWebSocketResponseError: (ctx, e) => {
    proxyLogger('Proxy error %s %o', ctx.requestId, e);
  },
  onCORSFailed: ctx => {
    proxyLogger('Proxy CORS check failed %s', ctx.requestId);
  },
  onContentInfoBuilt: ctx => {
    proxyLogger('Proxy resource content info %s %i', ctx.requestId, ctx);
  }
};
const serviceMsg = {
  onMessage: (msg, result) => {
    serviceMsgLogger('Service message %j, result %j', msg, result);
  },
  onError: (msg, err) => {
    const isError = err instanceof Error;
    const errMsg = isError ? err : getIncorrectErrorTypeMessage(err);
    serviceMsgLogger('Service message %j, error %o', msg, errMsg);
  }
};
const destination = {
  onMockedRequest: ctx => {
    destinationLogger('Destination request is mocked %s %s %j', ctx.requestId, ctx.mock.statusCode, ctx.mock.headers);
  },
  onRequest: opts => {
    destinationLogger('Destination request %s %s %s %j', opts.requestId, opts.method, opts.url, opts.headers);
  },
  onCachedRequest: (opts, hitCount) => {
    cachedDestinationLogger('Cached destination request %s %s %s %j (hitCount: %d)', opts.requestId, opts.method, opts.url, opts.headers, hitCount);
  },
  onUpgradeRequest: (opts, res) => {
    destinationLogger('Destination upgrade %s %d %j', opts.requestId, res.statusCode, res.headers);
  },
  onResponse: (opts, res) => {
    destinationLogger('Destination response %s %d %j', opts.requestId, res.statusCode, res.headers);
  },
  onProxyAuthenticationError: opts => {
    destinationLogger('Destination error: Cannot authorize to proxy %s', opts.requestId);
  },
  onResendWithCredentials: opts => {
    destinationLogger('Destination request resent with credentials %s', opts.requestId);
  },
  onFileRead: ctx => {
    destinationLogger('Read file %s %s', ctx.requestId, ctx.reqOpts.url);
  },
  onFileReadError: (ctx, err) => {
    destinationLogger('File read error %s %o', ctx.requestId, err);
  },
  onTimeoutError: (opts, timeout) => {
    destinationLogger('Destination request timeout %s (%d ms)', opts.requestId, timeout);
  },
  onError: (opts, err) => {
    destinationLogger('Destination error %s %o', opts.requestId, err);
  }
};
const destinationSocket = {
  enabled: destinationSocketLogger.enabled,
  onFirstChunk: (opts, data) => {
    destinationSocketLogger('Destination request socket first chunk of data %s %d %s', opts.requestId, data.length, JSON.stringify(data.toString()));
  },
  onError: (opts, err) => {
    destinationSocketLogger('Destination request socket error %s %o', opts.requestId, err);
  }
};
var _default = {
  proxy,
  destination,
  destinationSocket,
  serviceMsg
};
exports.default = _default;
module.exports = exports.default;