"use strict";

exports.__esModule = true;
exports.getFormattedInvalidCharacters = getFormattedInvalidCharacters;

var _messages = require("../messages");

const HEADER_LINE_SEPARATOR = '\r\n';
const HEADER_BODY_SEPARATOR = ':';
const HEADER_BODY_INVALID_CHARACTERS = ['\n', '\r'];
const HEADER_NAME_VALID_CHAR_CODE_RANGE = {
  min: 33,
  max: 126
};
const HEADER_INVALID_CHAR_LOCATIONS = {
  name: 'name',
  body: 'body'
};

function getFormattedInvalidCharacters(rawHeaders) {
  let invalidCharList = [];

  for (const header of rawHeaders.split(HEADER_LINE_SEPARATOR)) {
    const name = header.slice(0, header.indexOf(HEADER_BODY_SEPARATOR));
    const body = header.slice(header.indexOf(HEADER_BODY_SEPARATOR) + 1);
    invalidCharList = invalidCharList.concat(getInvalidCharacters(name, body));
  }

  return formatInvalidCharacters(invalidCharList);
}

function headerNameCharIsInvalid(char) {
  return char.charCodeAt(0) < HEADER_NAME_VALID_CHAR_CODE_RANGE.min || char.charCodeAt(0) > HEADER_NAME_VALID_CHAR_CODE_RANGE.max;
}

function headerBodyCharIsInvalid(char) {
  return HEADER_BODY_INVALID_CHARACTERS.includes(char);
}

function getInvalidCharacters(name, body) {
  const invalidCharList = [];

  for (let i = 0; i < name.length; i++) {
    if (headerNameCharIsInvalid(name[i])) {
      invalidCharList.push({
        name: name,
        location: HEADER_INVALID_CHAR_LOCATIONS.name,
        charCode: name[i].charCodeAt(0),
        index: i.toString()
      });
    }
  }

  for (let i = 0; i < body.length; i++) {
    if (headerBodyCharIsInvalid(body[i])) {
      invalidCharList.push({
        name: name,
        location: HEADER_INVALID_CHAR_LOCATIONS.body,
        charCode: body[i].charCodeAt(0),
        index: i.toString()
      });
    }
  }

  return invalidCharList;
}

function formatInvalidCharacters(invalidCharactersList) {
  return invalidCharactersList.map(invalidCharacter => (0, _messages.getText)(_messages.MESSAGE.invalidHeaderCharacter, invalidCharacter)).join('\n');
}