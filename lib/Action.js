import _ from 'lodash';
import { esClient } from './elasticsearch.js';
import logger from './logger.js';
import nconf from './config/config.js';
import { v4 as uuid } from 'uuid';

//The by-query and reindex APIs write in batches and answer 429 only once they give up on one of them - whatever they
//wrote before stays written, so repeating such a call would apply it again to the documents already processed
const BATCH_WRITING_FUNCTIONS = new Set([`updateByQuery`, `deleteByQuery`, `reindex`]);

/**
 * Returns how many documents a batch writing API reports as written before ES answered it with an error
 * @param functionName {string} Called function of the ES client wrapper
 * @param args {Array<*>} Arguments of the call, the first one names the client API in case of a raw call
 * @param error {*} Error of the call
 * @returns {number} Number of the written documents, zero for any other API
 */
function countWrittenDocuments(functionName, args, error) {
    const esFunction = (functionName === `call`) ? args[0] : functionName;
    if (!BATCH_WRITING_FUNCTIONS.has(esFunction)) {
        return 0;
    }

    //A request refused before it started answers with a plain error, without any of these counts
    const body = error?.meta?.body;
    return [body?.updated, body?.created, body?.deleted].reduce((sum, count) => sum + (_.isFinite(count) ? count : 0), 0);
}

class MyAction {
    /**
     * @param action {string}
     * @param alias {string | Array<string>}
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

        const warningMessages = [];
        const downloadedB = nconf.get(`warning:downloadedB`);
        if ((downloadedB > 0) && (this.summary.contentLength >= downloadedB)) {
            warningMessages.push(`downloaded ${(this.summary.contentLength / 1048576).toFixed(2)} MiB during single ODM API request`);
        }

        const searchCalls = nconf.get(`warning:searchCalls`);
        if ((searchCalls > 0) && (this.action === `jointModelSearch` || this.action === `search`) && (this.summary.esCalls >= searchCalls)) {
            warningMessages.push(`used ${this.summary.esCalls} internal ES search calls to finish single ODM API request`);
        }

        if (warningMessages.length > 0) {
            let warningMessage = warningMessages.join(` AND `);
            warningMessage = `${warningMessage.charAt(0).toUpperCase()}${warningMessage.slice(1)}.`;
            logger.warn({
                action: this.action,
                alias: this.alias,
                type: `warning`,
                msg: warningMessage,
                logId: this._uuid
            });
        }
    }

    /**
     * Calls ES API
     * @param functionName {string} ES API function name
     * @param args {*} ES API function arguments
     * @returns {Promise<*>} ES API function response
     */
    async callEs(functionName, ...args) {
        let retryCounter = 0;

        //Read per call - "setConfiguration" may change the retry policy at runtime
        const retries = nconf.get(`es:retries`);

        while (true) {
            let shouldRetry = false;

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
                //Only 429 is repeated - ES answers it before executing anything, so the call is safe to send again, unless
                //it comes from a batch writing API which already wrote something. A 5xx carries no such guarantee and the
                //ES client retries it itself where it can.
                const writtenBeforeRejection = (e.statusCode === 429) ? countWrittenDocuments(functionName, args, e) : 0;
                if (writtenBeforeRejection > 0) {
                    logger.warn({
                        action: this.action,
                        alias: this.alias,
                        type: `429`,
                        esFunction: functionName,
                        msg: `ES returns error 429 after it already wrote ${writtenBeforeRejection} documents, the call is not repeated.`,
                        logId: this._uuid
                    });
                    throw e;
                } else if (e.statusCode === 429 && retryCounter < retries.maxRetries) {
                    shouldRetry = true;
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

            //Streamed responses measure the transferred size themselves, the remaining ones are chunked only exceptionally
            const contentLength = result?.__contentLength ?? parseInt(result?.headers?.[`content-length`] ?? `0`, 10);
            const took = result?.body?.took ?? 0;

            this.summary.esCalls++;
            this.summary.contentLength += contentLength;
            this.summary.calculatedTook += calculatedTook;

            if (shouldRetry) {
                retryCounter++;
                const sleepTime = 100 * Math.pow(retries.base, retryCounter);
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
     * @param refresh {boolean | string}
     * @param numberOfProcessed {number}
     * @param bulkSize {number}
     * @param responseCache {{took: number, errors: boolean, items: Array<Record<string, any>>}=} Merged response of the already sent chunks
     * @returns {Promise<{}>}
     */
    async sendBulk(bulkSave, refresh = true, numberOfProcessed = 0, bulkSize = bulkSave.length, responseCache = void 0) {
        if (bulkSave.length <= 0) {
            return {
                body: {
                    took: 0,
                    errors: false,
                    items: []
                }
            };
        }

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
                    //concat instead of push(...items) - spread would overflow the call stack on huge batches
                    responseCache.items = responseCache.items.concat(response.body.items);
                }

                numberOfProcessed += bulkSize;
                if (numberOfProcessed >= bulkSave.length) {
                    return {
                        body: responseCache
                    };
                }
            }

        } catch (e) {
            const isTooLarge = (e.meta?.statusCode === 413);
            if (isTooLarge || e.message === `Invalid string length`) {
                if (bulkSize <= 2) {
                    //Keep the status of the original failure, consumers map ES errors by it
                    const error = Error(`Bulk operation failed despite the bulk size is ${bulkSize}.`, { cause: e });
                    if (!_.isNil(e.meta?.statusCode)) {
                        error.statusCode = e.meta.statusCode;
                        error.meta = e.meta;
                    }
                    throw error;
                }

                logger.warn({
                    action: this.action,
                    alias: this.alias,
                    type: (isTooLarge) ? `413` : `RangeError`,
                    esFunction: `bulk`,
                    msg: (isTooLarge) ?
                        `ES returns error 413 - Content Too Large, will try again with split payload.` :
                        `The bulk payload exceeds the maximum string length, will try again with split payload.`,
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

export default MyAction;
