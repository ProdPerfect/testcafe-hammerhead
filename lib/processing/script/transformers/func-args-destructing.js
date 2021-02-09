"use strict";

exports.__esModule = true;
exports.default = create;

var _nodeBuilder = require("../node-builder");

var _esotopeHammerhead = require("esotope-hammerhead");

var _replaceNode = _interopRequireDefault(require("./replace-node"));

var _tempVariables = _interopRequireDefault(require("./temp-variables"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// -------------------------------------------------------------
// WARNING: this file is used by both the client and the server.
// Do not use any browser or node-specific API!
// -------------------------------------------------------------
// Transform:
// function x ({a, b}, [c, d]) {}
// -->
// function x (_hh$temp0, _hh$temp1) {
//     var {a, b} = _hh$temp0,
//         [c, d] = _hh$temp1;
// }
function create(type) {
  return {
    nodeReplacementRequireTransform: false,
    nodeTypes: type,
    condition: node => {
      for (let param of node.params) {
        if (param.type === _esotopeHammerhead.Syntax.AssignmentPattern) param = param.left;
        if (param.type === _esotopeHammerhead.Syntax.ObjectPattern || param.type === _esotopeHammerhead.Syntax.ArrayPattern) return true;
      }

      return false;
    },
    run: node => {
      const declarations = [];

      for (let param of node.params) {
        let tempVarParent = node;
        let tempVarKey = 'params';

        if (param.type === _esotopeHammerhead.Syntax.AssignmentPattern) {
          // @ts-ignore
          tempVarParent = param;
          param = param.left;
          tempVarKey = 'left';
        }

        if (param.type === _esotopeHammerhead.Syntax.ObjectPattern && param.properties.length || param.type === _esotopeHammerhead.Syntax.ArrayPattern && param.elements.length) {
          const tempVar = (0, _nodeBuilder.createIdentifier)(_tempVariables.default.generateName()); // @ts-ignore

          (0, _replaceNode.default)(param, tempVar, tempVarParent, tempVarKey);
          declarations.push((0, _nodeBuilder.createVariableDeclarator)(param, tempVar));
        }
      }

      if (!declarations.length) return null;
      const declaration = (0, _nodeBuilder.createVariableDeclaration)('var', declarations);

      if (node.body.type !== _esotopeHammerhead.Syntax.BlockStatement) {
        // @ts-ignore
        const returnStmt = (0, _nodeBuilder.createReturnStatement)(node.body);
        (0, _replaceNode.default)(node.body, (0, _nodeBuilder.createBlockStatement)([declaration, returnStmt]), node, 'body'); // @ts-ignore

        node.expression = false;
        return node;
      } else (0, _replaceNode.default)(null, declaration, node.body, 'body');

      declaration.reTransform = true;
      return null;
    }
  };
}

module.exports = exports.default;