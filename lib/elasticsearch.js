'use strict';

const _ = require(`lodash`);
const buffer = require(`buffer`);
const { Client, errors } = require(`@elastic/elasticsearch`);
const nconf = require(`./config/config`);
const oboe = require(`oboe`);
const { PassThrough } = require(`stream`);

const ES_HOST = nconf.get(`es:url`);
const MAX_STRING_LENGTH = buffer.constants.MAX_STRING_LENGTH;
const REQUEST_TIMEOUT_SECONDS = nconf.get(`es:requestTimeoutSeconds`);

class Elasticsearch {
    constructor(node = void 0) {
        this.client = new Client({
            node: node || ES_HOST,
            requestTimeout: REQUEST_TIMEOUT_SECONDS * 1000
        });
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

    async search(index, body, from, size, source = void 0, trackTotalHits = true, scroll = false, searchAfter = void 0, pointInTime = void 0, refresh = void 0) {
        const esResult = await this.client.search({
            ...body,
            index: index,
            from: from,
            size: size,
            _source: source,
            seq_no_primary_term: true,
            version: true,
            track_total_hits: trackTotalHits,
            scroll: (scroll) ? ((refresh) ? `${refresh}s` : `${this.SCROLL_TIMEOUT_SECONDS}s`) : void 0,
            search_after: searchAfter,
            pit: (pointInTime) ? {
                id: pointInTime,
                keep_alive: (refresh) ? `${refresh}s` : `${ this.PIT_TIMEOUT_SECONDS}s`
            } : void 0
        }, {
            meta: true,
            asStream: true
        });

        return parseStream(esResult);
    }

    async scroll(scrollId, refresh = this.SCROLL_TIMEOUT_SECONDS) {
        const esResult = await this.client.scroll({
            scroll_id: scrollId,
            scroll: `${refresh}s`
        }, {
            meta: true,
            asStream: true
        });

        return parseStream(esResult);
    }

    async clearScroll(scrollId) {
        return this.client.clearScroll({
            scroll_id: scrollId
        }, {
            meta: true
        });
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
    const body = await new Promise((resolve) => {
        const chunkCache = [];
        let totalLength = 0;
        let isPiped = false;
        const stream = esResult.body;

        stream.on(`data`, (newChunk) => {
            if (isPiped) {
                return;
            }

            if ((totalLength + newChunk.length) < MAX_STRING_LENGTH) {
                //Cache chunks as long as possible
                chunkCache.push(newChunk);
                totalLength += newChunk.length;

            } else {
                //Caching is no longer possible, as we could exceed max string length -> pass data to "oboe" to parse them
                const passThrough = new PassThrough();
                for (const myData of chunkCache) {
                    passThrough.push(myData);
                }
                passThrough.push(newChunk);
                stream.pipe(passThrough);
                isPiped = true;

                oboe(passThrough).done((res) => {
                    resolve(res);
                });
            }
        });

        stream.on(`end`, () => {
            if (isPiped) {
                //Response will come from oboe
                return void 0;
            } else if (chunkCache.length > 0) {
                //Concat chunks and parse JSON
                resolve(JSON.parse(Buffer.concat(chunkCache, totalLength).toString(`utf-8`)));
            } else {
                //No data
                resolve(void 0);
            }
        });
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
esClient.SCROLL_TIMEOUT_SECONDS = nconf.get(`es:scrollTimeoutSeconds`);
esClient.PIT_TIMEOUT_SECONDS = nconf.get(`es:pitTimeoutSeconds`);

/**
 * Sets new ES client instance
 * @param node {string | Array<string> | *}
 * @param additional {{ scrollTimeoutSeconds: number, pitTimeoutSeconds: number, requestTimeoutSeconds: number }}
 */
function setClient(node, additional = void 0) {
    let requestTimeoutSeconds = REQUEST_TIMEOUT_SECONDS;
    if (additional?.requestTimeoutSeconds && _.isNumber(additional.requestTimeoutSeconds)) {
        requestTimeoutSeconds = additional.requestTimeoutSeconds;
    }

    esClient.client = new Client({
        node: node || ES_HOST,
        requestTimeout: requestTimeoutSeconds * 1000
    });

    if (additional?.scrollTimeoutSeconds && _.isNumber(additional.scrollTimeoutSeconds)) {
        esClient.SCROLL_TIMEOUT_SECONDS = additional.scrollTimeoutSeconds;
    }
    if (additional?.pitTimeoutSeconds && _.isNumber(additional.pitTimeoutSeconds)) {
        esClient.PIT_TIMEOUT_SECONDS = additional.pitTimeoutSeconds;
    }
}

module.exports = { esClient, setClient, esErrors: errors };