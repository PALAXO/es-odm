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
exports = module.exports = {
    //modules
    client,

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
}

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
