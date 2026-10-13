import _ from 'lodash';
import Action from './Action.js';
import BulkArray from './BulkArray.js';
import { esErrors } from './elasticsearch.js';
import logger from './logger.js';
import nconf from './config/config.js';
import utils from './utils.js';
import { v4 as uuid } from 'uuid';

/** @import { SearchResult, SearchMetadata } from './BulkArray.js' */

/**
 * ES search body. The index, the source filtering, the concurrency metadata and the PIT are managed by the library and
 * are not accepted here, the scroll API is not used at all; "from", "size", "search_after" and "track_total_hits" are honoured.
 * @typedef {Omit<import('@elastic/elasticsearch').estypes.SearchRequest, 'index' | '_source' | 'seq_no_primary_term' | 'version' | 'pit' | 'track_scores' | 'scroll'>} SearchBody
 */
/**
 * ES count body - the index is managed by the library
 * @typedef {Omit<import('@elastic/elasticsearch').estypes.CountRequest, 'index'>} CountBody
 */
/**
 * ES update by query body - the index, the scroll size, the refresh, the slicing and the completion mode are managed by the library
 * @typedef {Omit<import('@elastic/elasticsearch').estypes.UpdateByQueryRequest, 'index' | 'scroll_size' | 'refresh' | 'version' | 'slices' | 'wait_for_completion'>} UpdateByQueryBody
 */
/**
 * ES delete by query body - the same members as of the update by query body are managed by the library
 * @typedef {Omit<import('@elastic/elasticsearch').estypes.DeleteByQueryRequest, 'index' | 'scroll_size' | 'refresh' | 'version' | 'slices' | 'wait_for_completion'>} DeleteByQueryBody
 */
/**
 * ES create index body - the index is managed by the library
 * @typedef {Omit<import('@elastic/elasticsearch').estypes.IndicesCreateRequest, 'index'>} CreateIndexBody
 */
/**
 * ES put mapping body - the index is managed by the library
 * @typedef {Omit<import('@elastic/elasticsearch').estypes.IndicesPutMappingRequest, 'index'>} PutMappingBody
 */
/**
 * Additional options of a search
 * @typedef {Object} SearchAdditional
 * @property {Record<string, any>=} cache Cache object passed to the "_afterSearch" function
 * @property {(boolean|Array<string>)=} source Passed to ES "_source" and controls the output of the function. If not specified, a BulkArray of instances is returned, otherwise a plain array of ES objects
 * @property {Array<*>=} searchAfter Sort values of the last item, used for the "search_after" deep pagination
 * @property {string=} pitId Point in Time ID. When specified it is used as an explicit PIT and it is not closed. Each call returns a single page - "size" capped at "es:maxResults", or "_getBulkSize()" hits without an explicit "size"
 * @property {number=} refresh Point in Time keep alive in seconds
 * @property {boolean=} trackTotalHits Controls whether the "_total" value of the result is populated. Defaults to true
 * @property {boolean=} autoPitSort Controls whether an explicit PIT without any specified "sort" gets an ascending "_shard_doc" sort; an implicit PIT injects it always. Defaults to true
 */

const defaultConfiguration = {
    VALIDATOR_CONFIG: nconf.get(`joi:validatorConfig`),
    RETRY_ON_CONFLICT: nconf.get(`es:retryOnConflict`),
    PAGINATION_SIZE: nconf.get(`es:paginationSize`)
};

class BaseModel {
    /**
     * Joi schema
     * @type {import('joi').Schema}
     */
    static schema;

    /**
     * Tenant, beginning of the index
     * @type {string}
     */
    static _tenant;

    /**
     * Base name of the index
     * @type {string}
     */
    static _name;

    /**
     * Should write operations specify "refresh: true"?
     * @type {boolean | string}
     */
    static _immediateRefresh;

    /**
     * Special array property, if exists it saves the "search" queries and disables the function
     * Internally used for JointModel "recordSearch"
     * @type {Array<Record<string, any>>}
     */
    static __recordSearch;

    /**
     * Creates new instance
     * @param data          {Record<string, any>=}  Object, from which the instance is constructed
     * @param _id           {string}                ES id
     * @param _version      {number | string}       ES version
     * @param _highlight    {Record<string, Array<string>>} ES highlight
     * @param _primary_term {number | string}       ES primary term
     * @param _seq_no       {number | string}       ES sequence number
     * @param _score        {number}                ES score
     * @param _sort         {Array<*>}              ES sort
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

        /** @type {string | undefined} ES id */
        Object.defineProperty(this, `_id`, {
            value: _id,
            writable: true,
            enumerable: false
        });
        /** @type {number | undefined} ES version */
        Object.defineProperty(this, `_version`, {
            value: (!_.isNil(_version)) ? parseInt(_version) : void 0,
            writable: true,
            enumerable: false
        });
        /** @type {Record<string, Array<string>> | undefined} ES highlight */
        Object.defineProperty(this, `_highlight`, {
            value: _highlight,
            writable: true,
            enumerable: false
        });
        /** @type {number | undefined} ES primary term */
        Object.defineProperty(this, `_primary_term`, {
            value: (!_.isNil(_primary_term)) ? parseInt(_primary_term) : void 0,
            writable: true,
            enumerable: false
        });
        /** @type {number | undefined} ES sequence number */
        Object.defineProperty(this, `_seq_no`, {
            value: (!_.isNil(_seq_no)) ? parseInt(_seq_no): void 0,
            writable: true,
            enumerable: false
        });
        /** @type {number | undefined} ES score */
        Object.defineProperty(this, `_score`, {
            value: _score,
            writable: true,
            enumerable: false
        });
        /** @type {Array<*> | undefined} ES sort */
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
     * Unique constructor identifier
     * @returns {string}
     */
    static get __constructorIdentifier() {
        return this.alias;
    }

    /**
     * Indices a search of this class really touches - the whole alias, unlike a JointModel, which searches
     * only the indices of the models which recorded a query
     * @returns {string | Array<string>}
     */
    static get __searchedAlias() {
        return this.alias;
    }

    /**
     * Searches for documents of this class. Supports searchAfter and Point in Time.
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param from          {number=}       Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size          {number=}       Number of returned entries or bulk size in case of explicit PIT
     * @param additional    {(Omit<SearchAdditional, 'source'> & {source?: undefined})=}    Additional data
     * - "autoPitSort" controls whether in case of explicit PIT without any specified "sort" value should be ascending "\_shard\_doc" sort automatically passed; an implicit PIT injects it always. Defaults to true.
     * @returns             {Promise<SearchResult<InstanceType<T>>>} BulkArray of instances
     */
    /**
     * Searches for documents of this class. Supports searchAfter and Point in Time.
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param from          {number=}       Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size          {number=}       Number of returned entries or bulk size in case of explicit PIT
     * @param additional    {(Omit<SearchAdditional, 'source'> & {source: (boolean|Array<string>)})=}    Additional data
     * - "autoPitSort" controls whether in case of explicit PIT without any specified "sort" value should be ascending "\_shard\_doc" sort automatically passed; an implicit PIT injects it always. Defaults to true.
     * @returns             {Promise<Array<Record<string, any>> & SearchMetadata>} Array of plain ES objects
     */
    /**
     * Searches for documents of this class. Supports searchAfter and Point in Time.
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param from          {number=}       Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size          {number=}       Number of returned entries or bulk size in case of explicit PIT
     * @param additional    {SearchAdditional=}    Additional data
     * - "autoPitSort" controls whether in case of explicit PIT without any specified "sort" value should be ascending "\_shard\_doc" sort automatically passed; an implicit PIT injects it always. Defaults to true.
     * @returns             {Promise<SearchResult<InstanceType<T>> | Array<Record<string, any>> & SearchMetadata>}
     */
    /**
     * Searches for documents of this class. Supports searchAfter and Point in Time.
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param from          {number=}       Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size          {number=}       Number of returned entries or bulk size in case of explicit PIT
     * @param additional    {SearchAdditional=}    Additional data
     * - "autoPitSort" controls whether in case of explicit PIT without any specified "sort" value should be ascending "\_shard\_doc" sort automatically passed; an implicit PIT injects it always. Defaults to true.
     * @returns             {Promise<SearchResult<InstanceType<T>> | Array<Record<string, any>> & SearchMetadata>}
     */
    static async search(body = {}, from = void 0, size = void 0, additional = void 0) {
        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        const alteredBody = this._alterSearch(body);

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
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: undefined, pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>>}
     */
    /**
     * Returns iterator over bulks
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<Array<Record<string, any>> & SearchMetadata>}
     */
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>|(Array<Record<string, any>> & SearchMetadata)>} Union for a caller resolving "source" at runtime
     */
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>|(Array<Record<string, any>> & SearchMetadata)>}
     */
    static bulkIterator(body = void 0, additional = void 0) {
        checkNotRecording(this);

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
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: undefined, pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>>}
     */
    /**
     * Returns iterator over documents
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source: (boolean|Array<string>), pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<Record<string, any>>}
     */
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>|Record<string, any>>} Union for a caller resolving "source" at runtime
     */
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>|Record<string, any>>}
     */
    static itemIterator(body = void 0, additional = void 0) {
        checkNotRecording(this);

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
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @returns {Promise<SearchResult<InstanceType<T>>>} BulkArray of instances
     */
    /**
     * Finds all entries
     * @overload
     * @param source    {Array<string> | boolean}   Boolean or array with source fields
     * @returns {Promise<Array<Record<string, any>> & SearchMetadata>} Array of plain ES objects
     */
    /**
     * Finds all entries
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param source    {(Array<string> | boolean)=}    Boolean or optional array with source fields
     * @returns {Promise<SearchResult<InstanceType<T>> | Array<Record<string, any>> & SearchMetadata>} Union for a caller resolving "source" at runtime
     */
    /**
     * Finds all entries
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param source    {(Array<string> | boolean)=}    Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns {Promise<SearchResult<InstanceType<T>> | Array<Record<string, any>> & SearchMetadata>}
     */
    static async findAll(source = void 0) {
        checkNotRecording(this);

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
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param ids       {string | Array<string>}    Id or Ids to be found
     * @returns         {Promise<SearchResult<InstanceType<T>>>} BulkArray of instances
     */
    /**
     * Finds entries by given string or array of strings, uses search function
     * @overload
     * @param ids       {string | Array<string>}    Id or Ids to be found
     * @param source    {Array<string> | boolean}   Boolean or array with source fields
     * @returns         {Promise<Array<Record<string, any>> & SearchMetadata>} Array of plain ES objects
     */
    /**
     * Finds entries by given string or array of strings, uses search function
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param ids       {string | Array<string>}        Id or Ids to be found
     * @param source    {(Array<string> | boolean)=}    Boolean or optional array with source fields
     * @returns         {Promise<SearchResult<InstanceType<T>> | Array<Record<string, any>> & SearchMetadata>} Union for a caller resolving "source" at runtime
     */
    /**
     * Finds entries by given string or array of strings, uses search function
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param ids       {string | Array<string>}            Id or Ids to be found
     * @param source    {(Array<string> | boolean)=}        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns         {Promise<SearchResult<InstanceType<T>> | Array<Record<string, any>> & SearchMetadata>}
     */
    static async find(ids, source = void 0) {
        checkNotRecording(this);

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
        //A wildcard alias may return the same id from multiple indices - do not cap the size in that case
        const isWildcard = (this.alias.includes(`*`) || this.alias.includes(`?`));
        const array = await this.search(body, (isWildcard) ? void 0 : 0, (isWildcard) ? void 0 : ids.length, { source: source });

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
     * Gets an entry by its id
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param ids   {string}                                    Id to be found
     * @returns     {Promise<InstanceType<T>>} The found instance
     */
    /**
     * Gets entries by their ids
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param ids   {Array<string>}                             Ids to be found
     * @returns     {Promise<BulkArray<InstanceType<T>>>} BulkArray of the found instances
     */
    /**
     * Gets entries by given string or array of strings
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param ids   {string | Array<string>}                    Id or Ids to be found
     * @returns     {Promise<InstanceType<T> | BulkArray<InstanceType<T>>>} Union for a caller resolving the ids at runtime
     */
    /**
     * Gets entries by given string or array of strings
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param ids   {string | Array<string>}                    Id or Ids to be found
     * @returns     {Promise<InstanceType<T> | BulkArray<InstanceType<T>>>}
     */
    static async get(ids) {
        checkNotRecording(this);

        this.__checkIfFullySpecified(`get`);

        const myAction = new Action(`get`, this.alias);

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.isEmpty(ids)) {
            myAction.finish();
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
     * Gets the head of the given ID
     * @overload
     * @param ids   {string}                                    Id to be found
     * @returns     {Promise<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>>>} Head of the document
     */
    /**
     * Gets heads of the given IDs
     * @overload
     * @param ids   {Array<string>}                             Ids to be found
     * @returns     {Promise<Array<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>>>>} Heads of the documents
     */
    /**
     * Gets heads for given ID or array of IDs
     * @overload
     * @param ids   {string | Array<string>}                    Id or Ids to be found
     * @returns     {Promise<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>> | Array<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>>>>} Union for a caller resolving the ids at runtime
     */
    /**
     * Gets heads for given ID or array of IDs
     * @param ids   {string | Array<string>}                    Id or Ids to be found
     * @returns     {Promise<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>> | Array<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>>>>}
     */
    static async head(ids) {
        checkNotRecording(this);

        this.__checkIfFullySpecified(`head`);

        const myAction = new Action(`head`, this.alias);

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.isEmpty(ids)) {
            myAction.finish();
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
     * @returns             {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>}           ES response
     */
    static async delete(ids, version = void 0) {
        checkNotRecording(this);

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
            myAction.finish();
            return {
                errors: false,
                items: [],
                took: 0
            };
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
     * Checks if the entry exists
     * @overload
     * @param ids   {string}                                Id to check
     * @returns     {Promise<boolean>}                      Whether the entry exists
     */
    /**
     * Checks if the entries exist
     * @overload
     * @param ids   {Array<string>}                         Ids to check
     * @returns     {Promise<Array<boolean>>}               Whether each of the entries exists, in the order of the ids
     */
    /**
     * Checks if entries exist
     * @overload
     * @param ids   {string | Array<string>}                Id or Ids to check
     * @returns     {Promise<boolean | Array<boolean>>}     Union for a caller resolving the ids at runtime
     */
    /**
     * Checks if entries exist
     * @param ids   {string | Array<string>}                Id or Ids to check
     * @returns     {Promise<boolean | Array<boolean>>}     Boolean or array of booleans indicating result
     */
    static async exists(ids) {
        checkNotRecording(this);

        this.__checkIfFullySpecified(`exists`);

        const myAction = new Action(`exists`, this.alias);

        let single = true;
        if (_.isString(ids)) {
            ids = _.castArray(ids);
        } else if (_.isArray(ids) && _.isEmpty(ids)) {
            myAction.finish();
            return [];
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
     * @param body              {import('@elastic/elasticsearch').estypes.BulkUpdateAction}                    ES body with changes
     * @returns                 {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>}           ES response
     */
    static async update(ids, body) {
        checkNotRecording(this);

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
            myAction.finish();
            return {
                errors: false,
                items: [],
                took: 0
            };
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
     * @param body  {CountBody=}           Body object
     * @returns     {Promise<number>}   ES response
     */
    static async count(body = void 0) {
        checkNotRecording(this);

        const myAction = new Action(`count`, this.alias);

        const result = await myAction.callEs(`count`, this.alias, this._alterSearch(body ?? {}));

        myAction.finish();
        return result.body.count;
    }

    /**
     * Partially updates entries
     * @param body              {UpdateByQueryBody}     ES body with query and changes
     * @param scrollSize        {number=}   Optional scroll size
     * @param waitForCompletion {boolean=}  Wait for completion
     * @returns     {Promise<import('@elastic/elasticsearch').estypes.UpdateByQueryResponse>}   ES response
     */
    static async updateByQuery(body, scrollSize = void 0, waitForCompletion = true) {
        checkNotRecording(this);

        const myAction = new Action(`updateByQuery`, this.alias);
        myAction.logParams({
            scrollSize: scrollSize,
            waitForCompletion: waitForCompletion
        });

        const myScrollSize = (_.isNil(scrollSize)) ? await this._getBulkSize() : scrollSize;
        const result = await myAction.callEs(`updateByQuery`, this.alias, this._alterSearch(body), myScrollSize, waitForCompletion, toBooleanRefresh(this._immediateRefresh));

        myAction.finish();
        return result.body;
    }

    /**
     * Deletes entries by query
     * @param body              {DeleteByQueryBody}    ES body with query
     * @param scrollSize        {number=}   Optional scroll size
     * @param waitForCompletion {boolean=}  Wait for completion
     * @returns     {Promise<import('@elastic/elasticsearch').estypes.DeleteByQueryResponse>}   ES response
     */
    static async deleteByQuery(body, scrollSize = void 0, waitForCompletion = true) {
        checkNotRecording(this);

        const myAction = new Action(`deleteByQuery`, this.alias);
        myAction.logParams({
            scrollSize: scrollSize,
            waitForCompletion: waitForCompletion
        });

        const myScrollSize = (_.isNil(scrollSize)) ? await this._getBulkSize() : scrollSize;
        const result = await myAction.callEs(`deleteByQuery`, this.alias, this._alterSearch(body), myScrollSize, waitForCompletion, toBooleanRefresh(this._immediateRefresh));

        myAction.finish();
        return result.body;
    }

    /**
     * Creates index
     * @param body      {CreateIndexBody=}        Optional settings
     * @param setAlias  {boolean=}      True (default) to automatically set an alias to newly created index
     * @returns     {Promise<string>}   New index name
     */
    static async createIndex(body = void 0, setAlias = true) {
        checkNotRecording(this);

        this.__checkIfFullySpecified(`createIndex`);

        const myAction = new Action(`createIndex`, this.alias);

        const newIndex = this._generateIndex();
        await myAction.callEs(`createIndex`, newIndex, body);
        if (setAlias) {
            await this.aliasIndex(newIndex);
        }

        myAction.finish();
        return newIndex;
    }

    /**
     * Returns ES index of this ODM. Returns undefined when index doesn't exist.
     * @returns {Promise<string | void>} ES index
     */
    static async getIndex() {
        checkNotRecording(this);

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
        checkNotRecording(this);

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
     * Atomically moves the ODM alias to the given index. Alias is specified by this ODM, index has to be specified.
     * @param index {string} Index to be newly aliased
     * @param removeOriginalIndex {boolean=} True to atomically delete the originally aliased index as well
     * @returns {Promise<string | void>} Originally aliased index, if there was any
     */
    static async swapAlias(index, removeOriginalIndex = false) {
        checkNotRecording(this);

        if (_.isEmpty(index) || !_.isString(index)) {
            throw Error(`You have to specify an index.`);
        }

        this.__checkIfFullySpecified(`swapAlias`);

        const indexInfo = this._parseIndex(index);
        if (this.alias !== indexInfo.alias) {
            throw Error(`You are specifying incorrect index. Your index transforms into alias '${indexInfo.alias}', ODM alias is '${this.alias}'.`);
        }

        const myAction = new Action(`swapAlias`, this.alias);
        myAction.logParams({
            index: index, removeOriginalIndex: removeOriginalIndex
        });

        const originalIndex = await this.getIndex();
        if (originalIndex === index) {
            //Already aliased
            myAction.finish();
            return originalIndex;
        }

        const actions = [];
        if (!_.isNil(originalIndex)) {
            const isAlias = await this.aliasExists();
            if (isAlias === true) {
                actions.push((removeOriginalIndex) ? { remove_index: { index: originalIndex } } : { remove: { index: originalIndex, alias: this.alias } });
            } else if (removeOriginalIndex) {
                //A concrete index occupies the alias name
                actions.push({ remove_index: { index: originalIndex } });
            } else {
                throw Error(`Index '${originalIndex}' occupies the alias name, it must be removed to swap the alias.`);
            }
        }
        actions.push({
            add: {
                index: index,
                alias: this.alias,
                is_write_index: true
            }
        });

        await myAction.callEs(`updateAliases`, actions);

        myAction.finish();
        return originalIndex;
    }

    /**
     * Deletes alias, throws if it doesn't exist. Doesn't touch underlying index
     * @returns {Promise<void>}
     */
    static async deleteAlias() {
        checkNotRecording(this);

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
        checkNotRecording(this);

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
        checkNotRecording(this);

        this.__checkIfFullySpecified(`indexExists`);

        const myAction = new Action(`indexExists`, this.alias);

        const result = await myAction.callEs(`existsIndex`, this.alias);

        myAction.finish();
        return result.body;
    }

    /**
     * Deletes index along with alias (if exists)
     * @returns     {Promise<void>}   ES response
     */
    static async deleteIndex() {
        checkNotRecording(this);

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
     * @returns         {Promise<import('@elastic/elasticsearch').estypes.IndicesGetMappingResponse>}   ES response
     */
    static async getMapping() {
        checkNotRecording(this);

        const myAction = new Action(`getMapping`, this.alias);

        const result = await myAction.callEs(`getMapping`, this.alias);

        myAction.finish();
        return result.body;
    }

    /**
     * Puts mapping
     * @param mapping   {PutMappingBody}            ES mapping
     * @returns         {Promise<import('@elastic/elasticsearch').estypes.IndicesPutMappingResponse>}   ES response
     */
    static async putMapping(mapping) {
        checkNotRecording(this);

        this.__checkIfFullySpecified(`putMapping`);

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
     * @returns                 {Promise<import('@elastic/elasticsearch').estypes.IndicesGetSettingsResponse>}   ES response
     */
    static async getSettings(includeDefaults = false) {
        checkNotRecording(this);

        const myAction = new Action(`getSettings`, this.alias);

        const result = await myAction.callEs(`getSettings`, this.alias, includeDefaults);

        myAction.finish();
        return result.body;
    }

    /**
     * Puts settings
     * @param settings  {import('@elastic/elasticsearch').estypes.IndicesIndexSettings}            ES settings
     * @returns         {Promise<import('@elastic/elasticsearch').estypes.IndicesPutSettingsResponse>}   ES response
     */
    static async putSettings(settings) {
        checkNotRecording(this);

        this.__checkIfFullySpecified(`putSettings`);

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
     * @param destinationModel  {typeof BaseModel | string}    Destination ODM / index
     * @param script            {string=}                   Script source
     * @param scrollSize        {number=}                   Optional scroll size
     * @param waitForCompletion {boolean=}                  Wait for completion
     * @returns                 {Promise<import('@elastic/elasticsearch').estypes.ReindexResponse>}           ES response
     */
    static async reindex(destinationModel, script = void 0, scrollSize = void 0, waitForCompletion = true) {
        checkNotRecording(this);

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

        const result = await myAction.callEs(`reindex`, source, dest, myScript, waitForCompletion, toBooleanRefresh(this._immediateRefresh));

        myAction.finish();
        return result.body;
    }

    /**
     * Clones index into a new one. Preserves number of replicas. Input index has to be manually blocked for write (be made read-only).
     * @param settings {import('@elastic/elasticsearch').estypes.IndicesIndexSettings=}    Optional settings to use for the new index
     * @param targetIndex {string=} Optional target index
     * @returns {Promise<string>}   New index
     */
    static async cloneIndex(settings = void 0, targetIndex = void 0) {
        checkNotRecording(this);

        this.__checkIfFullySpecified(`cloneIndex`);

        const myAction = new Action(`cloneIndex`, this.alias);

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

                //Shallow copies - the caller's settings object must remain intact
                settings = { ...settings };
                settings.index = { ...settings.index, [field]: fieldValue };
            }
        }

        let newIndex;
        if (_.isString(targetIndex) && !_.isEmpty(targetIndex)) {
            const parsedIndex = this._parseIndex(targetIndex);
            if (_.isEmpty(parsedIndex.tenant) || _.isEmpty(parsedIndex.name) || parsedIndex.alias.includes(`*`) || parsedIndex.alias.includes(`?`)) {
                throw Error(`Specified target index '${targetIndex}' is not valid!`);
            }
            newIndex = targetIndex;
        } else {
            newIndex = this._generateIndex();
        }
        await myAction.callEs(`clone`, realIndex, newIndex, settings);

        myAction.finish();
        return newIndex;
    }

    /**
     * Refreshed index.
     * @returns {Promise<import('@elastic/elasticsearch').estypes.IndicesRefreshResponse>} ES response
     */
    static async refresh() {
        checkNotRecording(this);

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
        checkNotRecording(this);

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
        checkNotRecording(this);

        if (_.isEmpty(id)) {
            throw Error(`PIT ID must be specified!`);
        }

        const myAction = new Action(`closePIT`, this.alias);
        const myResult = await myAction.closePIT(id);

        myAction.finish();
        return myResult;
    }

    /**
     * Returns the current state of the given task, e.g. of an asynchronously started "reindex" or "updateByQuery"
     * @param taskId {string} Task ID
     * @returns {Promise<import('@elastic/elasticsearch').estypes.TasksGetResponse>} ES response
     */
    static async getTask(taskId) {
        checkNotRecording(this);

        if (_.isNil(taskId) || !_.isString(taskId) || _.isEmpty(taskId)) {
            throw Error(`Task ID must be specified!`);
        }

        const myAction = new Action(`getTask`, this.alias);
        myAction.logParams({
            taskId: taskId
        });

        const result = await myAction.callEs(`getTask`, taskId);

        myAction.finish();
        return result.body;
    }

    /**
     * Repeatedly checks the given task until it completes, e.g. an asynchronously started "reindex" or "updateByQuery"
     * @param taskId {string} Task ID
     * @param pollIntervalSeconds {number=} Interval between the completion checks
     * @param maxWaitSeconds {number=} When specified, the function throws instead of waiting for the task any longer
     * @returns {Promise<import('@elastic/elasticsearch').estypes.TasksGetResponse>} Completed task, its "response" property carries the operation result
     */
    static async waitForTask(taskId, pollIntervalSeconds = 2, maxWaitSeconds = void 0) {
        checkNotRecording(this);

        if (_.isNil(taskId) || !_.isString(taskId) || _.isEmpty(taskId)) {
            throw Error(`Task ID must be specified!`);
        } else if (!_.isNumber(pollIntervalSeconds) || !_.isFinite(pollIntervalSeconds) || pollIntervalSeconds <= 0) {
            throw Error(`Poll interval must be a positive number!`);
        } else if (!_.isNil(maxWaitSeconds) && (!_.isNumber(maxWaitSeconds) || !_.isFinite(maxWaitSeconds) || maxWaitSeconds <= 0)) {
            throw Error(`Maximum wait time must be a positive number!`);
        }

        const myAction = new Action(`waitForTask`, this.alias);
        myAction.logParams({
            taskId: taskId, pollIntervalSeconds: pollIntervalSeconds, maxWaitSeconds: maxWaitSeconds
        });

        const deadline = (_.isNil(maxWaitSeconds)) ? void 0 : Date.now() + (maxWaitSeconds * 1000);

        let result;
        while (true) {
            result = await myAction.callEs(`getTask`, taskId);
            if (result.body.completed === true) {
                break;
            }

            if (!_.isNil(deadline) && ((Date.now() + (pollIntervalSeconds * 1000)) > deadline)) {
                myAction.finish();
                throw Error(`Task '${taskId}' hasn't completed within ${maxWaitSeconds} seconds.`);
            }

            await new Promise((resolve) => {
                setTimeout(resolve, pollIntervalSeconds * 1000);
            });
        }

        myAction.finish();

        if (!_.isNil(result.body.error)) {
            throw new esErrors.ResponseError({
                body: result.body.error,
                statusCode: result.body.error.status ?? 500
            });
        }
        return result.body;
    }

    /**
     * Saves document to database
     * @param useVersion    {boolean=}          If true, sends version to ES
     * @returns             {Promise<this>}
     */
    async save(useVersion = false) {
        checkNotRecording(this.constructor);

        const myAction = new Action(`save`, this.constructor.alias);

        await this.validate();

        if (useVersion) {
            await checkVersion(this);
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
        checkNotRecording(this.constructor);

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
        checkNotRecording(this.constructor);

        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }

        const myAction = new Action(`delete`, this.constructor.alias);

        if (useVersion) {
            await checkVersion(this);
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
     * @template {abstract new (...args: any) => BaseModel} T
     * @this {T}
     * @param changes   {Record<string, any>=}   Changes to apply to cloned object
     * @returns         {T} Copy of this class, keeping the members of a subclass
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
     * @template {abstract new (...args: any) => BaseModel} T
     * @this {T}
     * @param newTenant     {string}
     * @returns             {T} Copy of this class, keeping the members of a subclass
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
     * @template {abstract new (...args: any) => BaseModel} T
     * @this {T}
     * @param newImmediateRefresh   {boolean | string}
     * @returns                     {T} Copy of this class, keeping the members of a subclass
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
        if (_.isNil(this._name) || !_.isString(this._name) || _.isEmpty(this._name) || this._name.includes(`*`) || this._name.includes(`?`)) {
            throw Error(`You cannot use '${functionName}' with current base name '${this._name}', full alias is '${this.alias}'!`);
        } else if (_.isEmpty(this._tenant) || this._tenant.includes(`*`) || this._tenant.includes(`?`)) {
            throw Error(`You cannot use '${functionName}' with current tenant '${this._tenant}', full alias is '${this.alias}'!`);
        }
    }

    /**
     * Returns correct constructor for search function data
     * @param searchResult {import('@elastic/elasticsearch').estypes.SearchHit<Record<string, any>>} Single document found in ES
     * @param constructorCache {Record<string, typeof BaseModel>} Cache object
     * @returns {typeof BaseModel} Constructor to be used
     */
    static __getConstructor(searchResult, constructorCache) {
        const indexInfo = this._parseIndex(searchResult._index);
        let Constructor = constructorCache[indexInfo.alias];
        if (!Constructor) {
            Constructor = this;

            if (Constructor._tenant !== indexInfo.tenant) {
                Constructor = Constructor.in(indexInfo.tenant);
            }
            if (Constructor._name !== indexInfo.name) {
                //Wildcard in the name - rebind to the concrete index name, instances must be fully specified
                Constructor = Constructor.clone({ _name: indexInfo.name });
            }

            constructorCache[indexInfo.alias] = Constructor;
        }
        return Constructor;
    }

    /**
     * Alters search body
     * @param body {SearchBody}
     * @returns {SearchBody}
     */
    static _alterSearch(body) {
        return body;
    }

    /**
     * Returns unpacked version of the data
     * Used when data are saved in another format than they are worked in
     * @param source {Record<string, any>}
     * @returns {Record<string, any>}
     */
    static _unpackData(source) {
        return source;
    }

    /**
     * Return packed version of the data
     * Used when data are saved in another format than they are worked in
     * @param cache {Record<string, any>=} Object that serve as a cache across multiple packs, may not be presented
     * @returns {Promise<Record<string, any>>}
     */
    // eslint-disable-next-line no-unused-vars
    async _packData(cache = void 0) {
        return this;
    }

    /**
     * Function resolved after search / find / find all / get
     * @param instances {Array<BaseModel>} Array of newly created instances
     * @param cache {Record<string, any>=} Optional cache object from search function
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line no-unused-vars
    static async _afterSearch(instances, cache = void 0) {
        //empty by default
    }

    /**
     * Returns best bulk size for the model. This size is used primarily for pagination
     * @returns {Promise<number>}
     */
    static async _getBulkSize() {
        return defaultConfiguration.PAGINATION_SIZE;
    }

    /**
     * Generates new index string, doesn't create any index in ES
     * @returns {string}
     */
    static _generateIndex() {
        this.__checkIfFullySpecified(`_generateIndex`);
        return `${this._tenant}_${this._name}-${uuid().replaceAll(`-`, ``)}`;
    }
}

export default BaseModel;

/**
 * Throws when the given class is a recording clone created by "JointModel.recordSearch", as only "search" itself can be recorded
 * @param Model {typeof BaseModel}
 */
function checkNotRecording(Model) {
    if (!_.isNil(Model.__recordSearch)) {
        throw Error(`Only 'search' can be called on a recording clone!`);
    }
}

/**
 * Converts the "_immediateRefresh" value to a boolean, as the by-query and reindex ES APIs do not accept the "wait_for" string
 * @param immediateRefresh {boolean | string}
 * @returns {boolean}
 */
function toBooleanRefresh(immediateRefresh) {
    return (immediateRefresh !== false && immediateRefresh !== `false`);
}

/**
 * Fetches version and sequence numbers
 * @param model {BaseModel} Model to be used
 * @returns {Promise<void>}
 */
async function checkVersion(model) {
    if (!model._id) {
        const error = Error(`You cannot use parameter 'useVersion' with model without _id specified.`);
        error.statusCode = 400;
        throw error;
    }

    if (_.isNil(model._primary_term) || _.isNil(model._seq_no)) {
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
