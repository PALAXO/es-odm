'use strict';

const _ = require(`lodash`);

const { es } = require(`./ElasticSearch`);

const STATES = Object.freeze({
    NOT_FOUND: `notFound`,
    REJECTED: `rejected`,
    IN_PROGRESS: `inProgress`,
    FINISHED: `finished`
});

/**
 * @template T
 * @extends {Array<T>}
 */
class BulkArray extends Array {
    constructor(...args) {
        super(...args);

        Object.defineProperty(this, `_total`, {
            value: (args) ? args.length : 0,
            writable: true,
            enumerable: false
        });

        Object.defineProperty(this, `__info`, {
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
        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        let info = this.info;

        const bulkBody = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item) {
                continue;
            } else if (item._id && info[item._id].state !== STATES.IN_PROGRESS) {
                continue;
            }

            //Can't use instanceof because of circular
            if (!_.hasIn(item, `constructor.__fullIndex`) ||
                !_.isString(item.constructor.__fullIndex) ||
                !_.hasIn(item, `constructor.__esType`) ||
                !_.isString(item.constructor.__esType) ||
                !_.hasIn(item, `validate`) ||
                !_.isFunction(item.validate)) {
                throw Error(`Incorrect item type at index ${i}!`);
            }

            await item.validate();

            bulkBody.push({
                index: {
                    _index: item.constructor.__fullIndex,
                    _type: item.constructor.__esType,
                    _id: item._id,
                    _version: (useVersion) ? item._version : void 0
                }
            });
            bulkBody.push(item);
        }

        if (bulkBody.length <= 0) {
            return;
        }

        const result = await es().bulk(bulkBody);

        for (let i = 0; i < result.body.items.length; i++) {
            const id = result.body.items[i].index._id;
            this[i]._id = id;
            this[i]._version = result.body.items[i].index._version;
        }

        info = this.info;

        for (let i = 0; i < result.body.items.length; i++) {
            const id = result.body.items[i].index._id;
            const myInfo = info[id];
            myInfo.status = result.body.items[i].index.status;
            myInfo.message = result.body.items[i].index.result;
        }

        return result.body;
    }

    /**
     * Deletes array items from ES
     * @param useVersion    {boolean}           Sends versions to ES
     * @returns             {Promise<Object>}   ES response
     */
    async delete(useVersion = false) {
        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const info = this.info;  //add non-exiting

        const bulkBody = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item) {
                continue;
            } else if (item._id && info[item._id].state !== STATES.IN_PROGRESS) {
                continue;
            }

            bulkBody.push({
                delete: {
                    _index: _.get(item, `constructor.__fullIndex`, ``),
                    _type: _.get(item, `constructor.__esType`, ``),
                    _id: _.get(item, `_id`, ``),
                    _version: (useVersion) ? item._version : void 0
                }
            });
        }

        if (bulkBody.length <= 0) {
            return;
        }

        const result = await es().bulk(bulkBody);

        for (let i = 0; i < result.body.items.length; i++) {
            const id = result.body.items[i].delete._id;
            const myInfo = info[id];
            if (myInfo) {
                myInfo.status = result.body.items[i].delete.status;
                myInfo.message = result.body.items[i].delete.result;
            }
        }

        return result.body;
    }

    //==================================================================================================================

    /**
     * Updates and returns info
     * @returns {Object}
     */
    get info() {
        for (const item of this) {
            if (item && item._id) {
                const id = item._id;
                if (!this.__info[id]) {
                    this.__info[id] = newItem(id, item.constructor.__fullIndex);
                }
            }
        }

        return this.__info;
    }

    /**
     * Returns ES info
     * @returns {Object}
     */
    get esInfo() {
        const info = this.info;

        const items = [];
        let errors = false;
        let count = 0;
        for (const value of Object.values(info)) {
            const copy = _.cloneDeep(value);
            delete copy.state;
            items.push(copy);
            if (copy.status && copy.status >= 400) {
                errors = true;
            }
            count++;
        }

        return { items, errors, count };
    }

    /**
     * Changes id of given item in both array and info
     * @param item {BaseModel}
     * @param id {string}
     */
    changeId(item, id) {
        const info = this.info;

        const originalId = item._id;
        if (!originalId) {
            throw Error(`Item has no id!`);
        }

        const myItem = info[originalId];
        delete info[originalId];

        item._id = id;
        myItem.id = id;
        myItem.payload.originalId = originalId;
        info[id] = myItem;
    }

    /**
     * @param id {string}
     * @param index {string}
     */
    notFound(id, index = void 0) {
        this.__info[id] = {
            index: index,
            id: id,
            status: 404,
            message: `Item not found`,
            state: STATES.NOT_FOUND,
            payload: {}
        };
    }

    /**
     * Rejects item with given status and message. Item is moved to array of rejected. Call clear() to remove holes.
     * @param item {BaseModel}
     * @param status {number}
     * @param message {string}
     */
    reject(item, status = 400, message = void 0) {
        action(this, item, true, status, message);
    }

    /**
     * Rejects all documents with current status code >= 400
     */
    rejectFailed() {
        const info = this.info;

        for (const item of this) {
            if (item && item._id) {
                const status = info[item._id].status;
                if (status && status >= 400) {
                    action(this, item, true);
                }
            }
        }
    }

    /**
     * Finishes item with given status and message. Item is moved to array of finished. Call clear() to remove holes.
     * @param item {BaseModel}
     * @param status {number}
     * @param message {string}
     */
    finish(item, status = 200, message = void 0) {
        action(this, item, false, status, message);
    }

    /**
     * @param item {BaseModel}
     * @returns {Object}
     */
    payload(item) {
        const id = item._id;
        if (!id) {
            throw Error(`Item has no id!`);
        }

        const info = this.info;
        if (!info[id]) {
            throw Error(`Item doesn't exist!`);
        }

        return info[id].payload;
    }

    /**
     *  Removes rejected/finished elements. Use after calling reject/finish while out of cycle.
     */
    clear() {
        const info = this.info;

        for (let i = this.length - 1; i >= 0; i--) {
            if (!this[i]) {
                this.splice(i, 1);
            } else if (info[this[i]._id].state === STATES.REJECTED) {
                this.splice(i, 1);
                this.__rejected.push(this[i]);
            } else if (info[this[i]._id].state === STATES.FINISHED) {
                this.splice(i, 1);
                this.__finished.push(this[i]);
            }
        }
    }
}

/**
 * @param id {string}
 * @param index {string}
 * @returns {Object}
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
 * @param instance {BulkArray}
 * @param item {BaseModel}
 * @param rejected {boolean}
 * @param status {number}
 * @param message {string}
 */
function action(instance, item, rejected = true, status = void 0, message = void 0) {
    const info = instance.info;

    const id = item._id;
    if (!id) {
        throw Error(`Item has no id!`);
    }

    if (!info[id]) {
        instance[id] = newItem(id, item.constructor.__fullIndex);
    }

    if (rejected) {
        info[id].state = STATES.REJECTED;
    } else {
        info[id].state = STATES.FINISHED;
    }

    if (status) {
        info[id].status = status;
    }
    if (message) {
        info[id].message = message;
    }
}

module.exports = BulkArray;
