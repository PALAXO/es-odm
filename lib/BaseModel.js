'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

const es = require(`./ElasticSearch`);

const nconf = require(`./config/config`);
const VALIDATOR_CONFIG = nconf.get(`joi:validatorConfig`);
const INDEX_DELIMITER = nconf.get(`es:indexDelimiter`);

class BaseModel {
    /**
     * Creates new instance
     * @param data {Object} Optional object, from which the instance is constructed
     * @param _id {string} Optional id
     */
    constructor(data = {}, _id = void 0) {
        if (_.isNil(this.constructor._type) || !_.isString(this.constructor._type) || this.constructor._type === `*`) {
            throw Error(`Type must be specified!`);
        }

        if (_id) {
            this._id = _id;
        }

        for (const [key, value] of Object.entries(data)) {
            this[key] = value;
        }

    }

    /**
     * Returns object with ElasticSearch client and some predefined functions
     * @private {Object}
     */
    static get __es() {
        return es;
    }

    /**
     * @returns {string}
     */
    static get __fullIndex() {
        const fullIndex = `${this._tenant}${INDEX_DELIMITER}${this._index}`;
        if (this.__typeInIndex) {
            return `${fullIndex}${INDEX_DELIMITER}${this._type}`;
        } else {
            return fullIndex;
        }
    }

    /**
     * @returns {void | string}
     */
    static get __esType() {
        return (this._type === `*`) ? void 0 : this._type;
    }

    /**
     * Performs ES search
     * @param body {Object} Body object
     * @param from {number} Start entry
     * @param size {number} Number of entries
     * @param scroll {Object} Scroll
     * @returns {Promise<Array<BaseModel>>}
     */
    static async search(body, from = void 0, size = void 0, scroll = void 0) {
        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        const results = await es.search(this.__fullIndex, this.__esType, body, from, size, scroll);

        return _.map(results.body.hits.hits, (result) => {
            if (this.__typeInIndex) {
                const TypedClass = this.type(result._type);
                return new TypedClass(result._source, result._id);
            } else {
                return new this(result._source, result._id);
            }
        });
    }

    /**
     * Finds all entries
     * @returns {Promise<Array<BaseModel>>}
     */
    static async findAll() {
        const body = {
            query: {
                match_all: {}
            }
        };
        return this.search(body);
    }

    static async get(ids) {
        //TODO
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use get with current type!`);
        }

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            single = false;
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        const promises = [];
        for (const myId of ids) {
            promises.push((async () => {
                const result = await es.get(this.__fullIndex, this.__esType, myId);
                return new this(result, myId);
            })());
        }

        if (single) {
            return promises[0];
        } else {
            return promises;
        }
    }

    static async find(ids) {
        //TODO
        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            single = false;
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        const body = {
            query: {
                ids: {
                    values: ids
                }
            }
        };
        const results = await this.search(body);

        if (single) {
            if (results.length <= 0) {
                return null;
            } else {
                return results[0];
            }
        } else {
            if (results.length <= 0) {
                return [];
            } else {
                return results;
            }
        }
    }

    static async delete(ids) {
        //TODO
        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            single = false;
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        const promises = [];
        for (const id of ids) {
            promises.push((async () => {
                const result = await es.delete(this.__fullIndex, this.__esType, id);
                return result.body;
            })());
        }

        if (single) {
            return promises[0];
        } else {
            return promises;
        }
    }

    /**
     * Saves document to database
     * @param force {boolean} If true, skips validations
     * @returns {Promise<void>} Nothing or new instance when cloning
     */
    async save(force = false) {
        //TODO - do we want to modify instance by Joi validations?
        let body = {};
        if (force) {
            body = _.cloneDeep(this);
        } else {
            body = await this.validate();
        }

        //ensure ID is not presented in the body
        delete body._id;

        const result = await es.index(this.constructor.__fullIndex, this.constructor.__esType, body, this._id);
        this._id = result.body._id;
    }

    /**
     * Reloads instance data from ES
     * @returns {Promise<void>}
     */
    async reload() {
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }

        //Throws if not in ES
        const result = await es.get(this.constructor.__fullIndex, this.constructor.__esType, this._id);

        //Delete all existing properties
        for (const key of Object.keys(this)) {
            delete this[key];
        }

        for (const [key, value] of Object.entries(result.body._source)) {
            this[key] = value;
        }
        this._id = result.body._id;
    }

    /**
     * Runs joi validation on this instance, returns deep copy of validated object
     * @returns {Promise<*>} Deep copy of validated object
     */
    async validate() {
        const validated = await Joi.validate(this, this.constructor.__schema, VALIDATOR_CONFIG);

        return _.cloneDeep(validated);
    }

    /**
     * Creates class copy with tenant specified
     * @param newTenant {string}
     * @returns {BaseModel}
     */
    static in(newTenant) {
        if (_.isNil(newTenant) || !_.isString(newTenant)) {
            throw Error(`Tenant must be a string!`);
        }

        const copy = cloneClass(this);
        copy._tenant = newTenant;

        return copy;
    }

    /**
     * Creates class copy with type specified, only for documents
     * @param newType {string}
     * @returns {BaseModel}
     */
    static type(newType) {
        if (_.isNil(newType) || !_.isString(newType)) {
            throw Error(`Type must be a string!`);
        }

        const copy = cloneClass(this);
        copy._type = newType;
        copy.__typeInIndex = true;

        return copy;
    }
}

module.exports = cloneClass;

/**
 * Creates clone of BaseModel class
 * @param properties {Object} Original class to copy properties
 * @returns {BaseModel}
 */
function cloneClass(properties = {}) {
    const newClass = class extends BaseModel {};

    Object.defineProperty(newClass, `__schema`, {
        value: properties.__schema,
        writable: true,
        enumerable: false
    });
    Object.defineProperty(newClass, `__typeInIndex`, {
        value: properties.__typeInIndex,
        writable: true,
        enumerable: false
    });

    Object.defineProperty(newClass, `_tenant`, {
        value: properties._tenant,
        writable: true,
        enumerable: false
    });
    Object.defineProperty(newClass, `_index`, {
        value: properties._index,
        writable: true,
        enumerable: false
    });
    Object.defineProperty(newClass, `_type`, {
        value: properties._type,
        writable: true,
        enumerable: false
    });

    //Copy custom functions / objects
    const objProperties = Object.getOwnPropertyNames(newClass);
    for (const property of Object.getOwnPropertyNames(properties)) {
        if (!_.includes(objProperties, property)) {
            if (typeof properties[property] === `function`) {
                newClass[property] = properties[property];
            } else {
                newClass[property] = _.cloneDeep(properties[property]);
            }
        }
    }

    return newClass;
}
