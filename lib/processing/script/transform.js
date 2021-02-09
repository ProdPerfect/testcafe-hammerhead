"use strict";

exports.__esModule = true;
exports.default = transformProgram;

var _transformers = _interopRequireDefault(require("./transformers"));

var _jsProtocolLastExpression = _interopRequireDefault(require("./transformers/js-protocol-last-expression"));

var _staticImport = _interopRequireDefault(require("./transformers/static-import"));

var _dynamicImport = _interopRequireDefault(require("./transformers/dynamic-import"));

var _replaceNode = _interopRequireDefault(require("./transformers/replace-node"));

var _esotopeHammerhead = require("esotope-hammerhead");

var _url = require("../../utils/url");

var _stackProcessing = require("../../utils/stack-processing");

var _nodeBuilder = require("./node-builder");

var _tempVariables = _interopRequireDefault(require("./transformers/temp-variables"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class State {
  constructor() {
    _defineProperty(this, "hasTransformedAncestor", false);

    _defineProperty(this, "newExpressionAncestor", void 0);

    _defineProperty(this, "newExpressionAncestorParent", void 0);

    _defineProperty(this, "newExpressionAncestorKey", void 0);
  }

  // NOTE: There is an issue with processing `new` expressions. `new a.src.b()` will be transformed
  // to `new __get$(a, 'src').b()`, which is wrong. The correct result is `new (__get$(a, 'src')).b()`.
  // To solve this problem, we add a 'state' entity. This entity stores the "new" expression, so that
  // we can add it to the changes when the transformation is found.
  static create(currState, node, parent, key, hasTransformedAncestor = false) {
    const isNewExpression = node.type === _esotopeHammerhead.Syntax.NewExpression;
    const isNewExpressionAncestor = isNewExpression && !currState.newExpressionAncestor;
    const newState = new State();
    newState.hasTransformedAncestor = currState.hasTransformedAncestor || hasTransformedAncestor;
    newState.newExpressionAncestor = isNewExpressionAncestor ? node : currState.newExpressionAncestor;
    newState.newExpressionAncestorParent = isNewExpressionAncestor ? parent : currState.newExpressionAncestorParent; // @ts-ignore

    newState.newExpressionAncestorKey = isNewExpressionAncestor ? key : currState.newExpressionAncestorKey;
    return newState;
  }

} // NOTE: We should avoid using native object prototype methods,
// since they can be overriden by the client code. (GH-245)


const objectToString = Object.prototype.toString;
const objectKeys = Object.keys;

function getChange(node, parentType) {
  /*eslint-disable @typescript-eslint/no-non-null-assertion*/
  const start = node.originStart;
  const end = node.originEnd;
  /*eslint-disable @typescript-eslint/no-non-null-assertion*/

  return {
    start,
    end,
    node,
    parentType
  };
}

function transformChildNodes(node, changes, state, tempVars) {
  // @ts-ignore
  const nodeKeys = objectKeys(node);

  for (const key of nodeKeys) {
    const childNode = node[key];
    const stringifiedNode = objectToString.call(childNode);

    if (stringifiedNode === '[object Array]') {
      // @ts-ignore
      const childNodes = childNode;

      for (const nthNode of childNodes) {
        // NOTE: Some items of ArrayExpression can be null
        if (nthNode) transform(nthNode, changes, state, node, key, tempVars);
      }
    } else if (stringifiedNode === '[object Object]') {
      // @ts-ignore
      transform(childNode, changes, state, node, key, tempVars);
    }
  }
}

function isNodeTransformed(node) {
  return node.originStart !== void 0 && node.originEnd !== void 0;
}

function addChangeForTransformedNode(state, changes, replacement, parentType) {
  const hasTransformedAncestor = state.hasTransformedAncestor || state.newExpressionAncestor && isNodeTransformed(state.newExpressionAncestor);
  if (hasTransformedAncestor) return;

  if (state.newExpressionAncestor) {
    (0, _replaceNode.default)(state.newExpressionAncestor, state.newExpressionAncestor, state.newExpressionAncestorParent, state.newExpressionAncestorKey);
    changes.push(getChange(state.newExpressionAncestor, state.newExpressionAncestorParent.type));
  } else changes.push(getChange(replacement, parentType));
}

function addTempVarsDeclaration(node, changes, state, tempVars) {
  const names = tempVars.get();
  if (!names.length) return;
  const declaration = (0, _nodeBuilder.createTempVarsDeclaration)(names);
  (0, _replaceNode.default)(null, declaration, node, 'body');
  addChangeForTransformedNode(state, changes, declaration, node.type);
}

function beforeTransform(wrapLastExprWithProcessHtml = false, resolver) {
  _jsProtocolLastExpression.default.wrapLastExpr = wrapLastExprWithProcessHtml;
  _staticImport.default.resolver = resolver;
  const isServerSide = typeof window === 'undefined';
  if (isServerSide) _dynamicImport.default.baseUrl = resolver ? (0, _url.parseProxyUrl)(resolver('./')).destUrl : '';else {
    const currentStack = new Error().stack; // NOTE: IE11 doesn't give the error stack without the 'throw' statement and doesn't support the 'import' statement

    _dynamicImport.default.baseUrl = currentStack && (0, _stackProcessing.getFirstDestUrl)(currentStack) || '';
  }
}

function afterTransform() {
  _jsProtocolLastExpression.default.wrapLastExpr = false;
  _staticImport.default.resolver = void 0;
  _dynamicImport.default.baseUrl = void 0;
}

function findTransformer(node, parent) {
  const nodeTransformers = _transformers.default.get(node.type);

  if (nodeTransformers) {
    for (const transformer of nodeTransformers) {
      if (transformer.condition(node, parent)) return transformer;
    }
  }

  return null;
}

function transform(node, changes, state, parent, key, tempVars) {
  const allowTempVarAdd = node.type === _esotopeHammerhead.Syntax.BlockStatement;
  let nodeTransformed = false;
  if (allowTempVarAdd) tempVars = new _tempVariables.default();

  if (!node.reTransform && isNodeTransformed(node)) {
    addChangeForTransformedNode(state, changes, node, parent.type);
    nodeTransformed = true;
  } else {
    const storedNode = node;
    let transformer = findTransformer(node, parent);
    let replacement = null;

    while (transformer) {
      replacement = transformer.run(replacement || node, parent, key, tempVars);
      if (!replacement) break;
      nodeTransformed = true;
      if (!transformer.nodeReplacementRequireTransform) break;
      transformer = findTransformer(replacement, parent);
      node = replacement;
    }

    if (nodeTransformed) {
      (0, _replaceNode.default)(storedNode, replacement, parent, key);
      addChangeForTransformedNode(state, changes, replacement, parent.type);
    }
  }

  state = State.create(state, node, parent, key, nodeTransformed);
  transformChildNodes(node, changes, state, tempVars);
  if (allowTempVarAdd) addTempVarsDeclaration(node, changes, state, tempVars);
}

function transformProgram(node, wrapLastExprWithProcessHtml = false, resolver) {
  const changes = [];
  const state = new State();
  const tempVars = new _tempVariables.default();

  _tempVariables.default.resetCounter();

  beforeTransform(wrapLastExprWithProcessHtml, resolver);
  transformChildNodes(node, changes, state, tempVars);
  addTempVarsDeclaration(node, changes, state, tempVars);
  afterTransform();
  return changes;
}

module.exports = exports.default;