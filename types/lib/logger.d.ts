declare const _default: {
    /**
     * Changes config
     * @param config {Record<string, any>=} Bunyan logger configuration, the default one from the ODM configuration when omitted
     */
    setLoggerConfig(config?: Record<string, any> | undefined): void;
    /**
     * Changes UID function
     * @param newUidFunction {Function}
     */
    setLoggerUidFunction(newUidFunction: Function): void;
    /**
     * Trace level logging
     * @param message {string|Object} Data send to logger
     */
    trace(message: string | any): void;
    /**
     * Debug level logging
     * @param message {string|Object} Data send to logger
     */
    debug(message: string | any): void;
    /**
     * Info level logging
     * @param message {string|Object} Data send to logger
     */
    info(message: string | any): void;
    /**
     * Warn level logging
     * @param message {string|Object} Data send to logger
     */
    warn(message: string | any): void;
    /**
     * Error level logging
     * @param message {string|Object} Data send to logger
     */
    error(message: string | any): void;
    /**
     * Fatal level logging
     * @param message {string|Object} Data send to logger
     */
    fatal(message: string | any): void;
};
export default _default;
