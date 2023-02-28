import {AggregateName, AggregationsAggregate, BulkResponse} from "@elastic/elasticsearch/lib/api/types";
import BaseModel from "./BaseModel";

/** Exportable item status */
export interface BulkArrayStatusItemExternal {
    /** Document alias (or index) */
    index: string,
    /** Document ID */
    id: string,
    /** Document status */
    status: number,
    /** Document logged message */
    message: string,
    /** Document payload */
    payload: Object
}

/** Internal status item */
export interface BulkArrayStatusItemInternal extends BulkArrayStatusItemExternal {
    /** Document state */
    state: Symbol
}

/** Internal object with statuses */
export type BulkArrayStatusInternal = Record<string, BulkArrayStatusItemInternal>;

/** Exportable item status */
export interface BulkArrayStatusExternal {
    /** Item statuses */
    items: Array<BulkArrayStatusItemExternal>,
    /** Have there been any errors? */
    errors: boolean,
    /** Number of items */
    count: number
}

export class SearchArray<T> extends Array<T> {
    /** ES aggregations */
    aggregations?: Record<AggregateName, AggregationsAggregate>;

    /** ES total hits */
    _total?: number;

    /** ES "pit_id", if applicable */
    pitId?: string;

    /** ES "_scroll_id", if applicable */
    scrollId?: string;

    /** ES "sort" value of the last item, if applicable */
    _lastPosition?: Array<any>;
}

export default class BulkArray<T extends BaseModel = BaseModel> extends SearchArray<T> {
    /** Value passed into ES as "refresh" parameter */
    _immediateRefresh: boolean | string;

    /** Object with array item statuses */
    __status: BulkArrayStatusInternal;

    /** Array with rejected items */
    __rejected: Array<T>;

    /** Array with finished items */
    __finished: Array<T>;

    constructor(...args?: Array<T>);

    /**
     * Saves array items to ES
     * @param useVersion - Sends versions to ES
     * @returns ES response
     */
    save(useVersion?: boolean = false): Promise<BulkResponse>;

    /**
     * Deletes array items from ES
     * @param useVersion - Sends versions to ES
     * @returns ES response
     */
    delete(useVersion?: boolean = false): Promise<BulkResponse>;

    /**
     * Reloads whole array
     * @returns
     */
    reload(): Promise<void>;

    /**
     * Returns bulk status
     * @returns
     */
    get status(): BulkArrayStatusInternal;

    /**
     * Returns ES status, items are cloned
     * @param includeAll - Include even success messages
     * @returns ES format bulk statuses
     */
    esStatus(includeAll?: boolean = false): BulkArrayStatusExternal;

    /**
     * Adds item with given id/alias as not found
     * @param id
     * @param alias
     */
    notFound(id:String, alias?: string = void 0): void;

    /**
     * Rejects item. Call clear() to remove it from array.
     * @param item - Item bo be rejected.
     * @param statusCode - Status code of rejection
     * @param message - Message of rejection
     */
    reject(item: T, statusCode?: number = 400, message?: string = void 0): void;

    /**
     * Rejects all documents with current status code >= 400
     */
    rejectFailed(): void;

    /**
     * Finishes item. Call clear() to remove it from array.
     * @param item - Item to be finished
     * @param statusCode - Status code
     * @param message - Message
     */
    finish(item: T, statusCode?: number = 200, message?: string = void 0): void;

    /**
     * Returns payload object of item.
     * @param item - Item with payload we want
     * @returns Item payload
     */
    payload(item: T): Object;

    /**
     *  Removes rejected/finished elements from this array.
     *  Use after calling reject/finish while out of cycle.
     */
    clear(): void;

    /**
     * Imports bulk status from other BulkArrays
     * Entries which not exist in foreign arrays remain intact
     * @param bulkArrays
     */
    importStatus(...bulkArrays: Array<BulkArray<T>>): void;

    [n: number]: T;
};

export {};
