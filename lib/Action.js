'use strict';

const _ = require(`lodash`);
const { esClient } = require(`./elasticsearch`);
const logger = require(`./logger`);
const nconf = require(`./config/config`);
const { v4: uuid } = require(`uuid`);

const RETRIES = nconf.get(`es:retries`);

class MyAction {
    /**
     * @param action {string}
     * @param alias {string}
     */
    constructor(action, alias = void 0) {
        this._uuid = uuid();

        this.alias = alias;
        this.action = action;
        this.time = process.hrtime();

        this.parameters = void 0;
        this.summary = {
            esCalls: 0,
            contentLength: 0,
            calculatedTook: 0
        };

        logger.debug({
            action: this.action,
            alias: this.alias,
            type: `apiRequest`,
            msg: `ES-ODM function called.`,
            logId: this._uuid
        });
    }

    /**
     * Logs debug note
     * @param msg {string} Note message
     */
    note(msg) {
        logger.debug({
            action: this.action,
            alias: this.alias,
            type: `note`,
            msg: msg,
            logId: this._uuid
        });
    }

    /**
     * Logs parameters
     * @param parameters {Object} API parameters
     */
    logParams(parameters = {}) {
        this.parameters = parameters;

        logger.debug({
            action: this.action,
            alias: this.alias,
            type: `apiParams`,
            parameters: this.parameters,
            msg: `These parameters will be used.`,
            logId: this._uuid
        });
    }

    /**
     * Logs API response
     * @param additionalData {Object} Log additional data
     */
    finish(additionalData = {}) {
        const timeInFunction = process.hrtime(this.time);
        const totalTime = (timeInFunction[0] * 1000) + (timeInFunction[1] / 1000000);

        logger.info({
            action: this.action,
            alias: this.alias,
            type: `apiResponse`,
            parameters: this.parameters,
            summary: this.summary,
            totalTime: totalTime,
            ...additionalData,
            msg: `ES-ODM function finished.`,
            logId: this._uuid
        });
    }

    /**
     * Calls ES API
     * @param functionName {string} ES API function name
     * @param args {*} ES API function arguments
     * @returns {Promise<*>} ES API function response
     */
    async callEs(functionName, ...args) {
        let retryCounter = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            let isTooManyRequests = false;

            logger.trace({
                action: this.action,
                alias: this.alias,
                type: `esRequest`,
                esFunction: functionName,
                msg: `Calling ES API.`,
                logId: this._uuid
            });

            const start = process.hrtime();
            let result = void 0;
            try {
                result = await esClient[functionName](...args);
            } catch (e) {
                if (e.statusCode === 429 && retryCounter < RETRIES.maxRetries) {
                    isTooManyRequests = true;
                    logger.warn({
                        action: this.action,
                        alias: this.alias,
                        type: `429`,
                        esFunction: functionName,
                        msg: `ES returns error 429 - Too many requests, will try again.`,
                        logId: this._uuid
                    });

                } else {
                    logger.warn({
                        action: this.action,
                        alias: this.alias,
                        type: `esError`,
                        esFunction: functionName,
                        msg: `Calling ES API thrown an error '${e.toString()}'.`,
                        logId: this._uuid
                    });
                    throw e;
                }
            }
            const end = process.hrtime(start);
            const calculatedTook = (end[0] * 1000) + (end[1] / 1000000);

            const contentLength = parseInt(result?.headers?.[`content-length`] ?? `0`, 10);
            const took = result?.body?.took ?? 0;

            this.summary.esCalls++;
            this.summary.contentLength += contentLength;
            this.summary.calculatedTook += calculatedTook;

            if (isTooManyRequests) {
                retryCounter++;
                const sleepTime = 100 * Math.pow(RETRIES.base, retryCounter);
                await this._sleep(sleepTime);

            } else {
                logger.debug({
                    action: this.action,
                    alias: this.alias,
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
        }
    }

    /**
     * Closes Point in Time
     * @param id {string}
     * @returns {Promise<boolean>}
     */
    async closePIT(id) {
        try {
            const result = await this.callEs(`closePIT`, id);
            return result.body.succeeded;

        } catch (e) {
            return false;
        }
    }

    /**
     * Sends ES bulk request, handles "Request Entity Too Large" and "Invalid string length"
     * It is necessary for the bulk elements to be of the same type, eg. you cannot mix save and delete requests
     * @param bulkSave {Array<{}>}
     * @param refresh {boolean}
     * @param numberOfProcessed {number}
     * @param bulkSize {number}
     * @param responseCache
     * @returns {Promise<{}>}
     */
    async sendBulk(bulkSave, refresh = true, numberOfProcessed = 0, bulkSize = bulkSave.length, responseCache = void 0) {
        try {
            while (numberOfProcessed < bulkSave.length) {
                const toProcess = (bulkSize >= bulkSave.length) ? bulkSave : bulkSave.slice(numberOfProcessed, numberOfProcessed + bulkSize);

                const response = await this.callEs(`bulk`, toProcess, refresh);
                if (toProcess.length === bulkSave.length) {
                    return response;
                }

                if (_.isEmpty(responseCache)) {
                    responseCache = {
                        took: response.body.took,
                        errors: response.body.errors,
                        items: response.body.items
                    };
                } else {
                    responseCache.took += response.body.took;
                    if (!responseCache.errors && response.body.errors) {
                        responseCache.errors = true;
                    }
                    responseCache.items.push(...response.body.items);
                }

                numberOfProcessed += bulkSize;
                if (numberOfProcessed >= bulkSave.length) {
                    return {
                        body: responseCache
                    };
                }
            }

        } catch (e) {
            if (e.meta?.statusCode === 413 || e.message === `Invalid string length`) {
                if (bulkSize <= 2) {
                    throw Error(`Bulk operation failed despite the bulk size is ${bulkSize}.`);
                }

                logger.warn({
                    action: this.action,
                    alias: this.alias,
                    type: `413`,
                    esFunction: `bulk`,
                    msg: `ES returns error 413 - Content Too Large, will try again with split payload.`,
                    logId: this._uuid
                });

                let newBulkSize = Math.floor(bulkSize / 2);
                if ((newBulkSize % 2) === 1) {
                    //Ensure this is even
                    newBulkSize += 1;
                }

                return this.sendBulk(bulkSave, refresh, numberOfProcessed, newBulkSize, responseCache);

            } else {
                throw e;
            }
        }
    }

    /**
     * Returns promise that waits for given amount of time +- some drift
     * @param sleepTime {number} Sleep time
     * @returns {Promise<void>}
     */
    _sleep(sleepTime) {
        const drift = sleepTime / 5;
        const max = sleepTime + drift;
        const min = sleepTime - drift;

        const random = (Math.random() * (max - min)) + min;
        return new Promise((resolve) => {
            setTimeout(resolve, random);
        });
    }
}

module.exports = MyAction;
