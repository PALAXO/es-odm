'use strict';

const chai = require(`chai`);
const chaiAsPromised = require(`chai-as-promised`);
const path = require(`path`);
const { Client } = require(`@elastic/elasticsearch`);

const nconf = require(`../lib/config/config`);
const ES_URL = nconf.get(`es:url`);


/*
 * Chai bootstrap
 */
chai.use(chaiAsPromised);
chai.should();

/*
 * Configuration bootstrap
 */
nconf.env();
nconf.argv();
nconf.file(`odm_test`, path.join(__dirname, `test_config.json`));

/*
 * Globals
 */
global.chai = chai;
global.expect = chai.expect;
global.testTimeout = nconf.get(`test:settings:timeout`);

/*
 * ES client
 */
const client = new Client({ node: ES_URL });

/*
 * Module exports
 */
module.exports = {
    //modules
    client,

    createIndex,
    deleteIndex,

    deleteData,

    //configuration
    nconf
};

/**
 * Unmocks all
 */
async function deleteData() {
    //Clean ES
    try {
        await client.deleteByQuery({
            index: `*`,
            body: {
                query: {
                    match_all: {}
                }
            },
            refresh: true
        });
    } catch (e) {
        //not found exception
        //it's OK
    }

    //Refresh indices
    try {
        await client.indices.refresh({
            index: `*`
        });
    } catch (e) {
        //not found exception
        //it's OK
    }
}

async function createIndex(alias, uuid) {
    const indexParts = alias.split(`_`);
    indexParts[1] += `-${uuid}`;
    const index = indexParts.join(`_`);

    await client.indices.create({
        index: index
    });
    await client.indices.putAlias({
        index: index,
        name: alias,
        body: {
            is_write_index: true
        }
    });
}

async function deleteIndex(alias, uuid) {
    const indexParts = alias.split(`_`);
    indexParts[1] += `-${uuid}`;
    const index = indexParts.join(`_`);

    try {
        await client.indices.delete({
            index: index
        });
    } catch (e) {
        //OK
    }
    try {
        await client.indices.deleteAlias({
            index: index,
            name: alias,
        });
    } catch (e) {
        //OK
    }
}

/**
 * Global beforeAll
 * Prepare ES mappings
 */
before(async function() {
    this.timeout(testTimeout);

    await client.indices.delete({
        index: `*`
    });

    await client.indices.create({
        index: `test_users-abc123`,
        body: {
            settings: {
                index: {
                    refresh_interval: -1
                }
            },
            mappings: {
                dynamic: `strict`,
                properties: {
                    status: {
                        type: `keyword`
                    },
                    name: {
                        type: `keyword`
                    },
                    fullname: {
                        type: `keyword`
                    }
                }
            }
        }
    });
    await client.indices.create({
        index: `test_documents-abc123_folder`,
        body: {
            settings: {
                index: {
                    refresh_interval: -1
                }
            },
            mappings: {
                dynamic: `strict`,
                properties: {
                    documentTitle: {
                        type: `keyword`
                    },
                    html: {
                        type: `keyword`
                    }
                }
            }
        }
    });
    await client.indices.create({
        index: `test_documents-abc123_d_default`,
        body: {
            settings: {
                index: {
                    refresh_interval: -1
                }
            },
            mappings: {
                dynamic: `strict`,
                properties: {
                    documentTitle: {
                        type: `keyword`
                    },
                    html: {
                        type: `keyword`
                    }
                }
            }
        }
    });

    await client.indices.putAlias({
        index: `test_users-abc123`,
        name: `test_users`,
        body: {
            is_write_index: true
        }
    });
    await client.indices.putAlias({
        index: `test_documents-abc123_folder`,
        name: `test_documents_folder`,
        body: {
            is_write_index: true
        }
    });
    await client.indices.putAlias({
        index: `test_documents-abc123_d_default`,
        name: `test_documents_d_default`,
        body: {
            is_write_index: true
        }
    });
});

/**
 * Resources global beforeEach
 */
beforeEach(async function () {
    //Unmock all
    await Promise.all([
        deleteData()
    ]);
});

/**
 * Resources global after
 */
after(async function () {
    //Unmock all
    await Promise.all([
        deleteData()
    ]);
});
