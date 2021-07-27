'use strict';

const _ = require(`lodash`);
const { v4: uuid } = require(`uuid`);

const { esClient } = require(`./ElasticSearch`);
const logger = require(`./logger`);

const STATES = Object.freeze({
    NOT_FOUND: Symbol(`notFound`),      //Not found item, not in array, manually added/mentioned
    REJECTED: Symbol(`rejected`),       //User rejected item, may be deleted from array using clear()
    IN_PROGRESS: Symbol(`inProgress`),  //In progress item, save/delete is performed only on this type
    FINISHED: Symbol(`finished`)        //User finished item, may be deleted from array using clear()
});

/**
 * @typedef {BulkArray} BulkArray
 */
class BulkArray extends Array {
    constructor(...args) {
        super(...args);

        logger.debug({
            action: `bulkConstructor`,
            type: `publicFunction`,
            parameters: {},
            msg: `Creating new BulkArray instance.`
        });

        Object.defineProperty(this, `_total`, {
            value: (args) ? args.length : 0,
            writable: true,
            enumerable: false
        });

        Object.defineProperty(this, `__status`, {
            value: {},
            writable: true,
            enumerable: false
        });

        Object.defineProperty(this, `__rejected`, {
            value: [],
            writable: true,
            enumerable: false
        });

        Object.defineProperty(this, `__finished`, {
            value: [],
            writable: true,
            enumerable: false
        });
    }

    /**
     * Saves array items to ES
     * @param useVersion    {boolean}           Sends versions to ES
     * @returns             {Promise<Object>}   ES response
     */
    async save(useVersion = false) {
        const status = this.status;

        const itemsToProcess = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item) {
                continue;
            } else if (!item.__uuid) {
                continue;
            } else if (status[item.__uuid].state !== STATES.IN_PROGRESS) {
                continue;
            } else if (item.constructor.__fullIndex.includes(`*`)) {
                throw Error(`Item at index ${i} has wildcard in index '${item.constructor.__fullIndex}'!`);
            } else if (useVersion && !item._id) {
                throw Error(`Item at index ${i} doesn't have specified id and you are using 'useVersion' parameter!`);
            } else if (useVersion && !item._version) {
                throw Error(`Item at index ${i} doesn't have specified version and you are using 'useVersion' parameter!`);
            }

            await item.validate();

            itemsToProcess.push(item);
        }

        if (useVersion) {
            await fetchVersions(itemsToProcess);
        }

        const bulkBody = [];
        for (let i = 0; i < itemsToProcess.length; i++) {
            const item = itemsToProcess[i];

            bulkBody.push({
                index: {
                    _index: item.constructor.__fullIndex,
                    _id: item._id,
                    if_primary_term: (useVersion) ? item._primary_term : void 0,
                    if_seq_no: (useVersion) ? item._seq_no : void 0
                }
            });
            bulkBody.push(item);
        }

        if (bulkBody.length <= 0) {
            return {};
        }

        const logObject = {
            action: `bulkSave`,
            parameters: {
                useVersion: useVersion
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Saving bulk records.`
        });

        const { result, time } = await logger.measure(esClient, `bulk`, bulkBody);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                size: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Records saved via bulk.`
        });

        for (let i = 0; i < result.body.items.length; i++) {
            itemsToProcess[i]._id = result.body.items[i].index._id;
            itemsToProcess[i]._version = result.body.items[i].index._version;
            itemsToProcess[i]._primary_term = result.body.items[i].index._primary_term;
            itemsToProcess[i]._seq_no = result.body.items[i].index._seq_no;

            setItem(status[itemsToProcess[i].__uuid], result.body.items[i].index);
        }

        return result.body;
    }

    /**
     * Deletes array items from ES
     * @param useVersion    {boolean}           Sends versions to ES
     * @returns             {Promise<Object>}   ES response
     */
    async delete(useVersion = false) {
        const status = this.status;

        const itemsToProcess = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item) {
                continue;
            } else if (!item.__uuid) {
                continue;
            } else if (status[item.__uuid].state !== STATES.IN_PROGRESS) {
                continue;
            } else if (item.constructor.__fullIndex.includes(`*`)) {
                throw Error(`Item at index ${i} has wildcard in index '${item.constructor.__fullIndex}'!`);
            } else if (!item._id) {
                throw Error(`Item at index ${i} doesn't have specified id!`);
            } else if (useVersion && !item._version) {
                throw Error(`Item at index ${i} doesn't have specified version and you are using 'useVersion' parameter!`);
            }

            itemsToProcess.push(item);
        }

        if (useVersion) {
            await fetchVersions(itemsToProcess);
        }

        const bulkBody = [];
        for (let i = 0; i < itemsToProcess.length; i++) {
            const item = itemsToProcess[i];

            bulkBody.push({
                delete: {
                    _index: _.get(item, `constructor.__fullIndex`, ``),
                    _id: _.get(item, `_id`, ``),
                    if_primary_term: (useVersion) ? item._primary_term : void 0,
                    if_seq_no: (useVersion) ? item._seq_no : void 0
                }
            });
        }

        if (bulkBody.length <= 0) {
            return {};
        }

        const logObject = {
            action: `bulkDelete`,
            parameters: {
                useVersion: useVersion
            }
        };
        logger.info({
            type: `apiRequest`,
            ...logObject,
            msg: `Deleting records via bulk.`
        });

        const { result, time } = await logger.measure(esClient, `bulk`, bulkBody);

        logger.info({
            type: `apiResponse`,
            ...logObject,
            response: {
                took: time,
                size: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
            },
            msg: `Records deleted via bulk.`
        });

        for (let i = 0; i < result.body.items.length; i++) {
            setItem(status[itemsToProcess[i].__uuid], result.body.items[i].delete);
        }

        return result.body;
    }

    /**
     * Reloads whole array
     * @returns {Promise<void>}
     */
    async reload() {
        logger.info({
            action: `bulkReload`,
            type: `apiRequest`,
            parameters: {},
            msg: `Reloading multiple records -> calling item reloads.`
        });
        const status = this.status;

        const promises = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item) {
                continue;
            } else if (status[item.__uuid].state !== STATES.IN_PROGRESS) {
                continue;
            }

            const self = this;
            promises.push(async function() {
                try {
                    await item.reload();
                } catch (e) {
                    self.reject(item, 404, `Another process deleted the item during progress.`);
                }
            }());
        }

        await Promise.all(promises);
        //Logger response omitted
        this.clear();
    }

    //==================================================================================================================

    /**
     * Returns bulk status
     * @returns {Object}
     */
    get status() {
        logger.debug({
            action: `status`,
            type: `internalFunction`,
            parameters: {},
            msg: `Creating BulkItems statuses.`
        });

        for (const item of this) {
            const uuid = item.__uuid;
            if (uuid && !this.__status[uuid]) {
                this.__status[uuid] = newItem(item._id, item.constructor.__fullIndex);
            }
        }

        return this.__status;
    }

    /**
     * Returns ES status, items are cloned
     * @param includeAll {boolean} Include even success messages
     * @returns {Object} ES format bulk status
     */
    esStatus(includeAll = false) {
        logger.debug({
            action: `esStatus`,
            type: `publicFunction`,
            parameters: {},
            msg: `Creating ES status.`
        });

        const items = [];
        let errors = false;
        let count = 0;

        const status = this.status;

        for (const value of Object.values(status)) {
            const copy = _.cloneDeep(value);
            delete copy.state;

            if (includeAll) {
                items.push(copy);
                if (copy.status && copy.status >= 400) {
                    errors = true;
                }
            } else {
                if (copy.status && copy.status >= 400) {
                    items.push(copy);
                    errors = true;
                }
            }
            count++;
        }

        return { items, errors, count };
    }

    /**
     * Adds item with given id/index as not found
     * @param id {string}
     * @param index {string}
     */
    notFound(id, index = void 0) {
        logger.debug({
            action: `notFound`,
            type: `internalFunction`,
            parameters: {},
            msg: `Marking BulkArray item as not found.`
        });

        this.__status[uuid()] = {
            index: index,
            id: id,
            status: 404,
            message: `Item not found`,
            state: STATES.NOT_FOUND,
            payload: {}
        };
    }

    /**
     * Rejects item. Call clear() to remove it from array.
     * @param item {BaseModel} Item bo be rejected.
     * @param statusCode {number} Status code of rejection
     * @param message {string} Message of rejection
     */
    reject(item, statusCode = 400, message = void 0) {
        logger.debug({
            action: `reject`,
            type: `internalFunction`,
            parameters: {},
            msg: `Rejecting bulkArray item.`
        });

        action(this, item, true, statusCode, message);
    }

    /**
     * Rejects all documents with current status code >= 400
     */
    rejectFailed() {
        logger.debug({
            action: `rejectFailed`,
            type: `internalFunction`,
            parameters: {},
            msg: `Rejecting failed bulkArray items.`
        });

        const status = this.status;

        for (const item of this) {
            const statusCode = status[item.__uuid].status;
            if (statusCode && statusCode >= 400) {
                action(this, item, true);
            }
        }
    }

    /**
     * Finishes item. Call clear() to remove it from array.
     * @param item {BaseModel} Item to be finished
     * @param statusCode {number} Status code
     * @param message {string} Message
     */
    finish(item, statusCode = 200, message = void 0) {
        logger.debug({
            action: `finish`,
            type: `internalFunction`,
            parameters: {},
            msg: `Finishing bulkArray item.`
        });

        action(this, item, false, statusCode, message);
    }

    /**
     * Returns payload object of item.
     * @param item {BaseModel} Item with payload we want
     * @returns {Object} Item payload
     */
    payload(item) {
        logger.debug({
            action: `payload`,
            type: `internalFunction`,
            parameters: {},
            msg: `Returning BulkArray item payload.`
        });

        const status = this.status;

        return status[item.__uuid].payload;
    }

    /**
     *  Removes rejected/finished elements from this array.
     *  Use after calling reject/finish while out of cycle.
     */
    clear() {
        logger.debug({
            action: `clear`,
            type: `internalFunction`,
            parameters: {},
            msg: `Removing processed items from bulkArray.`
        });

        const status = this.status;

        for (let i = this.length - 1; i >= 0; i--) {
            let toRemove = true;

            if (this[i] && this[i].__uuid) {
                const state = status[this[i].__uuid].state;

                if (state === STATES.IN_PROGRESS) {
                    toRemove = false;
                } else if (state === STATES.REJECTED) {
                    this.__rejected.push(this[i]);
                } else if (state === STATES.FINISHED) {
                    this.__finished.push(this[i]);
                }
            }

            if (toRemove) {
                this.splice(i, 1);
            }
        }
    }

    /**
     * Imports bulk status from other BulkArrays
     * Entries which not exist in foreign arrays remain intact
     * @param bulkArrays {BulkArray<*>}
     */
    importStatus(...bulkArrays) {
        logger.debug({
            action: `importStatus`,
            type: `internalFunction`,
            parameters: {},
            msg: `Importing bulkArrays statuses.`
        });

        const myStatus = this.status;
        for (const bulkArray of bulkArrays) {
            const bulkStatus = bulkArray.status;

            for (const [key, value] of Object.entries(bulkStatus)) {
                myStatus[key] = value;
            }
        }
    }
}

/**
 * Fetches version information for specified instances
 * @param itemsToProcess {Array<Object>}
 * @returns {Promise<void>}
 */
async function fetchVersions(itemsToProcess) {
    //parallel arrays
    const headPromises = [];
    const toFind = [];
    for (const item of itemsToProcess) {
        if (!item._primary_term || !item._seq_no) {
            headPromises.push(esClient.getHead(item.constructor.__fullIndex, item._id));
            toFind.push(item);
        }
    }

    const heads = await Promise.all(headPromises);  //may fail
    if (toFind.length !== heads.length) {
        //This should not occur, just to be sure - it should fail during get requests
        throw Error(`Tried to fetch version information but some instances are not in ES!`);
    }
    for (let i = 0; i < toFind.length; i++) {
        if (toFind[i]._version !== heads[i].body._version) {
            throw Error(`For item with id '${toFind[i]._id}' at index '${toFind[i].constructor.__fullIndex}', specified version '${toFind[i]._version}', another version '${heads[i].body._version}' was found!`);
        }

        toFind[i]._primary_term = heads[i].body._primary_term;
        toFind[i]._seq_no = heads[i].body._seq_no;
    }
}

/**
 * Creates new item body
 * @param id {string} Id of item
 * @param index {string} Index of item
 * @returns {Object} Item body
 */
function newItem(id, index) {
    return {
        id: id,
        index: index,
        status: void 0,
        message: void 0,
        state: STATES.IN_PROGRESS,
        payload: {}
    };
}

/**
 * Sets item given status
 * @param item {Object} Status object body
 * @param status {Object} ES bulk response object
 */
function setItem(item, status) {
    if (item.id && item.id !== status._id) {
        item.payload.originalId = item.id;
    }

    item.id = status._id;
    item.status = status.status;
    item.message = _.get(status, `error.reason`, status.result);
}

/**
 * Performs reject/finish action on given item
 * @param instance {BulkArray} Current BulkArray instance
 * @param item {BaseModel} Model instance on which the action is performed
 * @param rejected {boolean} True for reject, false for finish
 * @param statusCode {number} Optional status code
 * @param message {string} Optional message
 */
function action(instance, item, rejected = true, statusCode = void 0, message = void 0) {
    const status = instance.status;
    const uuid = item.__uuid;

    if (!status[uuid]) {
        status[uuid] = newItem(item._id, item.constructor.__fullIndex);
    }

    if (rejected) {
        status[uuid].state = STATES.REJECTED;
    } else {
        status[uuid].state = STATES.FINISHED;
    }

    if (statusCode) {
        status[uuid].status = statusCode;
    }
    if (message) {
        status[uuid].message = message;
    }
}

module.exports = BulkArray;
