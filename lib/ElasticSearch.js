'use strict';

const { Client } = require(`@elastic/elasticsearch`);

const nconf = require(`./config/config`);
const ES_URL = nconf.get(`es:url`);
const MAX_RESULTS = nconf.get(`es:maxResults`);

class ElasticSearch {
    constructor() {
        this.client = new Client({ node: ES_URL });
    }

    async index(index, type, body, id) {
        return this.client.index({
            index: index,
            type: type,
            body: body,
            id: id,
            refresh: true
        });
    }

    async delete(index, type, id) {
        return this.client.delete({
            index: index,
            type: type,
            id: id,
            refresh: true
        });
    }

    async search(index, type, body, from = 0, size = MAX_RESULTS, scroll = void 0) {
        return this.client.search({
            index: index,
            type: type,
            body: body,
            from: from,
            size: size,
            scroll: scroll
        });
    }

    async get(index, type, id) {
        return this.client.get({
            index: index,
            type: type,
            id: id
        });
    }
}

module.exports = new ElasticSearch();
