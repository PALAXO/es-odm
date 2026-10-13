import type BaseModel from './BaseModel.js';
import type { SearchBody, SearchAdditional } from './BaseModel.js';
import type { SearchResult, SearchMetadata } from './BulkArray.js';
export type RecordedModel = {
    /**
     * Original model class
     */
    model: typeof BaseModel;
    /**
     * Constructor identifier of the model
     */
    identifier: string;
    /**
     * Alias of the model
     */
    alias: string;
    /**
     * Recorded queries
     */
    queries: Array<Record<string, any>>;
};
/** @import BaseModel from './BaseModel.js' */
/** @import { SearchBody, SearchAdditional } from './BaseModel.js' */
/** @import { SearchResult, SearchMetadata } from './BulkArray.js' */
/**
 * A model registered by "recordSearch", together with the queries its recording clone captured
 * @typedef {Object} RecordedModel
 * @property {typeof BaseModel} model Original model class
 * @property {string} identifier Constructor identifier of the model
 * @property {string} alias Alias of the model
 * @property {Array<Record<string, any>>} queries Recorded queries
 */
declare class JointModel {
    /**
     * @type {Array<RecordedModel>}
     */
    models: Array<RecordedModel>;
    constructor();
    /**
     * Returns array of aliases
     * @returns {Array<string>}
     */
    get alias(): Array<string>;
    /**
     * Indices a search really touches - a model which recorded no query contributes no clause to the search,
     * so searching its index could only fail when the index does not exist
     * @returns {Array<string>}
     */
    get __searchedAlias(): Array<string>;
    /**
     * Models which recorded a query, or all of them when nothing is recorded yet
     * @returns {Array<RecordedModel>} Recorded models
     */
    get __searchedModels(): Array<RecordedModel>;
    /**
     * Returns cloned model with altered search function. Every performed search is "recorded" to be used later; only "query" parameter from recorded search is used.
     * "search" of the returned class records the query and resolves to undefined; every function of it which would reach Elasticsearch throws.
     * @template T
     * @param OdmModel {T}
     * @returns {T}
     */
    recordSearch<T>(OdmModel: T): T;
    search(body?: SearchBody | undefined, from?: number | undefined, size?: number | undefined, additional?: (Omit<SearchAdditional, 'source'> & {
        source?: undefined;
    }) | undefined): Promise<SearchResult<BaseModel>>;
    search(body?: SearchBody | undefined, from?: number | undefined, size?: number | undefined, additional?: (Omit<SearchAdditional, 'source'> & {
        source: (boolean | Array<string>);
    }) | undefined): Promise<Array<Record<string, any>> & SearchMetadata>;
    search(body?: SearchBody | undefined, from?: number | undefined, size?: number | undefined, additional?: SearchAdditional | undefined): Promise<SearchResult<BaseModel> | (Array<Record<string, any>> & SearchMetadata)>;
    /**
     * Returns iterator over bulks
     * @param body          {SearchBody=}    Body object, query parameter is ignored
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}}    Additional data
     * @returns {AsyncGenerator<SearchResult<BaseModel>|(Array<Record<string, any>> & SearchMetadata)>}
     */
    bulkIterator(body?: SearchBody | undefined, additional?: {
        cache?: Record<string, any>;
        source?: (boolean | Array<string>);
        pitId?: string;
        refresh?: number;
        trackTotalHits?: boolean;
    }): AsyncGenerator<SearchResult<BaseModel> | (Array<Record<string, any>> & SearchMetadata)>;
    /**
     * Returns iterator over documents
     * @param body          {SearchBody=}   Body object, query parameter is ignored
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}}    Additional data
     * @returns {AsyncGenerator<BaseModel|Record<string, any>>}
     */
    itemIterator(body?: SearchBody | undefined, additional?: {
        cache?: Record<string, any>;
        source?: (boolean | Array<string>);
        pitId?: string;
        refresh?: number;
    }): AsyncGenerator<BaseModel | Record<string, any>>;
    /**
     * Removes all recorded searches
     */
    clearSearch(): void;
    /**
     * Opens Point in Time
     * @returns {Promise<string>}
     */
    openPIT(): Promise<string>;
    /**
     * Closes Point in Time
     * @param id {string}
     * @returns {Promise<boolean>}
     */
    closePIT(id: string): Promise<boolean>;
    /**
     * Calls correct "_afterSearch" functions for search results
     * @param instances {Array<*>} Array of newly created instances
     * @param cache {Record<string, any>=} Optional cache object from search function
     * @returns {Promise<void>}
     */
    _afterSearch(instances: Array<any>, cache?: Record<string, any> | undefined): Promise<void>;
    /**
     * Returns best bulk size.
     * @returns {Promise<number>}
     */
    _getBulkSize(): Promise<number>;
}
export default JointModel;
