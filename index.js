'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

const BaseModel = require(`./lib/BaseModel`);
const JointModel = require(`./lib/JointModel`);
const BulkArray = require(`./lib/BulkArray`);
const { esClient, setClient, esErrors } = require(`./lib/elasticsearch`);
const { setLoggerConfig, setLoggerUidFunction } = require(`./lib/logger`);
const utils = require(`./lib/utils`);

/**
 * This is needed due to possible bug is JSDoc parser...
 * @typedef {typeof BaseModel} BaseModelType
 */

/**
 * @param name          {string}
 * @param schema        {Joi | void}
 * @param tenant        {string}
 * @returns             {BaseModelType}
 */
function createClass(name, schema = Joi.object(), tenant = `*`) {
    if (_.isNil(name) || !_.isString(name) || _.isEmpty(name)) {
        throw Error(`You have to specify an index name.`);
    } else if (_.isNil(tenant) || !_.isString(tenant) || _.isEmpty(tenant)) {
        throw Error(`Tenant cannot be empty.`);
    } else if (tenant.includes(`_`)) {
        throw Error(`Tenant cannot contain underscore.`);
    }

    return utils.cloneClass(BaseModel, {
        schema: schema,
        _tenant: tenant,
        _name: name,
        _immediateRefresh: true
    });
}

module.exports = {
    createClass,
    BaseModel, BulkArray, JointModel,
    esClient, setClient, esErrors,
    setLoggerConfig, setLoggerUidFunction
};
