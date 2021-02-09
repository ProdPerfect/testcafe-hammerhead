"use strict";

exports.__esModule = true;
exports.remove = remove;
exports.add = add;
exports.SCRIPT_PROCESSING_END_HEADER_COMMENT = exports.SCRIPT_PROCESSING_END_COMMENT = exports.SCRIPT_PROCESSING_START_COMMENT = void 0;

var _regexpEscape = _interopRequireDefault(require("../../utils/regexp-escape"));

var _internalProperties = _interopRequireDefault(require("../../processing/dom/internal-properties"));

var _instruction = _interopRequireDefault(require("./instruction"));

var _serviceRoutes = _interopRequireDefault(require("../../proxy/service-routes"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// -------------------------------------------------------------
// WARNING: this file is used by both the client and the server.
// Do not use any browser or node-specific API!
// -------------------------------------------------------------
const SCRIPT_PROCESSING_START_COMMENT = '/*hammerhead|script|start*/';
exports.SCRIPT_PROCESSING_START_COMMENT = SCRIPT_PROCESSING_START_COMMENT;
const SCRIPT_PROCESSING_END_COMMENT = '/*hammerhead|script|end*/';
exports.SCRIPT_PROCESSING_END_COMMENT = SCRIPT_PROCESSING_END_COMMENT;
const SCRIPT_PROCESSING_END_HEADER_COMMENT = '/*hammerhead|script|processing-header-end*/';
exports.SCRIPT_PROCESSING_END_HEADER_COMMENT = SCRIPT_PROCESSING_END_HEADER_COMMENT;
const STRICT_MODE_PLACEHOLDER = '{strict-placeholder}';
const SW_SCOPE_HEADER_VALUE = '{sw-scope-header-value}';
const HEADER = `
    ${SCRIPT_PROCESSING_START_COMMENT}
    ${STRICT_MODE_PLACEHOLDER}
    ${SW_SCOPE_HEADER_VALUE}

    if (typeof window !== 'undefined' && window){
        window['${_internalProperties.default.processDomMethodName}'] && window['${_internalProperties.default.processDomMethodName}']();

        if (window.${_instruction.default.getProperty} && typeof ${_instruction.default.getProperty} === 'undefined')
            var ${_instruction.default.getLocation} = window.${_instruction.default.getLocation},
                ${_instruction.default.setLocation} = window.${_instruction.default.setLocation},
                ${_instruction.default.setProperty} = window.${_instruction.default.setProperty},
                ${_instruction.default.getProperty} = window.${_instruction.default.getProperty},
                ${_instruction.default.callMethod} = window.${_instruction.default.callMethod},
                ${_instruction.default.getEval} = window.${_instruction.default.getEval},
                ${_instruction.default.processScript} = window.${_instruction.default.processScript},
                ${_instruction.default.processHtml} = window.${_instruction.default.processHtml},
                ${_instruction.default.getPostMessage} = window.${_instruction.default.getPostMessage},
                ${_instruction.default.getProxyUrl} = window.${_instruction.default.getProxyUrl},
                ${_instruction.default.restArray} = window.${_instruction.default.restArray},
                ${_instruction.default.restObject} = window.${_instruction.default.restObject};
    } else {
        if (typeof ${_instruction.default.getProperty} === 'undefined')
            var ${_instruction.default.getLocation} = function(l){return l},
                ${_instruction.default.setLocation} = function(l,v){return l = v},
                ${_instruction.default.setProperty} = function(o,p,v){return o[p] = v},
                ${_instruction.default.getProperty} = function(o,p){return o[p]},
                ${_instruction.default.callMethod} = function(o,p,a){return o[p].apply(o,a)},
                ${_instruction.default.getEval} = function(e){return e},
                ${_instruction.default.processScript} = function(s){return s},
                ${_instruction.default.processHtml} = function(h){return h},
                ${_instruction.default.getPostMessage} = function(w,p){return arguments.length===1?w.postMessage:p},
                ${_instruction.default.getProxyUrl} = function(u,d){return u},
                ${_instruction.default.restArray} = function(a,i){return Array.prototype.slice.call(a, i)},
                ${_instruction.default.restObject} = function(o,p){var k=Object.keys(o),n={};for(var i=0;i<k.length;++i)if(p.indexOf(k[i])<0)n[k[i]]=o[k[i]];return n};
        
        if (typeof importScripts !== "undefined" && /\\[native code]/g.test(importScripts.toString()))
            importScripts((location.origin || (location.protocol + "//" + location.host)) + "${_serviceRoutes.default.workerHammerhead}");
    }
    ${SCRIPT_PROCESSING_END_HEADER_COMMENT}
`.replace(/\n(?!$)\s*/g, ''); // NOTE: IE removes trailing newlines in script.textContent,
// so a trailing newline in RegExp is optional

const HEADER_RE = new RegExp(`${(0, _regexpEscape.default)(SCRIPT_PROCESSING_START_COMMENT)}[\\S\\s]+?${(0, _regexpEscape.default)(SCRIPT_PROCESSING_END_HEADER_COMMENT)}\n?`, 'gi');
const PROCESSING_END_COMMENT_RE = new RegExp(`\n?${(0, _regexpEscape.default)(SCRIPT_PROCESSING_END_COMMENT)}\\s*`, 'gi');

function remove(code) {
  return code.replace(HEADER_RE, '').replace(PROCESSING_END_COMMENT_RE, '');
}

function add(code, isStrictMode, swScopeHeaderValue) {
  const header = HEADER.replace(STRICT_MODE_PLACEHOLDER, isStrictMode ? '"use strict";' : '').replace(SW_SCOPE_HEADER_VALUE, swScopeHeaderValue ? `var ${_instruction.default.swScopeHeaderValue} = ${JSON.stringify(swScopeHeaderValue)};` : '');
  return header + code + '\n' + SCRIPT_PROCESSING_END_COMMENT;
}