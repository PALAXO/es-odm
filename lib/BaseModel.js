'use strict';

const _ = require(`lodash`);
const uuid = require(`uuid/v4`);
const nconf = require(`./config/config`);

const { es, errors } = require(`./ElasticSearch`);
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
     * Creates new instance
     * @param data          {Object}    Optional object, from which the instance is constructed
     * @param _id           {string}    Optional id
     * @param _version      {number}    Optional ES version
     * @param _highlight    {string}    Optional ES highlight
     */
    constructor(data = {}, _id = void 0, _version = void 0, _highlight = void 0) {
        if (_.isNil(this.constructor._index) || !_.isString(this.constructor._index) || this.constructor._index === `*`) {
            throw Error(`Class doesn't have specified index!`);
        }

        if (_.isNil(this.constructor._type) || !_.isString(this.constructor._type) || this.constructor._type === `*`) {
            throw Error(`Class doesn't have specified type!`);
        }

        /**
         * @type {string} ES id
         */
        Object.defineProperty(this, `_id`, {
            value: _id,
            writable: true,
            enumerable: false
        });
        /** @type {number} ES version */
        Object.defineProperty(this, `_version`, {
            value: _version,
            writable: true,
            enumerable: false
        });
        /** @type {string} ES highlight */
        Object.defineProperty(this, `_highlight`, {
            value: _highlight,
            writable: true,
            enumerable: false
        });
        /** @type {string} Internal uuid */
        Object.defineProperty(this, `__uuid`, {
            value: uuid(),
            writable: true,
            enumerable: false
        });

        for (const [key, value] of Object.entries(data)) {
            this[key] = value;
        }
    }

    /**
     * Returns object with ElasticSearch client and some predefined functions
     * @returns {Object}
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
     * @param body      {Object}                        Body object
     * @param from      {number}                        Start entry
     * @param size      {number}                        Number of entries
     * @param source    {String[] | boolean}            Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns         {Promise<BulkArray<BaseModel> | Object[]>}
     */
    static async search(body, from = void 0, size = void 0, source = void 0) {
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

        if (_.isFinite(from)) {
            if (from < 0) {
                throw Error(`From can't be lower than zero!`);
            } else {
                //OK
            }
        } else {
            if (_.isFinite(body.from)) {
                if (body.from < 0) {
                    throw Error(`From in body can't be lower than zero!`);
                } else {
                    from = body.from;
                }
            } else {
                from = 0;
            }
        }

        if (_.isFinite(size)) {
            if (size < 0) {
                throw Error(`Size can't be lower than zero!`);
            } else {
                //OK
            }
        } else {
            if (_.isFinite(body.size)) {
                if (body.size < 0) {
                    throw Error(`Size in body can't be lower than zero!`);
                } else {
                    size = body.size;
                }
            } else {
                size = Number.MAX_SAFE_INTEGER - from;
            }
        }

        const returnArray = (_.isNil(source)) ? new BulkArray() : [];

        let counter = 0;
        let full = false;
        const mySize = Math.min(from + size, defaultConfiguration.MAX_RESULTS);
        //Do not specify from (or only 0) - not supported for scrolls
        let results = await this.__es.search(this.__fullIndex, this.__esType, body, void 0, mySize, (mySize > 0), source);
        if (results.body.aggregations) {
            Object.defineProperty(returnArray, `aggregations`, {
                value: results.body.aggregations,
                writable: true,
                enumerable: false
            });
        }
        if (_.isNil(source)) {
            returnArray._total = results.body.hits.total;
        }

        do {
            const startIndex = Math.min(results.body.hits.hits.length, Math.max(0, from - counter));
            counter += startIndex;

            for (let i = startIndex; i < results.body.hits.hits.length; i++) {
                const result = results.body.hits.hits[i];

                if (_.isNil(source)) {
                    let constructor = this.clone();
                    if (constructor._type !== result._type) {
                        constructor = constructor.type(result._type);
                    }
                    if (constructor.__fullIndex !== result._index) {
                        const tenant = result._index.substring(0, result._index.length - constructor.__fullIndex.length + 1);
                        constructor = constructor.in(tenant);
                    }

                    returnArray.push(new constructor(result._source, result._id, result._version, result.highlight));
                } else {
                    returnArray.push(result);
                }

                counter++;
                if (counter >= from + size) {
                    full = true;
                    break;
                }
            }

            if (results.body.hits.hits.length > 0 && !full) {
                results = await this.__es.scroll(results.body._scroll_id);
            }
        } while (results.body.hits.hits.length > 0 && !full);

        return returnArray;
    }

    /**
     * Finds all entries
     * @param source    {String[] | boolean}        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns {Promise<BulkArray<BaseModel>>}
     */
    static async findAll(source = void 0) {
        const body = {
            query: {
                match_all: {}
            }
        };
        return this.search(body, void 0, void 0, source);
    }

    /**
     * Finds entries by given string or array of strings, uses search function
     * @param ids       {string | Array<string>}            Id or Ids to be found
     * @param source    {String[] | boolean}                Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns         {Promise<BulkArray<BaseModel>>}
     */
    static async find(ids, source = void 0) {
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            //ok
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
        const array = await this.search(body, void 0, void 0, source);

        //Note not found items to bulkArray
        if (array instanceof BulkArray) {
            const foundIds = _.map(array, (item) => item._id);
            for (const id of ids) {
                if (!foundIds.includes(id)) {
                    array.notFound(id, this.__fullIndex);
                }
            }
        }

        return array;
    }

    /**
     * Gets entries by given string or array of strings
     * @param ids   {string | Array<string>}                    Id or Ids to be found
     * @returns     {Promise<BaseModel | BulkArray<BaseModel>>}
     */
    static async get(ids) {
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use 'get' with current type!`);
        }

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.isEmpty(ids)) {
            return new BulkArray();
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            single = false;
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        const results = await this.__es.mget(this.__fullIndex, this.__esType, ids);

        const models = [];
        for (const result of results.body.docs) {
            if (!result.found) {
                throw new errors.ResponseError({
                    statusCode: 404,
                    body: {
                        ...result
                    }
                });
            } else {
                models.push(new this(result._source, result._id, result._version, result.highlight));
            }
        }

        if (single) {
            return models[0];
        } else {
            return new BulkArray(...models);
        }
    }

    /**
     * Deletes entries by given string or array of strings
     * @param ids           {string | Array<string>}    Id or Ids to be deleted
     * @param version       {number}                    Specific version to be deleted
     * @returns             {Promise<Object>}           ES response
     */
    static async delete(ids, version = void 0) {
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use 'delete' with current type!`);
        }

        let isSingle = false;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
            isSingle = true;
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
                    _id: id,
                    _version: version
                }
            });
        }
        const result = await this.__es.bulk(bulkBody);

        if (isSingle && result.body.items[0].delete.status >= 400) {
            const item = result.body.items[0].delete;
            const errorMessage = _.has(item, `error.reason`) ? item.error.reason : _.get(item, `result`, `Error happened during delete of item with id ${ids[0]}`);
            const error = Error(errorMessage);
            error.statusCode = item.status;
            throw error;
        } else {
            return result.body;
        }
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
     * @param version           {number}                    ES version
     * @returns                 {Promise<Object>}           ES response
     */
    static async update(ids, body, version = void 0) {
        if (this.__typeInIndex && this._type === `*`) {
            throw Error(`You cannot use 'update' with current type!`);
        }

        let isSingle = false;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
            isSingle = true;
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
                    version: version,
                    retry_on_conflict: (version) ? void 0 : defaultConfiguration.RETRY_ON_CONFLICT
                }
            });

            bulkBody.push(body);
        }
        const result = await this.__es.bulk(bulkBody);

        if (isSingle && result.body.items[0].update.status >= 400) {
            const item = result.body.items[0].update;
            const errorMessage = _.has(item, `error.reason`) ? item.error.reason : _.get(item, `result`, `Error happened during update of item with id ${ids[0]}`);
            const error = Error(errorMessage);
            error.statusCode = item.status;
            throw error;
        } else {
            return result.body;
        }
    }

    /**
     * Returns number of entries in index
     * @returns     {Promise<number>}   ES response
     */
    static async count() {
        const result = await this.__es.count(this.__fullIndex, this.__esType);
        return result.body.count;
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
     * Creates index
     * @param body  {Object}            Optional settings
     * @returns     {Promise<Object>}   ES response
     */
    static async createIndex(body = void 0) {
        if (this._tenant === `*`) {
            throw Error(`You cannot use 'createIndex' with current tenant!`);
        } else if (this._type === `*`) {
            throw Error(`You cannot use 'createIndex' with current type!`);
        }

        const result = await this.__es.createIndex(this.__fullIndex, body);
        return result.body;
    }

    /**
     * Checks index existence
     * @returns     {Promise<boolean>}   ES response
     */
    static async indexExists() {
        if (this._tenant === `*`) {
            throw Error(`You cannot use 'indexExists' with current tenant!`);
        } else if (this._type === `*`) {
            throw Error(`You cannot use 'indexExists' with current type!`);
        }

        const result = await this.__es.indexExists(this.__fullIndex);
        return result.body;
    }

    /**
     * Deletes index
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteIndex() {
        if (this._tenant === `*`) {
            throw Error(`You cannot use 'deleteIndex' with current tenant!`);
        } else if (this._type === `*`) {
            throw Error(`You cannot use 'deleteIndex' with current type!`);
        }

        const result = await this.__es.deleteIndex(this.__fullIndex);
        return result.body;
    }

    /**
     * Gets mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async getMapping() {
        if (this._tenant === `*`) {
            throw Error(`You cannot use 'getMapping' with current tenant!`);
        } else if (this._type === `*`) {
            throw Error(`You cannot use 'getMapping' with current type!`);
        }

        const result = await this.__es.getMapping(this.__fullIndex, this.__esType);
        return result.body;
    }

    /**
     * Puts mapping
     * @param mapping   {Object}            ES mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async putMapping(mapping) {
        if (this._tenant === `*`) {
            throw Error(`You cannot use 'putMapping' with current tenant!`);
        } else if (this._type === `*`) {
            throw Error(`You cannot use 'putMapping' with current type!`);
        }

        const result = await this.__es.putMapping(this.__fullIndex, this.__esType, mapping);
        return result.body;
    }

    /**
     * Reindex from current model to selected one
     * @param destinationModel  {BaseModelType}     Destination type
     * @returns                 {Promise<Object>}   ES response
     */
    static async reindex(destinationModel) {
        if (this._tenant === `*`) {
            throw Error(`You cannot use 'deleteIndex' with current tenant!`);
        } else if (this._type === `*`) {
            throw Error(`You cannot use 'deleteIndex' with current type!`);
        } else if (destinationModel._tenant === `*`) {
            throw Error(`You cannot use 'deleteIndex' with destination tenant!`);
        } else if (destinationModel._type === `*`) {
            throw Error(`You cannot use 'deleteIndex' with destination type!`);
        }

        const body = {
            source: {
                index: this.__fullIndex
            },
            dest: {
                index: destinationModel.__fullIndex
            }
        };

        const result = await this.__es.reindex(body);
        return result.body;
    }

    /**
     * Saves document to database
     * @param useVersion    {boolean}           If true, sends version to ES
     * @returns             {Promise<BaseModel>}
     */
    async save(useVersion = false) {
        await this.validate();

        const result = await this.constructor.__es.index(this.constructor.__fullIndex, this.constructor.__esType, _.cloneDeep(this),
            this._id, (useVersion) ? this._version : void 0);
        this._id = result.body._id;
        this._version = result.body._version;

        return this;
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

        //Delete existing enumerable properties
        for (const key of Object.keys(this)) {
            delete this[key];
        }

        //Set new properties
        this._id = result.body._id;
        this._version = result.body._version;
        //highlight remains the same
        for (const [key, value] of Object.entries(result.body._source)) {
            this[key] = value;
        }
    }

    /**
     * Deletes instance from ES
     * @param useVersion    {boolean}           If true, sends version to ES
     * @returns             {Promise<void>}
     */
    async delete(useVersion) {
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }

        //Throws if not in ES
        await this.constructor.__es.delete(this.constructor.__fullIndex, this.constructor.__esType, this._id,
            (useVersion) ? this._version : void 0);
    }

    /**
     * Creates clone of this instance
     * @param preserveAttributes    {boolean}   If true, non-enumerable attributes are preserved, except __uuid
     * @returns     {BaseModel}
     */
    clone(preserveAttributes = true) {
        if (preserveAttributes) {
            return new this.constructor(_.cloneDeep(this), this._id, this._version, this._highlight);
        } else {
            return new this.constructor(_.cloneDeep(this));
        }
    }

    /**
     * Runs joi validation on this instance
     * @returns {Promise<void>}
     */
    async validate() {
        if (this.constructor.__schema) {
            await this.constructor.__schema.validateAsync(this, defaultConfiguration.VALIDATOR_CONFIG);
        }
    }

    /**
     * Clones class
     * May be used to rewrite some functions / properties
     * @param changes   {Object}    Changes to apply to cloned object
     * @returns         {BaseModelType}
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
     * Creates class copy with type specified
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

/**
 * @name BaseModel#__schema
 * Joi schema
 * @type {Object}
 * @static
 */

/**
 * @name BaseModel#__typeInIndex
 * Does ES index contains type?
 * @type {boolean}
 * @static
 */

/**
 * @name BaseModel#_tenant
 * Tenant
 * @type {string}
 * @static
 */

/**
 * @name BaseModel#_index
 * ES index
 * @type {string}
 * @static
 */

/**
 * @name BaseModel#_type
 * ES type
 * @type {string}
 * @static
 */
