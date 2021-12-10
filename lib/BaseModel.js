'use strict';

const _ = require(`lodash`);
const { v4: uuid } = require(`uuid`);
const nconf = require(`./config/config`);

const { esClient, esErrors } = require(`./ElasticSearch`);
const BulkArray = require(`./BulkArray`);
const logger = require(`./logger`);

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
     * @param data          {Object}            Object, from which the instance is constructed
     * @param _id           {string}            ES id
     * @param _version      {number | string}   ES version
     * @param _highlight    {string}            ES highlight
     * @param _primary_term {number | string}   ES primary term
     * @param _seq_no       {number | string}   ES sequence number
     * @param _score        {number}            ES score
     */
    constructor(data = {}, _id = void 0, _version = void 0, _highlight = void 0, _primary_term = void 0, _seq_no = void 0, _score = void 0) {
        checkModelValidity(this.constructor, `constructor`);

        logger.trace({
            action: `constructor`,
            index: this.constructor.__fullIndex,
            parameters: {
                id: _id, version: _version, highlight: _highlight, primary_term: _primary_term, seq_no: _seq_no
            },
            msg: `Creating new instance.`
        });

        Object.assign(this, data);

        /**  @type {string} ES id */
        Object.defineProperty(this, `_id`, {
            value: _id,
            writable: true,
            enumerable: false
        });
        /** @type {number} ES version */
        Object.defineProperty(this, `_version`, {
            value: (_version) ? parseInt(_version) : void 0,
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
            value: (_primary_term) ? parseInt(_primary_term) : void 0,
            writable: true,
            enumerable: false
        });
        /** @type {number} ES sequence number */
        Object.defineProperty(this, `_seq_no`, {
            value: (_seq_no) ? parseInt(_seq_no): void 0,
            writable: true,
            enumerable: false
        });
        /** @type {number} ES score */
        Object.defineProperty(this, `_score`, {
            value: _score,
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
     * Returns full index - it consists of up to three parts
     * <Tenant (optional)>\_<Base index (required)>\_<Index type (optional)>
     * @returns {string}
     */
    static get __fullIndex() {
        return `${(this._tenant) ? `${this._tenant}_` : ``}${this._index}${(this._indexType) ? `_${this._indexType}` : ``}`;
    }

    /**
     * Performs ES search
     * @param body              {Object}                        Body object
     * @param from              {number}                        Start entry
     * @param size              {number}                        Number of entries
     * @param source            {String[] | boolean}            Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param explicitScroll    {string | number}               Specify number (>0) to return scrollId, or scrollId (string) to continue in search
     * @returns                 {Promise<BulkArray<BaseModel> | Object[]>}
     */
    static async search(body, from = void 0, size = void 0, source = void 0, explicitScroll = void 0) {
        if ((_.isEmpty(explicitScroll) || !_.isString(explicitScroll)) && (_.isNil(body) || (!_.isObject(body) && !_.isString(body)))) {
            throw Error(`Body must be an object!`);
        }

        const myLog = logger.createLogger(esClient, `search`, this.__fullIndex);

        //Set correct from and size
        if (typeof from === `string`) {
            from = parseInt(from, 10);
        }
        if (typeof size === `string`) {
            size = parseInt(size, 10);
        }

        if (_.isFinite(from)) {
            if (from < 0) {
                throw Error(`From can't be lower than zero!`);
            } else {
                //OK
            }
        } else {
            if (!_.isEmpty(body) && _.isFinite(body.from)) {
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
            if (!_.isEmpty(body) && _.isFinite(body.size)) {
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

        //Check if use scroll
        const isExplicitScroll = !!explicitScroll;
        const useScroll = ((from + size) > defaultConfiguration.MAX_RESULTS) || isExplicitScroll;
        const initScroll = isExplicitScroll && _.isString(explicitScroll);
        const myFrom = (useScroll) ? 0 : from;  //For scroll, do not specify real from, always start from 0
        const mySize = (useScroll) ? ((isExplicitScroll) ? Math.min(defaultConfiguration.MAX_RESULTS, size) : defaultConfiguration.MAX_RESULTS) : size;

        myLog.logApiRequest({
            from: from, size: size, source: source, useScroll: useScroll, explicitScroll: explicitScroll
        }, `Searching for records.`);

        let esResults;
        if (initScroll) {
            //We have a scroll id -> use it
            esResults = await myLog.callEsApi(`scroll`, explicitScroll);
        } else {
            //Normal search
            esResults = await myLog.callEsApi(`search`, this.__fullIndex, body, myFrom, mySize, useScroll, source, (isExplicitScroll) ? explicitScroll: void 0);
        }

        //Set aggregations and total size
        if (esResults.body.aggregations) {
            Object.defineProperty(returnArray, `aggregations`, {
                value: esResults.body.aggregations,
                writable: true,
                enumerable: false
            });
        }
        if (_.isNil(source)) {
            returnArray._total = esResults.body.hits.total.value;
        }

        const constructorCache = {};
        let counter = 0;
        let full = false;
        do {
            //Start index for current results
            const startIndex = (useScroll) ? Math.min(esResults.body.hits.hits.length, Math.max(0, from - counter)) : 0;
            //Counter of read records including 'from' (from + size)
            counter += (useScroll) ? startIndex : from;

            //Iterate over results
            for (let i = startIndex; (i < esResults.body.hits.hits.length) && (counter < from + size); i++) {
                const result = esResults.body.hits.hits[i];

                if (_.isNil(source)) {  //Create instance
                    const newIndex = result._index;

                    let Constructor = constructorCache[newIndex];
                    if (!Constructor) {
                        Constructor = this;

                        const baseIndex = Constructor._index;
                        const indexPosition = newIndex.indexOf(baseIndex);

                        //set tenant
                        const tenant = (indexPosition > 0) ? newIndex.substring(0, indexPosition - 1) : ``;
                        if (tenant !== Constructor._tenant > 0) {
                            Constructor = Constructor.in(tenant);
                        }

                        //set index type
                        if (Constructor.__fullIndex !== result._index) {
                            const indexTypePosition = indexPosition + baseIndex.length + 1;
                            const newIndexType = newIndex.substring(indexTypePosition);

                            Constructor = Constructor.type(newIndexType);
                        }

                        constructorCache[newIndex] = Constructor;
                    }

                    //push instance
                    returnArray.push(new Constructor(result._source, result._id, result._version, result.highlight,
                        result._primary_term, result._seq_no, result._score));

                } else {    //Just push
                    returnArray.push(result);
                }

                //Increase counter, check if break
                counter++;
                if (counter >= from + size) {
                    full = true;
                    break;
                }
            }

            //Check if perform scroll request
            if (!isExplicitScroll && useScroll && esResults.body.hits.hits.length > 0 && !full) {
                esResults = await myLog.callEsApi(`scroll`, esResults.body._scroll_id);
            } else if (isExplicitScroll) {
                Object.defineProperty(returnArray, `scrollId`, {
                    value: esResults.body._scroll_id,
                    writable: true,
                    enumerable: false
                });
            }
        } while (!isExplicitScroll && useScroll && esResults.body.hits.hits.length > 0 && !full);

        //Clear scroll
        if (!isExplicitScroll && useScroll && !_.isEmpty(esResults.body._scroll_id)) {
            //Run it asynchronously
            myLog.note(`Calling clearScroll asynchronously.`);
            this.clearScroll(esResults.body._scroll_id);
        }

        if (_.isNil(source)) {
            myLog.note(`Calling _afterSearch function.`);
            await this._afterSearch(returnArray);
        }

        myLog.logApiResponse(`Records searched.`, {
            items: returnArray.length
        });

        return returnArray;
    }

    /**
     * Clears ES scroll ID
     * @param scrollId          {string}    Scroll ID
     * @returns {Promise<boolean>}
     */
    static async clearScroll(scrollId) {
        const myLog = logger.createLogger(esClient, `clearScroll`, this.__fullIndex);

        if (_.isEmpty(scrollId)) {
            throw Error(`scrollId must be specified!`);
        }

        myLog.logApiRequest({
            scrollId: scrollId
        }, `Clearing search scroll.`);

        let myResult;
        try {
            const result = await myLog.callEsApi(`clearScroll`, scrollId);
            myResult = result.body.succeeded;

        } catch (e) {
            myResult = false;
        }

        myLog.logApiResponse(`Finished scroll clearing`);

        return myResult;
    }

    /**
     * Finds all entries
     * @param source    {String[] | boolean}        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns {Promise<BulkArray<BaseModel>>}
     */
    static async findAll(source = void 0) {
        logger.info({
            action: `findAll`,
            index: this.__fullIndex,
            type: `redirect`,
            parameters: {
                source: source
            },
            msg: `Finding all index records -> calling search function.`
        });

        const body = {
            query: {
                match_all: {}
            }
        };
        return this.search(body, void 0, void 0, source);   //Logger response contained in search
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

        logger.info({
            action: `find`,
            index: this.__fullIndex,
            type: `redirect`,
            parameters: {
                ids: ids, source: source
            },
            msg: `Finding records -> calling search function.`
        });

        const body = {
            query: {
                ids: {
                    values: ids
                }
            }
        };
        const array = await this.search(body, 0, ids.length, source);

        //Logger response contained in search

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

        const myLog = logger.createLogger(esClient, `get`, this.__fullIndex);

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

        myLog.logApiRequest({
            ids: ids
        }, `Getting record/s.`);

        const results = await myLog.callEsApi(`mget`, this.__fullIndex, ids);

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
                models.push(new this(result._source, result._id, result._version, result.highlight, result._primary_term, result._seq_no, 1));
            }
        }

        myLog.note(`Calling _afterSearch function.`);
        await this._afterSearch(models);

        myLog.logApiResponse(`Record/s obtained.`, {
            items: models.length
        });

        if (single) {
            return models[0];
        } else {
            return new BulkArray(...models);
        }
    }

    /**
     * Deletes entries by given string or array of strings
     * @param ids           {string | Array<string>}    Id or Ids to be deleted
     * @param version       {number}                    Version of document to be deleted
     * @returns             {Promise<Object>}           ES response
     */
    static async delete(ids, version = void 0) {
        checkModelValidity(this, `delete`);

        const myLog = logger.createLogger(esClient, `delete`, this.__fullIndex);

        let isSingle = false;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
            isSingle = true;
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            //ok
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        if (ids.length <= 0) {
            return;
        }

        let _primary_term = void 0;
        let _seq_no = void 0;

        if (!_.isNil(version)) {    //version specified
            if (!isSingle) {        //only one id allowed
                const error = Error(`You cannot use parameter 'version' with multiple ids specified!`);
                error.statusCode = 400;
                throw error;
            }

            const response = await myLog.callEsApi(`getHead`, this.__fullIndex, ids); //fetch id
            if (version !== response.body._version) {
                const error = Error(`Specified version '${version}' is different than stored version '${response.body._version}'!`);
                error.statusCode = 409;
                throw error;
            }

            _primary_term = response.body._primary_term;
            _seq_no = response.body._seq_no;
        }

        myLog.logApiRequest({
            ids: ids, version: version
        }, `Deleting records.`);

        const bulkBody = [];
        for (const id of ids) {
            bulkBody.push({
                delete: {
                    _index: this.__fullIndex,
                    _id: id,
                    if_primary_term: _primary_term,
                    if_seq_no: _seq_no
                }
            });
        }
        const result = await myLog.callEsApi(`bulk`, bulkBody);

        if (isSingle && result.body.items[0].delete.status >= 400) {
            const item = result.body.items[0].delete;
            const errorMessage = _.has(item, `error.reason`) ? item.error.reason : _.get(item, `result`, `Error happened during delete of item with id ${ids[0]}`);
            const error = Error(errorMessage);
            error.statusCode = item.status;
            throw error;
        } else {
            myLog.logApiResponse(`Records deleted.`);
            return result.body;
        }
    }

    /**
     * Checks if entries exist
     * @param ids   {string | Array<string>}                Id or Ids to check
     * @returns     {Promise<boolean | Array<boolean>>}     Boolean or array of booleans indicating result
     */
    static async exists(ids) {
        checkModelValidity(this, `exists`);

        const myLog = logger.createLogger(esClient, `exists`, this.__fullIndex);

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            single = false;
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        myLog.logApiRequest({
            ids: ids
        }, `Checking if records exist.`);

        const promises = [];
        for (const id of ids) {
            promises.push((async () => {
                const result = await myLog.callEsApi(`exists`, this.__fullIndex, id);
                return result.body;
            })());
        }

        let result;
        if (single) {
            result = await promises[0];
        } else {
            result = await Promise.all(promises);
        }

        myLog.logApiResponse(`Records checked.`);
        return result;
    }

    /**
     * Partially updates given entries
     * @param ids               {string | Array<string>}    Id or Ids to be updated
     * @param body              {Object}                    ES body with changes
     * @returns                 {Promise<Object>}           ES response
     */
    static async update(ids, body) {
        checkModelValidity(this, `update`);

        const myLog = logger.createLogger(esClient, `update`, this.__fullIndex);

        let isSingle = false;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
            isSingle = true;
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            //ok
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        if (ids.length <= 0) {
            return;
        }

        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        myLog.logApiRequest({
            ids: ids
        }, `Updating records.`);

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
        const result = await myLog.callEsApi(`bulk`, bulkBody);

        if (isSingle && result.body.items[0].update.status >= 400) {
            const item = result.body.items[0].update;
            const errorMessage = _.has(item, `error.reason`) ? item.error.reason : _.get(item, `result`, `Error happened during update of item with id ${ids[0]}`);
            const error = Error(errorMessage);
            error.statusCode = item.status;
            throw error;
        } else {
            myLog.logApiResponse(`Records updated.`);
            return result.body;
        }
    }

    /**
     * Returns number of entries in index
     * @param body  {Object}            Body object
     * @returns     {Promise<number>}   ES response
     */
    static async count(body = void 0) {
        const myLog = logger.createLogger(esClient, `count`, this.__fullIndex);
        myLog.logApiRequest({}, `Counting records.`);

        const result = await myLog.callEsApi(`count`, this.__fullIndex, body);

        myLog.logApiResponse(`Records counted.`);
        return result.body.count;
    }

    /**
     * Partially updates entries
     * @param body  {Object}            ES body with query and changes
     * @returns     {Promise<Object>}   ES response
     */
    static async updateByQuery(body) {
        const myLog = logger.createLogger(esClient, `updateByQuery`, this.__fullIndex);
        myLog.logApiRequest({}, `Updating by query.`);

        const result = await myLog.callEsApi(`updateByQuery`, this.__fullIndex, body);

        myLog.logApiResponse(`Records updated.`);
        return result.body;
    }

    /**
     * Deletes entries by query
     * @param body  {Object}            ES body with query
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteByQuery(body) {
        const myLog = logger.createLogger(esClient, `deleteByQuery`, this.__fullIndex);
        myLog.logApiRequest({}, `Deleting by query.`);

        const result = await myLog.callEsApi(`deleteByQuery`, this.__fullIndex, body);

        myLog.logApiResponse(`Records deleted.`);
        return result.body;
    }

    /**
     * Creates index
     * @param body  {Object}            Optional settings
     * @returns     {Promise<Object>}   ES response
     */
    static async createIndex(body = void 0) {
        checkModelValidity(this, `createIndex`);

        const myLog = logger.createLogger(esClient, `createIndex`, this.__fullIndex);
        myLog.logApiRequest({}, `Creating new index.`);

        const result = await myLog.callEsApi(`createIndex`, this.__fullIndex, body);

        myLog.logApiResponse(`Index created.`);
        return result.body;
    }

    /**
     * Checks index existence
     * @returns     {Promise<boolean>}   ES response
     */
    static async indexExists() {
        checkModelValidity(this, `indexExists`);

        const myLog = logger.createLogger(esClient, `indexExists`, this.__fullIndex);
        myLog.logApiRequest({}, `Checking index existence.`);

        const result = await myLog.callEsApi(`indexExists`, this.__fullIndex);

        myLog.logApiResponse(`Index checked.`);
        return result.body;
    }

    /**
     * Deletes index
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteIndex() {
        checkModelValidity(this, `deleteIndex`);

        const myLog = logger.createLogger(esClient, `deleteIndex`, this.__fullIndex);
        myLog.logApiRequest({}, `Deleting index.`);

        const result = await myLog.callEsApi(`deleteIndex`, this.__fullIndex);

        myLog.logApiResponse(`Index deleted.`);
        return result.body;
    }

    /**
     * Gets mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async getMapping() {
        checkModelValidity(this, `getMapping`);

        const myLog = logger.createLogger(esClient, `getMapping`, this.__fullIndex);
        myLog.logApiRequest({}, `Retrieving mapping.`);

        const result = await myLog.callEsApi(`getMapping`, this.__fullIndex);

        myLog.logApiResponse(`Mapping obtained.`);
        return result.body;
    }

    /**
     * Puts mapping
     * @param mapping   {Object}            ES mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async putMapping(mapping) {
        checkModelValidity(this, `putMapping`);

        const myLog = logger.createLogger(esClient, `putMapping`, this.__fullIndex);
        myLog.logApiRequest({}, `Updating mapping.`);

        const result = await myLog.callEsApi(`putMapping`, this.__fullIndex, mapping);

        myLog.logApiResponse(`Mapping updated.`);
        return result.body;
    }

    /**
     * Reindex from current model to selected one
     * @param destinationModel  {BaseModelType}     Destination type
     * @returns                 {Promise<Object>}   ES response
     */
    static async reindex(destinationModel) {
        if (!destinationModel) {
            throw Error(`You must specify destination model!`);
        }

        checkModelValidity(this, `reindex-source`);
        checkModelValidity(destinationModel, `reindex-destination`);

        const myLog = logger.createLogger(esClient, `reindex`, this.__fullIndex);
        myLog.logApiRequest({
            destinationIndex: _.get(destinationModel, `__fullIndex`)
        }, `Reindexing data.`);

        const body = {
            source: {
                index: this.__fullIndex
            },
            dest: {
                index: destinationModel.__fullIndex
            }
        };

        const result = await myLog.callEsApi(`reindex`, body);

        myLog.logApiResponse(`Data reindexed.`);
        return result.body;
    }

    /**
     * Saves document to database
     * @param useVersion    {boolean}           If true, sends version to ES
     * @returns             {Promise<BaseModel>}
     */
    async save(useVersion = false) {
        const myLog = logger.createLogger(esClient, `save`, this.constructor.__fullIndex);

        await this.validate();

        if (useVersion) {
            await checkUseVersion(myLog, this);
        }

        myLog.logApiRequest({
            id: this._id,
            useVersion: useVersion
        },`Saving instance.`);

        const result = await myLog.callEsApi(`index`, this.constructor.__fullIndex, this, this._id,
            (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0);

        this._id = result.body._id;
        this._version = result.body._version;
        this._primary_term = result.body._primary_term;
        this._seq_no = result.body._seq_no;

        myLog.logApiResponse(`Instance saved.`);

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

        logger.info({
            action: `reload`,
            index: this.constructor.__fullIndex,
            type: `redirect`,
            parameters: {
                id: this._id
            },
            msg: `Reloading instance -> calling get function.`
        });

        //Throws if not in ES
        const result = await this.constructor.get(this._id);

        //Logger response contained in get

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
        //score remains the same

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

        const myLog = logger.createLogger(esClient, `delete`, this.constructor.__fullIndex);

        if (useVersion) {
            await checkUseVersion(myLog, this);
        }

        myLog.logApiRequest({
            id: this._id,
            useVersion: useVersion
        },`Deleting instance.`);

        //Throws if not in ES
        await myLog.callEsApi(`delete`, this.constructor.__fullIndex, this._id,
            (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0);

        myLog.logApiResponse(`Instance deleted.`);
    }

    /**
     * Creates clone of this instance
     * @param preserveAttributes    {boolean}   If true, non-enumerable attributes are preserved, except __uuid
     * @returns     {BaseModel}
     */
    clone(preserveAttributes = true) {
        logger.debug({
            action: `clone`,
            index: this.constructor.__fullIndex,
            parameters: {
                id: this._id,
                preserveAttributes: preserveAttributes
            },
            msg: `Cloning instance.`
        });

        if (preserveAttributes) {
            return new this.constructor(_.cloneDeep(this), this._id, this._version, this._highlight, this._primary_term, this._seq_no, this._score);
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
            logger.trace({
                action: `validate`,
                index: this.constructor.__fullIndex,
                id: this._id,
                msg: `Validating instance.`
            });
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
        logger.trace({
            action: `clone`,
            index: this.__fullIndex,
            changes: changes,
            msg: `Creating new model class with changed properties.`
        });

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
        logger.trace({
            action: `in`,
            index: this.__fullIndex,
            newTenant: newTenant,
            msg: `Creating new model class with changed tenant.`
        });

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
        logger.trace({
            action: `type`,
            index: this.__fullIndex,
            newType: newType,
            msg: `Creating new model class with changed type.`
        });

        if (_.isNil(newType) || !_.isString(newType)) {
            throw Error(`Type must be a string!`);
        }

        const changes = {
            _indexType: newType
        };
        return this.clone(changes);
    }

    /**
     * Function resolved after search / find / find all / get
     * @param instances {Array<*>} Array of newly created instances
     * @returns {Promise<void>}
     * @private
     */
    static async _afterSearch(instances) {
        //empty by default
    }
}

module.exports = { cloneClass, BaseModel };

/**
 * Checks if model has correct index specified
 * @param model {Object} Model to be checked
 * @param functionName {string} Name of calling function
 */
function checkModelValidity(model, functionName) {
    if (_.isNil(model._index) || !_.isString(model._index) || model._index.includes(`*`)) {
        throw Error(`You cannot use '${functionName}' with current base index '${model._index}', full index is '${model.__fullIndex}'!`);
    } else if (_.isEmpty(model._tenant) || model._tenant.includes(`*`)) {
        throw Error(`You cannot use '${functionName}' with current tenant '${model._tenant}', full index is '${model.__fullIndex}'!`);
    } else if (!_.isEmpty(model._indexType) && model._indexType.includes(`*`)) {
        throw Error(`You cannot use '${functionName}' with current index type '${model._indexType}', full index is '${model.__fullIndex}'!`);
    }
}

/**
 * Fetches version and sequence numbers
 * @param myLog {MyLog} Logger instance
 * @param model {Object} Model to be used
 * @returns {Promise<void>}
 */
async function checkUseVersion(myLog, model) {
    if (!model._id) {
        const error = Error(`You cannot use parameter 'useVersion' with model without _id specified.`);
        error.statusCode = 400;
        throw error;
    }

    if (!model._primary_term || !model._seq_no) {
        const response = await myLog.callEsApi(`getHead`, model.constructor.__fullIndex, model._id);

        if (model._version !== response.body._version) {
            const error = Error(`Actual version '${model._version}' is different than stored version '${response.body._version}'!`);
            error.statusCode = 409;
            throw error;
        }

        model._primary_term = response.body._primary_term;
        model._seq_no = response.body._seq_no;
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
 * Tenant, beginning of the index
 * @type {string}
 * @static
 */

/**
 * @name BaseModel#_index
 * Base of the index
 * @type {string}
 * @static
 */

/**
 * @name BaseModel#_indexType
 * Type used as end of the index
 * @type {string}
 * @static
 */
