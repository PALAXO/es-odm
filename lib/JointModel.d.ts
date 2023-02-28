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
import {Id, Ids, SearchHit} from "@elastic/elasticsearch/lib/api/types";

export default class JointModel {
    models: BaseModel = [];

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
    recordSearch<T extends typeof BaseModel>(OdmModel: T): T;

    /**
     * Runs search function with all recorded queries. Supports implicit scrolling, explicit scrolling, searchAfter and Point in Time.
     * @param body - Body object; ignored when explicitly scrolling after the initial request
     * @param from - Start entry; cannot be used in case of explicit scrolling or when searchAfter is specified
     * @param size - Number of returned entries or bulk size in case of explicit scrolling; cannot be used when explicitly scrolling after the initial request
     * @param additional - Additional data
     * - "cache" is cache object passed to "\_afterSearch" function.
     * - "source" is passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned.
     * - "scrollId" is used for explicit scrolling. Specify "true" to initialize scrolling, or scroll ID to continue scrolling.
     * - "searchAfter" is array with last item sort result, used for searchAfter deep pagination.
     * - "pitId" is Point in Time ID.
     * - "refresh" is refresh time in seconds used for scrolling or PIT
     * - "trackTotalHits" controls if "\_total" value in resulting field should be populated. Defaults to true, except for searchAfter or search with PIT where it defaults to false.
     * - "autoPitSort" controls whether in case of PIT without any specified "sort" value should be descending "\_shard\_doc" sort automatically passed. Defaults to true.
     * @returns
     */
    search<T extends BaseModel>(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditional = undefined): Promise<BulkArray<T>>;
    search<T extends BaseModel>(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditionalWithoutSource = undefined): Promise<BulkArray<T>>;
    search(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditionalWithSource = undefined): Promise<SearchArray<SearchHit<Record<string, any>>>>;

    /**
     * Clears ES scroll ID
     * @param scrollId - Scroll ID
     * @returns
     */
    clearScroll(scrollId: Ids): Promise<boolean>;

    /**
     * Returns iterator over bulks
     * @param body - Body object
     * @param additional - Additional data
     * @returns
     */
    bulkIterator<T extends BaseModel>(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditional = undefined): AsyncIterator<BulkArray<T>>;
    bulkIterator<T extends BaseModel>(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditionalWithoutSource = undefined): AsyncIterator<BulkArray<T>>;
    bulkIterator(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditionalWithSource = undefined): AsyncIterator<SearchArray<SearchHit<Record<string, any>>>>;

    /**
     * Returns iterator over documents
     * @param body - Body object
     * @param additional - Additional data
     * @returns
     */
    itemIterator<T extends BaseModel>(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditional = undefined): AsyncIterator<T>;
    itemIterator<T extends BaseModel>(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditionalWithoutSource = undefined): AsyncIterator<T>;
    itemIterator(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditionalWithSource = undefined): AsyncIterator<SearchHit<Record<string, any>>>;

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
