'use strict';

const _ = require(`lodash`);
const { Client, errors } = require(`@elastic/elasticsearch`);

const nconf = require(`./config/config`);
const defaultConfiguration = {
    node: nconf.get(`es:url`),
    SCROLL_TIMEOUT: nconf.get(`es:scrollTimeout`),
    MAX_RESULTS: nconf.get(`es:maxResults`),
    MAX_RETRIES: nconf.get(`es:maxRetries`)
};

class ElasticSearch {
    constructor(node = void 0) {
        this.client = new Client({ node: node || defaultConfiguration.node });
    }

    async index(index, body, id, primary_term, seq_no, refresh = true) {
        return this._callEs(`index`, {
            index: index,
            body: body,
            id: id,
            if_primary_term: primary_term,
            if_seq_no: seq_no,
            refresh: refresh
        });
    }

    async updateByQuery(index, body, refresh = true) {
        return this._callEs(`updateByQuery`, {
            index: index,
            body: body,
            refresh: refresh
        });
    }

    async delete(index, id, primary_term, seq_no, refresh = true) {
        return this._callEs(`delete`, {
            index: index,
            id: id,
            if_primary_term: primary_term,
            if_seq_no: seq_no,
            refresh: refresh
        });
    }

    async deleteByQuery(index, body, refresh = true) {
        return this._callEs(`deleteByQuery`, {
            index: index,
            body: body,
            refresh: refresh
        });
    }

    async search(index, body, from = 0, size = defaultConfiguration.MAX_RESULTS, scroll = false, source = void 0, scrollTimeout = void 0) {
        return this._callEs(`search`, {
            index: index,
            body: body,
            from: from,
            size: size,
            scroll: (scroll) ? ((scrollTimeout) ? `${scrollTimeout}s` : defaultConfiguration.SCROLL_TIMEOUT) : void 0,
            _source: source,
            track_total_hits: true,
            seq_no_primary_term: true,
            version: true
        });
    }

    async scroll(scrollId, timeout = defaultConfiguration.SCROLL_TIMEOUT) {
        return this._callEs(`scroll`, {
            scroll: timeout,
            body: {
                scroll_id: scrollId
            }
        });
    }

    async clearScroll(scrollId) {
        return this._callEs(`clearScroll`, {
            body: {
                scroll_id: scrollId
            }
        });
    }

    async getHead(index, ids) {
        return this._callEs(`get`, {
            index: index,
            _source: false,
            id: ids
        });
    }

    async mget(index, ids) {
        return this._callEs(`mget`, {
            index: index,
            body: {
                ids: ids
            }
        });
    }

    async exists(index, id) {
        return this._callEs(`exists`, {
            index: index,
            id: id
        });
    }

    async count(index, body = void 0) {
        return this._callEs(`count`, {
            index: index,
            body: body
        });
    }

    async bulk(body, refresh = true) {
        return this._callEs(`bulk`, {
            body: body,
            refresh: refresh
        });
    }

    async createIndex(index, body = void 0) {
        return this._callEs(`indices.create`, {
            index: index,
            body: body
        });
    }

    async deleteIndex(index) {
        return this._callEs(`indices.delete`, {
            index: index
        });
    }

    async existsIndex(index) {
        return this._callEs(`indices.exists`, {
            index: index
        });
    }

    async getIndicesFromAlias(alias) {
        return this._callEs(`indices.getAlias`, {
            name: alias
        });
    }

    async existsAlias(alias) {
        return this._callEs(`indices.existsAlias`, {
            name: alias
        });
    }

    async putAlias(index, alias) {
        return this._callEs(`indices.putAlias`, {
            index: index,
            name: alias,
            body: {
                is_write_index: true
            }
        });
    }

    async deleteAlias(index, alias) {
        return this._callEs(`indices.deleteAlias`, {
            index: index,
            name: alias
        });
    }

    async refresh(index) {
        return this._callEs(`indices.refresh`, {
            index: index
        });
    }

    async stats(index) {
        return this._callEs(`indices.stats`, {
            index: index
        });
    }

    async getMapping(index) {
        return this._callEs(`indices.getMapping`, {
            index: index
        });
    }

    async putMapping(index, mapping) {
        return this._callEs(`indices.putMapping`, {
            index: index,
            body: mapping
        });
    }

    async getSettings(index, includeDefaults = false) {
        return this._callEs(`indices.getSettings`, {
            index: index,
            include_defaults: includeDefaults
        });
    }

    async putSettings(index, settings) {
        return this._callEs(`indices.putSettings`, {
            index: index,
            body: settings
        });
    }

    async reindex(body, refresh = true) {
        return this._callEs(`reindex`, {
            body: body,
            refresh: refresh
        });
    }

    async clone(source, target, settings = void 0) {
        return this._callEs(`indices.clone`, {
            index: source,
            target: target,
            body: {
                settings: settings
            }
        });
    }

    async _callEs(query, body, options = void 0, counter = 0) {
        try {
            const func = _.get(this.client, query).bind(this.client);
            return await func(body, options);

        } catch (e) {
            if (e.statusCode === 429 && counter < defaultConfiguration.MAX_RETRIES) {
                counter++;
                await this._sleep(100, 1000);
                return this._callEs(query, body, options, counter);
            } else {
                throw e;
            }
        }
    }

    _sleep(min, max = min) {
        const random = (Math.random() * (max - min)) + min;
        return new Promise((resolve) => {
            setTimeout(resolve, random);
        });
    }
}

const esClient = new ElasticSearch();
function setClient(node) {
    esClient.client = new Client({ node: node || defaultConfiguration.node });
}

module.exports = { esClient, setClient, esErrors: errors };
