'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

const BaseModel = require(`./lib/BaseModel`);
const BulkArray = require(`./lib/BulkArray`);
const { changeClient } = require(`./lib/ElasticSearch`);

/**
 * @param index {string}
 * @param schema {Joi | void}
 * @param type {string}
 * @returns {BaseClass}
 */
function createClass(index, schema = Joi.any(), type = `*`) {
    /*
     * TODO
     * test BaseModel.update, BaseModel.updateByQuery, BaseModel.search, BulkArray.update, this.setClient
     */
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

function setClient(configuration) {
    changeClient(configuration);
}

module.exports = { createClass, BulkArray, BaseModel: new BaseModel(void 0, true), setClient };
