'use strict';

const chai = require(`chai`);
const chaiAsPromised = require(`chai-as-promised`);
const path = require(`path`);
const nconf = require(`nconf`);

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
nconf.file(`test`, path.join(__dirname, `test_config.json`));

/*
 * Globals
 */
global.chai = chai;
global.expect = chai.expect;
global.testTimeout = nconf.get(`test:settings:timeout`);

/*
 * Module exports
 */
exports = module.exports = {
    //configuration
    nconf
};
