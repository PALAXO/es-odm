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
    MAX_RESULTS: nconf.get(`es:maxResults`),
    SCROLL_SIZE: nconf.get(`es:scrollSize`)
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
        this.constructor.__checkIfFullySpecified(`constructor`);

        logger.trace({
            action: `constructor`,
            alias: this.constructor.alias,
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
            value: (!_.isNil(_version)) ? parseInt(_version) : void 0,
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
            value: (!_.isNil(_primary_term)) ? parseInt(_primary_term) : void 0,
            writable: true,
            enumerable: false
        });
        /** @type {number} ES sequence number */
        Object.defineProperty(this, `_seq_no`, {
            value: (!_.isNil(_seq_no)) ? parseInt(_seq_no): void 0,
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
     * Returns alias - "<tenant>\_<name>"
     * @returns {string}
     */
    static get alias() {
        return `${this._tenant}_${this._name}`;
    }

    /**
     * Performs ES search
     * @param body              {Object}                                    Body object
     * @param from              {number}                                    Start entry
     * @param size              {number}                                    Number of entries
     * @param source            {String[] | boolean}                        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param explicitScroll    {string | number}                           Specify scrollId (string) to continue in scrolling, or a number to initialize scrolling (if positive => scroll timeout [s])
     * @param additional        {{cache: Object, scrollRefresh: number}}    Additional data - "cache" is used for "afterSearch" function, "scrollRefresh" is optional scroll refresh timeout
     * @returns                 {Promise<BulkArray<BaseModel> | Object[]>}
     */
    static async search(body, from = void 0, size = void 0, source = void 0, explicitScroll = void 0, additional = void 0) {
        if ((_.isEmpty(explicitScroll) || !_.isString(explicitScroll)) && (_.isNil(body) || (!_.isObject(body) && !_.isString(body)))) {
            throw Error(`Body must be an object!`);
        }
        const alteredBody = this._alterSearch(body);

        if (!_.isNil(this.__recordSearch)) {
            //This is for JointModel, we only record the search
            this.__recordSearch.push(alteredBody.query);
            return void 0;
        }

        const myLog = logger.createLogger(esClient, `search`, this.alias);

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
            if (!_.isEmpty(alteredBody) && _.isFinite(alteredBody.from)) {
                if (alteredBody.from < 0) {
                    throw Error(`From in body can't be lower than zero!`);
                } else {
                    from = alteredBody.from;
                }
            } else {
                from = 0;
            }
        }

        let isExplicitSize = true;
        if (_.isFinite(size)) {
            if (size < 0) {
                throw Error(`Size can't be lower than zero!`);
            } else {
                //OK
            }
        } else {
            if (!_.isEmpty(alteredBody) && _.isFinite(alteredBody.size)) {
                if (alteredBody.size < 0) {
                    throw Error(`Size in body can't be lower than zero!`);
                } else {
                    size = alteredBody.size;
                }
            } else {
                size = Number.MAX_SAFE_INTEGER - from;
                isExplicitSize = false;
            }
        }

        const returnArray = (_.isNil(source)) ? new BulkArray() : [];

        //Check if use scroll
        const isExplicitScroll = !_.isNil(explicitScroll);
        const useScroll = ((from + size) > defaultConfiguration.MAX_RESULTS) || isExplicitScroll;
        const initScroll = isExplicitScroll && _.isString(explicitScroll);
        const myFrom = (useScroll) ? 0 : from;  //For scroll, do not specify real from, always start from 0
        let mySize;
        if (useScroll) {
            if (isExplicitScroll && isExplicitSize) {
                mySize = Math.min(defaultConfiguration.MAX_RESULTS, size);
            } else {
                const modelBulkSize = await this._getBulkSize();
                if (!_.isFinite(modelBulkSize)) {
                    mySize = defaultConfiguration.SCROLL_SIZE;
                } else {
                    mySize = modelBulkSize;
                }
            }
        } else {
            mySize = size;
        }

        myLog.logApiRequest({
            from: from, size: size, source: source, useScroll: useScroll, explicitScroll: explicitScroll
        }, `Searching for records.`);

        let esResults;
        if (initScroll) {
            //We have a scroll id -> use it
            esResults = await myLog.callEsApi(`scroll`, explicitScroll, additional?.scrollRefresh);
        } else {
            //Normal search
            const myScrollTimeout = (_.isNumber(explicitScroll) && explicitScroll > 0) ? explicitScroll : ((_.isNumber(additional?.scrollRefresh)) ? additional.scrollRefresh : void 0);
            esResults = await myLog.callEsApi(`search`, this.alias, alteredBody, myFrom, mySize, useScroll, source, myScrollTimeout);
        }

        if (!_.isEmpty(esResults?.body?._shards?.failures)) {
            throw new esErrors.ResponseError({ body: esResults.body._shards.failures[0] });
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
                    const Constructor = this.__getConstructor(result, constructorCache);

                    //push instance
                    returnArray.push(new Constructor(Constructor._unpackData(result._source), result._id, result._version, result.highlight,
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
            await this.clearScroll(esResults.body._scroll_id);
        }

        if (_.isNil(source)) {
            myLog.note(`Calling _afterSearch function.`);
            await this._afterSearch(returnArray, additional?.cache);
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
        const myLog = logger.createLogger(esClient, `clearScroll`, this.alias);

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
     * Returns iterator over bulks
     * @param body              {Object}                                    Body object
     * @param source            {String[] | boolean}                        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param bulkSize          {number}                                    Optional bulk size
     * @param additional        {{cache: Object, scrollRefresh: number}}    Additional data - "cache" is used for "afterSearch" function, "scrollRefresh" is optional scroll refresh timeout
     * @returns {AsyncGenerator<BulkArray<BaseModel>|Array<Object>>}
     */
    static async *bulkIterator(body = void 0, source = void 0, bulkSize = void 0, additional = void 0) {
        const myAdditional = (!_.isObject(additional)) ? {} : { ...additional };
        //Always pass the cache object
        myAdditional.cache = (additional?.cache) ? additional.cache : {};

        let scrollId;
        try {
            let instances = await this.search(body ?? {}, 0, bulkSize, source, -1, myAdditional);
            scrollId = instances.scrollId;

            while (instances.length > 0) {
                yield instances;

                instances = await this.search(void 0, void 0, void 0, source, scrollId, myAdditional);
                scrollId = instances.scrollId;
            }

        } finally {
            if (scrollId) {
                await this.clearScroll(scrollId);
            }
        }
    }

    /**
     * Returns iterator over documents
     * @param body              {Object}                                    Body object
     * @param source            {String[] | boolean}                        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param bulkSize          {number}                                    Optional bulk size
     * @param additional        {{cache: Object, scrollRefresh: number}}    Additional data - "cache" is used for "afterSearch" function, "scrollRefresh" is optional scroll refresh timeout
     * @returns {AsyncGenerator<BaseModel|Object>}
     */
    static async *itemIterator(body, source = void 0, bulkSize = void 0, additional = void 0) {
        const myBulkIterator = this.bulkIterator(body, source, bulkSize, additional);
        for await (const bulk of myBulkIterator) {
            for (const item of bulk) {
                yield item;
            }
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
            alias: this.alias,
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
            alias: this.alias,
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
                    array.notFound(id, this.alias);
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
        this.__checkIfFullySpecified(`get`);

        const myLog = logger.createLogger(esClient, `get`, this.alias);

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

        const results = await myLog.callEsApi(`mget`, this.alias, ids);

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
                models.push(new this(this._unpackData(result._source), result._id, result._version, result.highlight, result._primary_term, result._seq_no, 1));
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
        this.__checkIfFullySpecified(`delete`);

        const myLog = logger.createLogger(esClient, `delete`, this.alias);

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

            const response = await myLog.callEsApi(`getHead`, this.alias, ids); //fetch single id
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
                    _index: this.alias,
                    _id: id,
                    if_primary_term: _primary_term,
                    if_seq_no: _seq_no
                }
            });
        }
        const result = await myLog.sendBulk(bulkBody, this._immediateRefresh);

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
        this.__checkIfFullySpecified(`exists`);

        const myLog = logger.createLogger(esClient, `exists`, this.alias);

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

        let result;
        if (single) {
            const myResult = await myLog.callEsApi(`exists`, this.alias, ids[0]);
            result = myResult.body;
        } else {
            const myResult = await myLog.callEsApi(`mget`, this.alias, ids, false);
            result = myResult.body.docs.map((doc) => {
                return doc.found;
            });
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
        this.__checkIfFullySpecified(`update`);

        const myLog = logger.createLogger(esClient, `update`, this.alias);

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
                    _index: this.alias,
                    _id: id,
                    retry_on_conflict: defaultConfiguration.RETRY_ON_CONFLICT
                }
            });

            bulkBody.push(body);
        }
        const result = await myLog.sendBulk(bulkBody, this._immediateRefresh);

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
        const myLog = logger.createLogger(esClient, `count`, this.alias);
        myLog.logApiRequest({}, `Counting records.`);

        const result = await myLog.callEsApi(`count`, this.alias, this._alterSearch(body));

        myLog.logApiResponse(`Records counted.`);
        return result.body.count;
    }

    /**
     * Partially updates entries
     * @param body              {Object}    ES body with query and changes
     * @param scrollSize        {number}    Optional scroll size
     * @param waitForCompletion {boolean}   Wait for completion
     * @returns     {Promise<Object>}   ES response
     */
    static async updateByQuery(body, scrollSize = void 0, waitForCompletion = true) {
        const myLog = logger.createLogger(esClient, `updateByQuery`, this.alias);
        myLog.logApiRequest({
            scrollSize: scrollSize,
            waitForCompletion: waitForCompletion
        }, `Updating by query.`);

        const myScrollSize = (_.isNil(scrollSize)) ? await this._getBulkSize() : scrollSize;
        const result = await myLog.callEsApi(`updateByQuery`, this.alias, this._alterSearch(body), myScrollSize, waitForCompletion, this._immediateRefresh);

        myLog.logApiResponse(`Records updated.`);
        return result.body;
    }

    /**
     * Deletes entries by query
     * @param body              {Object}    ES body with query
     * @param scrollSize        {Object}    Optional scroll size
     * @param waitForCompletion {boolean}   Wait for completion
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteByQuery(body, scrollSize = void 0, waitForCompletion = true) {
        const myLog = logger.createLogger(esClient, `deleteByQuery`, this.alias);
        myLog.logApiRequest({
            scrollSize: scrollSize,
            waitForCompletion: waitForCompletion
        }, `Deleting by query.`);

        const myScrollSize = (_.isNil(scrollSize)) ? await this._getBulkSize() : scrollSize;
        const result = await myLog.callEsApi(`deleteByQuery`, this.alias, this._alterSearch(body), myScrollSize, waitForCompletion, this._immediateRefresh);

        myLog.logApiResponse(`Records deleted.`);
        return result.body;
    }

    /**
     * Creates index
     * @param body      {Object}        Optional settings
     * @param setAlias  {boolean}       True (default) to automatically set an alias to newly created index
     * @returns     {Promise<string>}   New index name
     */
    static async createIndex(body = void 0, setAlias = true) {
        this.__checkIfFullySpecified(`createIndex`);

        const myLog = logger.createLogger(esClient, `createIndex`, this.alias);
        myLog.logApiRequest({}, `Creating new index.`);

        const newIndex = generateIndex(this);
        await myLog.callEsApi(`createIndex`, newIndex, body);
        if (setAlias) {
            await myLog.callEsApi(`putAlias`, newIndex, this.alias);
        }

        myLog.logApiResponse(`Index created.`);
        return newIndex;
    }

    /**
     * Returns ES index of this ODM. Returns undefined when index doesn't exist.
     * @returns {Promise<string>} ES index
     */
    static async getIndex() {
        this.__checkIfFullySpecified(`getIndex`);

        const myLog = logger.createLogger(esClient, `getIndex`, this.alias);
        myLog.logApiRequest({}, `Returns index of this alias.`);

        let realIndex = void 0;
        const isAlias = await myLog.callEsApi(`existsAlias`, this.alias);
        if (isAlias.body === true) {
            const indices = await myLog.callEsApi(`getIndicesFromAlias`, this.alias);
            if (Object.keys(indices.body).length > 1) {
                throw Error(`Found multiple indices to alias.`);
            }
            realIndex = Object.keys(indices.body)[0];
        } else {
            const isIndex = await myLog.callEsApi(`existsIndex`, this.alias);
            if (isIndex.body === true) {
                realIndex = this.alias;
            }
        }

        myLog.logApiResponse(`Index returned.`);
        return realIndex;
    }

    /**
     * Puts a write alias to ES index. Alias is specified by this ODM, index has to be specified.
     * @param index {string} Index to be aliased
     * @returns {Promise<void>}
     */
    static async aliasIndex(index) {
        if (_.isEmpty(index) || !_.isString(index)) {
            throw Error(`You have to specify an index.`);
        }

        this.__checkIfFullySpecified(`aliasIndex`);

        let indexInfo;
        try {
            indexInfo = this._parseIndex(index);
        } catch (e) {
            throw Error(`You are specifying incorrect index.`);
        }
        if (this.alias !== indexInfo.alias) {
            throw Error(`You are specifying incorrect index. Your index transforms into alias '${indexInfo.alias}', ODM alias is '${this.alias}'.`);
        }

        const myLog = logger.createLogger(esClient, `aliasIndex`, this.alias);
        myLog.logApiRequest({}, `Put alias to the index.`);

        const aliasExists = await myLog.callEsApi(`existsAlias`, this.alias);
        if (aliasExists.body === true) {
            throw Error(`Alias '${this.alias}' is already used.`);
        }

        await myLog.callEsApi(`putAlias`, index, this.alias);

        myLog.logApiResponse(`Alias created.`);
    }

    /**
     * Deletes alias, throws if it doesn't exist. Doesn't touch underlying index
     * @returns {Promise<void>}
     */
    static async deleteAlias() {
        this.__checkIfFullySpecified(`deleteAlias`);

        const myLog = logger.createLogger(esClient, `deleteAlias`, this.alias);
        myLog.logApiRequest({}, `Deletes alias from the index.`);

        const isAlias = await myLog.callEsApi(`existsAlias`, this.alias);
        if (isAlias.body === true) {
            const indices = await myLog.callEsApi(`getIndicesFromAlias`, this.alias);
            await Promise.all(Object.keys(indices.body).map((index) => myLog.callEsApi(`deleteAlias`, index, this.alias)));
        } else {
            throw Error(`Alias '${this.alias}' doesn't exist.`);
        }

        myLog.logApiResponse(`Alias deleted.`);
    }

    /**
     * Checks index existence
     * @returns     {Promise<boolean>}   ES response
     */
    static async indexExists() {
        this.__checkIfFullySpecified(`existsIndex`);

        const myLog = logger.createLogger(esClient, `existsIndex`, this.alias);
        myLog.logApiRequest({}, `Checking index existence.`);

        const result = await myLog.callEsApi(`existsIndex`, this.alias);

        myLog.logApiResponse(`Index checked.`);
        return result.body;
    }

    /**
     * Deletes index along with alias (if exists)
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteIndex() {
        this.__checkIfFullySpecified(`deleteIndex`);

        const myLog = logger.createLogger(esClient, `deleteIndex`, this.alias);
        myLog.logApiRequest({}, `Deleting index.`);

        const isAlias = await myLog.callEsApi(`existsAlias`, this.alias);
        if (isAlias.body === true) {
            const indices = await myLog.callEsApi(`getIndicesFromAlias`, this.alias);
            await Promise.all(Object.keys(indices.body).map((index) => myLog.callEsApi(`deleteIndex`, index)));
        } else {
            await myLog.callEsApi(`deleteIndex`, this.alias);
        }

        myLog.logApiResponse(`Index deleted.`);
    }

    /**
     * Gets mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async getMapping() {
        const myLog = logger.createLogger(esClient, `getMapping`, this.alias);
        myLog.logApiRequest({}, `Retrieving mapping.`);

        const result = await myLog.callEsApi(`getMapping`, this.alias);

        myLog.logApiResponse(`Mapping obtained.`);
        return result.body;
    }

    /**
     * Puts mapping
     * @param mapping   {Object}            ES mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async putMapping(mapping) {
        if (_.isEmpty(mapping) || !_.isObject(mapping)) {
            throw Error(`You have to specify mapping object.`);
        }

        const myLog = logger.createLogger(esClient, `putMapping`, this.alias);
        myLog.logApiRequest({}, `Updating mapping.`);

        const result = await myLog.callEsApi(`putMapping`, this.alias, mapping);

        myLog.logApiResponse(`Mapping updated.`);
        return result.body;
    }

    /**
     * Gets settings
     * @param includeDefaults   {boolean}           Include default settings?
     * @returns                 {Promise<Object>}   ES response
     */
    static async getSettings(includeDefaults = false) {
        const myLog = logger.createLogger(esClient, `getSettings`, this.alias);
        myLog.logApiRequest({}, `Retrieving settings.`);

        const result = await myLog.callEsApi(`getSettings`, this.alias, includeDefaults);

        myLog.logApiResponse(`Settings obtained.`);
        return result.body;
    }

    /**
     * Puts settings
     * @param settings  {Object}            ES settings
     * @returns         {Promise<Object>}   ES response
     */
    static async putSettings(settings) {
        if (_.isEmpty(settings) || !_.isObject(settings)) {
            throw Error(`You have to specify settings object.`);
        }

        const myLog = logger.createLogger(esClient, `putSettings`, this.alias);
        myLog.logApiRequest({}, `Updating settings.`);

        const result = await myLog.callEsApi(`putSettings`, this.alias, settings);

        myLog.logApiResponse(`Settings updated.`);
        return result.body;
    }

    /**
     * Reindex from current model into a new one
     * @param destinationModel  {BaseModelType | string}    Destination ODM / index
     * @param script            {string}                    Script source
     * @param scrollSize        {number}                    Optional scroll size
     * @param waitForCompletion {boolean}                   Wait for completion
     * @returns                 {Promise<Object>}           ES response
     */
    static async reindex(destinationModel, script = void 0, scrollSize = void 0, waitForCompletion = true) {
        if (!destinationModel) {
            throw Error(`You must specify destination model!`);
        }
        this.__checkIfFullySpecified(`reindex-source`);
        if (!_.isString(destinationModel)) {
            destinationModel.__checkIfFullySpecified(`reindex-destination`);
        }

        const myLog = logger.createLogger(esClient, `reindex`, this.alias);
        myLog.logApiRequest({
            destinationIndex: (!_.isString(destinationModel)) ? destinationModel.alias : destinationModel,
            script: script,
            scrollSize: scrollSize,
            waitForCompletion: waitForCompletion
        }, `Reindexing data.`);

        const source = {
            index: this.alias,
            size: scrollSize
        };
        const dest = {
            index: (!_.isString(destinationModel)) ? destinationModel.alias : destinationModel,
            version_type: `external`
        };
        let myScript = void 0;
        if (_.isString(script) && !_.isEmpty(script)) {
            myScript = {
                source: script,
                lang: `painless`
            };
        }

        const result = await myLog.callEsApi(`reindex`, source, dest, myScript, waitForCompletion, this._immediateRefresh);

        myLog.logApiResponse(`Data reindexed.`);
        return result.body;
    }

    /**
     * Clones index into a new one. Preserves number of replicas. Input index has to be manually blocked for write (be made read-only).
     * @param settings {Object} Optional settings to use for the new index
     * @returns {Promise<string>} New index
     */
    static async cloneIndex(settings = void 0) {
        this.__checkIfFullySpecified(`clone`);

        const myLog = logger.createLogger(esClient, `clone`, this.alias);
        myLog.logApiRequest({}, `Clone index.`);

        let realIndex = this.alias;
        const isAlias = await myLog.callEsApi(`existsAlias`, this.alias);
        if (isAlias.body === true) {
            const indices = await myLog.callEsApi(`getIndicesFromAlias`, this.alias);
            if (Object.keys(indices.body).length > 1) {
                throw Error(`Found multiple indices to alias.`);
            }
            realIndex = Object.keys(indices.body)[0];
        }

        //Fetch and set original amount of replicas, this is not done by default
        const fields = [`number_of_replicas`, `auto_expand_replicas`];
        let originalSettings;
        for (const field of fields) {
            if (_.isNil(settings?.[field]) && _.isNil(settings?.index?.[field])) {
                if (!originalSettings) {
                    originalSettings = await this.getSettings();
                }
                const fieldValue = Object.values(originalSettings)[0].settings.index[field];

                if (_.isNil(settings)) {
                    settings = {
                        index: {
                            [field]: fieldValue
                        }
                    };
                } else if (_.isNil(settings.index)) {
                    settings.index = {
                        [field]: fieldValue
                    };
                } else {
                    settings.index[field] = fieldValue;
                }
            }
        }

        const newIndex = generateIndex(this);
        await myLog.callEsApi(`clone`, realIndex, newIndex, settings);

        myLog.logApiResponse(`Data cloned.`);
        return newIndex;
    }

    /**
     * Refreshed index.
     * @returns {Promise<Object>} ES response
     */
    static async refresh() {
        const myLog = logger.createLogger(esClient, `refresh`, this.alias);
        myLog.logApiRequest({}, `Refresh indices.`);

        const result = await myLog.callEsApi(`refresh`, this.alias);

        myLog.logApiResponse(`Indices refreshed.`);
        return result.body;
    }

    /**
     * Saves document to database
     * @param useVersion    {boolean}           If true, sends version to ES
     * @returns             {Promise<BaseModel>}
     */
    async save(useVersion = false) {
        const myLog = logger.createLogger(esClient, `save`, this.constructor.alias);

        await this.validate();

        if (useVersion) {
            await checkUseVersion(myLog, this);
        }

        myLog.logApiRequest({
            id: this._id,
            useVersion: useVersion
        },`Saving instance.`);

        const result = await myLog.callEsApi(`index`, this.constructor.alias, await this._packData(), this._id,
            (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0,
            this.constructor._immediateRefresh);

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
            alias: this.constructor.alias,
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

        const myLog = logger.createLogger(esClient, `delete`, this.constructor.alias);

        if (useVersion) {
            await checkUseVersion(myLog, this);
        }

        myLog.logApiRequest({
            id: this._id,
            useVersion: useVersion
        },`Deleting instance.`);

        //Throws if not in ES
        await myLog.callEsApi(`delete`, this.constructor.alias, this._id,
            (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0,
            this.constructor._immediateRefresh);

        myLog.logApiResponse(`Instance deleted.`);
    }

    /**
     * Creates clone of this instance
     * @param preserveAttributes    {boolean}   If true, non-enumerable attributes are preserved, except __uuid
     * @returns     {this}
     */
    clone(preserveAttributes = true) {
        logger.debug({
            action: `clone`,
            alias: this.constructor.alias,
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
        if (this.constructor.schema) {
            logger.trace({
                action: `validate`,
                alias: this.constructor.alias,
                id: this._id,
                msg: `Validating instance.`
            });
            await this.constructor.schema.validateAsync(this, defaultConfiguration.VALIDATOR_CONFIG);
        }
    }

    /**
     * Clones class
     * May be used to rewrite some functions / properties
     * @param changes   {Object}    Changes to apply to cloned object
     * @returns         {this}
     */
    static clone(changes = {}) {
        logger.trace({
            action: `clone`,
            alias: this.alias,
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
            alias: this.alias,
            newTenant: newTenant,
            msg: `Creating new model class with changed tenant.`
        });

        if (_.isNil(newTenant) || !_.isString(newTenant) || _.isEmpty(newTenant)) {
            throw Error(`Tenant must be a string!`);
        } else if (newTenant.includes(`_`)) {
            throw Error(`Tenant cannot contain underscore.`);
        }

        if (this._tenant === newTenant) {
            return this;
        } else {
            const changes = {
                _tenant: newTenant
            };
            return this.clone(changes);
        }
    }

    /**
     * Creates class copy with immediate refresh specified
     * @param newImmediateRefresh   {boolean}
     * @returns                     {this}
     */
    static immediateRefresh(newImmediateRefresh) {
        logger.trace({
            action: `setRefresh`,
            alias: this.alias,
            newImmediateRefresh: newImmediateRefresh,
            msg: `Creating new model class with changed immediateRefresh.`
        });

        if (_.isNil(newImmediateRefresh) || !_.isBoolean(newImmediateRefresh)) {
            throw Error(`Refresh must be a boolean!`);
        }

        const changes = {
            _immediateRefresh: newImmediateRefresh
        };
        return this.clone(changes);
    }

    /**
     * Parses index or alias into parts.
     * @param index {string} Index (or alias) from ES
     * @returns {{tenant: string, name: string, alias: string}} Object with parsed index
     * @private
     */
    static _parseIndex(index) {
        const aliasParts = index.split(`_`);
        const tenant = aliasParts.shift();
        const name = aliasParts.join(`_`).split(`-`)[0];

        return {
            tenant: tenant,
            name: name,
            alias: `${tenant}_${name}`
        };
    }

    /**
     * Checks if model is fully specified
     * @param functionName {string} Name of calling function
     * @private
     */
    static __checkIfFullySpecified(functionName) {
        if (_.isNil(this._name) || !_.isString(this._name) || this._name.includes(`*`) || this._name.includes(`?`)) {
            throw Error(`You cannot use '${functionName}' with current base name '${this._name}', full alias is '${this.alias}'!`);
        } else if (_.isEmpty(this._tenant) || this._tenant.includes(`*`) || this._tenant.includes(`?`)) {
            throw Error(`You cannot use '${functionName}' with current tenant '${this._tenant}', full alias is '${this.alias}'!`);
        }
    }

    /**
     * Returns correct constructor for search function data
     * @param searchResult {Object} Single document found in ES
     * @param constructorCache {Object} Cache object
     * @returns {this} Constructor to be used
     * @private
     */
    static __getConstructor(searchResult, constructorCache) {
        const indexInfo = this._parseIndex(searchResult._index);
        let Constructor = constructorCache[indexInfo.alias];
        if (!Constructor) {
            Constructor = this;

            if (Constructor._tenant !== indexInfo.tenant) {
                Constructor = Constructor.in(indexInfo.tenant);
            }

            constructorCache[indexInfo.alias] = Constructor;
        }
        return Constructor;
    }

    /**
     * Alters search body
     * @param body {Object}
     * @returns {Object}
     * @private
     */
    static _alterSearch(body) {
        return body;
    }

    /**
     * Returns unpacked version of the data
     * Used when data are saved in another format than they are worked in
     * @param source {Object}
     * @returns {Object}
     * @private
     */
    static _unpackData(source) {
        return source;
    }

    /**
     * Return packed version of the data
     * Used when data are saved in another format than they are worked in
     * @param cache {Object} Object that serve as a cache across multiple packs, may not be presented
     * @returns {Promise<Object>}
     * @private
     */
    // eslint-disable-next-line no-unused-vars
    async _packData(cache = void 0) {
        return this;
    }

    /**
     * Function resolved after search / find / find all / get
     * @param instances {Array<*>} Array of newly created instances
     * @param cache {Object} Optional cache object from search function
     * @returns {Promise<void>}
     * @private
     */
    // eslint-disable-next-line no-unused-vars
    static async _afterSearch(instances, cache = void 0) {
        //empty by default
    }

    /**
     * Returns best bulk size for the model. This size is used for searching/scrolling/iterating
     * @returns {Promise<number>}
     * @private
     */
    static async _getBulkSize() {
        return defaultConfiguration.SCROLL_SIZE;
    }
}

module.exports = { cloneClass, BaseModel };

function generateIndex(model) {
    return `${model._tenant}_${model._name}-${uuid().replaceAll(`-`, ``)}`;
}

/**
 * Fetches version and sequence numbers
 * @param myLog {MyLog} Logger instance
 * @param model {BaseModel} Model to be used
 * @returns {Promise<void>}
 */
async function checkUseVersion(myLog, model) {
    if (!model._id) {
        const error = Error(`You cannot use parameter 'useVersion' with model without _id specified.`);
        error.statusCode = 400;
        throw error;
    }

    if (!model._primary_term || !model._seq_no) {
        const response = await myLog.callEsApi(`getHead`, model.constructor.alias, model._id);

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
 * @param newClass {typeof BaseModel}
 */
function setClassName(newClass) {
    Object.defineProperty(newClass, `name`, {
        value: newClass.alias,
        writable: false,
        enumerable: false
    });
}

/**
 * @name BaseModel#schema
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
 * @name BaseModel#_name
 * Base name of the index
 * @type {string}
 * @static
 */

/**
 * @name BaseModel#_immediateRefresh
 * Should write operations specify "refresh: true"?
 * @type {string}
 * @static
 */

/**
 * @name BaseModel#__recordSearch
 * Special array property, if exists it saves the "search" queries and disables the function
 * Internally used for JointModel "recordSearch"
 * @type {Array<Object>}
 * @static
 */
