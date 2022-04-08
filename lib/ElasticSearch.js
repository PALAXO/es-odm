'use strict';

const { Client, errors } = require(`@elastic/elasticsearch`);

const nconf = require(`./config/config`);
const defaultConfiguration = {
    node: nconf.get(`es:url`),
    SCROLL_TIMEOUT: nconf.get(`es:scrollTimeout`),
    MAX_RESULTS: nconf.get(`es:maxResults`)
};

class ElasticSearch {
    constructor(node = void 0) {
        this.client = new Client({ node: node || defaultConfiguration.node });
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

    async updateByQuery(index, body, refresh = true) {
        return this.client.updateByQuery({
            index: index,
            body: body,
            refresh: refresh
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

    async deleteByQuery(index, body, refresh = true) {
        return this.client.deleteByQuery({
            index: index,
            body: body,
            refresh: refresh
        });
    }

    async search(index, body, from = 0, size = defaultConfiguration.MAX_RESULTS, scroll = false, source = void 0, scrollTimeout = void 0) {
        return this.client.search({
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
        return this.client.scroll({
            scroll: timeout,
            body: {
                scroll_id: scrollId
            }
        });
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
        return this.client.bulk({
            body: body,
            refresh: refresh
        });
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

    async indexExists(index) {
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

    async reindex(body, refresh = true) {
        return this.client.reindex({
            body: body,
            refresh: refresh
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

const esClient = new ElasticSearch();
function setClient(node) {
    esClient.client = new Client({ node: node || defaultConfiguration.node });
}

module.exports = { esClient, setClient, esErrors: errors };
