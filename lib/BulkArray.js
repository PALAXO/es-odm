'use strict';

const _ = require(`lodash`);
const Action = require(`./Action`);
const logger = require(`./logger`);
const utils = require(`./utils`);
const { v4: uuid } = require(`uuid`);

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

        logger.trace({
            action: `bulkConstructor`,
            msg: `Creating new BulkArray instance.`
        });

        Object.defineProperty(this, `_immediateRefresh`, {
            value: true,
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
     * @param useVersion    {boolean=}          Sends versions to ES
     * @returns             {Promise<Object>}   ES response
     */
    async save(useVersion = false) {
        const myAction = new Action(`bulkSave`);

        const status = this.status;
        const packCache = {};

        const itemsToProcess = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];
            if (!item.__uuid) {
                throw Error(`Item at position ${i} doesn't have internal property "__uuid".`);
            } else if (status[item.__uuid].state !== STATES.IN_PROGRESS) {
                continue;
            } else if (useVersion && !item._id) {
                throw Error(`Item at position ${i} doesn't have specified id and you are using 'useVersion' parameter!`);
            } else if (useVersion && !item._version) {
                throw Error(`Item at position ${i} doesn't have specified version and you are using 'useVersion' parameter!`);
            }
            item.constructor.__checkIfFullySpecified(`bulkArray.save`);

            await item.validate();
            itemsToProcess.push(item);
        }

        if (useVersion) {
            await fetchVersions(myAction, itemsToProcess);
        }

        if (itemsToProcess.length <= 0) {
            return {
                errors: false,
                items: [],
                took: 0
            };
        }

        const bulkBody = [];
        for (let i = 0; i < itemsToProcess.length; i++) {
            const item = itemsToProcess[i];

            bulkBody.push({
                index: {
                    _index: item.constructor.alias,
                    _id: item._id,
                    if_primary_term: (useVersion) ? item._primary_term : void 0,
                    if_seq_no: (useVersion) ? item._seq_no : void 0
                }
            });
            bulkBody.push(await item._packData(packCache));
        }

        myAction.logParams({
            useVersion: useVersion,
            items: bulkBody.length
        });

        const result = await myAction.sendBulk(bulkBody, this._immediateRefresh);

        for (let i = 0; i < result.body.items.length; i++) {
            itemsToProcess[i]._id = result.body.items[i].index._id;
            itemsToProcess[i]._version = result.body.items[i].index._version;
            itemsToProcess[i]._primary_term = result.body.items[i].index._primary_term;
            itemsToProcess[i]._seq_no = result.body.items[i].index._seq_no;

            setItem(status[itemsToProcess[i].__uuid], result.body.items[i].index);
        }

        myAction.finish();
        return result.body;
    }

    /**
     * Deletes array items from ES
     * @param useVersion    {boolean=}          Sends versions to ES
     * @returns             {Promise<Object>}   ES response
     */
    async delete(useVersion = false) {
        const myAction = new Action(`bulkDelete`);

        const status = this.status;

        const itemsToProcess = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item.__uuid) {
                throw Error(`Item at position ${i} doesn't have internal property "__uuid".`);
            } else if (status[item.__uuid].state !== STATES.IN_PROGRESS) {
                continue;
            } else if (!_.isString(item.constructor?.alias)) {
                throw Error(`Item at position ${i} doesn't specify any alias!`);
            } else if (item.constructor.alias.includes(`*`) || item.constructor.alias.includes(`?`)) {
                throw Error(`Item at position ${i} has wildcard in alias '${item.constructor.alias}'!`);
            } else if (!item._id) {
                throw Error(`Item at position ${i} doesn't have specified id!`);
            } else if (useVersion && !item._version) {
                throw Error(`Item at position ${i} doesn't have specified version and you are using 'useVersion' parameter!`);
            }

            itemsToProcess.push(item);
        }

        if (useVersion) {
            await fetchVersions(myAction, itemsToProcess);
        }

        if (itemsToProcess.length <= 0) {
            return {
                errors: false,
                items: [],
                took: 0
            };
        }

        const bulkBody = [];
        for (let i = 0; i < itemsToProcess.length; i++) {
            const item = itemsToProcess[i];

            bulkBody.push({
                delete: {
                    _index: _.get(item, `constructor.alias`, ``),
                    _id: _.get(item, `_id`, ``),
                    if_primary_term: (useVersion) ? item._primary_term : void 0,
                    if_seq_no: (useVersion) ? item._seq_no : void 0
                }
            });
        }

        myAction.logParams({
            useVersion: useVersion,
            items: bulkBody.length
        });

        const result = await myAction.sendBulk(bulkBody, this._immediateRefresh);

        for (let i = 0; i < result.body.items.length; i++) {
            setItem(status[itemsToProcess[i].__uuid], result.body.items[i].delete);
        }

        myAction.finish();
        return result.body;
    }

    /**
     * Reloads whole array
     * @returns {Promise<void>}
     */
    async reload() {
        const myAction = new Action(`reload`);
        const status = this.status;

        const reloadCache = {};
        for (let i = 0; i < this.length; i++) {
            const item = this[i];

            if (!item.__uuid) {
                throw Error(`Item at position ${i} doesn't have internal property "__uuid".`);
            } else if (status[item.__uuid].state !== STATES.IN_PROGRESS) {
                continue;
            } else if (_.isNil(item._id) || !_.isString(item._id) || _.isEmpty(item._id)) {
                continue;
            }

            //Note items to reload, group by alias
            if (!reloadCache[item.constructor.alias]) {
                reloadCache[item.constructor.alias] = {
                    Odm: item.constructor,
                    items: []
                };
            }
            reloadCache[item.constructor.alias].items.push(item);
        }

        const searchCache = {};
        for (const reloadingAlias of Object.keys(reloadCache)) {
            const toReload = reloadCache[reloadingAlias];

            let processed = 0;
            const reloadBulkSize = await toReload.Odm._getBulkSize();
            while (processed < toReload.items.length) {
                //Do not exceed maximum allowed bulk size
                const itemsToProcess = (reloadBulkSize >= toReload.items.length) ? toReload.items : toReload.items.slice(processed, processed + reloadBulkSize);
                processed += reloadBulkSize;

                let myResults = await myAction.callEs(`mget`, toReload.Odm.alias, itemsToProcess.map((item) => item._id));
                myResults = myResults.body.docs;

                //Parallel arrays
                const hlpItemArray = [];
                const newInstances = [];
                for (let i = 0; i < itemsToProcess.length; i++) {
                    //Parallel arrays
                    const item = itemsToProcess[i];
                    const foundResult = myResults[i];

                    if (foundResult.found !== true) {
                        this.reject(item, 404, `Another process deleted the item during progress.`);
                    } else {
                        hlpItemArray.push(item);
                        newInstances.push(new toReload.Odm(toReload.Odm._unpackData(foundResult._source), foundResult._id,
                            foundResult._version, item._highlight, foundResult._primary_term, foundResult._seq_no, item._score, item._sort));
                    }
                }
                await toReload.Odm._afterSearch(newInstances, searchCache);

                for (let i = 0; i < hlpItemArray.length; i++) {
                    utils.reloadInstance(hlpItemArray[i], newInstances[i]);
                }
            }
        }
        myAction.finish();

        this.clear();
    }

    //==================================================================================================================

    /**
     * Returns bulk status
     * @returns {Object}
     */
    get status() {
        logger.trace({
            action: `bulkStatus`,
            msg: `Creating BulkItems statuses.`
        });

        for (const item of this) {
            const uuid = item.__uuid;
            if (uuid && !this.__status[uuid]) {
                this.__status[uuid] = newItem(item._id, item.constructor.alias);
            }
        }

        return this.__status;
    }

    /**
     * Returns ES status, items are cloned
     * @param includeAll {boolean=} Include even success messages
     * @returns {Object} ES format bulk status
     */
    esStatus(includeAll = false) {
        logger.debug({
            action: `bulkEsStatus`,
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
     * Adds item with given id/alias as not found
     * @param id {string}
     * @param alias {string=}
     */
    notFound(id, alias = void 0) {
        logger.debug({
            action: `bulkNotFound`,
            msg: `Marking BulkArray item as not found.`
        });

        this.__status[uuid()] = {
            index: alias,
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
     * @param statusCode {number=} Status code of rejection
     * @param message {string=} Message of rejection
     */
    reject(item, statusCode = 400, message = void 0) {
        logger.debug({
            action: `bulkReject`,
            msg: `Rejecting bulkArray item.`
        });

        action(this, item, true, statusCode, message);
    }

    /**
     * Rejects all documents with current status code >= 400
     */
    rejectFailed() {
        logger.debug({
            action: `bulkRejectFailed`,
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
     * @param statusCode {number=} Status code
     * @param message {string=} Message
     */
    finish(item, statusCode = 200, message = void 0) {
        logger.debug({
            action: `bulkFinish`,
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
            action: `bulkPayload`,
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
            action: `bulkClear`,
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
            action: `bulkImportStatus`,
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
 * @param myAction {MyAction} Logger instance
 * @param itemsToProcess {Array<Object>}
 * @returns {Promise<void>}
 */
async function fetchVersions(myAction, itemsToProcess) {
    const fetchCache = {};
    for (const item of itemsToProcess) {
        if (!item._primary_term || !item._seq_no) {
            //Note items to fetch, group by alias
            if (!fetchCache[item.constructor.alias]) {
                fetchCache[item.constructor.alias] = {
                    Odm: item.constructor,
                    items: []
                };
            }
            fetchCache[item.constructor.alias].items.push(item);
        }
    }

    for (const fetchingAlias of Object.keys(fetchCache)) {
        const toFetch = fetchCache[fetchingAlias];

        let processed = 0;
        const fetchBulkSize = await toFetch.Odm._getBulkSize();
        while (processed < toFetch.items.length) {
            //Do not exceed maximum allowed bulk size
            const itemsToFetch = (fetchBulkSize >= toFetch.items.length) ? toFetch.items : toFetch.items.slice(processed, processed + fetchBulkSize);
            processed += fetchBulkSize;

            let myResults = await myAction.callEs(`mget`, toFetch.Odm.alias, itemsToFetch.map((item) => item._id), false);
            myResults = myResults.body.docs;

            for (let i = 0; i < itemsToFetch.length; i++) {
                //Parallel arrays
                const item = itemsToFetch[i];
                const foundResult = myResults[i];

                if (foundResult.found !== true) {
                    throw Error(`Tried to fetch version information but some instances are not in ES.`);
                } else if (foundResult._version !== item._version) {
                    throw Error(`For item with id '${item._id}' in alias '${item.constructor.alias}', specified version '${item._version}', another version '${foundResult._version}' was found!`);
                } else {
                    item._primary_term = foundResult._primary_term;
                    item._seq_no = foundResult._seq_no;
                }
            }
        }
    }
}

/**
 * Creates new item body
 * @param id {string} Id of item
 * @param alias {string} alias of item
 * @returns {Object} Item body
 */
function newItem(id, alias) {
    return {
        id: id,
        index: alias,
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
        status[uuid] = newItem(item._id, item.constructor.alias);
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
