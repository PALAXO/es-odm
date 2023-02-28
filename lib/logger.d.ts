
/**
 * Changes config
 * @param config {Object}
 */
function setLoggerConfig(config: {} = void 0): void;

/**
 * Changes UID function
 * @param newUidFunction {Function}
 */
function setLoggerUidFunction(newUidFunction: () => string): void;

/**
 * Trace level logging
 * @param message - Data send to logger
 */
function trace(message: string | any): void;

/**
 * Debug level logging
 * @param message - Data send to logger
 */
function debug(message: string | any): void;

/**
 * Info level logging
 * @param message - Data send to logger
 */
function info(message: string | any): void;

/**
 * Warn level logging
 * @param message - Data send to logger
 */
function warn(message: string | any): void;

/**
 * Error level logging
 * @param message - Data send to logger
 */
function error(message: string | any): void;

/**
 * Fatal level logging
 * @param message - Data send to logger
 */
function fatal(message: string | any): void;

export {
    setLoggerConfig, setLoggerUidFunction,
    trace, debug, info, warn, error, fatal
};
