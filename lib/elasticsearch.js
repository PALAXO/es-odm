'use strict';

const _ = require(`lodash`);
const buffer = require(`buffer`);
const { Client, errors } = require(`@elastic/elasticsearch`);
const nconf = require(`./config/config`);
const { Parser } = require(`stream-json`);
const StreamAssembler = require(`stream-json/Assembler`);
const { PassThrough } = require(`stream`);

const ES_HOST = nconf.get(`es:url`);
const MAX_STRING_LENGTH = buffer.constants.MAX_STRING_LENGTH;
const REQUEST_TIMEOUT_SECONDS = nconf.get(`es:requestTimeoutSeconds`);
const PING_TIMEOUT_SECONDS = nconf.get(`es:pingTimeoutSeconds`);
const MAX_RETRIES = nconf.get(`es:maxRetries`);

class Elasticsearch {
    constructor(node = void 0) {
        this.client = new Client({
            node: parseNode(node || ES_HOST, REQUEST_TIMEOUT_SECONDS * 1000),
            requestTimeout: REQUEST_TIMEOUT_SECONDS * 1000,
            pingTimeout: PING_TIMEOUT_SECONDS * 1000,
            maxRetries: MAX_RETRIES
        });

        /** @type {number} */
        this.PIT_TIMEOUT_SECONDS = nconf.get(`es:pitTimeoutSeconds`);
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
                keep_alive: (refresh) ? `${refresh}s` : `${ this.PIT_TIMEOUT_SECONDS}s`
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

    async openPIT(index, keepAlive = this.PIT_TIMEOUT_SECONDS) {
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
 * @param node {string | Array<string> | *}
 * @param additional {{ pitTimeoutSeconds: number, requestTimeoutSeconds: number, pingTimeoutSeconds: number, maxRetries: number }}
 */
function setClient(node, additional = void 0) {
    let requestTimeoutSeconds = REQUEST_TIMEOUT_SECONDS;
    if (additional?.requestTimeoutSeconds && _.isNumber(additional.requestTimeoutSeconds)) {
        requestTimeoutSeconds = additional.requestTimeoutSeconds;
    }
    let pingTimeoutSeconds = PING_TIMEOUT_SECONDS;
    if (additional?.pingTimeoutSeconds && _.isNumber(additional.pingTimeoutSeconds)) {
        pingTimeoutSeconds = additional.pingTimeoutSeconds;
    }
    let maxRetries = MAX_RETRIES;
    if (additional?.maxRetries && _.isNumber(additional.maxRetries)) {
        maxRetries = additional.maxRetries;
    }

    esClient.client = new Client({
        node: parseNode(node || ES_HOST, requestTimeoutSeconds * 1000),
        requestTimeout: requestTimeoutSeconds * 1000,
        pingTimeout: pingTimeoutSeconds * 1000,
        maxRetries: maxRetries
    });

    if (additional?.pitTimeoutSeconds && _.isNumber(additional.pitTimeoutSeconds)) {
        esClient.PIT_TIMEOUT_SECONDS = additional.pitTimeoutSeconds;
    }
}

/**
 * ES client doesn't pass timeout values correctly
 * https://github.com/elastic/elasticsearch-js/issues/1791
 * @param node {string | {}}
 * @param timeout {number}
 * @returns {*}
 */
function parseNode(node, timeout) {
    if (_.isString(node)) {
        return {
            url: new URL(node),
            timeout: timeout
        };
    } else if (_.isObject(node) && !_.isArray(node)) {
        node.timeout = timeout;
        return node;
    } else if (_.isArray(node)) {
        return node.map((singleNode) => parseNode(singleNode, timeout));
    } else {
        throw Error(`Unknown ES client node specified.`);
    }
}

module.exports = { esClient, setClient, esErrors: errors };
