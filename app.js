'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

const BaseModel = require(`./lib/BaseModel`);

/**
 * @param index {string}
 * @param schema {Joi | void}
 * @param type {string}
 * @returns {BaseClass}
 */
function createClass(index, schema = Joi.any(), type = `*`) {
    if (_.isNil(index) || !_.isString(index) || _.isEmpty(index)) {
        throw Error(`You have to specify index.`);
    }

    const properties = {
        __schema: schema,
        __typeInIndex: (type === `*`),

        _tenant: `default`,
        _index: index,
        _type: type
    };
    return BaseModel(properties);
}

module.exports = createClass;
