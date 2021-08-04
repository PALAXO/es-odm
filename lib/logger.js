'use strict';

const _ = require(`lodash`);
const bunyan = require(`bunyan`);
const path = require(`path`);
const { v4: uuid } = require(`uuid`);

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
        if ([`file`, `rotating-file`].includes(stream.type)) {
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
        const msg = data?.msg ?? data?.message ?? ``;
        this.logger[level](data, msg);
    }
}

let singleton = new Logger();
let uidFunction = function() {};

module.exports = {
    /**
     * Changes config
     * @param config {Object}
     */
    setLoggerConfig(config = void 0) {
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
     * Creates new MyLog instance
     * @param es {ElasticSearch}
     * @param action {string}
     * @param index {string}
     * @returns {MyLog}
     */
    createLogger(es, action, index) {
        return new MyLog(this, es, action, index);
    }
};


class MyLog {
    /**
     * @param logger {Logger}
     * @param es {ElasticSearch}
     * @param action {string}
     * @param index {string}
     */
    constructor(logger, es, action, index = void 0) {
        this._logger = logger;
        this._es = es;
        this._uuid = uuid();

        this.index = index;
        this.action = action;
        this.time = process.hrtime();

        this.parameters = void 0;
        this.summary = {
            esCalls: 0,
            contentLength: 0,
            calculatedTook: 0
        };

        this._logger.debug({
            action: this.action,
            index: this.index,
            type: `apiFunctionCalled`,
            msg: `es-odm function called.`,
            logId: this._uuid
        });
    }

    /**
     * Logs API request
     * @param parameters {Object} API parameters
     * @param msg {string} Log message
     */
    logApiRequest(parameters = {}, msg = void 0) {
        this.parameters = parameters;

        this._logger.info({
            action: this.action,
            index: this.index,
            type: `apiRequest`,
            parameters: this.parameters,
            msg: msg,
            logId: this._uuid
        });
    }

    /**
     * Calls ES API
     * @param functionName {string} ES API function name
     * @param args {*} ES API function arguments
     * @returns {Promise<*>} ES API function response
     */
    async callEsApi(functionName, ...args) {
        this._logger.trace({
            action: this.action,
            index: this.index,
            type: `esRequest`,
            esFunction: functionName,
            msg: `Calling ES API.`,
            logId: this._uuid
        });

        const start = process.hrtime();
        let result = void 0;
        try {
            result = await this._es[functionName](...args);
        } catch (e) {
            this._logger.error({
                action: this.action,
                index: this.index,
                type: `esError`,
                esFunction: functionName,
                msg: `Calling ES API thrown an error '${e.toString()}'.`,
                logId: this._uuid
            });
            throw e;
        }
        const end = process.hrtime(start);
        const calculatedTook = (end[0] * 1000) + (end[1] / 1000000);

        const contentLength = parseInt(result?.headers?.[`content-length`] ?? `0`, 10);
        const took = result?.body.took ?? 0;

        this.summary.esCalls++;
        this.summary.contentLength += contentLength;
        this.summary.calculatedTook += calculatedTook;

        this._logger.debug({
            action: this.action,
            index: this.index,
            type: `esResponse`,
            esFunction: functionName,

            callNumber: this.summary.esCalls,
            contentLength: contentLength,
            took: took,
            calculatedTook: calculatedTook,

            msg: `ES API responded.`,
            logId: this._uuid
        });

        return result;
    }

    /**
     * Logs API response
     * @param msg {string} Log message
     * @param additionalData {Object} Log additional data
     */
    logApiResponse(msg = void 0, additionalData = {}) {
        const timeInFunction = process.hrtime(this.time);
        const totalTime = (timeInFunction[0] * 1000) + (timeInFunction[1] / 1000000);

        this._logger.info({
            action: this.action,
            index: this.index,
            type: `apiResponse`,
            parameters: this.parameters,
            summary: this.summary,
            totalTime: totalTime,
            ...additionalData,
            msg: msg,
            logId: this._uuid
        });
    }

    /**
     * Logs debug note
     * @param msg {string} Note message
     */
    note(msg) {
        this._logger.debug({
            action: this.action,
            index: this.index,
            type: `note`,
            msg: msg,
            logId: this._uuid
        });
    }
}


