import path from 'path';
import nconf from 'nconf';

//Own instance on purpose - the default nconf export is a process-wide singleton, which any consumer resolving
//the same nconf copy shares with the library: its stores would shadow ours and ours would shadow its keys
const provider = new nconf.Provider();

provider.env();
provider.argv();
provider.file(`odm_conf`, { file: path.join(import.meta.dirname, `config.json`) });

/**
 * Configuration of the library - only the two members the library itself uses are exposed,
 * so that the generated declaration does not depend on the untyped "nconf" package
 * @typedef {Object} OdmConfiguration
 * @property {(key: string) => any} get Returns the value of the given configuration key
 * @property {(key: string, value: any) => void} set Sets the value of the given configuration key
 */

/** @type {OdmConfiguration} */
const configuration = provider;

export default configuration;
