'use strict';

const _ = require(`lodash`);
const Joi = require(`@hapi/joi`);
const nconf = require(`./config/config`);

const { es } = require(`./ElasticSearch`);
const BulkArray = require(`./BulkArray`);

const defaultConfiguration = {
    VALIDATOR_CONFIG: nconf.get(`joi:validatorConfig`),
    RETRY_ON_CONFLICT: nconf.get(`es:retryOnConflict`),
    MAX_RESULTS: nconf.get(`es:maxResults`)
};


/**
 * This is needed due to possible bug is JSDoc parser...
 * @typedef {typeof BaseModel} BaseModelType
 */


class BaseModel {
    /**
     * @property __schema       {Object}
     * @property __typeInIndex  {boolean}
     *
     * @property _tenant        {string}
     * @property _index         {string}
     * @property _type          {string}
     *
     * @property __es           {Object}
     * @property __fullIndex    {string}
     * @property __esType       {string}
     */

    /**
     * Creates new instance
     * @param data      {Object}    Optional object, from which the instance is constructed
     * @param _id       {string}    Optional id
     * @param _version  {string}    Optional ES version
     */
    constructor(data = {}, _id = void 0, _version = void 0) {
        if (_.isNil(this.constructor._index) || !_.isString(this.constructor._index) || this.constructor._index === `*`) {
            throw Error(`Class doesn't have specified index!`);
        }

        if (_.isNil(this.constructor._type) || !_.isString(this.constructor._type) || this.constructor._type === `*`) {
            throw Error(`Class doesn't have specified type!`);
        }

        Object.defineProperty(this, `_id`, {
            value: _id,
            writable: true,
            enumerable: false
        });
        Object.defineProperty(this, `_version`, {
            value: _version,
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
        return es();
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
     * @param body  {Object}                        Body object
     * @param from  {number}                        Start entry
     * @param size  {number}                        Number of entries
     * @returns     {Promise<BulkArray<BaseModel>>}
     */
    static async search(body, from = void 0, size = void 0) {
        if (_.isNil(body) || (!_.isObject(body) && !_.isString(body))) {
            throw Error(`Body must be an object!`);
        }

        //Set correct from and size
        if (typeof from === `string`) {
            from = _.parseInt(from);
        }
        if (typeof size === `string`) {
            size = _.parseInt(size);
        }

        if (_.isFinite(from) && _.isFinite(size)) {
            if (from < 0 || size < 0) {
                throw Error(`From and size can't be lower than zero!`);
            } else {
                //OK
            }
        } else if (_.isFinite(from)) {
            if (from < 0) {
                throw Error(`From can't be lower than zero!`);
            } else {
                size = Number.MAX_SAFE_INTEGER;
            }
        } else if (_.isFinite(size)) {
            if (size < 0) {
                throw Error(`Size can't be lower than zero!`);
            } else {
                from = 0;
            }
        } else {
            from = 0;
            size = Number.MAX_SAFE_INTEGER;
        }

        const bulk = new BulkArray();
        if (from + size <= 0) {
            return bulk;
        }

        let counter = 0;
        let full = false;
        let results = await this.__es.search(this.__fullIndex, this.__esType, body, 0, defaultConfiguration.MAX_RESULTS, true);
        do {
            const startIndex = Math.min(results.body.hits.hits.length, Math.max(0, from - counter));
            counter += startIndex;

            for (let i = startIndex; i < results.body.hits.hits.length; i++) {
                const result = results.body.hits.hits[i];

                let constructor = this.clone();
                if (constructor._type !== result._type) {
                    constructor = constructor.type(result._type);
                }
                if (constructor.__fullIndex !== result._index) {
                    const tenant = result._index.substring(0, result._index.length - constructor.__fullIndex.length + 1);
                    constructor = constructor.in(tenant);
                }

                bulk.push(new constructor(result._source, result._id, result._version));

                counter++;
                if (counter >= from + size) {
                    full = true;
                    break;
                }
            }

            if (!full) {
                results = await this.__es.scroll(results.body._scroll_id);
            }
        } while (results.body.hits.hits.length > 0 && !full);

        return bulk;
    }

    /**
     * Finds all entries
     * @returns {Promise<BulkArray<BaseModel>>}
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
     * Finds entries by given string or array of strings, uses search function
     * @param ids   {string | Array<string>}                    Id or Ids to be find
     * @returns     {Promise<BaseModel | BulkArray<BaseModel>>}
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
     * Gets entries by given string or array of strings
     * @param ids   {string | Array<string>}                    Id or Ids to be find
     * @returns     {Promise<BaseModel | BulkArray<BaseModel>>}
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
                return new this(result.body._source, result.body._id, result.body._version);
            })());
        }

        if (single) {
            return promises[0];
        } else {
            const results = await Promise.all(promises);
            return new BulkArray(...results);
        }
    }

    /**
     * Deletes entries by given string or array of strings
     * @param ids   {string | Array<string>}    Id or Ids to be deleted
     * @returns     {Promise<Object>}           ES response
     */
    static async delete(ids) {
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use 'delete' with current type!`);
        }

        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            //ok
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        if(ids.length <= 0) {
            return;
        }

        const bulkBody = [];
        for (const id of ids) {
            bulkBody.push({
                delete: {
                    _index: this.__fullIndex,
                    _type: this.__esType,
                    _id: id
                }
            });
        }
        const result = await this.__es.bulk(bulkBody);
        return result.body;
    }

    /**
     * Checks if entries exist
     * @param ids   {string | Array<string>}                Id or Ids to check
     * @returns     {Promise<boolean | Array<boolean>>}     Boolean or array of booleans indicating result
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
     * Partially updates given entries
     * @param ids               {string | Array<string>}    Id or Ids to be updated
     * @param body              {Object}                    ES body with changes
     * @param retryOnConflict   {number}                    Number of retries in case of version conflict
     * @returns                 {Promise<Object>}           ES response
     */
    static async update(ids, body, retryOnConflict = defaultConfiguration.RETRY_ON_CONFLICT) {
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use 'update' with current type!`);
        }

        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            //ok
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        if(ids.length <= 0) {
            return;
        }

        const bulkBody = [];
        for (const id of ids) {
            bulkBody.push({
                update: {
                    _index: this.__fullIndex,
                    _type: this.__esType,
                    _id: id,
                    retry_on_conflict: retryOnConflict
                }
            });

            bulkBody.push(body);
        }
        const result = await this.__es.bulk(bulkBody);
        return result.body;
    }

    /**
     * Partially updates entries
     * @param body  {Object}            ES body with query and changes
     * @returns     {Promise<Object>}   ES response
     */
    static async updateByQuery(body) {
        const result = await this.__es.updateByQuery(this.__fullIndex, this.__esType, body);
        return result.body;
    }

    /**
     * Deletes entries by query
     * @param body  {Object}            ES body with query
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteByQuery(body) {
        const result = await this.__es.deleteByQuery(this.__fullIndex, this.__esType, body);
        return result.body;
    }

    /**
     * Saves document to database
     * @param force         {boolean}           If true, skips validations
     * @param useVersion    {boolean}           If true, sends version to ES
     * @returns             {Promise<void>}
     */
    async save(force = false, useVersion = false) {
        if (!force) {
            await this.validate();
        }

        const result = await this.constructor.__es.index(this.constructor.__fullIndex, this.constructor.__esType, _.cloneDeep(this),
            this._id, (useVersion) ? this._version : void 0);
        this._id = result.body._id;
        this._version = result.body._version;
    }

    /**
     * Reloads instance data from ES
     * @returns {Promise<void>}
     */
    async reload() {
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet!`);
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
        this._version = result.body._version;
    }

    /**
     * Deletes instance from ES
     * @returns {Promise<void>}
     */
    async delete() {
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }

        //Throws if not in ES
        await this.constructor.__es.delete(this.constructor.__fullIndex, this.constructor.__esType, this._id);
    }

    /**
     * Creates clone of this instance
     * @param _id   {string}    New id
     * @returns     {BaseModel}
     */
    clone(_id = void 0) {
        return new this.constructor(_.cloneDeep(this), _id);
    }

    /**
     * Runs joi validation on this instance
     * @returns {Promise<void>}
     */
    async validate() {
        await Joi.validate(this, this.constructor.__schema, defaultConfiguration.VALIDATOR_CONFIG);
    }

    /**
     * Clones class
     * May be used to rewrite some functions / properties
     * @param changes   {Object}    Changes to apply to cloned object
     * @returns         {BaseModel}
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
     * @param newTenant     {string}
     * @returns             {BaseModelType}
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
     * @param newType   {string}
     * @returns         {BaseModelType}
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

module.exports = { cloneClass, BaseModel };

/**
 * Creates clone of BaseModel class
 * @param properties    {Object}    BaseModel inherited class or object with properties to be copied
 * @returns             {BaseModelType}
 */
function cloneClass(properties = {}) {
    let newClass;

    if (properties.prototype instanceof BaseModel) {
        newClass = class extends properties {};
    } else {
        newClass = class extends BaseModel {};

        for (const [key, value] of Object.entries(properties)) {
            if (typeof value === `function`) {
                newClass[key] = value;
            } else {
                newClass[key] = _.cloneDeep(value);
            }
        }
    }

    //cosmetic
    setClassName(newClass);

    return newClass;
}


/**
 * Rewrites class name to its full index
 * @param newClass {BaseModelType}
 */
function setClassName(newClass) {
    Object.defineProperty(newClass, `name`, {
        value: newClass.__fullIndex,
        writable: false,
        enumerable: false
    });
}
