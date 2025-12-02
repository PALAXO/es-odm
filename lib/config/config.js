import path from 'path';
import nconf from 'nconf';

nconf.env();
nconf.argv();
nconf.file(`odm_conf`, { file: path.join(import.meta.dirname, `config.json`) });

export default nconf;
