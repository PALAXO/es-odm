'use strict';

const _ = require(`lodash`);
const { v4: uuid } = require(`uuid`);
const nconf = require(`./config/config`);

const { esClient, esErrors } = require(`./ElasticSearch`);
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
     * @param data          {Object}    Object, from which the instance is constructed
     * @param _id           {string}    ES id
     * @param _version      {number}    ES version
     * @param _highlight    {string}    ES highlight
     * @param _primary_term {number}    ES primary term
     * @param _seq_no       {number}    ES sequence number
     */
    constructor(data = {}, _id = void 0, _version = void 0, _highlight = void 0, _primary_term = void 0, _seq_no = void 0) {
        checkModelValidity(this.constructor, `constructor`);

        Object.assign(this, data);

        /**  @type {string} ES id */
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
        /** @type {number} ES primary term */
        Object.defineProperty(this, `_primary_term`, {
            value: _primary_term,
            writable: true,
            enumerable: false
        });
        /** @type {number} ES sequence number */
        Object.defineProperty(this, `_seq_no`, {
            value: _seq_no,
            writable: true,
            enumerable: false
        });

        /** @type {string} Internal uuid */
        Object.defineProperty(this, `__uuid`, {
            value: uuid(),
            writable: true,
            enumerable: false
        });
    }

    /**
     * @returns {string}
     */
    static get __fullIndex() {
        const fullIndex = `${this._tenant}_${this._index}`;
        if (this._indexType) {
            return `${fullIndex}_${this._indexType}`;
        } else {
            return fullIndex;
        }
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
        let results = await esClient.search(this.__fullIndex, body, void 0, mySize, (mySize > 0), source);
        if (results.body.aggregations) {
            Object.defineProperty(returnArray, `aggregations`, {
                value: results.body.aggregations,
                writable: true,
                enumerable: false
            });
        }
        if (_.isNil(source)) {
            returnArray._total = results.body.hits.total.value;
        }

        do {
            const startIndex = Math.min(results.body.hits.hits.length, Math.max(0, from - counter));
            counter += startIndex;

            for (let i = startIndex; i < results.body.hits.hits.length; i++) {
                const result = results.body.hits.hits[i];

                if (_.isNil(source)) {
                    let constructor = this.clone();

                    if (constructor._tenant === `*`) {
                        const baseIndex = constructor._index;
                        const newIndex = result._index;

                        const indexPosition = newIndex.indexOf(baseIndex, 2);

                        const newTenant = result._index.substring(0, indexPosition - 1);
                        constructor = constructor.in(newTenant);
                    }

                    if (constructor.__fullIndex !== result._index) {
                        const baseIndex = constructor._index;
                        const newIndex = result._index;

                        const indexPosition = newIndex.indexOf(baseIndex, 2);
                        const indexTypePosition = indexPosition + baseIndex.length + 1;
                        const newIndexType = newIndex.substring(indexTypePosition);

                        constructor = constructor.type(newIndexType);
                    }

                    returnArray.push(new constructor(result._source, result._id, result._version, result.highlight,
                        result._primary_term, result._seq_no));
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
                results = await esClient.scroll(results.body._scroll_id);
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
        checkModelValidity(this, `get`);

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

        const results = await esClient.mget(this.__fullIndex, ids);

        const models = [];
        for (const result of results.body.docs) {
            if (!result.found) {
                throw new esErrors.ResponseError({
                    statusCode: 404,
                    body: {
                        ...result
                    }
                });
            } else {
                models.push(new this(result._source, result._id, result._version, result.highlight, result._primary_term, result._seq_no));
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
     * @returns             {Promise<Object>}           ES response
     */
    static async delete(ids) {
        if (this._indexType === `*`) {
            throw Error(`You cannot use 'delete' with current index type!`);
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
                    _id: id
                }
            });
        }
        const result = await esClient.bulk(bulkBody);

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
        if (this._indexType === `*`) {
            throw Error(`You cannot use 'exists' with current index type!`);
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
                const result = await esClient.exists(this.__fullIndex, id);
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
     * @returns                 {Promise<Object>}           ES response
     */
    static async update(ids, body) {
        if (this._indexType === `*`) {
            throw Error(`You cannot use 'update' with current index type!`);
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
                    _id: id,
                    retry_on_conflict: defaultConfiguration.RETRY_ON_CONFLICT
                }
            });

            bulkBody.push(body);
        }
        const result = await esClient.bulk(bulkBody);

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
        const result = await esClient.count(this.__fullIndex);
        return result.body.count;
    }

    /**
     * Partially updates entries
     * @param body  {Object}            ES body with query and changes
     * @returns     {Promise<Object>}   ES response
     */
    static async updateByQuery(body) {
        const result = await esClient.updateByQuery(this.__fullIndex, body);
        return result.body;
    }

    /**
     * Deletes entries by query
     * @param body  {Object}            ES body with query
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteByQuery(body) {
        const result = await esClient.deleteByQuery(this.__fullIndex, body);
        return result.body;
    }

    /**
     * Creates index
     * @param body  {Object}            Optional settings
     * @returns     {Promise<Object>}   ES response
     */
    static async createIndex(body = void 0) {
        checkModelValidity(this, `createIndex`);

        const result = await esClient.createIndex(this.__fullIndex, body);
        return result.body;
    }

    /**
     * Checks index existence
     * @returns     {Promise<boolean>}   ES response
     */
    static async indexExists() {
        checkModelValidity(this, `indexExists`);

        const result = await esClient.indexExists(this.__fullIndex);
        return result.body;
    }

    /**
     * Deletes index
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteIndex() {
        checkModelValidity(this, `deleteIndex`);

        const result = await esClient.deleteIndex(this.__fullIndex);
        return result.body;
    }

    /**
     * Gets mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async getMapping() {
        checkModelValidity(this, `getMapping`);

        const result = await esClient.getMapping(this.__fullIndex);
        return result.body;
    }

    /**
     * Puts mapping
     * @param mapping   {Object}            ES mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async putMapping(mapping) {
        checkModelValidity(this, `putMapping`);

        const result = await esClient.putMapping(this.__fullIndex, mapping);
        return result.body;
    }

    /**
     * Reindex from current model to selected one
     * @param destinationModel  {BaseModelType}     Destination type
     * @returns                 {Promise<Object>}   ES response
     */
    static async reindex(destinationModel) {
        checkModelValidity(this, `reindex`);
        checkModelValidity(destinationModel, `reindex`);

        const body = {
            source: {
                index: this.__fullIndex
            },
            dest: {
                index: destinationModel.__fullIndex
            }
        };

        const result = await esClient.reindex(body);
        return result.body;
    }

    /**
     * Saves document to database
     * @param useVersion    {boolean}           If true, sends version to ES
     * @returns             {Promise<BaseModel>}
     */
    async save(useVersion = false) {
        await this.validate();

        const result = await esClient.index(this.constructor.__fullIndex, _.cloneDeep(this),
            this._id, (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0);

        this._id = result.body._id;
        this._version = result.body._version;
        this._primary_term = result.body._primary_term;
        this._seq_no = result.body._seq_no;

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
        const result = await this.constructor.get(this._id);

        //Delete existing enumerable properties
        for (const key of Object.keys(this)) {
            delete this[key];
        }

        //Set new properties
        this._id = result._id;
        this._version = result._version;
        //highlight remains the same
        this._primary_term = result._primary_term;
        this._seq_no = result._seq_no;

        Object.assign(this, result);
    }

    /**
     * Deletes instance from ES
     * @param useVersion    {boolean}           If true, sends version to ES
     * @returns             {Promise<void>}
     */
    async delete(useVersion = false) {
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }

        //Throws if not in ES
        await esClient.delete(this.constructor.__fullIndex, this._id,
            (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0);
    }

    /**
     * Creates clone of this instance
     * @param preserveAttributes    {boolean}   If true, non-enumerable attributes are preserved, except __uuid
     * @returns     {BaseModel}
     */
    clone(preserveAttributes = true) {
        if (preserveAttributes) {
            return new this.constructor(_.cloneDeep(this), this._id, this._version, this._highlight, this._primary_term, this._seq_no);
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
            _indexType: newType
        };
        return this.clone(changes);
    }
}

module.exports = { cloneClass, BaseModel };

/**
 *
 * @param model {Object} Model to be checked
 * @param functionName {string} Name of calling function
 */
function checkModelValidity(model, functionName) {
    if (_.isNil(model._index) || !_.isString(model._index) || model._index.includes(`*`)) {
        throw Error(`You cannot use '${functionName}' with current base index '${model._index}', full index '${model.__fullIndex}'!`);
    } else if (_.isEmpty(model._tenant) || model._tenant.includes(`*`)) {
        throw Error(`You cannot use '${functionName}' with current tenant '${model._tenant}', full index '${model.__fullIndex}'!`);
    } else if (!_.isEmpty(model._indexType) && model._indexType.includes(`*`)) {
        throw Error(`You cannot use '${functionName}' with current index type '${model._indexType}', full index '${model.__fullIndex}'!`);
    }
}

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
 * @name BaseModel#_tenant
 * Tenant, part of index
 * @type {string}
 * @static
 */

/**
 * @name BaseModel#_index
 * Base of ES index
 * @type {string}
 * @static
 */

/**
 * @name BaseModel#_indexType
 * Type used as end of index
 * @type {string}
 * @static
 */
