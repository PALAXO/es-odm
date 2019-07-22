'use strict';

const { Client } = require(`@elastic/elasticsearch`);

const nconf = require(`./config/config`);
const ES_URL = nconf.get(`es:url`);
const MAX_RESULTS = nconf.get(`es:maxResults`);

const elasticSearch = new Client({ node: ES_URL });

//TODO

async function search(index, type, body, from = 0, size = MAX_RESULTS, scroll = void 0) {
    return elasticSearch.search({
        index: index,
        type: type,
        body: body,
        from: from,
        size: size,
        scroll: scroll
    });
}

async function get(index, type, id) {
    return elasticSearch.get({
        index: index,
        type: type,
        id: id
    });
}

exports.elasticSearch = elasticSearch;
exports.search = search;
exports.get = get;
