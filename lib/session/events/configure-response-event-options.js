"use strict";

exports.__esModule = true;
exports.default = void 0;

class ConfigureResponseEventOptions {
  constructor(_includeHeaders = false, _includeBody = false) {
    this._includeHeaders = _includeHeaders;
    this._includeBody = _includeBody;
  }

  get includeHeaders() {
    return this._includeHeaders;
  }

  set includeHeaders(value) {
    this._includeHeaders = !!value;
  }

  get includeBody() {
    return this._includeBody;
  }

  set includeBody(value) {
    this._includeBody = !!value;
  }

  static get DEFAULT() {
    return new ConfigureResponseEventOptions();
  }

}

exports.default = ConfigureResponseEventOptions;
module.exports = exports.default;