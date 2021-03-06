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

    async index(index, body, id, primary_term, seq_no) {
        return this.client.index({
            index: index,
            body: body,
            id: id,
            if_primary_term: primary_term,
            if_seq_no: seq_no,
            refresh: true
        });
    }

    async updateByQuery(index, body) {
        return this.client.updateByQuery({
            index: index,
            body: body,
            refresh: true
        });
    }

    async delete(index, id, primary_term, seq_no) {
        return this.client.delete({
            index: index,
            id: id,
            if_primary_term: primary_term,
            if_seq_no: seq_no,
            refresh: true
        });
    }

    async deleteByQuery(index, body) {
        return this.client.deleteByQuery({
            index: index,
            body: body,
            refresh: true
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

    async count(index) {
        return this.client.count({
            index: index
        });
    }

    async bulk(body) {
        return this.client.bulk({
            body: body,
            refresh: true
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

    async reindex(body) {
        return this.client.reindex({
            body: body,
            refresh: true
        });
    }
}

const esClient = new ElasticSearch();
function setClient(node) {
    esClient.client = new Client({ node: node || defaultConfiguration.node });
}

module.exports = { esClient, setClient, esErrors: errors };
