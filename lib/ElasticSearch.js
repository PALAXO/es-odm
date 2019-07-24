'use strict';

const { Client } = require(`@elastic/elasticsearch`);

const nconf = require(`./config/config`);
const ES_URL = nconf.get(`es:url`);
const MAX_RESULTS = nconf.get(`es:maxResults`);

const client = new Client({ node: ES_URL });

async function index(index, type, body, id) {
    return client.index({
        index: index,
        type: type,
        body: body,
        id: id,
        refresh: true
    });
}

async function remove(index, type, id) {
    return client.delete({
        index: index,
        type: type,
        id: id,
        refresh: true
    });
}

async function search(index, type, body, from = 0, size = MAX_RESULTS, scroll = void 0) {
    return client.search({
        index: index,
        type: type,
        body: body,
        from: from,
        size: size,
        scroll: scroll
    });
}

async function get(index, type, id) {
    return client.get({
        index: index,
        type: type,
        id: id
    });
}

exports.client = client;

exports.index = index;
exports.remove = remove;
exports.search = search;
exports.get = get;
