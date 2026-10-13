import _ from 'lodash';
import Action from './Action.js';
import logger from './logger.js';
import nconf from './config/config.js';
import utils from './utils.js';
import { v4 as uuid } from 'uuid';

/** @import BaseModel from './BaseModel.js' */
/** @import MyAction from './Action.js' */

const MAX_RESULTS = nconf.get(`es:maxResults`);

//Length of each array at its last full status sweep, see "ensureRecorded"
const sweptLengths = new WeakMap();

const STATES = Object.freeze({
    NOT_FOUND: Symbol(`notFound`),      //Not found item, not in array, manually added/mentioned
    REJECTED: Symbol(`rejected`),       //User rejected item, may be deleted from array using clear()
    IN_PROGRESS: Symbol(`inProgress`),  //In progress item, save/delete is performed only on this type
    FINISHED: Symbol(`finished`)        //User finished item, may be deleted from array using clear()
});

//Default status code for item rejection
const DEFAULT_REJECTION_STATUS = 400;
//Default status message for item rejection
const DEFAULT_REJECTION_MESSAGE = `The operation cannot be performed on this resource.`;
//Default status type for item rejection
const DEFAULT_REJECTION_TYPE = `RESOURCE:INVALID_OPERATION`;

/**
 * Status record of a single item of the array
 * @typedef {Object} BulkItemStatus
 * @property {string=} id Document ID, as known to the array - absent for an instance never saved to ES
 * @property {string=} index Alias of the item
 * @property {number} [status] Status code of the last operation, rejection or finish
 * @property {string} [message] Message of the last operation, rejection or finish
 * @property {string} [type] Type of the failure
 * @property {symbol} state Processing state of the item
 * @property {Record<string, any>} payload Free-form payload of the item, see "payload()"
 */
/**
 * ES-like summary of the item statuses
 * @typedef {Object} BulkEsStatus
 * @property {Array<Omit<BulkItemStatus, 'state'>>} items Status records in their creation order - the failed ones only, unless "includeAll" is set
 * @property {boolean} errors True when at least one item failed
 * @property {number} count Number of all the status records
 */

/**
 * Array of ODM instances with a per item status ledger
 * @template {BaseModel} [T=BaseModel]
 * @extends {Array<T>}
 */
class BulkArray extends Array {
    constructor(...args) {
        super(...args);

        logger.trace({
            action: `bulkConstructor`,
            msg: `Creating new BulkArray instance.`
        });

        /** @type {boolean | string} True or an ES refresh string to refresh the written indices right away; per array, as the items may come from several classes */
        Object.defineProperty(this, `_immediateRefresh`, {
            value: true,
            writable: true,
            enumerable: false
        });

        /** @type {Record<string, BulkItemStatus>} Status records of the items, keyed by their internal uuid */
        Object.defineProperty(this, `__status`, {
            value: {},
            writable: true,
            enumerable: false
        });

        /** @type {Array<BaseModel>} Items taken out of the processing set by "reject" */
        Object.defineProperty(this, `__rejected`, {
            value: [],
            writable: true,
            enumerable: false
        });

        /** @type {Array<BaseModel>} Items taken out of the processing set by "finish" */
        Object.defineProperty(this, `__finished`, {
            value: [],
            writable: true,
            enumerable: false
        });
    }

    /**
     * Saves array items to ES
     * @param useVersion    {boolean=}          Sends versions to ES
     * @returns             {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>}   ES response
     */
    async save(useVersion = false) {
        checkNotRecording(this);

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
            myAction.finish();
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
            items: itemsToProcess.length
        });

        const result = await myAction.sendBulk(bulkBody, this._immediateRefresh);

        for (let i = 0; i < result.body.items.length; i++) {
            const responseItem = result.body.items[i].index;

            //Failed items carry no concurrency metadata in the response - keep their original values
            if (responseItem.status < 400) {
                itemsToProcess[i]._id = responseItem._id;
                itemsToProcess[i]._version = responseItem._version;
                itemsToProcess[i]._primary_term = responseItem._primary_term;
                itemsToProcess[i]._seq_no = responseItem._seq_no;
            }

            setItem(status[itemsToProcess[i].__uuid], responseItem);
        }

        myAction.finish();
        return result.body;
    }

    /**
     * Deletes array items from ES
     * @param useVersion    {boolean=}          Sends versions to ES
     * @returns             {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>}   ES response
     */
    async delete(useVersion = false) {
        checkNotRecording(this);

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
            myAction.finish();
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
        checkNotRecording(this);

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

            //Note items to reload, group by constructor identifier and alias
            const key = `${item.constructor.__constructorIdentifier}:${item.constructor.alias}`;
            if (!reloadCache[key]) {
                reloadCache[key] = {
                    Constructor: item.constructor,
                    alias: item.constructor.alias,
                    items: []
                };
            }
            reloadCache[key].items.push(item);
        }

        const searchCache = {};
        for (const toReload of Object.values(reloadCache)) {

            let processed = 0;
            const reloadBulkSize = await toReload.Constructor._getBulkSize();
            while (processed < toReload.items.length) {
                //Do not exceed the maximum allowed bulk size
                const itemsToProcess = (reloadBulkSize >= toReload.items.length) ? toReload.items : toReload.items.slice(processed, processed + reloadBulkSize);
                processed += itemsToProcess.length;

                let myResults = await myAction.callEs(`mget`, toReload.alias, itemsToProcess.map((item) => item._id));
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
                        newInstances.push(new toReload.Constructor(toReload.Constructor._unpackData(foundResult._source), foundResult._id,
                            foundResult._version, item._highlight, foundResult._primary_term, foundResult._seq_no, item._score, item._sort));
                    }
                }
                await toReload.Constructor._afterSearch(newInstances, searchCache);

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
     * @returns {Record<string, BulkItemStatus>} Status records keyed by the internal uuid of the item
     */
    get status() {
        logger.trace({
            action: `bulkStatus`,
            msg: `Creating BulkItems statuses.`
        });

        recordArrayItems(this);
        return this.__status;
    }

    /**
     * Returns ES status, items are cloned
     * The records come in their creation order - the array items in the array order as of the first access touching
     * them, so a cleared item keeps its position, followed or preceded by the records written by "notFound" and
     * "importStatus" according to when those were created
     * @param includeAll {boolean=} Include even success messages
     * @returns {BulkEsStatus} ES format bulk status
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
            type: `RESOURCE:NOT_FOUND`,
            state: STATES.NOT_FOUND,
            payload: {}
        };
    }

    /**
     * Rejects item. Call clear() to remove it from array.
     * @param item {BaseModel} Item bo be rejected.
     * @param statusCodeOrError {(number|string|Error|Object)=} Status code OR message OR Error OR object of rejection
     * @param message {string=} Message of rejection
     * @param type {string=} Type of rejection
     */
    reject(item, statusCodeOrError = void 0, message = void 0, type = void 0) {
        logger.debug({
            action: `bulkReject`,
            msg: `Rejecting bulkArray item.`
        });

        let finalStatus, finalMessage, finalType;
        if (statusCodeOrError instanceof Error || (typeof statusCodeOrError === `object` && statusCodeOrError !== null)) {
            const objMessage = statusCodeOrError.message || (statusCodeOrError instanceof Error ? statusCodeOrError.toString() : void 0);

            finalStatus = statusCodeOrError.status || statusCodeOrError.statusCode || DEFAULT_REJECTION_STATUS;
            finalMessage = message || objMessage || DEFAULT_REJECTION_MESSAGE;
            finalType = type || statusCodeOrError.type || statusCodeOrError.code || DEFAULT_REJECTION_TYPE;

        } else {
            if (typeof statusCodeOrError === `number`) {
                finalStatus = statusCodeOrError;
                finalMessage = message || DEFAULT_REJECTION_MESSAGE;
            } else if (typeof statusCodeOrError === `string`) {
                finalStatus = DEFAULT_REJECTION_STATUS;
                finalMessage = statusCodeOrError;
            } else {
                finalStatus = DEFAULT_REJECTION_STATUS;
                finalMessage = message || DEFAULT_REJECTION_MESSAGE;
            }

            finalType = type || DEFAULT_REJECTION_TYPE;
        }

        action(this, item, true, finalStatus, finalMessage, finalType);
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
     * @param statusCode {number|string=} Status code or message
     * @param message {string=} Message
     */
    finish(item, statusCode = 200, message = void 0) {
        logger.debug({
            action: `bulkFinish`,
            msg: `Finishing bulkArray item.`
        });

        if (typeof statusCode === `string`) {
            message = statusCode;
            statusCode = 200;
        }

        action(this, item, false, statusCode, message);
    }

    /**
     * Returns payload object of item.
     * @param item {BaseModel} Item with payload we want
     * @returns {Record<string, any>} Item payload
     */
    payload(item) {
        logger.debug({
            action: `bulkPayload`,
            msg: `Returning BulkArray item payload.`
        });

        const uuid = checkUuid(item);
        ensureRecorded(this, uuid, item);

        return this.__status[uuid].payload;
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

        //Every remaining item was recorded by the sweep above - a stale length would let as many pushed items as were
        //removed here pass unrecorded through "ensureRecorded"
        sweptLengths.set(this, this.length);
    }

    /**
     * Imports bulk status from other BulkArrays
     * Entries which not exist in foreign arrays remain intact
     * @param bulkArrays {...BulkArray<*>}
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
 * Throws when any item of the array belongs to a recording clone created by "JointModel.recordSearch",
 * as such a class only records its searches and must never reach Elasticsearch
 * @param bulkArray {BulkArray<BaseModel>} Array to be checked
 */
function checkNotRecording(bulkArray) {
    for (const item of bulkArray) {
        if (!_.isNil(item?.constructor?.__recordSearch)) {
            throw Error(`Only 'search' can be called on a recording clone!`);
        }
    }
}

/**
 * Fetches version information for specified instances
 * @param myAction {MyAction} Logger instance
 * @param itemsToProcess {Array<BaseModel>}
 * @returns {Promise<void>}
 */
async function fetchVersions(myAction, itemsToProcess) {
    const aliasCache = {};
    for (const item of itemsToProcess) {
        if (_.isNil(item._primary_term) || _.isNil(item._seq_no)) {
            //Note items to fetch, group by alias
            if (!aliasCache[item.constructor.alias]) {
                aliasCache[item.constructor.alias] = [];
            }
            aliasCache[item.constructor.alias].push(item);
        }
    }

    for (const [alias, aliasItems] of Object.entries(aliasCache)) {
        let processed = 0;
        while (processed < aliasItems.length) {
            //Do not exceed maximum allowed bulk size
            const itemsToFetch = (MAX_RESULTS >= aliasItems.length) ? aliasItems : aliasItems.slice(processed, processed + MAX_RESULTS);
            processed += itemsToFetch.length;

            let myResults = await myAction.callEs(`mget`, alias, itemsToFetch.map((item) => item._id), false);
            myResults = myResults.body.docs;

            for (let i = 0; i < itemsToFetch.length; i++) {
                //Parallel arrays
                const item = itemsToFetch[i];
                const foundResult = myResults[i];

                if (foundResult.found !== true) {
                    const error = Error(`Tried to fetch version information but some instances are not in ES.`);
                    error.statusCode = 404;
                    throw error;
                } else if (foundResult._version !== item._version) {
                    const error = Error(`For item with id '${item._id}' in alias '${alias}', specified version '${item._version}', another version '${foundResult._version}' was found!`);
                    error.statusCode = 409;
                    throw error;
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
 * @returns {BulkItemStatus} Item body
 */
function newItem(id, alias) {
    return {
        id: id,
        index: alias,
        status: void 0,
        message: void 0,
        type: void 0,
        state: STATES.IN_PROGRESS,
        payload: {}
    };
}

/**
 * Returns the internal uuid of given item, refuses anything which is not an ODM instance
 * @param item {BaseModel} Item of the array
 * @returns {string} Internal uuid of the item
 */
function checkUuid(item) {
    const uuid = item?.__uuid;
    if (!uuid || !_.isString(uuid)) {
        throw Error(`Given item doesn't have internal property "__uuid".`);
    }

    return uuid;
}

/**
 * Creates the missing status records of the array items, in the order of the array - "esStatus" reports the records
 * in their creation order, so the items come in the order of the array as of the first access touching them
 * @param instance {BulkArray<BaseModel>} Current BulkArray instance
 */
function recordArrayItems(instance) {
    for (const item of instance) {
        const uuid = item.__uuid;
        if (uuid && !instance.__status[uuid]) {
            instance.__status[uuid] = newItem(item._id, item.constructor.alias);
        }
    }
    sweptLengths.set(instance, instance.length);
}

/**
 * Makes sure the given item has a status record, creating the records in the same order as a full sweep of the array
 * on every call would. The sweep is skipped when the item is recorded already and the array length did not change
 * since the last sweep - nothing can be left unrecorded then, unless the array was mutated by hand without a net
 * change of its length (an item replaced in place, a "pop" followed by a "push") - as sweeping
 * on every call would make the per-item loops of "reject", "finish" and "payload" quadratic.
 * @param instance {BulkArray<BaseModel>} Current BulkArray instance
 * @param uuid {string} Internal uuid of the item
 * @param item {BaseModel} The item
 */
function ensureRecorded(instance, uuid, item) {
    if (!instance.__status[uuid] || sweptLengths.get(instance) !== instance.length) {
        //The items of the array are recorded first, an item outside of it follows them
        recordArrayItems(instance);
    }

    if (!instance.__status[uuid]) {
        instance.__status[uuid] = newItem(item._id, item.constructor.alias);
    }
}

/**
 * Sets item given status
 * @param item {BulkItemStatus} Status object body
 * @param status {import('@elastic/elasticsearch').estypes.BulkResponseItem} ES bulk response object
 */
function setItem(item, status) {
    //A failed operation reports the id ES generated for a document it never wrote - keep the item's own id instead
    if (status.status < 400) {
        if (item.id && item.id !== status._id) {
            item.payload.originalId = item.id;
        }

        item.id = status._id;
    }

    item.status = status.status;
    item.message = _.get(status, `error.reason`, status.result);

    if (item.status >= 400) {
        if (!item.type) {
            item.type = `DATABASE:OPERATION_FAILED`;
        }
    } else {
        //Success clears an error type possibly left over from a previous attempt
        item.type = void 0;
    }
}

/**
 * Performs reject/finish action on given item
 * @param instance {BulkArray} Current BulkArray instance
 * @param item {BaseModel} Model instance on which the action is performed
 * @param rejected {boolean} True for reject, false for finish
 * @param statusCode {number} Optional status code
 * @param message {string} Optional message
 * @param type {string} Optional error type
 */
function action(instance, item, rejected = true, statusCode = void 0, message = void 0, type = void 0) {
    const uuid = checkUuid(item);
    ensureRecorded(instance, uuid, item);
    const status = instance.__status;

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
    if (type) {
        status[uuid].type = type;
    }
}

/**
 * Paging metadata the search engine attaches to whatever array it returns - a BulkArray of instances as well as
 * the plain ES hits of a "source" search
 * Its "_lastPosition" cursor holds the sort values as parsed from the ES response - the Long sentinels ES uses for
 * a missing value are restored to their exact values only when the library sends the cursor back
 * @typedef {Object} SearchMetadata
 * @property {number=} _total Number of all the matching documents, unless "trackTotalHits" switched it off
 * @property {Record<string, import('@elastic/elasticsearch').estypes.AggregationsAggregate>=} aggregations ES aggregations of the search
 * @property {string=} pitId Point in Time ID, when the search ran through an explicit one
 * @property {Array<*>=} _lastPosition Sort values of the last item, to be passed back as the next "searchAfter"
 */

/**
 * Array of instances returned by a search, carrying the paging metadata
 * @template {BaseModel} T
 * @typedef {BulkArray<T> & SearchMetadata} SearchResult
 */

export default BulkArray;
