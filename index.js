import Joi from 'joi';
import _ from 'lodash';

import BaseModel from './lib/BaseModel.js';
import JointModel from './lib/JointModel.js';
import BulkArray from './lib/BulkArray.js';
import { esClient, setClient, esErrors } from './lib/elasticsearch.js';
import logger from './lib/logger.js';
import nconf from './lib/config/config.js';
import utils from './lib/utils.js';

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

/**
 * Sets ODM configuration
 * @param configuration {{warning: {downloadedMiB: string | number, searchCalls: string | number}}}
 */
function setConfiguration(configuration) {
    const downloadedMiB = configuration?.warning?.downloadedMiB;
    if (_.isFinite(parseInt(downloadedMiB, 10))) {
        nconf.set(`warning:downloadedB`, parseInt(downloadedMiB, 10) * 1048576);
    }

    const searchCalls = configuration?.warning?.searchCalls;
    if (_.isFinite(parseInt(searchCalls, 10))) {
        nconf.set(`warning:searchCalls`, Math.floor(parseInt(searchCalls, 10)));
    }
}

export {
    createClass,
    BaseModel, BulkArray, JointModel,
    esClient, setClient, esErrors,
    setConfiguration
};
export const setLoggerConfig = logger.setLoggerConfig;
export const setLoggerUidFunction = logger.setLoggerUidFunction;
