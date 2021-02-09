"use strict";

exports.__esModule = true;
exports.shouldCache = shouldCache;
exports.create = create;
exports.add = add;
exports.getResponse = getResponse;

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _httpCacheSemantics = _interopRequireDefault(require("http-cache-semantics"));

var _incomingMessageLike = _interopRequireDefault(require("./incoming-message-like"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const requestsCache = new _lruCache.default({
  max: 500 // Store 500 responses

});

function getCacheKey(requestOptions) {
  // NOTE: We don't use pair <method:url> as a cache key since we cache only GET requests
  return requestOptions.url;
} // NOTE: export for testing purposes


function shouldCache(ctx) {
  return ctx.serverInfo.cacheRequests && !ctx.isFileProtocol && ctx.reqOpts.method === 'GET' && (ctx.contentInfo.isCSS || ctx.contentInfo.isScript);
}

function create(reqOptions, res) {
  const cachePolicy = new _httpCacheSemantics.default(reqOptions, res);
  if (!cachePolicy.storable()) return void 0;
  return {
    key: getCacheKey(reqOptions),
    value: {
      cachePolicy,
      res: _incomingMessageLike.default.createFrom(res),
      hitCount: 0
    }
  };
}

function add(entry) {
  const {
    key,
    value
  } = entry;
  requestsCache.set(key, value, value.cachePolicy.timeToLive());
}

function getResponse(reqOptions) {
  const key = getCacheKey(reqOptions);
  const cachedResponse = requestsCache.get(key);
  if (!cachedResponse) return void 0;
  const {
    cachePolicy,
    res
  } = cachedResponse;
  if (!cachePolicy.satisfiesWithoutRevalidation(reqOptions)) return void 0;
  res.headers = cachePolicy.responseHeaders();
  cachedResponse.hitCount++;
  return {
    res,
    hitCount: cachedResponse.hitCount
  };
}