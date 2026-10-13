import Joi from 'joi';
import _ from 'lodash';

import Action from './lib/Action.js';
import BaseModel from './lib/BaseModel.js';
import JointModel from './lib/JointModel.js';
import BulkArray from './lib/BulkArray.js';
import { esClient, setClient, esErrors } from './lib/elasticsearch.js';
import logger from './lib/logger.js';
import nconf from './lib/config/config.js';
import utils from './lib/utils.js';

//Re-exported so that consumers can name the types of the public surface without deep-importing the modules
/**
 * @template {BaseModel} T
 * @typedef {import('./lib/BulkArray.js').SearchResult<T>} SearchResult
 */
/** @typedef {import('./lib/BulkArray.js').SearchMetadata} SearchMetadata */
/** @typedef {import('./lib/BaseModel.js').SearchBody} SearchBody */
/** @typedef {import('./lib/BaseModel.js').SearchAdditional} SearchAdditional */
/** @typedef {import('./lib/BaseModel.js').CountBody} CountBody */
/** @typedef {import('./lib/BaseModel.js').UpdateByQueryBody} UpdateByQueryBody */
/** @typedef {import('./lib/BaseModel.js').DeleteByQueryBody} DeleteByQueryBody */
/** @typedef {import('./lib/BaseModel.js').CreateIndexBody} CreateIndexBody */
/** @typedef {import('./lib/BaseModel.js').PutMappingBody} PutMappingBody */
/** @typedef {import('./lib/BulkArray.js').BulkItemStatus} BulkItemStatus */
/** @typedef {import('./lib/BulkArray.js').BulkEsStatus} BulkEsStatus */
/** @typedef {import('./lib/elasticsearch.js').EsResponse} EsResponse */

/**
 * Creates a new model class
 * @template {abstract new (...args: any) => BaseModel} [B=typeof BaseModel]
 * @param name          {string}            Base name of the index
 * @param schema        {Joi.Schema=}       Joi schema of the instances
 * @param tenant        {string=}           Tenant, a wildcard by default
 * @param Base          {B=}                Class to extend - BaseModel itself or a subclass of it, so that the models may share
 *                                          members of their own; the created class keeps its type
 * @returns             {B}                 New subclass of the given base class
 */
function createClass(name, schema = Joi.object(), tenant = `*`, Base = BaseModel) {
    if (_.isNil(name) || !_.isString(name) || _.isEmpty(name)) {
        throw Error(`You have to specify an index name.`);
    } else if (name.includes(`-`)) {
        throw Error(`Index name cannot contain dash.`);
    } else if (_.isNil(tenant) || !_.isString(tenant) || _.isEmpty(tenant)) {
        throw Error(`Tenant cannot be empty.`);
    } else if (tenant.includes(`_`)) {
        throw Error(`Tenant cannot contain underscore.`);
    } else if (!_.isFunction(Base) || (Base !== BaseModel && !(Base.prototype instanceof BaseModel))) {
        throw Error(`Base class must be BaseModel or its subclass.`);
    }

    return utils.cloneClass(Base, {
        schema: schema,
        _tenant: tenant,
        _name: name,
        _immediateRefresh: true
    });
}

/**
 * Sets ODM configuration
 * - "warning" holds the thresholds at or above which a single ODM call logs a warning, zero disables a threshold
 * - "retries" is the policy of repeating a call ES answered with 429: the call is repeated at most "maxRetries" times,
 *   waiting "100 * base ^ attempt" milliseconds before each attempt. Not to be confused with the "maxRetries" of
 *   "setClient", which the ES client applies to connection failures itself
 * @param configuration {{warning?: {downloadedMiB?: string | number, searchCalls?: string | number}, retries?: {base?: string | number, maxRetries?: string | number}}=}
 */
function setConfiguration(configuration) {
    const downloadedMiB = toNumber(configuration?.warning?.downloadedMiB);
    if (!_.isNil(downloadedMiB)) {
        nconf.set(`warning:downloadedB`, Math.floor(downloadedMiB * 1048576));
    }

    const searchCalls = toNumber(configuration?.warning?.searchCalls);
    if (!_.isNil(searchCalls)) {
        nconf.set(`warning:searchCalls`, Math.floor(searchCalls));
    }

    const retriesBase = toNumber(configuration?.retries?.base);
    if (!_.isNil(retriesBase) && retriesBase > 0) {
        nconf.set(`es:retries:base`, retriesBase);
    }

    const maxRetries = toNumber(configuration?.retries?.maxRetries);
    if (!_.isNil(maxRetries) && maxRetries >= 0) {
        nconf.set(`es:retries:maxRetries`, Math.floor(maxRetries));
    }
}

/**
 * Parses a configuration value which has to be a number
 * @param value {string | number | undefined} Value to parse
 * @returns {number | undefined} The number, or undefined when the value is not one
 */
function toNumber(value) {
    if (_.isFinite(value)) {
        return value;
    } else if (_.isString(value) && !_.isEmpty(value.trim()) && _.isFinite(Number(value))) {
        return Number(value);
    } else {
        return void 0;
    }
}

/**
 * Calls an arbitrary ES API through the library's client, with the standard 429 retry, logging and streamed-response handling
 * @param functionPath {string} Dot-separated path of the ES client API, e.g. "indices.stats" or "snapshot.create"
 * @param params {Record<string, any>=} API parameters
 * @param additional {{asStream?: boolean}=} "asStream" streams the response and parses it, bypassing the maximum string length
 * @returns {Promise<EsResponse>} Full ES response envelope
 */
async function callEs(functionPath, params = void 0, additional = void 0) {
    if (_.isNil(functionPath) || !_.isString(functionPath) || _.isEmpty(functionPath)) {
        throw Error(`You have to specify an ES API.`);
    }

    const myAction = new Action(`callEs`, functionPath);
    const result = await myAction.callEs(`call`, functionPath, params, additional);

    myAction.finish();
    return result;
}

/**
 * Sends given operations through the ES Bulk API, splitting the payload when it is too large
 * All operations must be of the same type, payload lines must directly follow their operation line
 * @param operations {NonNullable<import('@elastic/elasticsearch').estypes.BulkRequest['operations']>} Bulk API operations
 * @param refresh {boolean | string=} "refresh" parameter of the bulk API
 * @returns {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>} ES bulk response
 */
async function sendBulk(operations, refresh = true) {
    if (!_.isArray(operations)) {
        throw Error(`Operations must be an array!`);
    }

    const myAction = new Action(`sendBulk`);
    const result = await myAction.sendBulk(operations, refresh);

    myAction.finish();
    return result.body;
}

export {
    createClass,
    BaseModel, BulkArray, JointModel,
    esClient, setClient, esErrors,
    setConfiguration,
    callEs, sendBulk
};
export const setLoggerConfig = logger.setLoggerConfig;
export const setLoggerUidFunction = logger.setLoggerUidFunction;
