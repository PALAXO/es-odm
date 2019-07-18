'use strict';

const path = require(`path`);
const nconf = require(`nconf`);

nconf.env();
nconf.argv();
nconf.file(`conf`, { file: path.join(__dirname, `config.json`) });

module.exports = nconf;
