"use strict";

exports.__esModule = true;
exports.isScriptProcessed = isScriptProcessed;
exports.processScript = processScript;

var _transform = _interopRequireDefault(require("./transform"));

var _instruction = _interopRequireDefault(require("./instruction"));

var _header = require("./header");

var _acornHammerhead = require("acorn-hammerhead");

var _esotopeHammerhead = require("esotope-hammerhead");

var _regexpEscape = _interopRequireDefault(require("../../utils/regexp-escape"));

var _getBom = _interopRequireDefault(require("../../utils/get-bom"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// -------------------------------------------------------------
// WARNING: this file is used by both the client and the server.
// Do not use any browser or node-specific API!
// -------------------------------------------------------------
const HTML_COMMENT_RE = /(^|\n)\s*<!--[^\n]*(\n|$)/g;
const OBJECT_RE = /^\s*\{.*\}\s*$/;
const TRAILING_SEMICOLON_RE = /;\s*$/;
const OBJECT_WRAPPER_RE = /^\s*\((.*)\);\s*$/;
const SOURCEMAP_RE = /(?:\/\/[@#][ \t]+sourceMappingURL=([^\s'"]+?)[ \t]*$)/gm;
const PROCESSED_SCRIPT_RE = new RegExp([(0, _regexpEscape.default)(_instruction.default.getLocation), (0, _regexpEscape.default)(_instruction.default.setLocation), (0, _regexpEscape.default)(_instruction.default.getProperty), (0, _regexpEscape.default)(_instruction.default.setProperty), (0, _regexpEscape.default)(_instruction.default.callMethod), (0, _regexpEscape.default)(_instruction.default.processScript), (0, _regexpEscape.default)(_instruction.default.processHtml), (0, _regexpEscape.default)(_instruction.default.getPostMessage), (0, _regexpEscape.default)(_instruction.default.getProxyUrl)].join('|'));
const PARSING_OPTIONS = {
  allowReturnOutsideFunction: true,
  allowImportExportEverywhere: true,
  ecmaVersion: 11
}; // Code pre/post-processing

function removeHtmlComments(code) {
  // NOTE: The JS parser removes the line that follows'<!--'. (T226589)
  do code = code.replace(HTML_COMMENT_RE, '\n'); while (HTML_COMMENT_RE.test(code));

  return code;
}

function preprocess(code) {
  const bom = (0, _getBom.default)(code);
  let preprocessed = bom ? code.substring(bom.length) : code;
  preprocessed = (0, _header.remove)(preprocessed);
  preprocessed = removeSourceMap(preprocessed);
  return {
    bom,
    preprocessed
  };
}

function removeSourceMap(code) {
  return code.replace(SOURCEMAP_RE, '');
}

function postprocess(processed, withHeader, bom, strictMode, swScopeHeaderValue) {
  // NOTE: If the 'use strict' directive is not in the beginning of the file, it is ignored.
  // As we insert our header in the beginning of the script, we must put a new 'use strict'
  // before the header, otherwise it will be ignored.
  if (withHeader) processed = (0, _header.add)(processed, strictMode, swScopeHeaderValue);
  return bom ? bom + processed : processed;
} // Parse/generate code


function removeTrailingSemicolon(processed, src) {
  return TRAILING_SEMICOLON_RE.test(src) ? processed : processed.replace(TRAILING_SEMICOLON_RE, '');
}

function getAst(src, isObject) {
  // NOTE: In case of objects (e.g.eval('{ 1: 2}')) without wrapping
  // object will be parsed as label. To avoid this we parenthesize src
  src = isObject ? `(${src})` : src;

  try {
    return (0, _acornHammerhead.parse)(src, PARSING_OPTIONS);
  } catch (err) {
    return null;
  }
}

function getCode(ast, src) {
  const code = (0, _esotopeHammerhead.generate)(ast, {
    format: {
      quotes: 'double',
      escapeless: true,
      compact: true
    }
  });
  return src ? removeTrailingSemicolon(code, src) : code;
} // Analyze code


function analyze(code) {
  let isObject = OBJECT_RE.test(code);
  let ast = getAst(code, isObject); // NOTE: `{ const a = 'foo'; }` edge case

  if (!ast && isObject) {
    ast = getAst(code, false);
    isObject = false;
  }

  return {
    ast,
    isObject
  };
}

function isArrayDataScript(ast) {
  const firstChild = ast.body[0];
  return ast.body.length === 1 && firstChild.type === _esotopeHammerhead.Syntax.ExpressionStatement && firstChild.expression.type === _esotopeHammerhead.Syntax.ArrayExpression;
}

function isStrictMode(ast) {
  if (ast.body.length) {
    const firstChild = ast.body[0];
    if (firstChild.type === _esotopeHammerhead.Syntax.ExpressionStatement && firstChild.expression.type === _esotopeHammerhead.Syntax.Literal) return firstChild.expression.value === 'use strict';
  }

  return false;
}

function applyChanges(script, changes, isObject) {
  const indexOffset = isObject ? -1 : 0;
  const chunks = [];
  let index = 0;
  if (!changes.length) return script;
  changes.sort((a, b) => a.start - b.start || a.end - b.end);

  for (const change of changes) {
    const changeStart = change.start + indexOffset;
    const changeEnd = change.end + indexOffset;
    const parentheses = change.node.type === _esotopeHammerhead.Syntax.SequenceExpression && change.parentType !== _esotopeHammerhead.Syntax.ExpressionStatement && change.parentType !== _esotopeHammerhead.Syntax.SequenceExpression;
    chunks.push(script.substring(index, changeStart));
    chunks.push(parentheses ? '(' : ' ');
    chunks.push(getCode(change.node, script.substring(changeStart, changeEnd)));
    chunks.push(parentheses ? ')' : ' ');
    index += changeEnd - index;
  }

  chunks.push(script.substring(index));
  return chunks.join('');
}

function isScriptProcessed(code) {
  return PROCESSED_SCRIPT_RE.test(code);
}

function processScript(src, withHeader = false, wrapLastExprWithProcessHtml = false, resolver, swScopeHeaderValue) {
  const {
    bom,
    preprocessed
  } = preprocess(src);
  const withoutHtmlComments = removeHtmlComments(preprocessed);
  const {
    ast,
    isObject
  } = analyze(withoutHtmlComments);
  if (!ast) return src;
  withHeader = withHeader && !isObject && !isArrayDataScript(ast);
  const changes = (0, _transform.default)(ast, wrapLastExprWithProcessHtml, resolver);
  let processed = changes.length ? applyChanges(withoutHtmlComments, changes, isObject) : preprocessed;
  processed = postprocess(processed, withHeader, bom, isStrictMode(ast), swScopeHeaderValue);
  if (isObject) processed = processed.replace(OBJECT_WRAPPER_RE, '$1');
  return processed;
}