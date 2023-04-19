'use strict';

const buffer = require(`buffer`);
const { Client, errors } = require(`@elastic/elasticsearch`);
const { Parser } = require(`stream-json`);
const StreamAssembler = require(`stream-json/Assembler`);
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

    async updateByQuery(index, body, scrollSize = MAX_RESULTS, waitForCompletion = true, refresh = true) {
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

    async deleteByQuery(index, body, scrollSize = MAX_RESULTS, waitForCompletion = true, refresh = true) {
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

    async search(index, body, from = 0, size = MAX_RESULTS, scroll = false, source = void 0, scrollTimeout = void 0) {
        const esResult = await this.client.search({
            ...body,
            index: index,
            from: from,
            size: size,
            scroll: (scroll) ? ((scrollTimeout) ? `${scrollTimeout}s` : SCROLL_TIMEOUT) : void 0,
            _source: source,
            track_total_hits: true,
            seq_no_primary_term: true,
            version: true
        }, {
            meta: true,
            asStream: true
        });

        return _parseStream(esResult);
    }

    async scroll(scrollId, timeout = SCROLL_TIMEOUT) {
        const esResult = await this.client.scroll({
            scroll: timeout,
            scroll_id: scrollId
        }, {
            meta: true,
            asStream: true
        });

        return _parseStream(esResult);
    }

    async clearScroll(scrollId) {
        return this.client.clearScroll({
            scroll_id: scrollId
        }, {
            meta: true
        });
    }

    async getHead(index, ids) {
        return this.client.get({
            index: index,
            _source: false,
            id: ids
        }, {
            meta: true
        });
    }

    async mget(index, ids) {
        return this.client.mget({
            index: index,
            ids: ids
        }, {
            meta: true
        });
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

        return _parseStream(esResult);
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

    async stats(index) {
        return this.client.indices.stats({
            index: index
        }, {
            meta: true
        });
    }

    async getMapping(index) {
        return this.client.indices.getMapping({
            index: index
        }, {
            meta: true
        });
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
        return this.client.indices.getSettings({
            index: index,
            include_defaults: includeDefaults
        }, {
            meta: true
        });
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
}

/**
 * Parses ES stream
 * @param esResult {{}} ES response
 * @returns {Promise<{}>} Response object
 */
async function _parseStream(esResult) {
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

const esClient = new ElasticSearch();
function setClient(node) {
    esClient.client = new Client({
        node: node || ES_HOST,
        requestTimeout: REQUEST_TIMEOUT
    });
}

module.exports = { esClient, setClient, esErrors: errors };
