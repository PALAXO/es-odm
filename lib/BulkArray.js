'use strict';

const _ = require(`lodash`);
const uuid = require(`uuid/v4`);

const { es } = require(`./ElasticSearch`);

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

        const bulkBody = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item) {
                continue;
            } else if (!item.__uuid) {
                continue;
            } else if (status[item.__uuid].state !== STATES.IN_PROGRESS) {
                continue;
            }

            await item.validate();

            bulkBody.push({
                index: {
                    _index: item.constructor.__fullIndex,
                    _type: item.constructor.__esType,
                    _id: item._id,
                    version: (useVersion) ? item._version : void 0
                }
            });
            bulkBody.push(item);
        }

        if (bulkBody.length <= 0) {
            return {};
        }

        const result = await es().bulk(bulkBody);

        for (let i = 0; i < result.body.items.length; i++) {
            this[i]._id = result.body.items[i].index._id;
            this[i]._version = result.body.items[i].index._version;

            setItem(status[this[i].__uuid], result.body.items[i].index);
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

        const bulkBody = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item) {
                continue;
            } else if (!item.__uuid) {
                continue;
            } else if (status[item.__uuid].state !== STATES.IN_PROGRESS) {
                continue;
            }

            bulkBody.push({
                delete: {
                    _index: _.get(item, `constructor.__fullIndex`, ``),
                    _type: _.get(item, `constructor.__esType`, ``),
                    _id: _.get(item, `_id`, ``),
                    version: (useVersion) ? item._version : void 0
                }
            });
        }

        if (bulkBody.length <= 0) {
            return {};
        }

        const result = await es().bulk(bulkBody);

        for (let i = 0; i < result.body.items.length; i++) {
            setItem(status[this[i].__uuid], result.body.items[i].delete);
        }

        return result.body;
    }

    /**
     * Reloads whole array
     * @returns {Promise<void>}
     */
    async reload() {
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
        this.clear();
    }

    //==================================================================================================================

    /**
     * Returns bulk status
     * @returns {Object}
     */
    get status() {
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
        action(this, item, true, statusCode, message);
    }

    /**
     * Rejects all documents with current status code >= 400
     */
    rejectFailed() {
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
        action(this, item, false, statusCode, message);
    }

    /**
     * Returns payload object of item.
     * @param item {BaseModel} Item with payload we want
     * @returns {Object} Item payload
     */
    payload(item) {
        const status = this.status;

        return status[item.__uuid].payload;
    }

    /**
     *  Removes rejected/finished elements from this array.
     *  Use after calling reject/finish while out of cycle.
     */
    clear() {
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
    item.message = status.result;
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
