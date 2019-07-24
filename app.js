'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

/**
 * @param index {string}
 * @param schema {Joi | void}
 * @param type {string}
 * @returns {BaseClass}
 */
function prepareClass(index, schema = Joi.any(), type = `*`) {
    if (_.isNil(index) || !_.isString(index) || _.isEmpty(index)) {
        throw Error(`You have to specify index.`);
    }

    const myClass = require(`./lib/BaseModel`);

    myClass._index = index;
    myClass._tenant = `default`;
    myClass.__schema = schema;
    myClass._type = type;
    myClass.__typeInIndex = (type === `*`);

    return myClass;
}

module.exports = prepareClass;
