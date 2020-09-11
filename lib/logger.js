'use strict';

const _ = require(`lodash`);
const bunyan = require(`bunyan`);
const path = require(`path`);

const nconf = require(`./config/config`);

const LOG_LEVEL = Object.freeze({
    TRACE: `trace`,
    DEBUG: `debug`,
    INFO: `info`,
    WARN: `warn`,
    ERROR: `error`,
    FATAL: `fatal`
});

/**
 * Parse configuration
 * @param config {Object} Configuration object
 * @returns {Object}
 */
const parseConfig = (config) => {
    // Do not persist changes
    const cfgCopy = _.cloneDeep(config);

    // Transform our config to bunyan convention
    for (const stream of cfgCopy.streams) {
        if (_.includes([`file`, `rotating-file`], stream.type)) {
            stream.path = path.isAbsolute(stream.path) ? stream.path : path.join(__dirname, `/../`, stream.path);
        } else if (stream.type === `console`) {
            stream.type = `raw`;

            stream.stream = {
                write: (data) => {
                    const uid = uidFunction();
                    if (!_.isEmpty(uid)) {
                        data = Object.assign({ uid }, data);
                    }

                    process.stdout.write(`${JSON.stringify(data)}\n`);
                }
            };
        }
    }

    return cfgCopy;
};

class Logger {
    constructor(config = void 0) {
        this.logger = bunyan.createLogger(parseConfig(config || nconf.get(`logger`)));
    }

    /**
     * Generic log function respecting the presented level
     * @param data      {string|Object} Data for logger
     * @param level     {string}        Message log level
     */
    log (data, level) {
        // Parse message error for bunyan. First, try 'msg' attribute, if empty try 'message'
        const msg = _.get(data, `msg`, _.get(data, `message`, ``));
        // Call nextTick to make logging async, Promises are too much overhead for such thing
        process.nextTick(() => this.logger[level](data, msg));
    }
}

let singleton = new Logger();
let uidFunction = function() {};

module.exports = {
    /**
     * Changes config
     * @param config {Object}
     */
    setLoggerConfig(config) {
        singleton = new Logger(config);
    },
    /**
     * Changes UID function
     * @param newUidFunction {Function}
     */
    setLoggerUidFunction(newUidFunction) {
        uidFunction = newUidFunction;
    },

    /**
     * Trace level logging
     * @param message {string|Object} Data send to logger
     */
    trace(message) {
        singleton.log(message, LOG_LEVEL.TRACE);
    },

    /**
     * Debug level logging
     * @param message {string|Object} Data send to logger
     */
    debug(message) {
        singleton.log(message, LOG_LEVEL.DEBUG);
    },

    /**
     * Info level logging
     * @param message {string|Object} Data send to logger
     */
    info(message) {
        singleton.log(message, LOG_LEVEL.INFO);
    },

    /**
     * Warn level logging
     * @param message {string|Object} Data send to logger
     */
    warn(message) {
        singleton.log(message, LOG_LEVEL.WARN);
    },

    /**
     * Error level logging
     * @param message {string|Object} Data send to logger
     */
    error(message) {
        singleton.log(message, LOG_LEVEL.ERROR);
    },

    /**
     * Fatal level logging
     * @param message {string|Object} Data send to logger
     */
    fatal(message) {
        singleton.log(message, LOG_LEVEL.FATAL);
    },

    /**
     * Calls given function and measures its time
     * @param self {Object}
     * @param funcName {string}
     * @param args {Array<*>} Arguments
     * @returns {Promise<{result: *, time: number}>}
     */
    async measure(self, funcName, ...args) {
        const start = process.hrtime();
        let result = void 0;
        try {
            result = await self[funcName](...args);
        } catch (e) {
            this.warn({
                type: `error`,
                msg: `Measured function thrown an error.`
            });
            throw e;
        }
        const end = process.hrtime(start);
        const time = (end[0] * 1000) + (end[1] / 1000000);
        return { result, time };
    }
};


