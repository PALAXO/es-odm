'use strict';

const _ = require(`lodash`);
const buffer = require(`buffer`);
const { Client, errors, Transport } = require(`@elastic/elasticsearch`);
const nconf = require(`./config/config`);
const { Parser } = require(`stream-json`);
const StreamAssembler = require(`stream-json/Assembler`);
const { PassThrough } = require(`stream`);

const ES_HOST = nconf.get(`es:url`);
const MAX_STRING_LENGTH = buffer.constants.MAX_STRING_LENGTH;
const REQUEST_TIMEOUT_SECONDS = nconf.get(`es:requestTimeoutSeconds`);
const PING_TIMEOUT_SECONDS = nconf.get(`es:pingTimeoutSeconds`);
const MAX_RETRIES = nconf.get(`es:maxRetries`);
const PIT_TIMEOUT_SECONDS = nconf.get(`es:pitTimeoutSeconds`);

class Elasticsearch {
    constructor() {
        this.client = _createClient(ES_HOST);

        /** @type {number} */
        this.pitTimeoutSeconds = PIT_TIMEOUT_SECONDS;
    }

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

    async search(index, body, from, size, source = void 0, trackTotalHits = true, searchAfter = void 0, pointInTime = void 0, refresh = void 0) {
        const esResult = await this.client.search({
            ...body,
            index: index,
            from: from,
            size: size,
            _source: source,
            seq_no_primary_term: true,
            version: true,
            track_total_hits: trackTotalHits,
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

    async exists(index, id) {
        return this.client.exists({
            index: index,
            id: id
        }, {
            meta: true
        });
    }

    async count(index, body = void 0) {
        return this.client.count({
            ...body,
            index: index
        }, {
            meta: true
        });
    }

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

    async createIndex(index, body = void 0) {
        return this.client.indices.create({
            ...body,
            index: index
        }, {
            meta: true
        });
    }

    async deleteIndex(index) {
        return this.client.indices.delete({
            index: index
        }, {
            meta: true
        });
    }

    async existsIndex(index) {
        return this.client.indices.exists({
            index: index
        }, {
            meta: true
        });
    }

    async getIndicesFromAlias(alias) {
        return this.client.indices.getAlias({
            name: alias
        }, {
            meta: true
        });
    }

    async existsAlias(alias) {
        return this.client.indices.existsAlias({
            name: alias
        }, {
            meta: true
        });
    }

    async putAlias(index, alias) {
        return this.client.indices.putAlias({
            index: index,
            name: alias,
            is_write_index: true
        }, {
            meta: true
        });
    }

    async deleteAlias(index, alias) {
        return this.client.indices.deleteAlias({
            index: index,
            name: alias
        }, {
            meta: true
        });
    }

    async refresh(index) {
        return this.client.indices.refresh({
            index: index
        }, {
            meta: true
        });
    }

    async getMapping(index) {
        const esResult = await this.client.indices.getMapping({
            index: index
        }, {
            meta: true,
            asStream: true
        });

        return parseStream(esResult);
    }

    async putMapping(index, mapping) {
        return this.client.indices.putMapping({
            ...mapping,
            index: index
        }, {
            meta: true
        });
    }

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

    async putSettings(index, settings) {
        return this.client.indices.putSettings({
            index: index,
            settings: settings
        }, {
            meta: true
        });
    }

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

    async clone(source, target, settings = void 0) {
        return this.client.indices.clone({
            index: source,
            target: target,
            settings: settings
        }, {
            meta: true
        });
    }

    async openPIT(index, keepAlive = this.pitTimeoutSeconds) {
        return this.client.openPointInTime({
            index: index,
            keep_alive: `${keepAlive}s`
        }, {
            meta: true
        });
    }

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
    const body = await new Promise((resolve, reject) => {
        try {
            const chunkCache = [];
            let totalLength = 0;
            let isPiped = false;
            const stream = esResult.body;

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
                        for (const myData of chunkCache) {
                            passThrough.push(myData);
                        }
                        passThrough.push(newChunk);
                        stream.pipe(passThrough);
                        isPiped = true;

                        const pipeline = passThrough.pipe(new Parser({ jsonStreaming: false }));
                        const streamAssembler = StreamAssembler.connectTo(pipeline);

                        pipeline.on(`end`, () => {
                            try {
                                return resolve(streamAssembler.current);
                            } catch (e) {
                                return reject(e);
                            }
                        });
                        pipeline.on(`error`, (e) => {
                            return reject(e);
                        });
                    }
                } catch (e) {
                    return reject(e);
                }
            });

            stream.on(`end`, () => {
                try {
                    if (isPiped) {
                        //Response will come from "stream-json"
                        return void 0;
                    } else if (chunkCache.length > 0) {
                        //Concat chunks and parse JSON
                        return resolve(JSON.parse(Buffer.concat(chunkCache, totalLength).toString(`utf-8`)));
                    } else {
                        //No data
                        return resolve(void 0);
                    }
                } catch (e) {
                    return reject(e);
                }
            });

        } catch (e) {
            return reject(e);
        }
    });

    const result = {
        body: body,
        statusCode: esResult.statusCode,
        headers: esResult.headers,
        meta: esResult.meta
    };

    if (esResult.statusCode >= 400) {
        throw new errors.ResponseError(result);
    } else {
        return result;
    }
}

const esClient = new Elasticsearch();

/**
 * Sets new ES client instance
 * @param options {string | Array<string> | *}
 * @param additional {{ pitTimeoutSeconds: number, requestTimeoutSeconds: number, pingTimeoutSeconds: number, maxRetries: number }}
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
 * @param options {string | Array<string> | *}
 * @param additional {{ pitTimeoutSeconds: number, requestTimeoutSeconds: number, pingTimeoutSeconds: number, maxRetries: number }}
 * @returns {Client}
 */
function _createClient(options, additional = void 0) {
    const myOptions = (_.isString(options) || _.isArray(options) || _.isNil(options)) ? { node: options || ES_HOST } : options;

    _assignOption(myOptions, `requestTimeout`, REQUEST_TIMEOUT_SECONDS, additional?.requestTimeoutSeconds, 1000);
    _assignOption(myOptions, `pingTimeout`, PING_TIMEOUT_SECONDS, additional?.pingTimeoutSeconds, 1000);
    _assignOption(myOptions, `maxRetries`, MAX_RETRIES, additional?.maxRetries, 1);

    const parsedNode = parseNode(myOptions.node, myOptions.requestTimeout);
    myOptions.node = parsedNode.node;
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
 * @param preferredValue {number}
 * @param multiplier {number}
 */
function _assignOption(myOptions, optionsName, defaultValue, preferredValue = void 0, multiplier = 1) {
    if (_.isNull(myOptions[optionsName])) {
        //"null" value forces default
        delete myOptions[optionsName];

    } else if (_.isUndefined(myOptions[optionsName])) {
        //Not specified value -> assign it
        let finalValue = defaultValue;
        if (preferredValue && _.isNumber(preferredValue)) {
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
 * @returns {{transport: Transport, url: URL}}
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

module.exports = { esClient, setClient, esErrors: errors };
