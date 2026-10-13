import _ from 'lodash';
import buffer from 'buffer';
import { Client, errors, Transport } from '@elastic/elasticsearch';
import nconf from './config/config.js';
import { parser } from 'stream-json';
import StreamAssembler from 'stream-json/assembler.js';
import { PassThrough } from 'stream';
import zlib from 'zlib';

const ES_HOST = nconf.get(`es:url`);
const MAX_STRING_LENGTH = buffer.constants.MAX_STRING_LENGTH;
const REQUEST_TIMEOUT_SECONDS = nconf.get(`es:requestTimeoutSeconds`);
const PING_TIMEOUT_SECONDS = nconf.get(`es:pingTimeoutSeconds`);
const MAX_RETRIES = nconf.get(`es:maxRetries`);
const PIT_TIMEOUT_SECONDS = nconf.get(`es:pitTimeoutSeconds`);

/**
 * Full ES response envelope, as returned by every wrapper of this module
 * @typedef {Object} EsResponse
 * @property {*} body Response body, already parsed
 * @property {number} statusCode HTTP status code of the response
 * @property {Record<string, any>} headers Response headers
 * @property {Object} meta ES client metadata of the call
 */

class Elasticsearch {
    constructor() {
        this.client = _createClient(ES_HOST);

        /** @type {number} */
        this.pitTimeoutSeconds = PIT_TIMEOUT_SECONDS;
    }

    /**
     * Indexes given document
     * @param index        {string} Index or alias to write into
     * @param document     {Object} Document data
     * @param id           {string=} Document ID
     * @param primary_term {number | string=} "if_primary_term" of the optimistic concurrency control
     * @param seq_no       {number | string=} "if_seq_no" of the optimistic concurrency control
     * @param refresh      {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    async index(index, document, id, primary_term = void 0, seq_no = void 0, refresh = true) {
        return this.client.index({
            index: index,
            id: id,
            document: document,
            if_primary_term: primary_term,
            if_seq_no: seq_no,
            refresh: refresh
        }, {
            meta: true
        });
    }

    /**
     * Updates all the documents matching given query
     * @param index             {string | Array<string>} Index, alias or their list
     * @param body              {Object} ES body with the query and the script
     * @param scrollSize        {number} Scroll size
     * @param waitForCompletion {boolean=} False to return a task ID instead of awaiting the result
     * @param refresh           {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    async updateByQuery(index, body, scrollSize, waitForCompletion = true, refresh = true) {
        return this.client.updateByQuery({
            ...body,
            index: index,
            scroll_size: scrollSize,
            refresh: refresh,
            version: true,
            slices: `auto`,
            wait_for_completion: waitForCompletion
        }, {
            meta: true
        });
    }

    /**
     * Deletes given document
     * @param index        {string} Index or alias to delete from
     * @param id           {string} Document ID
     * @param primary_term {number | string=} "if_primary_term" of the optimistic concurrency control
     * @param seq_no       {number | string=} "if_seq_no" of the optimistic concurrency control
     * @param refresh      {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    async delete(index, id, primary_term = void 0, seq_no = void 0, refresh = true) {
        return this.client.delete({
            index: index,
            id: id,
            if_primary_term: primary_term,
            if_seq_no: seq_no,
            refresh: refresh
        }, {
            meta: true
        });
    }

    /**
     * Deletes all the documents matching given query
     * @param index             {string | Array<string>} Index, alias or their list
     * @param body              {Object} ES body with the query
     * @param scrollSize        {number} Scroll size
     * @param waitForCompletion {boolean=} False to return a task ID instead of awaiting the result
     * @param refresh           {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    async deleteByQuery(index, body, scrollSize, waitForCompletion = true, refresh = true) {
        return this.client.deleteByQuery({
            ...body,
            index: index,
            scroll_size: scrollSize,
            refresh: refresh,
            version: true,
            slices: `auto`,
            wait_for_completion: waitForCompletion
        }, {
            meta: true
        });
    }

    /**
     * Searches for documents
     * @param index          {string | Array<string>} Index, alias or their list; undefined when a PIT is used
     * @param body           {Object} ES body with the query
     * @param from           {number} Start entry
     * @param size           {number} Number of entries
     * @param source         {boolean | Array<string>=} ES "_source" parameter
     * @param trackTotalHits {boolean=} ES "track_total_hits" parameter
     * @param searchAfter    {Array<*>=} Sort values of the last entry of the previous page
     * @param pointInTime    {string=} Point in Time ID
     * @param refresh        {number=} Point in Time keep alive in seconds
     * @returns {Promise<EsResponse>} ES response
     */
    async search(index, body, from, size, source = void 0, trackTotalHits = void 0, searchAfter = void 0, pointInTime = void 0, refresh = void 0) {
        const esResult = await this.client.search({
            ...body,
            index: index,
            from: from,
            size: size,
            _source: source,
            seq_no_primary_term: true,
            version: true,
            track_total_hits: trackTotalHits ?? body?.track_total_hits ?? true,
            search_after: searchAfter,
            pit: (pointInTime) ? {
                id: pointInTime,
                keep_alive: (refresh) ? `${refresh}s` : `${ this.pitTimeoutSeconds}s`
            } : void 0,
            track_scores: true
        }, {
            meta: true,
            asStream: true
        });

        return parseStream(esResult);
    }

    /**
     * Returns documents of given IDs
     * @param index  {string} Index or alias
     * @param ids    {Array<string>} Document IDs
     * @param source {boolean | Array<string>=} ES "_source" parameter
     * @returns {Promise<EsResponse>} ES response
     */
    async mget(index, ids, source = true) {
        const esResult = await this.client.mget({
            index: index,
            ids: ids,
            _source: source
        }, {
            meta: true,
            asStream: true
        });

        return parseStream(esResult);
    }

    /**
     * Checks whether given document exists
     * @param index {string} Index or alias
     * @param id    {string} Document ID
     * @returns {Promise<EsResponse>} ES response
     */
    async exists(index, id) {
        return this.client.exists({
            index: index,
            id: id
        }, {
            meta: true
        });
    }

    /**
     * Counts the documents matching given query
     * @param index {string | Array<string>} Index, alias or their list
     * @param body  {Object=} ES body with the query
     * @returns {Promise<EsResponse>} ES response
     */
    async count(index, body = void 0) {
        return this.client.count({
            ...body,
            index: index
        }, {
            meta: true
        });
    }

    /**
     * Sends given operations through the Bulk API
     * @param operations {Array<Object>} Bulk API operations
     * @param refresh    {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    async bulk(operations, refresh = true) {
        const esResult = await this.client.bulk({
            operations: operations,
            refresh: refresh
        }, {
            meta: true,
            asStream: true
        });

        return parseStream(esResult);
    }

    /**
     * Creates given index
     * @param index {string} Index to be created
     * @param body  {Object=} ES body with the settings and the mappings
     * @returns {Promise<EsResponse>} ES response
     */
    async createIndex(index, body = void 0) {
        return this.client.indices.create({
            ...body,
            index: index
        }, {
            meta: true
        });
    }

    /**
     * Deletes given index
     * @param index {string} Index to be deleted
     * @returns {Promise<EsResponse>} ES response
     */
    async deleteIndex(index) {
        return this.client.indices.delete({
            index: index
        }, {
            meta: true
        });
    }

    /**
     * Checks whether given index exists
     * @param index {string} Index to be checked
     * @returns {Promise<EsResponse>} ES response
     */
    async existsIndex(index) {
        return this.client.indices.exists({
            index: index
        }, {
            meta: true
        });
    }

    /**
     * Returns the indices given alias points to
     * @param alias {string} Alias to be resolved
     * @returns {Promise<EsResponse>} ES response
     */
    async getIndicesFromAlias(alias) {
        return this.client.indices.getAlias({
            name: alias
        }, {
            meta: true
        });
    }

    /**
     * Checks whether given alias exists
     * @param alias {string} Alias to be checked
     * @returns {Promise<EsResponse>} ES response
     */
    async existsAlias(alias) {
        return this.client.indices.existsAlias({
            name: alias
        }, {
            meta: true
        });
    }

    /**
     * Puts given write alias to given index
     * @param index {string} Index to be aliased
     * @param alias {string} Alias to be created
     * @returns {Promise<EsResponse>} ES response
     */
    async putAlias(index, alias) {
        return this.client.indices.putAlias({
            index: index,
            name: alias,
            is_write_index: true
        }, {
            meta: true
        });
    }

    /**
     * Deletes given alias
     * @param index {string} Aliased index
     * @param alias {string} Alias to be deleted
     * @returns {Promise<EsResponse>} ES response
     */
    async deleteAlias(index, alias) {
        return this.client.indices.deleteAlias({
            index: index,
            name: alias
        }, {
            meta: true
        });
    }

    /**
     * Refreshes given indices
     * @param index {string | Array<string>} Index, alias or their list
     * @returns {Promise<EsResponse>} ES response
     */
    async refresh(index) {
        return this.client.indices.refresh({
            index: index
        }, {
            meta: true
        });
    }

    /**
     * Returns the mappings of given indices
     * @param index {string | Array<string>} Index, alias or their list
     * @returns {Promise<EsResponse>} ES response
     */
    async getMapping(index) {
        const esResult = await this.client.indices.getMapping({
            index: index
        }, {
            meta: true,
            asStream: true
        });

        return parseStream(esResult);
    }

    /**
     * Puts given mapping to given indices
     * @param index   {string | Array<string>} Index, alias or their list
     * @param mapping {Object} ES mapping
     * @returns {Promise<EsResponse>} ES response
     */
    async putMapping(index, mapping) {
        return this.client.indices.putMapping({
            ...mapping,
            index: index
        }, {
            meta: true
        });
    }

    /**
     * Returns the settings of given indices
     * @param index           {string | Array<string>} Index, alias or their list
     * @param includeDefaults {boolean=} True to include the ES defaults
     * @returns {Promise<EsResponse>} ES response
     */
    async getSettings(index, includeDefaults = false) {
        const esResult = await this.client.indices.getSettings({
            index: index,
            include_defaults: includeDefaults
        }, {
            meta: true,
            asStream: true
        });

        return parseStream(esResult);
    }

    /**
     * Puts given settings to given indices
     * @param index    {string | Array<string>} Index, alias or their list
     * @param settings {Object} ES settings
     * @returns {Promise<EsResponse>} ES response
     */
    async putSettings(index, settings) {
        return this.client.indices.putSettings({
            index: index,
            settings: settings
        }, {
            meta: true
        });
    }

    /**
     * Reindexes documents from one index into another
     * @param source            {Object} ES reindex source
     * @param dest              {Object} ES reindex destination
     * @param script            {Object=} ES script altering the reindexed documents
     * @param waitForCompletion {boolean=} False to return a task ID instead of awaiting the result
     * @param refresh           {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    async reindex(source, dest, script = void 0, waitForCompletion = true, refresh = true) {
        return this.client.reindex({
            source: source,
            dest: dest,
            script: script,
            refresh: refresh,
            slices: `auto`,
            wait_for_completion: waitForCompletion
        }, {
            meta: true
        });
    }

    /**
     * Clones given index into a new one
     * @param source   {string} Index to be cloned
     * @param target   {string} New index
     * @param settings {Object=} ES settings of the new index
     * @returns {Promise<EsResponse>} ES response
     */
    async clone(source, target, settings = void 0) {
        return this.client.indices.clone({
            index: source,
            target: target,
            settings: settings
        }, {
            meta: true
        });
    }

    /**
     * Performs given alias actions atomically
     * @param actions {Array<Object>} ES alias actions performed atomically
     * @returns {Promise<EsResponse>} ES response
     */
    async updateAliases(actions) {
        return this.client.indices.updateAliases({
            actions: actions
        }, {
            meta: true
        });
    }

    /**
     * Returns the current state of given task
     * @param taskId {string} Task ID
     * @returns {Promise<EsResponse>} ES response
     */
    async getTask(taskId) {
        return this.client.tasks.get({
            task_id: taskId
        }, {
            meta: true
        });
    }

    /**
     * Calls an arbitrary ES client API given by its dot-separated path, e.g. "indices.stats" or "snapshot.create"
     * @param functionPath {string} Dot-separated path of the client API
     * @param params {Object=} API parameters
     * @param additional {{asStream?: boolean}=} "asStream" streams the response and parses it, bypassing the maximum string length
     * @returns {Promise<EsResponse>} ES response
     */
    async call(functionPath, params = void 0, additional = void 0) {
        const lastDotIndex = functionPath.lastIndexOf(`.`);
        const context = (lastDotIndex === -1) ? this.client : _.get(this.client, functionPath.substring(0, lastDotIndex));
        const functionName = (lastDotIndex === -1) ? functionPath : functionPath.substring(lastDotIndex + 1);
        if (_.isNil(context) || !_.isFunction(context[functionName])) {
            throw Error(`Unknown ES API '${functionPath}'.`);
        }

        if (additional?.asStream) {
            const esResult = await context[functionName](params, {
                meta: true,
                asStream: true
            });
            return parseStream(esResult);
        } else {
            return context[functionName](params, {
                meta: true
            });
        }
    }

    /**
     * Opens Point in Time
     * @param index     {string | Array<string>} Index, alias or their list
     * @param keepAlive {number=} Point in Time keep alive in seconds
     * @returns {Promise<EsResponse>} ES response
     */
    async openPIT(index, keepAlive = this.pitTimeoutSeconds) {
        return this.client.openPointInTime({
            index: index,
            keep_alive: `${keepAlive}s`
        }, {
            meta: true
        });
    }

    /**
     * Closes Point in Time
     * @param id {string} Point in Time ID
     * @returns {Promise<EsResponse>} ES response
     */
    async closePIT(id) {
        return this.client.closePointInTime({
            id: id
        }, {
            meta: true
        });
    }
}

/**
 * Parses ES stream
 * @param esResult {{}} ES response
 * @returns {Promise<{}>} Response object
 */
async function parseStream(esResult) {
    //Streamed responses are chunked and carry no "content-length" header - the transferred size has to be measured
    let contentLength = 0;

    const body = await new Promise((resolve, reject) => {
        //A failure leaves the response body unconsumed - destroy it, otherwise its socket never returns to the pool
        let decompressor = void 0;
        const fail = (e) => {
            esResult.body?.destroy?.();
            decompressor?.destroy?.();
            return reject(e);
        };

        try {
            const chunkCache = [];
            let totalLength = 0;
            let isPiped = false;
            let stream = esResult.body;

            stream.on(`error`, fail);

            //Measured on the raw stream, before the decompression below - these are the really transferred bytes
            stream.on(`data`, (newChunk) => {
                contentLength += newChunk?.byteLength ?? 0;
            });

            //Decompress compressed responses - "asStream" bypasses the client's own content decoding
            const contentEncoding = (esResult.headers?.[`content-encoding`] ?? ``).toLowerCase().trim();
            if (contentEncoding !== `` && contentEncoding !== `identity`) {
                if (contentEncoding.includes(`gzip`)) {
                    decompressor = zlib.createGunzip();
                } else if (contentEncoding.includes(`deflate`)) {
                    decompressor = zlib.createInflate();
                } else if (contentEncoding.includes(`br`)) {
                    decompressor = zlib.createBrotliDecompress();
                } else {
                    //Handing the compressed bytes to the JSON parser would fail somewhere far from the real cause
                    return fail(Error(`Unknown response content encoding '${contentEncoding}'.`));
                }

                decompressor.on(`error`, fail);
                stream.pipe(decompressor);
                stream = decompressor;
            }

            stream.on(`data`, (newChunk) => {
                try {
                    if (isPiped) {
                        return;
                    }

                    if ((totalLength + newChunk.length) < MAX_STRING_LENGTH) {
                        //Cache chunks as long as possible
                        chunkCache.push(newChunk);
                        totalLength += newChunk.length;

                    } else {
                        //Caching is no longer possible, as we could exceed max string length -> pass data to "stream-json" to parse them
                        const passThrough = new PassThrough();
                        passThrough.on(`error`, fail);
                        for (const myData of chunkCache) {
                            passThrough.push(myData);
                        }
                        passThrough.push(newChunk);
                        stream.pipe(passThrough);
                        isPiped = true;

                        const pipeline = passThrough.pipe(parser.asStream({ jsonStreaming: false }));
                        const streamAssembler = StreamAssembler.connectTo(pipeline);

                        pipeline.on(`end`, () => {
                            return resolve(streamAssembler.current);
                        });
                        pipeline.on(`error`, (e) => {
                            return fail(e);
                        });
                    }
                } catch (e) {
                    return fail(e);
                }
            });

            stream.on(`end`, () => {
                try {
                    if (isPiped) {
                        //Response will come from "stream-json"
                        return void 0;
                    } else if (chunkCache.length > 0) {
                        //Concat chunks and parse JSON
                        const rawBody = Buffer.concat(chunkCache, totalLength).toString(`utf-8`);
                        try {
                            return resolve(JSON.parse(rawBody));
                        } catch (e) {
                            if (esResult.statusCode >= 400) {
                                //An error response needn't be JSON at all (an error page of a proxy in front of ES) -
                                //keep it raw, the status code must survive into the thrown "ResponseError" below
                                return resolve(rawBody);
                            }
                            throw e;
                        }
                    } else {
                        //No data
                        return resolve(void 0);
                    }
                } catch (e) {
                    return fail(e);
                }
            });

        } catch (e) {
            return fail(e);
        }
    });

    const result = {
        body: body,
        statusCode: esResult.statusCode,
        headers: esResult.headers,
        meta: esResult.meta
    };

    //Internal only - the response envelope returned to the consumers must stay unchanged
    Object.defineProperty(result, `__contentLength`, {
        value: contentLength,
        enumerable: false
    });

    if (esResult.statusCode >= 400) {
        throw new errors.ResponseError(result);
    } else {
        return result;
    }
}

const esClient = new Elasticsearch();

/**
 * Sets new ES client instance
 * @param options {string | Array<string> | Record<string, any>}
 * @param additional {{ pitTimeoutSeconds?: number, requestTimeoutSeconds?: number, pingTimeoutSeconds?: number, maxRetries?: number }}
 */
function setClient(options, additional = void 0) {
    esClient.client = _createClient(options, additional);

    if (additional?.pitTimeoutSeconds && _.isNumber(additional.pitTimeoutSeconds)) {
        esClient.pitTimeoutSeconds = additional.pitTimeoutSeconds;
    } else {
        esClient.pitTimeoutSeconds = PIT_TIMEOUT_SECONDS;
    }
}

/**
 * Creates ES client instance
 * @param options {string | Array<string> | Record<string, any>}
 * @param additional {{ pitTimeoutSeconds?: number, requestTimeoutSeconds?: number, pingTimeoutSeconds?: number, maxRetries?: number }}
 * @returns {Client}
 */
function _createClient(options, additional = void 0) {
    //Shallow copy - the caller's options must remain intact
    const myOptions = (_.isString(options) || _.isArray(options) || _.isNil(options)) ? { node: options || ES_HOST } : { ...options };

    _assignOption(myOptions, `requestTimeout`, REQUEST_TIMEOUT_SECONDS, additional?.requestTimeoutSeconds, 1000);
    _assignOption(myOptions, `pingTimeout`, PING_TIMEOUT_SECONDS, additional?.pingTimeoutSeconds, 1000);
    _assignOption(myOptions, `maxRetries`, MAX_RETRIES, additional?.maxRetries, 1);

    if (_.isNil(myOptions.node) && _.isNil(myOptions.nodes) && !_.isNil(myOptions.cloud)) {
        //Cloud configuration - there is no node URL to parse
        return new Client(myOptions);
    }

    const nodeKey = (_.isNil(myOptions.node) && !_.isNil(myOptions.nodes)) ? `nodes` : `node`;
    const parsedNode = parseNode(myOptions[nodeKey], myOptions.requestTimeout);
    myOptions[nodeKey] = parsedNode.node;
    if (parsedNode.transport) {
        myOptions.Transport = parsedNode.transport;
    }

    return new Client(myOptions);
}

/**
 * Assigns additional value to the options
 * @param myOptions {Object}
 * @param optionsName {string}
 * @param defaultValue {number}
 * @param preferredValue {number=}
 * @param multiplier {number=}
 */
function _assignOption(myOptions, optionsName, defaultValue, preferredValue = void 0, multiplier = 1) {
    if (_.isNull(myOptions[optionsName])) {
        //"null" value forces default
        delete myOptions[optionsName];

    } else if (_.isUndefined(myOptions[optionsName])) {
        //Not specified value -> assign it
        let finalValue = defaultValue;
        if (_.isFinite(preferredValue)) {
            finalValue = preferredValue;
        }
        myOptions[optionsName] = finalValue * multiplier;

    } else {
        //Value already specified -> do not overwrite
    }
}

/**
 * ES client doesn't pass timeout values correctly
 * https://github.com/elastic/elasticsearch-js/issues/1791
 * @param node {string | {}}
 * @param timeout {number}
 * @returns {*}
 */
function parseNode(node, timeout = void 0) {
    if (_.isString(node)) {
        const data = _parseUrl(node);
        return {
            node: {
                url: data.url,
                timeout: timeout
            },
            transport: data.transport
        };

    } else if (_.isObject(node) && !_.isArray(node)) {
        //Shallow copy - the caller's node object must remain intact
        node = { ...node };
        if (_.isUndefined(node.timeout)) {
            node.timeout = timeout;
        }

        const result = {
            node: node,
            transport: void 0
        };

        if (node.url) {
            const data = _parseUrl(node.url);

            result.node.url = data.url;
            result.transport = data.transport;
        }

        return result;

    } else if (_.isArray(node)) {
        if (node.length === 1) {
            //Single node array supports the custom-path Transport workaround just like a scalar node
            return parseNode(node[0], timeout);
        }

        const configs = node.map((singleNode) => parseNode(singleNode, timeout));
        if (configs.some((item) => !!item.transport)) {
            throw Error(`Unable to parse multiple URLs when custom path is specified.`);
        } else {
            return {
                node: configs.map((item) => item.node),
                transport: void 0
            };
        }

    } else {
        throw Error(`Unknown ES client node specified.`);
    }
}

/**
 * Parse ES URL, return custom Transport class
 * https://github.com/elastic/elasticsearch-js/issues/1709
 * @param url {string | URL}
 * @returns {{transport: typeof Transport, url: URL}}
 */
function _parseUrl(url) {
    const myUrl = new URL(url);

    const baseUrl = new URL(myUrl.origin);
    baseUrl.username = myUrl.username;
    baseUrl.password = myUrl.password;

    let MyTransport = void 0;
    const hasPath = (myUrl.pathname.replaceAll(`/`, ``).length > 0);
    if (hasPath) {
        let myPath = myUrl.pathname.replace(/\/+/g, `/`);
        if (myPath.endsWith(`/`)) {
            myPath = myPath.substring(0, myPath.length - 1);
        }

        MyTransport = class extends Transport {
            async request(params, options) {
                params.path = myPath + params.path;
                return super.request(params, options);
            }
        };
    }

    return {
        url: baseUrl,
        transport: MyTransport
    };
}

export { esClient, setClient, errors as esErrors };
