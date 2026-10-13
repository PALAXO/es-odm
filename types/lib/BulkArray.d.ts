import type BaseModel from './BaseModel.js';
export type BulkItemStatus = {
    /**
     * Document ID, as known to the array - absent for an instance never saved to ES
     */
    id?: string | undefined;
    /**
     * Alias of the item
     */
    index?: string | undefined;
    /**
     * Status code of the last operation, rejection or finish
     */
    status?: number;
    /**
     * Message of the last operation, rejection or finish
     */
    message?: string;
    /**
     * Type of the failure
     */
    type?: string;
    /**
     * Processing state of the item
     */
    state: symbol;
    /**
     * Free-form payload of the item, see "payload()"
     */
    payload: Record<string, any>;
};
export type BulkEsStatus = {
    /**
     * Status records in their creation order - the failed ones only, unless "includeAll" is set
     */
    items: Array<Omit<BulkItemStatus, 'state'>>;
    /**
     * True when at least one item failed
     */
    errors: boolean;
    /**
     * Number of all the status records
     */
    count: number;
};
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
declare class BulkArray<T extends BaseModel = BaseModel> extends Array<T> {
    /** True or an ES refresh string to refresh the written indices right away; per array, as the items may come from several classes */
    _immediateRefresh: boolean | string;
    /** Status records of the items, keyed by their internal uuid */
    __status: Record<string, BulkItemStatus>;
    /** Items taken out of the processing set by "reject" */
    __rejected: Array<BaseModel>;
    /** Items taken out of the processing set by "finish" */
    __finished: Array<BaseModel>;
    constructor(...args: any[]);
    /**
     * Saves array items to ES
     * @param useVersion    {boolean=}          Sends versions to ES
     * @returns             {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>}   ES response
     */
    save(useVersion?: boolean | undefined): Promise<import('@elastic/elasticsearch').estypes.BulkResponse>;
    /**
     * Deletes array items from ES
     * @param useVersion    {boolean=}          Sends versions to ES
     * @returns             {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>}   ES response
     */
    delete(useVersion?: boolean | undefined): Promise<import('@elastic/elasticsearch').estypes.BulkResponse>;
    /**
     * Reloads whole array
     * @returns {Promise<void>}
     */
    reload(): Promise<void>;
    /**
     * Returns bulk status
     * @returns {Record<string, BulkItemStatus>} Status records keyed by the internal uuid of the item
     */
    get status(): Record<string, BulkItemStatus>;
    /**
     * Returns ES status, items are cloned
     * The records come in their creation order - the array items in the array order as of the first access touching
     * them, so a cleared item keeps its position, followed or preceded by the records written by "notFound" and
     * "importStatus" according to when those were created
     * @param includeAll {boolean=} Include even success messages
     * @returns {BulkEsStatus} ES format bulk status
     */
    esStatus(includeAll?: boolean | undefined): BulkEsStatus;
    /**
     * Adds item with given id/alias as not found
     * @param id {string}
     * @param alias {string=}
     */
    notFound(id: string, alias?: string | undefined): void;
    /**
     * Rejects item. Call clear() to remove it from array.
     * @param item {BaseModel} Item bo be rejected.
     * @param statusCodeOrError {(number|string|Error|Object)=} Status code OR message OR Error OR object of rejection
     * @param message {string=} Message of rejection
     * @param type {string=} Type of rejection
     */
    reject(item: BaseModel, statusCodeOrError?: (number | string | Error | any) | undefined, message?: string | undefined, type?: string | undefined): void;
    /**
     * Rejects all documents with current status code >= 400
     */
    rejectFailed(): void;
    /**
     * Finishes item. Call clear() to remove it from array.
     * @param item {BaseModel} Item to be finished
     * @param statusCode {number|string=} Status code or message
     * @param message {string=} Message
     */
    finish(item: BaseModel, statusCode?: (number | string) | undefined, message?: string | undefined): void;
    /**
     * Returns payload object of item.
     * @param item {BaseModel} Item with payload we want
     * @returns {Record<string, any>} Item payload
     */
    payload(item: BaseModel): Record<string, any>;
    /**
     *  Removes rejected/finished elements from this array.
     *  Use after calling reject/finish while out of cycle.
     */
    clear(): void;
    /**
     * Imports bulk status from other BulkArrays
     * Entries which not exist in foreign arrays remain intact
     * @param bulkArrays {...BulkArray<*>}
     */
    importStatus(...bulkArrays: BulkArray<any>[]): void;
}
export type SearchMetadata = {
    /**
     * Number of all the matching documents, unless "trackTotalHits" switched it off
     */
    _total?: number | undefined;
    /**
     * ES aggregations of the search
     */
    aggregations?: Record<string, import('@elastic/elasticsearch').estypes.AggregationsAggregate> | undefined;
    /**
     * Point in Time ID, when the search ran through an explicit one
     */
    pitId?: string | undefined;
    /**
     * Sort values of the last item, to be passed back as the next "searchAfter"
     */
    _lastPosition?: Array<any> | undefined;
};
export type SearchResult<T extends BaseModel> = BulkArray<T> & SearchMetadata;
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
