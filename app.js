'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

const { cloneClass, BaseModel } = require(`./lib/BaseModel`);
const BulkArray = require(`./lib/BulkArray`);
const { changeClient, errors } = require(`./lib/ElasticSearch`);

/**
 * This is needed due to possible bug is JSDoc parser...
 * @typedef {typeof BaseModel} BaseModelType
 */

/**
 * @param index     {string}
 * @param schema    {Joi | void}
 * @param type      {string}
 * @returns         {BaseModelType}
 */
function createClass(index, schema = Joi.object(), type = `*`) {
    if (_.isNil(index) || !_.isString(index) || _.isEmpty(index)) {
        throw Error(`You have to specify an index.`);
    }

    const properties = {
        __schema: schema,
        __typeInIndex: (type === `*`),

        _tenant: `default`,
        _index: index,
        _type: type
    };

    // Creates new class extended from {BaseModel}
    return cloneClass(properties);
}

function setClient(configuration) {
    changeClient(configuration);
}

module.exports = { createClass, BulkArray, BaseModel, setClient, esErrors: errors };
