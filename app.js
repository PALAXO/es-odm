'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);
const rewire = require(`rewire`);

/**
 * @param index {string}
 * @param schema {*}
 * @param type {string}
 * @returns {BaseClass}
 */
function prepareClass(index, schema = Joi.any(), type = `*`) {
    if (_.isNil(index) || !_.isString(index) || _.isEmpty(index)) {
        throw Error(`You have to specify index.`);
    }

    const constructor = rewire(`./lib/BaseModel`);
    constructor.__set__(`_index`, index);
    constructor.__set__(`__schema`, schema);
    constructor.__set__(`_type`, type);

    if (type === `*`) {
        constructor.__set__(`__typeInIndex`, true);
    } else {
        constructor.__set__(`__typeInIndex`, false);
    }

    return constructor;
}

module.exports = prepareClass;
