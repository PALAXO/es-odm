'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);

const es = require(`./ElasticSearch`);

const nconf = require(`./config/config`);
const configuration = {
    validatorConfig: nconf.get(`joi:validatorConfig`)
};

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

        Object.defineProperty(this, `_id`, {
            value: _id,
            writable: true,
            enumerable: false
        });

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
        const fullIndex = `${this._tenant}_${this._index}`;
        if (this.__typeInIndex) {
            return `${fullIndex}_${this._type}`;
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

        const results = await this.__es.search(this.__fullIndex, this.__esType, body, from, size, scroll);

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

    /**
     * Gets entries by given string or array of strings
     * @param ids {string | Array<string>} Id or Ids to be find
     * @returns {Promise<BaseModel | Array<BaseModel>>}
     */
    static async get(ids) {
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use 'get' with current type!`);
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
                const result = await this.__es.get(this.__fullIndex, this.__esType, myId);
                return new this(result.body._source, result.body._id);
            })());
        }

        if (single) {
            return promises[0];
        } else {
            return Promise.all(promises);
        }
    }

    /**
     * Finds entries by given string or array of strings, uses search function
     * @param ids {string | Array<string>} Id or Ids to be find
     * @returns {Promise<BaseModel | Array<BaseModel>>}
     */
    static async find(ids) {
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

    /**
     * Deletes entries by given string or array of strings
     * @param ids {string | Array<string>} Id or Ids to be deleted
     * @returns {Promise<boolean | Array<boolean>>} Boolean or array of booleans indicating result
     */
    static async delete(ids) {
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use 'delete' with current type!`);
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
        for (const id of ids) {
            promises.push((async () => {
                try {
                    await this.__es.delete(this.__fullIndex, this.__esType, id);
                    return true;
                } catch (err) {
                    return false;
                }
            })());
        }

        if (single) {
            return promises[0];
        } else {
            return Promise.all(promises);
        }
    }

    /**
     * Checks if entries exist
     * @param ids {string | Array<string>} Id or Ids to check
     * @returns {Promise<boolean | Array<boolean>>} Boolean or array of booleans indicating result
     */
    static async exists(ids) {
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use 'exists' with current type!`);
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
        for (const id of ids) {
            promises.push((async () => {
                const result = await this.__es.exists(this.__fullIndex, this.__esType, id);
                return result.body;
            })());
        }

        if (single) {
            return promises[0];
        } else {
            return Promise.all(promises);
        }
    }

    /**
     * Saves document to database
     * @param force {boolean} If true, skips validations
     * @returns {Promise<void>} Nothing or new instance when cloning
     */
    async save(force = false) {
        let body = {};
        if (force) {
            body = _.cloneDeep(this);
        } else {
            body = await this.validate();
        }

        //ensure ID is not presented in the body
        delete body._id;

        const result = await this.constructor.__es.index(this.constructor.__fullIndex, this.constructor.__esType, body, this._id);
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
        const result = await this.constructor.__es.get(this.constructor.__fullIndex, this.constructor.__esType, this._id);

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
     * Runs joi validation on this instance
     * @returns {Promise<*>} Deep copy of validated instance
     */
    async validate() {
        const objectCopy = _.cloneDeep(this);
        return Joi.validate(objectCopy, objectCopy.constructor.__schema, configuration.validatorConfig);
    }

    /**
     * Clones class
     * May be used to rewrite some functions / properties
     * @param changes {Object} Changes to apply to cloned object
     * @returns {BaseModel}
     */
    static clone(changes = {}) {
        const clone = cloneClass(this);
        for (const [key, value] of Object.entries(changes)) {
            clone[key] = value;
        }

        //cosmetic
        setClassName(clone);

        return clone;
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

        const changes = {
            _tenant: newTenant
        };
        return this.clone(changes);
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

        const changes = {
            _type: newType,
            __typeInIndex: true
        };
        return this.clone(changes);
    }
}

module.exports = cloneClass;

/**
 * Creates clone of BaseModel class
 * @param properties {Object} Original class with properties to be copied
 * @returns {BaseModel}
 */
function cloneClass(properties = {}) {
    const newClass = class extends BaseModel {};

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

    //cosmetic
    setClassName(newClass);

    return newClass;
}

/**
 * Rewrites class name to its full index
 * @param newClass {BaseModel}
 */
function setClassName(newClass) {
    Object.defineProperty(newClass, `name`, {
        value: newClass.__fullIndex,
        writable: false,
        enumerable: false
    });
}
