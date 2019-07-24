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
     * @returns {Object}
     */
    get __es() {
        return this.constructor.__es;
    }

    /**
     * @returns {string}
     */
    static get _fullIndex() {
        const fullIndex = `${this._tenant}${INDEX_DELIMITER}${this._index}`;
        if (this.__typeInIndex) {
            return `${fullIndex}${INDEX_DELIMITER}${this._type}`;
        } else {
            return fullIndex;
        }
    }

    /**
     * @returns {string}
     */
    get _fullIndex() {
        return this.constructor._fullIndex;
    }

    static async _search(body, from = void 0, size = void 0, scroll = void 0) {
        //TODO
        const results = await es.search(this._fullIndex, this._type, body, from, size, scroll);

        return _.map(results.body.hits.hits, (result) => {
            if (this.__typeInIndex) {
                const TypedClass = this.type(result._type);
                return new TypedClass(result._source, result._id);
            } else {
                return new this(result._source, result._id);
            }
        });
    }

    static async findAll() {
        //TODO
        const body = {
            query: {
                match_all: {}
            }
        };
        const results = await es.search(this._fullIndex, this._type, body);

        return _.map(results.body.hits.hits, (result) => {
            if (this.__typeInIndex) {
                const TypedClass = this.type(result._type);
                return new TypedClass(result._source, result._id);
            } else {
                return new this(result._source, result._id);
            }
        });
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
                const result = await es.get(this._fullIndex, this._type, myId);
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
        const results = await es.search(this._fullIndex, this._type, body);

        const myResults = _.get(results, `body.hits.hits`);
        if (single) {
            if (myResults.length <= 0) {
                return null;
            } else {
                if (this.__typeInIndex) {
                    const TypedClass = this.type(myResults[0]._type);
                    return new TypedClass(myResults[0]._source, myResults[0]._id);
                } else {
                    return new this(myResults[0]._source, myResults[0]._id);
                }
            }
        } else {
            if (myResults.length <= 0) {
                return [];
            } else {
                for (const myResult of myResults) {
                    if (this.__typeInIndex) {
                        const TypedClass = this.type(myResult._type);
                        return new TypedClass(myResult._source, myResult._id);
                    } else {
                        return new this(myResult._source, myResult._id);
                    }
                }
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
                const result = await es.remove(this._fullIndex, this._type, id);
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
        let body = {};
        if (force) {
            body = _.cloneDeep(this);
        } else {
            body = await this.validate();
        }

        //ensure ID is not presented in the body
        delete body._id;

        const result = await es.index(this._fullIndex, this.constructor._type, body, this._id);
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
        const result = await es.get(this._fullIndex, this.constructor._type, this._id);

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
        const copy = copyClass(this);
        copy._tenant = newTenant;

        return copy;
    }

    /**
     * Creates class copy with type specified, only for documents
     * @param newType {string}
     * @returns {BaseModel}
     */
    static type(newType) {
        const copy = copyClass(this);
        copy._type = newType;
        copy.__typeInIndex = true;

        return copy;
    }
}

module.exports = (() => {
    const name = require.resolve(`./BaseModel`);
    delete require.cache[name];

    setProperties(BaseModel);

    return BaseModel;
})();

/**
 * Creates copy of BaseModel class
 * @param properties {Object} Original class to copy properties
 * @returns {BaseModel}
 */
function copyClass(properties) {
    const newClass = require(`./BaseModel`);
    setProperties(newClass, properties);

    return newClass;
}

/**
 * Sets given properties to object
 * @param obj {Object} Object to which the properties will be set
 * @param properties {Object} Properties to set
 */
function setProperties(obj, properties = {}) {
    Object.defineProperty(obj, `_index`, {
        value: properties._index,
        writable: true,
        enumerable: false
    });
    Object.defineProperty(obj, `_tenant`, {
        value: properties._tenant,
        writable: true,
        enumerable: false
    });
    Object.defineProperty(obj, `__schema`, {
        value: properties.__schema,
        writable: true,
        enumerable: false
    });
    Object.defineProperty(obj, `_type`, {
        value: properties._type,
        writable: true,
        enumerable: false
    });
    Object.defineProperty(obj, `__typeInIndex`, {
        value: properties.__typeInIndex,
        writable: true,
        enumerable: false
    });

    //Copy custom functions / objects
    //TODO - it doesn't copy rewritten static functions
    for (const property of Object.getOwnPropertyNames(properties)) {
        if (_.isUndefined(obj[property])) {
            if (typeof properties[property] === `function`) {
                obj[property] = properties[property];
            } else {
                obj[property] = _.cloneDeep(properties[property]);
            }
        }
    }
}
