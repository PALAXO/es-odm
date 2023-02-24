'use strict';

const _ = require(`lodash`);
const Action = require(`./Action`);
const BulkArray = require(`./BulkArray`);
const { esErrors } = require(`./ElasticSearch`);
const logger = require(`./logger`);
const nconf = require(`./config/config`);
const utils = require(`./utils`);
const { v4: uuid } = require(`uuid`);

const defaultConfiguration = {
    VALIDATOR_CONFIG: nconf.get(`joi:validatorConfig`),
    RETRY_ON_CONFLICT: nconf.get(`es:retryOnConflict`),
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
     * @param _sort         {Array<*>}          ES sort
     */
    constructor(data = {}, _id = void 0, _version = void 0, _highlight = void 0, _primary_term = void 0, _seq_no = void 0, _score = void 0, _sort = void 0) {
        this.constructor.__checkIfFullySpecified(`constructor`);

        logger.trace({
            action: `constructor`,
            alias: this.constructor.alias,
            parameters: {
                id: _id, version: _version, primary_term: _primary_term, seq_no: _seq_no
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
        /** @type {Array<*>} ES sort */
        Object.defineProperty(this, `_sort`, {
            value: _sort,
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
     * Performs ES search. Supports implicit scrolling, explicit scrolling, searchAfter and Point in Time.
     * @param body          {Object=}    Body object; ignored when explicitly scrolling after the initial request
     * @param from          {number=}    Start entry; cannot be used in case of explicit scrolling or when searchAfter is specified
     * @param size          {number=}    Number of returned entries or bulk size in case of explicit scrolling; cannot be used when explicitly scrolling after the initial request
     * @param additional    {{cache: Object=, source: (boolean|Array<string>)=, scrollId: (string|boolean)=, searchAfter: Array<*>=, pitId: string=, refresh: number=, trackTotalHits: boolean=, autoPitSort: boolean=}}    Additional data
     * - "cache" is cache object passed to "\_afterSearch" function.
     * - "source" is passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned.
     * - "scrollId" is used for explicit scrolling. Specify "true" to initialize scrolling, or scroll ID to continue scrolling.
     * - "searchAfter" is array with last item sort result, used for searchAfter deep pagination.
     * - "pitId" is Point in Time ID.
     * - "refresh" is refresh time in seconds used for scrolling or PIT
     * - "trackTotalHits" controls if "\_total" value in resulting field should be populated. Defaults to true, except for searchAfter or search with PIT where it defaults to false.
     * - "autoPitSort" controls whether in case of PIT without any specified "sort" value should be descending "\_shard\_doc" sort automatically passed. Defaults to true.
     * @returns                 {Promise<BulkArray<BaseModel> | Object[]>}
     */
    static async search(body = {}, from = void 0, size = void 0, additional = void 0) {
        const alteredBody = this._alterSearch(body);

        if ((_.isEmpty(additional?.scrollId) || !_.isString(additional?.scrollId)) && (_.isNil(body) || !_.isObject(body))) {
            throw Error(`Body must be an object!`);
        }

        if (!_.isNil(this.__recordSearch)) {
            //This is for JointModel, we only record the search
            this.__recordSearch.push(alteredBody.query);
            return void 0;
        }

        const myAction = new Action(`search`, this.alias);

        const self = this;
        const returnArray = (_.isNil(additional?.source)) ? new BulkArray() : [];
        const constructorCache = {};
        const parseResult = function (result) {
            if (_.isNil(additional?.source)) {  //Create instance
                const Constructor = self.__getConstructor(result, constructorCache);

                //push instance
                returnArray.push(new Constructor(Constructor._unpackData(result._source), result._id, result._version, result.highlight,
                    result._primary_term, result._seq_no, result._score, result.sort));

            } else {    //Just push
                returnArray.push(result);
            }
        };

        await utils.search(this, myAction, parseResult, returnArray, alteredBody, from, size, additional);

        myAction.finish({
            items: returnArray.length
        });
        return returnArray;
    }

    /**
     * Clears ES scroll ID
     * @param scrollId  {string}    Scroll ID
     * @returns {Promise<boolean>}
     */
    static async clearScroll(scrollId) {
        if (_.isNil(scrollId)) {
            throw Error(`scrollId must be specified!`);
        }

        const myAction = new Action(`clearScroll`, this.alias);
        const myResult = await myAction.clearScroll(scrollId);

        myAction.finish();
        return myResult;
    }

    /**
     * Returns iterator over bulks
     * @param body          {Object=}   Body object
     * @param additional    {{cache: Object=, source: (boolean|Array<string>)=, refresh: number=, trackTotalHits: boolean=}}    Additional data
     * @returns {AsyncGenerator<BulkArray<BaseModel>|Array<Object>>}
     */
    static bulkIterator(body = void 0, additional = void 0) {
        logger.info({
            action: `bulkIterator`,
            alias: this.alias,
            type: `redirect`,
            msg: `Iterating documents by bulks -> calling search functions.`
        });

        return utils.bulkIterator(this, body, additional);
    }

    /**
     * Returns iterator over documents
     * @param body          {Object=}   Body object
     * @param additional    {{cache: Object=, source: (boolean|Array<string>)=, refresh: number=}}    Additional data
     * @returns {AsyncGenerator<BaseModel|Object>}
     */
    static itemIterator(body = void 0, additional = void 0) {
        logger.info({
            action: `itemIterator`,
            alias: this.alias,
            type: `redirect`,
            msg: `Iterating documents by items -> calling search functions.`
        });

        return utils.itemIterator(this, body, additional);
    }

    /**
     * Finds all entries
     * @param source    {(String[] | boolean)=}     Boolean or optional array with source fields -> if specified, function returns plain objects
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
        return this.search(body, void 0, void 0, { source: source });
    }

    /**
     * Finds entries by given string or array of strings, uses search function
     * @param ids       {string | Array<string>}            Id or Ids to be found
     * @param source    {(String[] | boolean)=}             Boolean or optional array with source fields -> if specified, function returns plain objects
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
        const array = await this.search(body, 0, ids.length, { source: source });

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

        const myAction = new Action(`get`, this.alias);

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

        myAction.logParams({
            ids: ids
        });

        const results = await myAction.callEs(`mget`, this.alias, ids);

        const models = new BulkArray();
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

        myAction.note(`Calling _afterSearch function.`);
        await this._afterSearch(models);

        myAction.finish({
            items: models.length
        });

        if (single) {
            return models[0];
        } else {
            return models;
        }
    }

    /**
     * Gets heads for given ID or array of IDs
     * @param ids   {string | Array<string>}                    Id or Ids to be found
     * @returns     {Promise<Object | Array<Object>>}
     */
    static async head(ids) {
        this.__checkIfFullySpecified(`head`);

        const myAction = new Action(`head`, this.alias);

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.isEmpty(ids)) {
            return [];
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            single = false;
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        myAction.logParams({
            ids: ids
        });

        const results = await myAction.callEs(`mget`, this.alias, ids, false);

        const output = [];
        for (const result of results.body.docs) {
            if (!result.found) {
                throw new esErrors.ResponseError({
                    statusCode: 404,
                    body: {
                        ...result
                    }
                });
            } else {
                output.push(result);
            }
        }

        myAction.finish();

        if (single) {
            return output[0];
        } else {
            return output;
        }
    }

    /**
     * Deletes entries by given string or array of strings
     * @param ids           {string | Array<string>}    Id or Ids to be deleted
     * @param version       {number=}                   Version of document to be deleted
     * @returns             {Promise<Object>}           ES response
     */
    static async delete(ids, version = void 0) {
        this.__checkIfFullySpecified(`delete`);

        const myAction = new Action(`delete`, this.alias);

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
            throw Error(`You have to specify the IDs.`);
        }

        let _primary_term = void 0;
        let _seq_no = void 0;

        if (!_.isNil(version)) {    //version specified
            if (!isSingle) {        //only one id allowed
                const error = Error(`You cannot use parameter 'version' with multiple ids specified!`);
                error.statusCode = 400;
                throw error;
            }

            const response = await this.head(ids[0]);
            if (version !== response._version) {
                const error = Error(`Specified version '${version}' is different than stored version '${response._version}'!`);
                error.statusCode = 409;
                throw error;
            }

            _primary_term = response._primary_term;
            _seq_no = response._seq_no;
        }

        myAction.logParams({
            ids: ids, version: version
        });

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
        const result = await myAction.sendBulk(bulkBody, this._immediateRefresh);

        if (isSingle && result.body.items[0].delete.status >= 400) {
            const item = result.body.items[0].delete;
            const errorMessage = _.has(item, `error.reason`) ? item.error.reason : _.get(item, `result`, `Error happened during delete of item with id ${ids[0]}`);
            const error = Error(errorMessage);
            error.statusCode = item.status;
            throw error;
        } else {
            myAction.finish();
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

        const myAction = new Action(`exists`, this.alias);

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.every(ids, _.isString)) {
            single = false;
        } else {
            throw Error(`You must specify string ID or array of string IDs!`);
        }

        myAction.logParams({
            ids: ids
        });

        let result;
        if (single) {
            const myResult = await myAction.callEs(`exists`, this.alias, ids[0]);
            result = myResult.body;
        } else {
            const myResult = await myAction.callEs(`mget`, this.alias, ids, false);
            result = myResult.body.docs.map((doc) => {
                return doc.found;
            });
        }

        myAction.finish();
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

        const myAction = new Action(`update`, this.alias);

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
            throw Error(`You have to specify the IDs.`);
        }

        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        myAction.logParams({
            ids: ids
        });

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
        const result = await myAction.sendBulk(bulkBody, this._immediateRefresh);

        if (isSingle && result.body.items[0].update.status >= 400) {
            const item = result.body.items[0].update;
            const errorMessage = _.has(item, `error.reason`) ? item.error.reason : _.get(item, `result`, `Error happened during update of item with id ${ids[0]}`);
            const error = Error(errorMessage);
            error.statusCode = item.status;
            throw error;
        } else {
            myAction.finish();
            return result.body;
        }
    }

    /**
     * Returns number of entries in index
     * @param body  {Object=}           Body object
     * @returns     {Promise<number>}   ES response
     */
    static async count(body = void 0) {
        const myAction = new Action(`count`, this.alias);

        const result = await myAction.callEs(`count`, this.alias, this._alterSearch(body));

        myAction.finish();
        return result.body.count;
    }

    /**
     * Partially updates entries
     * @param body              {Object}    ES body with query and changes
     * @param scrollSize        {number=}   Optional scroll size
     * @param waitForCompletion {boolean=}  Wait for completion
     * @returns     {Promise<Object>}   ES response
     */
    static async updateByQuery(body, scrollSize = void 0, waitForCompletion = true) {
        const myAction = new Action(`updateByQuery`, this.alias);
        myAction.logParams({
            scrollSize: scrollSize,
            waitForCompletion: waitForCompletion
        });

        const myScrollSize = (_.isNil(scrollSize)) ? await this._getBulkSize() : scrollSize;
        const result = await myAction.callEs(`updateByQuery`, this.alias, this._alterSearch(body), myScrollSize, waitForCompletion, this._immediateRefresh);

        myAction.finish();
        return result.body;
    }

    /**
     * Deletes entries by query
     * @param body              {Object}    ES body with query
     * @param scrollSize        {number=}   Optional scroll size
     * @param waitForCompletion {boolean=}  Wait for completion
     * @returns     {Promise<Object>}   ES response
     */
    static async deleteByQuery(body, scrollSize = void 0, waitForCompletion = true) {
        const myAction = new Action(`deleteByQuery`, this.alias);
        myAction.logParams({
            scrollSize: scrollSize,
            waitForCompletion: waitForCompletion
        });

        const myScrollSize = (_.isNil(scrollSize)) ? await this._getBulkSize() : scrollSize;
        const result = await myAction.callEs(`deleteByQuery`, this.alias, this._alterSearch(body), myScrollSize, waitForCompletion, this._immediateRefresh);

        myAction.finish();
        return result.body;
    }

    /**
     * Creates index
     * @param body      {Object}        Optional settings
     * @param setAlias  {boolean=}      True (default) to automatically set an alias to newly created index
     * @returns     {Promise<string>}   New index name
     */
    static async createIndex(body = void 0, setAlias = true) {
        this.__checkIfFullySpecified(`createIndex`);

        const myAction = new Action(`createIndex`, this.alias);

        const newIndex = generateIndex(this);
        await myAction.callEs(`createIndex`, newIndex, body);
        if (setAlias) {
            await this.aliasIndex(newIndex);
        }

        myAction.finish();
        return newIndex;
    }

    /**
     * Returns ES index of this ODM. Returns undefined when index doesn't exist.
     * @returns {Promise<string>} ES index
     */
    static async getIndex() {
        this.__checkIfFullySpecified(`getIndex`);

        const myAction = new Action(`getIndex`, this.alias);

        let realIndex = void 0;
        const isAlias = await this.aliasExists();
        if (isAlias === true) {
            const indices = await myAction.callEs(`getIndicesFromAlias`, this.alias);
            if (Object.keys(indices.body).length > 1) {
                throw Error(`Found multiple indices to alias.`);
            }
            realIndex = Object.keys(indices.body)[0];
        } else {
            const isIndex = await this.indexExists();
            if (isIndex === true) {
                realIndex = this.alias;
            }
        }

        myAction.finish();
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

        const indexInfo = this._parseIndex(index);
        if (this.alias !== indexInfo.alias) {
            throw Error(`You are specifying incorrect index. Your index transforms into alias '${indexInfo.alias}', ODM alias is '${this.alias}'.`);
        }

        const myAction = new Action(`aliasIndex`, this.alias);

        const aliasExists = await this.aliasExists();
        if (aliasExists === true) {
            throw Error(`Alias '${this.alias}' is already used.`);
        }

        await myAction.callEs(`putAlias`, index, this.alias);

        myAction.finish();
    }

    /**
     * Deletes alias, throws if it doesn't exist. Doesn't touch underlying index
     * @returns {Promise<void>}
     */
    static async deleteAlias() {
        this.__checkIfFullySpecified(`deleteAlias`);

        const myAction = new Action(`deleteAlias`, this.alias);

        const isAlias = await this.aliasExists();
        if (isAlias === true) {
            const indices = await myAction.callEs(`getIndicesFromAlias`, this.alias);
            await Promise.all(Object.keys(indices.body).map((index) => myAction.callEs(`deleteAlias`, index, this.alias)));
        } else {
            throw Error(`Alias '${this.alias}' doesn't exist.`);
        }

        myAction.finish();
    }

    /**
     * Checks alias existence
     * @returns     {Promise<boolean>}   ES response
     */
    static async aliasExists() {
        this.__checkIfFullySpecified(`aliasExists`);

        const myAction = new Action(`aliasExists`, this.alias);

        const result = await myAction.callEs(`existsAlias`, this.alias);

        myAction.finish();
        return result.body;
    }

    /**
     * Checks index existence
     * @returns     {Promise<boolean>}   ES response
     */
    static async indexExists() {
        this.__checkIfFullySpecified(`existsIndex`);

        const myAction = new Action(`existsIndex`, this.alias);

        const result = await myAction.callEs(`existsIndex`, this.alias);

        myAction.finish();
        return result.body;
    }

    /**
     * Deletes index along with alias (if exists)
     * @returns     {Promise<void>}   ES response
     */
    static async deleteIndex() {
        this.__checkIfFullySpecified(`deleteIndex`);

        const myAction = new Action(`deleteIndex`, this.alias);

        const isAlias = await this.aliasExists();
        if (isAlias === true) {
            const indices = await myAction.callEs(`getIndicesFromAlias`, this.alias);
            await Promise.all(Object.keys(indices.body).map((index) => myAction.callEs(`deleteIndex`, index)));
        } else {
            await myAction.callEs(`deleteIndex`, this.alias);
        }

        myAction.finish();
    }

    /**
     * Gets mapping
     * @returns         {Promise<Object>}   ES response
     */
    static async getMapping() {
        const myAction = new Action(`getMapping`, this.alias);

        const result = await myAction.callEs(`getMapping`, this.alias);

        myAction.finish();
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

        const myAction = new Action(`putMapping`, this.alias);

        const result = await myAction.callEs(`putMapping`, this.alias, mapping);

        myAction.finish();
        return result.body;
    }

    /**
     * Gets settings
     * @param includeDefaults   {boolean=}          Include default settings?
     * @returns                 {Promise<Object>}   ES response
     */
    static async getSettings(includeDefaults = false) {
        const myAction = new Action(`getSettings`, this.alias);

        const result = await myAction.callEs(`getSettings`, this.alias, includeDefaults);

        myAction.finish();
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

        const myAction = new Action(`putSettings`, this.alias);

        const result = await myAction.callEs(`putSettings`, this.alias, settings);

        myAction.finish();
        return result.body;
    }

    /**
     * Reindex from current model into a new one
     * @param destinationModel  {BaseModelType | string}    Destination ODM / index
     * @param script            {string=}                   Script source
     * @param scrollSize        {number=}                   Optional scroll size
     * @param waitForCompletion {boolean=}                  Wait for completion
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

        const myAction = new Action(`reindex`, this.alias);
        myAction.logParams({
            destinationIndex: (!_.isString(destinationModel)) ? destinationModel.alias : destinationModel,
            script: !!script,
            scrollSize: scrollSize,
            waitForCompletion: waitForCompletion
        });

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

        const result = await myAction.callEs(`reindex`, source, dest, myScript, waitForCompletion, this._immediateRefresh);

        myAction.finish();
        return result.body;
    }

    /**
     * Clones index into a new one. Preserves number of replicas. Input index has to be manually blocked for write (be made read-only).
     * @param settings {Object=}    Optional settings to use for the new index
     * @returns {Promise<string>}   New index
     */
    static async cloneIndex(settings = void 0) {
        this.__checkIfFullySpecified(`clone`);

        const myAction = new Action(`clone`, this.alias);

        const realIndex = await this.getIndex();

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
        await myAction.callEs(`clone`, realIndex, newIndex, settings);

        myAction.finish();
        return newIndex;
    }

    /**
     * Refreshed index.
     * @returns {Promise<Object>} ES response
     */
    static async refresh() {
        const myAction = new Action(`refresh`, this.alias);

        const result = await myAction.callEs(`refresh`, this.alias);

        myAction.finish();
        return result.body;
    }

    /**
     * Opens Point in Time
     * @returns {Promise<string>}
     */
    static async openPIT() {
        const myAction = new Action(`openPIT`, this.alias);

        const result = await myAction.callEs(`openPIT`, this.alias);

        myAction.finish();
        return result.body.id;
    }

    /**
     * Closes Point in Time
     * @param id {string}
     * @returns {Promise<boolean>}
     */
    static async closePIT(id) {
        if (_.isEmpty(id)) {
            throw Error(`PIT ID must be specified!`);
        }

        const myAction = new Action(`closePIT`, this.alias);
        const myResult = await myAction.closePIT(id);

        myAction.finish();
        return myResult;
    }

    /**
     * Saves document to database
     * @param useVersion    {boolean=}          If true, sends version to ES
     * @returns             {Promise<BaseModel>}
     */
    async save(useVersion = false) {
        const myAction = new Action(`save`, this.constructor.alias);

        await this.validate();

        if (useVersion) {
            await checkVersion(myAction, this);
        }

        myAction.logParams({
            id: this._id,
            useVersion: useVersion
        });

        const result = await myAction.callEs(`index`, this.constructor.alias, await this._packData(), this._id,
            (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0,
            this.constructor._immediateRefresh);

        this._id = result.body._id;
        this._version = result.body._version;
        this._primary_term = result.body._primary_term;
        this._seq_no = result.body._seq_no;

        myAction.finish();

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

        utils.reloadInstance(this, result);
    }

    /**
     * Deletes instance from ES
     * @param useVersion    {boolean=}          If true, sends version to ES
     * @returns             {Promise<void>}
     */
    async delete(useVersion = false) {
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }

        const myAction = new Action(`delete`, this.constructor.alias);

        if (useVersion) {
            await checkVersion(myAction, this);
        }

        myAction.logParams({
            id: this._id,
            useVersion: useVersion
        });

        //Throws if not in ES
        await myAction.callEs(`delete`, this.constructor.alias, this._id,
            (useVersion) ? this._primary_term : void 0, (useVersion) ? this._seq_no : void 0,
            this.constructor._immediateRefresh);

        myAction.finish();
    }

    /**
     * Creates clone of this instance
     * @param preserveAttributes    {boolean=}  If true, non-enumerable attributes are preserved, except __uuid
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
            return new this.constructor(_.cloneDeep(this), this._id, this._version, this._highlight, this._primary_term, this._seq_no, this._score, this._sort);
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
     * @param changes   {Object=}   Changes to apply to cloned object
     * @returns         {this}
     */
    static clone(changes = {}) {
        logger.trace({
            action: `clone`,
            alias: this.alias,
            changes: changes,
            msg: `Creating new model class with changed properties.`
        });

        return utils.cloneClass(this, changes);
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
            return this.clone({
                _tenant: newTenant
            });
        }
    }

    /**
     * Creates class copy with immediate refresh specified
     * @param newImmediateRefresh   {boolean | string}
     * @returns                     {this}
     */
    static immediateRefresh(newImmediateRefresh) {
        logger.trace({
            action: `setRefresh`,
            alias: this.alias,
            newImmediateRefresh: newImmediateRefresh,
            msg: `Creating new model class with changed immediateRefresh.`
        });

        if (_.isNil(newImmediateRefresh) || (!_.isBoolean(newImmediateRefresh) && !_.isString(newImmediateRefresh))) {
            throw Error(`Immediate refresh must be a boolean or a string!`);
        }

        if (this._immediateRefresh === newImmediateRefresh) {
            return this;
        } else {
            return this.clone({
                _immediateRefresh: newImmediateRefresh
            });
        }
    }

    /**
     * Parses index or alias into parts.
     * @param index {string} Index (or alias) from ES
     * @returns {{tenant: string, name: string, alias: string}} Object with parsed index
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
     */
    static _alterSearch(body) {
        return body;
    }

    /**
     * Returns unpacked version of the data
     * Used when data are saved in another format than they are worked in
     * @param source {Object}
     * @returns {Object}
     */
    static _unpackData(source) {
        return source;
    }

    /**
     * Return packed version of the data
     * Used when data are saved in another format than they are worked in
     * @param cache {Object=} Object that serve as a cache across multiple packs, may not be presented
     * @returns {Promise<Object>}
     */
    // eslint-disable-next-line no-unused-vars
    async _packData(cache = void 0) {
        return this;
    }

    /**
     * Function resolved after search / find / find all / get
     * @param instances {Array<*>} Array of newly created instances
     * @param cache {Object=} Optional cache object from search function
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line no-unused-vars
    static async _afterSearch(instances, cache = void 0) {
        //empty by default
    }

    /**
     * Returns best bulk size for the model. This size is used for searching/scrolling/iterating
     * @returns {Promise<number>}
     */
    static async _getBulkSize() {
        return defaultConfiguration.SCROLL_SIZE;
    }
}

module.exports = BaseModel;

function generateIndex(model) {
    return `${model._tenant}_${model._name}-${uuid().replaceAll(`-`, ``)}`;
}

/**
 * Fetches version and sequence numbers
 * @param myAction {MyAction} Logger instance
 * @param model {BaseModel} Model to be used
 * @returns {Promise<void>}
 */
async function checkVersion(myAction, model) {
    if (!model._id) {
        const error = Error(`You cannot use parameter 'useVersion' with model without _id specified.`);
        error.statusCode = 400;
        throw error;
    }

    if (!model._primary_term || !model._seq_no) {
        const result = await model.constructor.head(model._id);

        if (model._version !== result._version) {
            const error = Error(`Actual version '${model._version}' is different than stored version '${result._version}'!`);
            error.statusCode = 409;
            throw error;
        }

        model._primary_term = result._primary_term;
        model._seq_no = result._seq_no;
    }
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
 * @type {boolean}
 * @static
 */

/**
 * @name BaseModel#__recordSearch
 * Special array property, if exists it saves the "search" queries and disables the function
 * Internally used for JointModel "recordSearch"
 * @type {Array<Object>}
 * @static
 */
