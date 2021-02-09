"use strict";

exports.__esModule = true;
exports.sendRequest = sendRequest;
exports.error = error;
exports.callResponseEventCallbackForProcessedRequest = callResponseEventCallbackForProcessedRequest;
exports.callOnRequestEventCallback = callOnRequestEventCallback;
exports.callOnResponseEventCallbackForFailedSameOriginCheck = callOnResponseEventCallbackForFailedSameOriginCheck;
exports.callOnConfigureResponseEventForNonProcessedRequest = callOnConfigureResponseEventForNonProcessedRequest;
exports.callOnResponseEventCallbackWithBodyForNonProcessedRequest = callOnResponseEventCallbackWithBodyForNonProcessedRequest;
exports.callOnResponseEventCallbackWithoutBodyForNonProcessedResource = callOnResponseEventCallbackWithoutBodyForNonProcessedResource;
exports.callOnResponseEventCallbackForMotModifiedResource = callOnResponseEventCallbackForMotModifiedResource;

var _info = require("../session/events/info");

var _fileRequest = _interopRequireDefault(require("./file-request"));

var _destinationRequest = _interopRequireDefault(require("./destination-request"));

var _promisifyStream = _interopRequireDefault(require("../utils/promisify-stream"));

var _configureResponseEvent = _interopRequireDefault(require("../session/events/configure-response-event"));

var _requestEvent = _interopRequireDefault(require("../session/events/request-event"));

var _responseEvent = _interopRequireDefault(require("../session/events/response-event"));

var _names = _interopRequireDefault(require("../session/events/names"));

var _configureResponseEventOptions = _interopRequireDefault(require("../session/events/configure-response-event-options"));

var _buffer = require("../utils/buffer");

var _stream = require("stream");

var _messages = require("../messages");

var _logger = _interopRequireDefault(require("../utils/logger"));

var _httpHeaderParser = require("./http-header-parser");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// An empty line that indicates the end of the header section
// https://tools.ietf.org/html/rfc7230#section-3
const HTTP_BODY_SEPARATOR = '\r\n\r\n'; // Used to calculate the recommended maximum header size
// See getRecommendedMaxHeaderSize() below

const HEADER_SIZE_MULTIPLIER = 2;
const HEADER_SIZE_CALCULATION_PRECISION = 2; // Calculates the HTTP header size in bytes that a customer should specify via the
// --max-http-header-size Node option so that the proxy can process the site
// https://nodejs.org/api/cli.html#cli_max_http_header_size_size
// Example:
// (8211 * 2).toPrecision(2) -> 16 * 10^3 -> 16000

function getRecommendedMaxHeaderSize(currentHeaderSize) {
  return Number((currentHeaderSize * HEADER_SIZE_MULTIPLIER).toPrecision(HEADER_SIZE_CALCULATION_PRECISION));
}

function sendRequest(ctx) {
  return new Promise(resolve => {
    const req = ctx.isFileProtocol ? new _fileRequest.default(ctx.reqOpts.url) : new _destinationRequest.default(ctx.reqOpts, ctx.serverInfo.cacheRequests);
    ctx.goToNextStage = false;
    req.on('response', res => {
      if (ctx.isWebSocketConnectionReset) {
        res.destroy();
        resolve();
        return;
      }

      ctx.destRes = res;
      ctx.goToNextStage = true;
      ctx.buildContentInfo();
      ctx.calculateIsDestResReadableEnded();
      ctx.createCacheEntry(res);
      resolve();
    });
    req.on('error', err => {
      // NOTE: Sometimes the underlying socket emits an error event. But if we have a response body,
      // we can still process such requests. (B234324)
      if (!ctx.isDestResReadableEnded) {
        const rawHeadersStr = err.rawPacket ? err.rawPacket.asciiSlice().split(HTTP_BODY_SEPARATOR)[0].split('\n').splice(1).join('\n') : '';
        const headerSize = rawHeadersStr.length;
        error(ctx, (0, _messages.getText)(_messages.MESSAGE.destConnectionTerminated, {
          url: ctx.dest.url,
          message: _messages.MESSAGE.nodeError[err.code] || err.toString(),
          headerSize: headerSize,
          recommendedMaxHeaderSize: getRecommendedMaxHeaderSize(headerSize).toString(),
          invalidChars: (0, _httpHeaderParser.getFormattedInvalidCharacters)(rawHeadersStr)
        }));
      }

      resolve();
    });
    req.on('fatalError', err => {
      if (ctx.isFileProtocol) _logger.default.destination.onFileReadError(ctx, err);
      error(ctx, err);
      resolve();
    });
    req.on('socketHangUp', () => {
      ctx.req.socket.end();
      resolve();
    });

    if (req instanceof _fileRequest.default) {
      _logger.default.destination.onFileRead(ctx);

      req.init();
    }
  });
}

function error(ctx, err) {
  if (ctx.isPage && !ctx.isIframe) ctx.session.handlePageError(ctx, err);else if (ctx.isAjax) ctx.req.destroy();else ctx.closeWithError(500, err.toString());
}

async function callResponseEventCallbackForProcessedRequest(ctx, configureResponseEvent) {
  const responseInfo = new _info.ResponseInfo(ctx);
  const preparedResponseInfo = new _info.PreparedResponseInfo(responseInfo, configureResponseEvent.opts);
  const responseEvent = new _responseEvent.default(configureResponseEvent._requestFilterRule, preparedResponseInfo);
  await ctx.session.callRequestEventCallback(_names.default.onResponse, configureResponseEvent._requestFilterRule, responseEvent);
}

async function callOnRequestEventCallback(ctx, rule, reqInfo) {
  const requestEvent = new _requestEvent.default(ctx, rule, reqInfo);
  await ctx.session.callRequestEventCallback(_names.default.onRequest, rule, requestEvent);
}

async function callOnResponseEventCallbackForFailedSameOriginCheck(ctx, rule, configureOpts) {
  const responseInfo = new _info.ResponseInfo(ctx);
  const preparedResponseInfo = new _info.PreparedResponseInfo(responseInfo, configureOpts);
  const responseEvent = new _responseEvent.default(rule, preparedResponseInfo);
  await ctx.session.callRequestEventCallback(_names.default.onResponse, rule, responseEvent);
}

async function callOnConfigureResponseEventForNonProcessedRequest(ctx) {
  await ctx.forEachRequestFilterRule(async rule => {
    const configureResponseEvent = new _configureResponseEvent.default(ctx, rule, _configureResponseEventOptions.default.DEFAULT);
    await ctx.session.callRequestEventCallback(_names.default.onConfigureResponse, rule, configureResponseEvent);
    ctx.onResponseEventData.push({
      rule,
      opts: configureResponseEvent.opts
    });
  });
}

async function callOnResponseEventCallbackWithBodyForNonProcessedRequest(ctx, onResponseEventDataWithBody) {
  const destResBodyCollectorStream = new _stream.PassThrough();
  ctx.destRes.pipe(destResBodyCollectorStream);
  (0, _promisifyStream.default)(destResBodyCollectorStream).then(async data => {
    ctx.saveNonProcessedDestResBody(data);
    const responseInfo = new _info.ResponseInfo(ctx);
    await Promise.all(onResponseEventDataWithBody.map(async ({
      rule,
      opts
    }) => {
      const preparedResponseInfo = new _info.PreparedResponseInfo(responseInfo, opts);
      const responseEvent = new _responseEvent.default(rule, preparedResponseInfo);
      await ctx.session.callRequestEventCallback(_names.default.onResponse, rule, responseEvent);
    }));
    (0, _buffer.toReadableStream)(data).pipe(ctx.res);
  });
}

async function callOnResponseEventCallbackWithoutBodyForNonProcessedResource(ctx, onResponseEventDataWithoutBody) {
  const responseInfo = new _info.ResponseInfo(ctx);
  await Promise.all(onResponseEventDataWithoutBody.map(async item => {
    const preparedResponseInfo = new _info.PreparedResponseInfo(responseInfo, item.opts);
    const responseEvent = new _responseEvent.default(item.rule, preparedResponseInfo);
    await ctx.session.callRequestEventCallback(_names.default.onResponse, item.rule, responseEvent);
  }));
  ctx.destRes.pipe(ctx.res);
}

async function callOnResponseEventCallbackForMotModifiedResource(ctx) {
  const responseInfo = new _info.ResponseInfo(ctx);
  await Promise.all(ctx.onResponseEventData.map(async item => {
    const preparedResponseInfo = new _info.PreparedResponseInfo(responseInfo, item.opts);
    const responseEvent = new _responseEvent.default(item.rule, preparedResponseInfo);
    await ctx.session.callRequestEventCallback(_names.default.onResponse, item.rule, responseEvent);
  }));
  ctx.res.end();
}