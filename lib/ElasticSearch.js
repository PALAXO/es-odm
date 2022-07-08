'use strict';

const buffer = require(`buffer`);
const { Client, errors } = require(`@elastic/elasticsearch`);
const oboe = require(`oboe`);
const { PassThrough } = require(`stream`);

const nconf = require(`./config/config`);
const ES_HOST = nconf.get(`es:url`);
const REQUEST_TIMEOUT = nconf.get(`es:requestTimeout`);
const SCROLL_TIMEOUT = nconf.get(`es:scrollTimeout`);
const MAX_RESULTS = nconf.get(`es:maxResults`);

const MAX_STRING_LENGTH = buffer.constants.MAX_STRING_LENGTH;

class ElasticSearch {
    constructor(node = void 0) {
        this.client = new Client({
            node: node || ES_HOST,
            requestTimeout: REQUEST_TIMEOUT
        });
    }

    async index(index, body, id, primary_term, seq_no, refresh = true) {
        return this.client.index({
            index: index,
            body: body,
            id: id,
            if_primary_term: primary_term,
            if_seq_no: seq_no,
            refresh: refresh
        });
    }

    async updateByQuery(index, body, scrollSize = MAX_RESULTS, waitForCompletion = true, refresh = true) {
        return this.client.updateByQuery({
            index: index,
            body: body,
            scroll_size: scrollSize,
            refresh: refresh,
            version: true,
            slices: `auto`,
            wait_for_completion: waitForCompletion
        });
    }

    async delete(index, id, primary_term, seq_no, refresh = true) {
        return this.client.delete({
            index: index,
            id: id,
            if_primary_term: primary_term,
            if_seq_no: seq_no,
            refresh: refresh
        });
    }

    async deleteByQuery(index, body, scrollSize = MAX_RESULTS, waitForCompletion = true, refresh = true) {
        return this.client.deleteByQuery({
            index: index,
            body: body,
            scroll_size: scrollSize,
            refresh: refresh,
            version: true,
            slices: `auto`,
            wait_for_completion: waitForCompletion
        });
    }

    async search(index, body, from = 0, size = MAX_RESULTS, scroll = false, source = void 0, scrollTimeout = void 0) {
        const esResult = await this.client.search({
            index: index,
            body: body,
            from: from,
            size: size,
            scroll: (scroll) ? ((scrollTimeout) ? `${scrollTimeout}s` : SCROLL_TIMEOUT) : void 0,
            _source: source,
            track_total_hits: true,
            seq_no_primary_term: true,
            version: true
        }, {
            asStream: true
        });

        return _parseStream(esResult);
    }

    async scroll(scrollId, timeout = SCROLL_TIMEOUT) {
        const esResult = await this.client.scroll({
            scroll: timeout,
            body: {
                scroll_id: scrollId
            }
        }, {
            asStream: true
        });

        return _parseStream(esResult);
    }

    async clearScroll(scrollId) {
        return this.client.clearScroll({
            body: {
                scroll_id: scrollId
            }
        });
    }

    async getHead(index, ids) {
        return this.client.get({
            index: index,
            _source: false,
            id: ids
        });
    }

    async mget(index, ids) {
        return this.client.mget({
            index: index,
            body: {
                ids: ids
            }
        });
    }

    async exists(index, id) {
        return this.client.exists({
            index: index,
            id: id
        });
    }

    async count(index, body = void 0) {
        return this.client.count({
            index: index,
            body: body
        });
    }

    async bulk(body, refresh = true) {
        const esResult = await this.client.bulk({
            body: body,
            refresh: refresh
        }, {
            asStream: true
        });

        return _parseStream(esResult);
    }

    async createIndex(index, body = void 0) {
        return this.client.indices.create({
            index: index,
            body: body
        });
    }

    async deleteIndex(index) {
        return this.client.indices.delete({
            index: index
        });
    }

    async existsIndex(index) {
        return this.client.indices.exists({
            index: index
        });
    }

    async getIndicesFromAlias(alias) {
        return this.client.indices.getAlias({
            name: alias
        });
    }

    async existsAlias(alias) {
        return this.client.indices.existsAlias({
            name: alias
        });
    }

    async putAlias(index, alias) {
        return this.client.indices.putAlias({
            index: index,
            name: alias,
            body: {
                is_write_index: true
            }
        });
    }

    async deleteAlias(index, alias) {
        return this.client.indices.deleteAlias({
            index: index,
            name: alias
        });
    }

    async refresh(index) {
        return this.client.indices.refresh({
            index: index
        });
    }

    async stats(index) {
        return this.client.indices.stats({
            index: index
        });
    }

    async getMapping(index) {
        return this.client.indices.getMapping({
            index: index
        });
    }

    async putMapping(index, mapping) {
        return this.client.indices.putMapping({
            index: index,
            body: mapping
        });
    }

    async getSettings(index, includeDefaults = false) {
        return this.client.indices.getSettings({
            index: index,
            include_defaults: includeDefaults
        });
    }

    async putSettings(index, settings) {
        return this.client.indices.putSettings({
            index: index,
            body: settings
        });
    }

    async reindex(body, waitForCompletion = true, refresh = true) {
        return this.client.reindex({
            body: body,
            refresh: refresh,
            slices: `auto`,
            wait_for_completion: waitForCompletion
        });
    }

    async clone(source, target, settings = void 0) {
        return this.client.indices.clone({
            index: source,
            target: target,
            body: {
                settings: settings
            }
        });
    }
}

/**
 * Parses ES stream
 * @param esResult {{}} ES response
 * @returns {Promise<{}>} Response object
 */
async function _parseStream(esResult) {
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

const esClient = new ElasticSearch();
function setClient(node) {
    esClient.client = new Client({ node: node || ES_HOST });
}

module.exports = { esClient, setClient, esErrors: errors };
