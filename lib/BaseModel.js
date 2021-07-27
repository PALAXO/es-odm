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

        logger.debug({
            action: `constructor`,
            type: `publicFunction`,
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

        //Logger stats
        let totalTime = 0;
        let totalSize = 0;
        let scrolls = 0;

        //Check if use scroll
        const isExplicitScroll = !!explicitScroll;
        const useScroll = ((from + size) > defaultConfiguration.MAX_RESULTS) || isExplicitScroll;
        const initScroll = isExplicitScroll && _.isString(explicitScroll);
        const myFrom = (useScroll) ? 0 : from;  //For scroll, do not specify real from, always start from 0
        const mySize = (useScroll) ? ((isExplicitScroll) ? Math.min(defaultConfiguration.MAX_RESULTS, size) : defaultConfiguration.MAX_RESULTS) : size;

        const logObject = {
            action: `search`,
            index: this.__fullIndex,
            parameters: {
                from: from, size: size, source: source, useScroll: useScroll, explicitScroll: explicitScroll
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Searching for records.`
        });

        let esResult;
        if (initScroll) {
            //We have a scroll id -> use it
            esResult = await logger.measure(esClient, `scroll`, explicitScroll);
        } else {
            //Normal search
            esResult = await logger.measure(esClient, `search`, this.__fullIndex, body, myFrom, mySize, useScroll, source, (isExplicitScroll) ? explicitScroll: void 0);
        }
        const result = esResult.result;
        totalTime += esResult.time;
        totalSize += parseInt(_.get(result, `headers['content-length']`, `0`), 10);

        //Set aggregations and total size
        let esResults = result;
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
                    let constructor = this.clone();

                    const baseIndex = constructor._index;
                    const newIndex = result._index;
                    const indexPosition = newIndex.indexOf(baseIndex);

                    //set tenant
                    const tenant = (indexPosition > 0) ? newIndex.substring(0, indexPosition - 1) : ``;
                    if (tenant !== constructor._tenant > 0) {
                        constructor = constructor.in(tenant);
                    }

                    //set index type
                    if (constructor.__fullIndex !== result._index) {
                        const indexTypePosition = indexPosition + baseIndex.length + 1;
                        const newIndexType = newIndex.substring(indexTypePosition);

                        constructor = constructor.type(newIndexType);
                    }

                    //push instance
                    returnArray.push(new constructor(result._source, result._id, result._version, result.highlight,
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
                const { result, time } = await logger.measure(esClient, `scroll`, esResults.body._scroll_id);
                totalTime += time;
                totalSize += parseInt(_.get(result, `headers['content-length']`, `0`), 10);
                scrolls++;
                esResults = result;
            } else if (isExplicitScroll) {
                Object.defineProperty(returnArray, `scrollId`, {
                    value: esResults.body._scroll_id,
                    writable: true,
                    enumerable: false
                });
            }
        } while (!isExplicitScroll && useScroll && esResults.body.hits.hits.length > 0 && !full);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: totalTime,
                contentLength: totalSize,
                scrolls: scrolls
            },
            msg: `Records searched.`
        });

        //Clear scroll
        if (!isExplicitScroll && useScroll && !_.isEmpty(esResults.body._scroll_id)) {
            //Run it asynchronously
            this.clearScroll(esResults.body._scroll_id);
        }

        if (_.isNil(source)) {
            await this._afterSearch(returnArray);
        }

        return returnArray;
    }

    /**
     * Clears ES scroll ID
     * @param scrollId          {string}    Scroll ID
     * @returns {Promise<boolean>}
     */
    static async clearScroll(scrollId) {
        if (_.isEmpty(scrollId)) {
            throw Error(`scrollId must be specified!`);
        }

        const logObject = {
            action: `clearScroll`,
            index: this.__fullIndex,
            parameters: {
                scrollId: scrollId
            }
        };
        logger.debug({
            type: `apiRequest`,
            ...logObject,
            msg: `Asynchronously clearing search scroll.`
        });

        try {
            const { result, time } = await logger.measure(esClient, `clearScroll`, scrollId);
            logger.debug({
                type: `apiResponse`,
                ...logObject,
                response: {
                    took: time,
                    contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
                },
                msg: `Scroll cleared.`
            });
            return result.body.succeeded;

        } catch (e) {
            return false;
        }
    }

    /**
     * Finds all entries
     * @param source    {String[] | boolean}        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns {Promise<BulkArray<BaseModel>>}
     */
    static async findAll(source = void 0) {
        logger.info({
            action: `findAll`,
            type: `apiRequest`,
            index: this.__fullIndex,
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
            type: `apiRequest`,
            index: this.__fullIndex,
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

        const logObject = {
            action: `get`,
            index: this.__fullIndex,
            parameters: {
                ids: ids
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Getting record.`
        });

        const { result, time } = await logger.measure(esClient, `mget`, this.__fullIndex, ids);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Record obtained.`
        });

        const results = result;
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

        await this._afterSearch(models);

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

        let _primary_term = void 0;
        let _seq_no = void 0;

        if (!_.isNil(version)) {    //version specified
            if (!_.isString(ids)) { //only one id allowed
                const error = Error(`You cannot use parameter 'version' with multiple ids specified!`);
                error.statusCode = 400;
                throw error;
            }

            const response = await esClient.getHead(this.__fullIndex, ids); //fetch id
            if (version !== response.body._version) {
                const error = Error(`Specified version '${version}' is different than stored version '${response.body._version}'!`);
                error.statusCode = 409;
                throw error;
            }

            _primary_term = response.body._primary_term;
            _seq_no = response.body._seq_no;
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

        if (ids.length <= 0) {
            return;
        }

        const logObject = {
            action: `delete`,
            index: this.__fullIndex,
            parameters: {
                ids: ids, version: version
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Deleting records.`
        });

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
        const { result, time } = await logger.measure(esClient, `bulk`, bulkBody);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Records deleted.`
        });

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
        checkModelValidity(this, `exists`);

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            single = false;
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        const logObject = {
            action: `exists`,
            index: this.__fullIndex,
            parameters: {
                ids: ids
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Checking if records exist.`
        });

        let totalTime = 0;
        let totalSize = 0;
        const promises = [];
        for (const id of ids) {
            promises.push((async () => {
                const { result, time } = await logger.measure(esClient, `exists`, this.__fullIndex, id);
                totalTime += time;
                totalSize += parseInt(_.get(result, `headers['content-length']`, `0`), 10);
                return result.body;
            })());
        }

        let result;
        if (single) {
            result = await promises[0];
        } else {
            result = await Promise.all(promises);
        }

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: totalTime,
                contentLength: totalSize
            },
            msg: `Records checked.`
        });

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

        if (ids.length <= 0) {
            return;
        }

        const logObject = {
            action: `update`,
            index: this.__fullIndex,
            parameters: {
                ids: ids
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Updating records.`
        });

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
        const { result, time } = await logger.measure(esClient, `bulk`, bulkBody);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Records updated.`
        });

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
        const logObject = {
            action: `count`,
            index: this.__fullIndex,
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Counting records.`
        });

        const { result, time } = await logger.measure(esClient, `count`, this.__fullIndex);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Records counted.`
        });

        return result.body.count;
    }

    /**
     * Partially updates entries
     * @param body  {Object}            ES body with query and changes
     * @returns     {Promise<Object>}   ES response
     */
    static async updateByQuery(body) {
        const logObject = {
            action: `updateByQuery`,
            index: this.__fullIndex,
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Updating by query.`
        });

        const { result, time } = await logger.measure(esClient, `updateByQuery`, this.__fullIndex, body);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Records updated.`
        });

        return result.body;
    }

    /**
     * Deletes entries by query
     * @param body  {Object}            ES body with query
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteByQuery(body) {
        const logObject = {
            action: `deleteByQuery`,
            index: this.__fullIndex,
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Deleting by query.`
        });

        const { result, time } = await logger.measure(esClient, `deleteByQuery`, this.__fullIndex, body);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Records deleted.`
        });

        return result.body;
    }

    /**
     * Creates index
     * @param body  {Object}            Optional settings
     * @returns     {Promise<Object>}   ES response
     */
    static async createIndex(body = void 0) {
        checkModelValidity(this, `createIndex`);

        const logObject = {
            action: `createIndex`,
            index: this.__fullIndex,
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Creating new index.`
        });

        const { result, time } = await logger.measure(esClient, `createIndex`, this.__fullIndex, body);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Index created.`
        });

        return result.body;
    }

    /**
     * Checks index existence
     * @returns     {Promise<boolean>}   ES response
     */
    static async indexExists() {
        checkModelValidity(this, `indexExists`);

        const logObject = {
            action: `indexExists`,
            index: this.__fullIndex,
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Checking index existence.`
        });

        const { result, time } = await logger.measure(esClient, `indexExists`, this.__fullIndex);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Index checked.`
        });

        return result.body;
    }

    /**
     * Deletes index
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteIndex() {
        checkModelValidity(this, `deleteIndex`);

        const logObject = {
            action: `deleteIndex`,
            index: this.__fullIndex,
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Deleting index.`
        });

        const { result, time } = await logger.measure(esClient, `deleteIndex`, this.__fullIndex);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Index deleted.`
        });

        return result.body;
    }

    /**
     * Gets mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async getMapping() {
        checkModelValidity(this, `getMapping`);

        const logObject = {
            action: `getMapping`,
            index: this.__fullIndex,
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Retrieving mapping.`
        });

        const { result, time } = await logger.measure(esClient, `getMapping`, this.__fullIndex);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Mapping obtained.`
        });

        return result.body;
    }

    /**
     * Puts mapping
     * @param mapping   {Object}            ES mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async putMapping(mapping) {
        checkModelValidity(this, `putMapping`);

        const logObject = {
            action: `putMapping`,
            index: this.__fullIndex,
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Updating mapping.`
        });

        const { result, time } = await logger.measure(esClient, `putMapping`, this.__fullIndex, mapping);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Mapping updated.`
        });

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

        const logObject = {
            action: `reindex`,
            index: this.__fullIndex,
            destinationIndex: _.get(destinationModel, `__fullIndex`),
            parameters: {}
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Reindexing data.`
        });

        const body = {
            source: {
                index: this.__fullIndex
            },
            dest: {
                index: destinationModel.__fullIndex
            }
        };

        const { result, time } = await logger.measure(esClient, `reindex`, body);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Data reindexed.`
        });

        return result.body;
    }

    /**
     * Saves document to database
     * @param useVersion    {boolean}           If true, sends version to ES
     * @returns             {Promise<BaseModel>}
     */
    async save(useVersion = false) {
        await this.validate();

        if (useVersion) {
            await checkUseVersion(this);
        }

        const logObject = {
            action: `save`,
            index: this.constructor.__fullIndex,
            id: this._id,
            parameters: {
                useVersion: useVersion
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Saving instance.`
        });

        const { result, time } = await logger.measure(esClient, `index`, this.constructor.__fullIndex, _.cloneDeep(this),
            this._id, (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0);

        this._id = result.body._id;
        this._version = result.body._version;
        this._primary_term = result.body._primary_term;
        this._seq_no = result.body._seq_no;

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Instance saved.`
        });

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
            type: `apiRequest`,
            index: this.constructor.__fullIndex,
            id: this._id,
            parameters: {},
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

        if (useVersion) {
            await checkUseVersion(this);
        }

        const logObject = {
            action: `delete`,
            index: this.constructor.__fullIndex,
            id: this._id,
            parameters: {
                useVersion: useVersion
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Deleting instance.`
        });

        //Throws if not in ES
        const { result, time } = await logger.measure(esClient, `delete`, this.constructor.__fullIndex, this._id,
            (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Instance deleted.`
        });
    }

    /**
     * Creates clone of this instance
     * @param preserveAttributes    {boolean}   If true, non-enumerable attributes are preserved, except __uuid
     * @returns     {BaseModel}
     */
    clone(preserveAttributes = true) {
        logger.info({
            action: `clone`,
            type: `publicFunction`,
            index: this.constructor.__fullIndex,
            id: this._id,
            parameters: {
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
        logger.debug({
            action: `validate`,
            type: `internalFunction`,
            index: this.constructor.__fullIndex,
            id: this._id,
            parameters: {},
            msg: `Validating instance.`
        });

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
        logger.trace({
            action: `clone`,
            type: `internalFunction`,
            index: this.__fullIndex,
            parameters: {
                changes: changes
            },
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
        logger.debug({
            action: `in`,
            type: `publicFunction`,
            index: this.__fullIndex,
            parameters: {
                newTenant: newTenant
            },
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
        logger.debug({
            action: `type`,
            type: `publicFunction`,
            index: this.__fullIndex,
            parameters: {
                newType: newType
            },
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
 * @param model {Object} Model to be used
 * @returns {Promise<void>}
 */
async function checkUseVersion(model) {
    if (!model._id) {
        const error = Error(`You cannot use parameter 'useVersion' with model without _id specified.`);
        error.statusCode = 400;
        throw error;
    }

    if (!model._primary_term || !model._seq_no) {
        const response = await esClient.getHead(model.constructor.__fullIndex, model._id);

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
