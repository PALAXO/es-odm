'use strict';

const { Client } = require(`@elastic/elasticsearch`);

const nconf = require(`./config/config`);
const defaultConfiguration = {
    node: nconf.get(`es:url`),
    MAX_RESULTS: nconf.get(`es:maxResults`),
    SCROLL_TIMEOUT: nconf.get(`es:scrollTimeout`)
};

class ElasticSearch {
    constructor(node = void 0) {
        this.client = new Client({ node: node || defaultConfiguration.node });
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

    async updateByQuery(index, type, body) {
        return this.client.updateByQuery({
            index: index,
            type: type,
            body: body,
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

    async search(index, type, body, from = 0, size = defaultConfiguration.MAX_RESULTS, scroll = false) {
        return this.client.search({
            index: index,
            type: type,
            body: body,
            from: from,
            size: size,
            scroll: scroll ? defaultConfiguration.SCROLL_TIMEOUT : void 0,
            version: true
        });
    }

    async scroll(scrollId, timeout = defaultConfiguration.SCROLL_TIMEOUT) {
        return this.client.scroll({
            scrollId: scrollId,
            scroll: timeout,
            //performance
            sort: [`_doc`]
        });
    }

    async get(index, type, id) {
        return this.client.get({
            index: index,
            type: type,
            id: id
        });
    }

    async exists(index, type, id) {
        return this.client.exists({
            index: index,
            type: type,
            id: id
        });
    }

    async bulk(body) {
        return this.client.bulk({
            refresh: true,
            body: body
        });
    }
}

let singleton = new ElasticSearch();
function es() {
    return singleton;
}
function changeClient(node) {
    singleton = new ElasticSearch(node);
}

module.exports = { es, changeClient };
