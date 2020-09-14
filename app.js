'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

const { cloneClass, BaseModel } = require(`./lib/BaseModel`);
const BulkArray = require(`./lib/BulkArray`);
const { esClient, setClient, esErrors } = require(`./lib/ElasticSearch`);
const { setLoggerConfig, setLoggerUidFunction } = require(`./lib/logger`);

/**
 * This is needed due to possible bug is JSDoc parser...
 * @typedef {typeof BaseModel} BaseModelType
 */

/**
 * @param index         {string}
 * @param schema        {Joi | void}
 * @param indexType     {string}
 * @param tenant        {string}
 * @returns             {BaseModelType}
 */
function createClass(index, schema = Joi.object(), indexType = ``, tenant = `*`) {
    if (_.isNil(index) || !_.isString(index) || _.isEmpty(index)) {
        throw Error(`You have to specify an index.`);
    }

    const properties = {
        __schema: schema,

        _tenant: tenant,
        _index: index,
        _indexType: indexType
    };

    // Creates new class extended from {BaseModel}
    return cloneClass(properties);
}

module.exports = { createClass, BulkArray, BaseModel, esClient, setClient, esErrors,
    setLoggerConfig, setLoggerUidFunction };
