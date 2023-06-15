import BaseModel, {
    ModelBulkIteratorAdditional,
    ModelBulkIteratorAdditionalWithoutSource,
    ModelBulkIteratorAdditionalWithSource,
    ModelSearchAdditional,
    ModelSearchAdditionalWithoutSource,
    ModelSearchAdditionalWithSource,
    ModelItemIteratorAdditional, ModelItemIteratorAdditionalWithoutSource, ModelItemIteratorAdditionalWithSource,
    SimplifiedSearch
} from "./BaseModel";
import BulkArray, {SearchArray} from "./BulkArray";
import {Id, Ids, QueryDslQueryContainer, SearchHit} from "@elastic/elasticsearch/lib/api/types";

export interface JointModelModel<T extends typeof BaseModel = typeof BaseModel> {
    model: T,
    alias: Array<string>,
    queries: Array<QueryDslQueryContainer>,
    results: Array<InstanceType<T> | SearchHit<Record<string, any>>>
}

export default class JointModel<T extends typeof BaseModel> {
    models: Array<JointModelModel<T>>;

    constructor();

    /**
     * Returns array of aliases
     * @returns
     */
    get alias(): Array<string>;

    /**
     * Returns cloned model with altered search function. Every performed search is "recorded" to be used later; only "query" parameter from recorded search is used.
     * @param OdmModel
     * @returns
     */
    recordSearch(OdmModel: T): T;

    /**
     * Runs search function with all recorded queries. Supports searchAfter and Point in Time.
     * @param body - Body object
     * @param from - Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size - Number of returned entries or bulk size in case of explicit PIT
     * @param additional - Additional data
     * - "cache" is cache object passed to "\_afterSearch" function.
     * - "source" is passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned.
     * - "searchAfter" is array with last item sort result, used for searchAfter deep pagination.
     * - "pitId" is Point in Time ID. When specified it will use it for explicit PIT and it will not be closed.
     * - "refresh" is refresh time in seconds used for PIT
     * - "trackTotalHits" controls if "\_total" value in resulting field should be populated. Defaults to true.
     * - "autoPitSort" controls whether in case of PIT without any specified "sort" value should be descending "\_shard\_doc" sort automatically passed. Defaults to true.
     * @returns
     */
    search(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditional = undefined): Promise<BulkArray<InstanceType<T>>>;
    search(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditionalWithoutSource = undefined): Promise<BulkArray<InstanceType<T>>>;
    search(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditionalWithSource = undefined): Promise<SearchArray<SearchHit<Record<string, any>>>>;

    /**
     * Returns iterator over bulks
     * @param body - Body object
     * @param additional - Additional data
     * @returns
     */
    bulkIterator(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditional = undefined): AsyncGenerator<BulkArray<InstanceType<T>>>;
    bulkIterator(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditionalWithoutSource = undefined): AsyncGenerator<BulkArray<InstanceType<T>>>;
    bulkIterator(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditionalWithSource = undefined): AsyncGenerator<SearchArray<SearchHit<Record<string, any>>>>;

    /**
     * Returns iterator over documents
     * @param body - Body object
     * @param additional - Additional data
     * @returns
     */
    itemIterator(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditional = undefined): AsyncGenerator<InstanceType<T>>;
    itemIterator(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditionalWithoutSource = undefined): AsyncGenerator<InstanceType<T>>;
    itemIterator(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditionalWithSource = undefined): AsyncGenerator<SearchHit<Record<string, any>>>;

    /**
     * Removes all recorded searches
     */
    clearSearch(): void;

    /**
     * Opens Point in Time
     * @returns
     */
    openPIT(): Promise<Id>;

    /**
     * Closes Point in Time
     * @param id
     * @returns
     */
    closePIT(id: Id): Promise<boolean>;

    /**
     * Calls correct "_afterSearch" functions for search results
     * @param instances - Array of newly created instances
     * @param cache - Optional cache object from search function
     * @returns
     */
    _afterSearch(instances: BulkArray<InstanceType<this>>, cache?: Record<string, any> = void 0): Promise<void>;

    /**
     * Returns best bulk size.
     * @returns
     */
    _getBulkSize(): Promise<number>;
}

export {};
