export type OdmConfiguration = {
    /**
     * Returns the value of the given configuration key
     */
    get: (key: string) => any;
    /**
     * Sets the value of the given configuration key
     */
    set: (key: string, value: any) => void;
};
/**
 * Configuration of the library - only the two members the library itself uses are exposed,
 * so that the generated declaration does not depend on the untyped "nconf" package
 * @typedef {Object} OdmConfiguration
 * @property {(key: string) => any} get Returns the value of the given configuration key
 * @property {(key: string, value: any) => void} set Sets the value of the given configuration key
 */
/** @type {OdmConfiguration} */
declare const configuration: OdmConfiguration;
export default configuration;
