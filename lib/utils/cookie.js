"use strict";

exports.__esModule = true;
exports.parseClientSyncCookieStr = parseClientSyncCookieStr;
exports.prepareSyncCookieProperties = prepareSyncCookieProperties;
exports.formatSyncCookie = formatSyncCookie;
exports.parseSyncCookie = parseSyncCookie;
exports.changeSyncType = changeSyncType;
exports.isOutdatedSyncCookie = isOutdatedSyncCookie;
exports.generateDeleteSyncCookieStr = generateDeleteSyncCookieStr;
exports.SYNCHRONIZATION_TYPE = void 0;

var _stringTrim = _interopRequireDefault(require("./string-trim"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// -------------------------------------------------------------
// WARNING: this file is used by both the client and the server.
// Do not use any browser or node-specific API!
// -------------------------------------------------------------
const TIME_RADIX = 36;
const CLEAR_COOKIE_VALUE_STR = '=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT';
const CLIENT_COOKIE_SYNC_KEY_FRAGMENT_COUNT = 7;
const KEY_VALUE_REGEX = /(?:^([^=]+)=([\s\S]*))?/;
const SYNCHRONIZATION_TYPE = {
  server: 's',
  client: 'c',
  window: 'w'
};
exports.SYNCHRONIZATION_TYPE = SYNCHRONIZATION_TYPE;
const SYNCHRONIZATION_TYPE_RE = new RegExp(`^[${SYNCHRONIZATION_TYPE.server}${SYNCHRONIZATION_TYPE.client}${SYNCHRONIZATION_TYPE.window}]+`);

function isSameCookies(cookie1, cookie2) {
  return cookie1.sid === cookie2.sid && cookie1.key === cookie2.key && cookie1.domain === cookie2.domain && cookie1.path === cookie2.path;
}

function sortByOutdatedAndActual(parsedCookies) {
  const outdated = [];
  const actual = [];

  for (let current = 0; current < parsedCookies.length; current++) {
    let other = current + 1;

    for (; other < parsedCookies.length; other++) {
      if (isSameCookies(parsedCookies[current], parsedCookies[other])) {
        if (parsedCookies[current].lastAccessed > parsedCookies[other].lastAccessed) {
          const temp = parsedCookies[current];
          parsedCookies[current] = parsedCookies[other];
          parsedCookies[other] = temp;
        }

        outdated.push(parsedCookies[current]);
        break;
      }
    }

    if (other === parsedCookies.length) actual.push(parsedCookies[current]);
  }

  return {
    outdated,
    actual
  };
}

function stringifySyncType(cookie) {
  return (cookie.isServerSync ? SYNCHRONIZATION_TYPE.server : '') + (cookie.isClientSync ? SYNCHRONIZATION_TYPE.client : '') + (cookie.isWindowSync ? SYNCHRONIZATION_TYPE.window : '');
}

function formatSyncCookieKey(cookie) {
  const syncType = stringifySyncType(cookie);
  const key = encodeURIComponent(cookie.key);
  const domain = encodeURIComponent(cookie.domain);
  const path = encodeURIComponent(cookie.path);
  const expires = cookie.expires !== 'Infinity' ? cookie.expires.getTime().toString(TIME_RADIX) : '';
  const lastAccessed = cookie.lastAccessed.getTime().toString(TIME_RADIX);
  return `${syncType}|${cookie.sid}|${key}|${domain}|${path}|${expires}|${lastAccessed}`;
}

function parseClientSyncCookieStr(cookieStr) {
  const cookies = cookieStr ? cookieStr.split(';') : '';
  const parsedCookies = [];

  for (const cookie of cookies) {
    const parsedCookie = parseSyncCookie((0, _stringTrim.default)(cookie));
    if (parsedCookie) parsedCookies.push(parsedCookie);
  }

  return sortByOutdatedAndActual(parsedCookies);
}

function prepareSyncCookieProperties(cookie) {
  cookie.syncKey = cookie.syncKey || formatSyncCookieKey(cookie);
  cookie.cookieStr = cookie.cookieStr || `${cookie.syncKey}=${cookie.value}`;
}

function formatSyncCookie(cookie) {
  if (cookie.cookieStr) return `${cookie.cookieStr};path=/`;
  return `${formatSyncCookieKey(cookie)}=${cookie.value};path=/`;
}

function parseSyncCookie(cookieStr) {
  const [, key, value] = KEY_VALUE_REGEX.exec(cookieStr);
  const parsedKey = key !== void 0 && value !== void 0 && key.split('|');
  if (parsedKey && parsedKey.length !== CLIENT_COOKIE_SYNC_KEY_FRAGMENT_COUNT) return null;
  return {
    isServerSync: parsedKey[0].indexOf(SYNCHRONIZATION_TYPE.server) > -1,
    isClientSync: parsedKey[0].indexOf(SYNCHRONIZATION_TYPE.client) > -1,
    isWindowSync: parsedKey[0].indexOf(SYNCHRONIZATION_TYPE.window) > -1,
    sid: parsedKey[1],
    key: decodeURIComponent(parsedKey[2]),
    domain: decodeURIComponent(parsedKey[3]),
    path: decodeURIComponent(parsedKey[4]),
    expires: parsedKey[5] ? new Date(parseInt(parsedKey[5], TIME_RADIX)) : 'Infinity',
    lastAccessed: new Date(parseInt(parsedKey[6], TIME_RADIX)),
    syncKey: key,
    value,
    cookieStr
  };
}

function changeSyncType(parsedCookie, flags) {
  if ('server' in flags) parsedCookie.isServerSync = flags.server;
  if ('client' in flags) parsedCookie.isClientSync = flags.client;
  if ('window' in flags) parsedCookie.isWindowSync = flags.window;
  const newSyncTypeStr = stringifySyncType(parsedCookie);
  parsedCookie.syncKey = parsedCookie.syncKey.replace(SYNCHRONIZATION_TYPE_RE, newSyncTypeStr);
  parsedCookie.cookieStr = parsedCookie.cookieStr.replace(SYNCHRONIZATION_TYPE_RE, newSyncTypeStr);
}

function isOutdatedSyncCookie(currentCookie, newCookie) {
  return newCookie.isServerSync === currentCookie.isServerSync && newCookie.sid === currentCookie.sid && newCookie.key === currentCookie.key && newCookie.domain === currentCookie.domain && newCookie.path === currentCookie.path && newCookie.lastAccessed > currentCookie.lastAccessed;
}

function generateDeleteSyncCookieStr(cookie) {
  return cookie.syncKey + CLEAR_COOKIE_VALUE_STR;
}