import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import path from 'path';
import { Client } from '@elastic/elasticsearch';

import nconf from '../lib/config/config.js';
const ES_URL = nconf.get(`es:url`);

//Every index the suite works with lives here - the suite must never touch anything else in the cluster
const TEST_NAMESPACE = `odmtest*`;


/*
 * Chai bootstrap
 */
chai.use(chaiAsPromised);

/*
 * Configuration bootstrap
 */
nconf.env();
nconf.argv();
nconf.file(`odm_test`, path.join(import.meta.dirname, `test_config.json`));

/*
 * Globals
 */
global.expect = chai.expect;
global.testTimeout = nconf.get(`test:settings:timeout`);

/*
 * ES client
 */
const client = new Client({ node: ES_URL });

/*
 * Module exports
 */
// eslint-disable-next-line mocha/no-exports
export default {
    //modules
    client,

    createIndex,
    deleteIndex,
    resetFixtureIndices,

    deleteData,
    captureStdout,

    //configuration
    nconf,
    TEST_NAMESPACE
};

/**
 * Runs given function with a captured "process.stdout.write", returns the parsed logger records
 * @param myFunction {function} Function to run
 * @returns {Promise<Array<Object>>} Logger records written to stdout
 */
async function captureStdout(myFunction) {
    const records = [];
    const originalWrite = process.stdout.write;

    process.stdout.write = (chunk) => {
        records.push(chunk);
        return true;
    };

    try {
        await myFunction();
    } finally {
        process.stdout.write = originalWrite;
    }

    return records.map((record) => {
        try {
            return JSON.parse(record);
        } catch (e) {
            //A stray non JSON write would otherwise surface as a confusing SyntaxError far from its cause
            throw Error(`Captured stdout write is not a logger record: '${record}'.`, { cause: e });
        }
    });
}

/**
 * Unmocks all
 */
async function deleteData() {
    //Refresh indices first - "deleteByQuery" sees only refreshed documents, and an unrefreshed write left behind by a failed
    //test would otherwise survive the cleanup or make it fail on a version conflict
    try {
        await client.indices.refresh({
            index: TEST_NAMESPACE
        });
    } catch (e) {
        rethrowUnlessMissing(e);
    }

    //Clean ES
    try {
        await client.deleteByQuery({
            index: TEST_NAMESPACE,
            query: {
                match_all: {}
            },
            refresh: true
        });
    } catch (e) {
        rethrowUnlessMissing(e);
    }
}

/**
 * Swallows a "not found" error of the cleanup, rethrows anything else - a silently failed cleanup
 * would let every following test run against stale data
 * @param e {Error} Error thrown by the cleanup
 */
function rethrowUnlessMissing(e) {
    if (e?.meta?.statusCode !== 404) {
        throw e;
    }
}

async function createIndex(alias, uuid) {
    const index = `${alias}-${uuid}`;

    await client.indices.create({
        index: index
    });
    await client.indices.putAlias({
        index: index,
        name: alias,
        is_write_index: true
    });
}

async function deleteIndex(alias, uuid) {
    const index = `${alias}-${uuid}`;

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

    //Only the suite namespace - the rest of the cluster may hold data of other projects
    await resetFixtureIndices();
});

/**
 * Drops the whole test namespace and recreates the fixture indices of the bootstrap
 * @returns {Promise<void>}
 */
async function resetFixtureIndices() {
    await client.indices.delete({
        index: TEST_NAMESPACE,
        ignore_unavailable: true
    });

    await client.indices.create({
        index: `odmtest_users-abc123`,
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
    });
    await client.indices.create({
        index: `odmtest_documents-abc123`,
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
                },
                text: {
                    type: `text`
                }
            }
        }
    });

    await client.indices.putAlias({
        index: `odmtest_users-abc123`,
        name: `odmtest_users`,
        is_write_index: true
    });
    await client.indices.putAlias({
        index: `odmtest_documents-abc123`,
        name: `odmtest_documents`,
        is_write_index: true
    });
}

/**
 * Resources global beforeEach
 */
beforeEach(async function () {
    this.timeout(testTimeout);

    //Unmock all
    await Promise.all([
        deleteData()
    ]);
});

/**
 * Resources global after
 */
after(async function () {
    this.timeout(testTimeout);

    //Unmock all
    await Promise.all([
        deleteData()
    ]);
});
