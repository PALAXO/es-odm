'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

const { cloneClass, BaseModel } = require(`./lib/BaseModel`);
const { JointModel } = require(`./lib/JointModel`);
const BulkArray = require(`./lib/BulkArray`);
const { esClient, setClient, esErrors } = require(`./lib/ElasticSearch`);
const { setLoggerConfig, setLoggerUidFunction } = require(`./lib/logger`);

/**
 * This is needed due to possible bug is JSDoc parser...
 * @typedef {typeof BaseModel} BaseModelType
 */

/**
 * @param name          {string}
 * @param schema        {Joi | void}
 * @param type          {string}
 * @param tenant        {string}
 * @returns             {BaseModelType}
 */
function createClass(name, schema = Joi.object(), type = ``, tenant = `*`) {
    if (_.isNil(name) || !_.isString(name) || _.isEmpty(name)) {
        throw Error(`You have to specify an index name.`);
    } else if (_.isNil(tenant) || !_.isString(tenant) || _.isEmpty(tenant)) {
        throw Error(`Tenant cannot be empty.`);
    } else if (tenant.includes(`_`)) {
        throw Error(`Tenant cannot contain underscore.`);
    }

    const properties = {
        __schema: schema,

        _tenant: tenant,
        _name: name,
        _type: type,

        _immediateRefresh: true
    };

    // Creates new class extended from {BaseModel}
    return cloneClass(properties);
}

module.exports = { createClass, BulkArray, BaseModel, JointModel, esClient, setClient, esErrors,
    setLoggerConfig, setLoggerUidFunction };
