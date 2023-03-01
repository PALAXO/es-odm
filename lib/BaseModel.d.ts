import BulkArray, {SearchArray} from "./BulkArray";
import {
    BulkResponse,
    BulkUpdateAction,
    CountRequest,
    DeleteByQueryRequest,
    DeleteByQueryResponse,
    ExistsResponse,
    GetGetResult, Id, Ids,
    IndicesCreateRequest,
    IndicesExistsAliasResponse,
    IndicesExistsResponse,
    IndicesGetMappingResponse,
    IndicesGetSettingsResponse,
    IndicesPutMappingRequest,
    IndicesPutMappingResponse,
    IndicesPutSettingsRequest,
    IndicesPutSettingsResponse,
    IndicesRefreshResponse,
    ReindexResponse,
    SearchHit,
    SearchRequest,
    UpdateByQueryRequest,
    UpdateByQueryResponse
} from "@elastic/elasticsearch/lib/api/types";

export interface SimplifiedSearch extends Omit<SearchRequest, `index`|`_source`|`seq_no_primary_term`|`version`|`track_total_hits`|`scroll`|`search_after`|`pit`> {}
export interface SimplifiedUpdateByQuery extends Omit<UpdateByQueryRequest, `index`|`scroll_size`|`refresh`|`version`|`slices`|`wait_for_completion`> {}
export interface SimplifiedDeleteByQuery extends Omit<DeleteByQueryRequest, `index`|`scroll_size`|`refresh`|`version`|`slices`|`wait_for_completion`> {}
export interface SimplifiedIndicesCreate extends Omit<IndicesCreateRequest, `index`> {}
export interface SimplifiedIndicesPutMapping extends Omit<IndicesPutMappingRequest, `index`> {}
export interface SimplifiedIndicesPutSettings extends Omit<IndicesPutSettingsRequest, `index`> {}

/** Parsed index */
export interface ParsedIndex {
    /** Tenant part of the index/alias */
    tenant: string,
    /** Main part of the index/alias */
    name?: string
    /** Model alias */
    alias?: string
}

/** Search additional main base parameters */
export interface ModelItemIteratorAdditional {
    /** Cache object passed to "\_afterSearch" function. */
    cache?: Record<string, any>,
    /** refresh time in seconds used for scrolling or PIT. */
    refresh?: number
}

/** Search additional main base parameters without source */
export interface ModelItemIteratorAdditionalWithoutSource extends ModelItemIteratorAdditional {
    /** Passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned. */
    source: undefined | null
}

/** Search additional main base parameters with source */
export interface ModelItemIteratorAdditionalWithSource extends ModelItemIteratorAdditional {
    /** Passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned. */
    source: NonNullable<boolean | Array<string>>
}

/** Search additional main parameters */
export interface ModelBulkIteratorAdditional extends ModelItemIteratorAdditional  {
    /** Controls if "\_total" value in resulting field should be populated. Defaults to true, except for searchAfter or search with PIT where it defaults to false. */
    trackTotalHits?: boolean
}

/** Search additional main parameters without source */
export interface ModelBulkIteratorAdditionalWithoutSource extends ModelBulkIteratorAdditional {
    /** Passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned. */
    source: undefined | null
}

/** Search additional main parameters with source */
export interface ModelBulkIteratorAdditionalWithSource extends ModelBulkIteratorAdditional {
    /** Passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned. */
    source: NonNullable<boolean | Array<string>>
}

/** Search additional parameters */
export interface ModelSearchAdditional extends ModelBulkIteratorAdditional {
    /** Used for explicit scrolling. Specify "true" to initialize scrolling, or scroll ID to continue scrolling. */
    scrollId?: (string|boolean),
    /** Array with last item sort result, used for searchAfter deep pagination. */
    searchAfter?: Array<any>,
    /** Point in Time ID. */
    pitId?: string,
    /** Controls whether in case of PIT without any specified "sort" value should be descending "\_shard\_doc" sort automatically passed. Defaults to true. */
    autoPitSort?: boolean
}

/** Search additional parameters without source */
export interface ModelSearchAdditionalWithoutSource extends ModelSearchAdditional {
    /** Passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned. */
    source: undefined | null
}
/** Search additional parameters with source */
export interface ModelSearchAdditionalWithSource extends ModelSearchAdditional {
    /** Passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned. */
    source: NonNullable<boolean | Array<string>>
}

export default class BaseModel {
    /** Joi schema */
    static schema: any;
    /** Tenant */
    static _tenant: string = `*`;
    /** Index name */
    static _name: string;
    /** Type of ES refresh */
    static _immediateRefresh: boolean = true;
    /**
     * Special array property, if exists it saves the "search" queries and disables the function
     * Internally used for JointModel "recordSearch"
     */
    static __recordSearch: Array<{}> = undefined;

    /** ES id */
    _id?: string;

    /** ES version */
    _version?: number;

    /** ES highlight */
    _highlight?: string;

    /** ES primary term */
    _primary_term?: number;

    /** ES sequence number */
    _seq_no?: number;

    /** ES score */
    _score?: number;

    /** ES sort */
    _sort?: Array<any>;

    /** Internal uuid */
    __uuid?: string;

    /**
     * Creates new instance
     * @param data - Object, from which the instance is constructed
     * @param _id - ES id
     * @param _version - ES version
     * @param _highlight - ES highlight
     * @param _primary_term - ES primary term
     * @param _seq_no - ES sequence number
     * @param _score - ES score
     * @param _sort - ES sort
     */
    constructor(data?: Record<string, any> = {}, _id?: string = undefined, _version?: (number | string) = undefined, _highlight?: string = undefined, _primary_term?: (number | string) = undefined, _seq_no?: (number | string) = undefined, _score?: number = undefined, _sort?: Array<any> = undefined);

    /**
     * Returns alias - "<tenant>\_<name>"
     * @returns
     */
    static get alias(): string;

    /**
     * Performs ES search. Supports implicit scrolling, explicit scrolling, searchAfter and Point in Time.
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
    static search(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditional = undefined): Promise<BulkArray<InstanceType<this>>>;
    static search(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditionalWithoutSource = undefined): Promise<BulkArray<InstanceType<this>>>;
    static search(body?: SimplifiedSearch = {}, from?: number = undefined, size?: number = undefined, additional?: ModelSearchAdditionalWithSource = undefined): Promise<SearchArray<SearchHit<Record<string, any>>>>;

    /**
     * Clears ES scroll ID
     * @param scrollId - Scroll ID
     * @returns
     */
    static clearScroll(scrollId: Ids): Promise<boolean>;

    /**
     * Returns iterator over bulks
     * @param body - Body object
     * @param additional - Additional data
     * @returns
     */
    static bulkIterator(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditional = undefined): AsyncGenerator<BulkArray<InstanceType<this>>>;
    static bulkIterator(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditionalWithoutSource = undefined): AsyncGenerator<BulkArray<InstanceType<this>>>;
    static bulkIterator(body?: SimplifiedSearch = undefined, additional?: ModelBulkIteratorAdditionalWithSource = undefined): AsyncGenerator<SearchArray<SearchHit<Record<string, any>>>>;

    /**
     * Returns iterator over documents
     * @param body - Body object
     * @param additional - Additional data
     * @returns
     */
    static itemIterator(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditional = undefined): AsyncGenerator<InstanceType<this>>;
    static itemIterator(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditionalWithoutSource = undefined): AsyncGenerator<InstanceType<this>>;
    static itemIterator(body?: SimplifiedSearch = undefined, additional?: ModelItemIteratorAdditionalWithSource = undefined): AsyncGenerator<SearchHit<Record<string, any>>>;

    /**
     * Finds all entries
     * @param source - Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns
     */
    static findAll(source?: undefined | null = undefined): Promise<BulkArray<InstanceType<this>>>;
    static findAll(source?: boolean | Array<string> = undefined): Promise<SearchArray<SearchHit<Record<string, any>>>>;

    /**
     * Finds entries by given string or array of strings, uses search function
     * @param ids - Id or Ids to be found
     * @param source - Boolean or optional array with source fields -> if specified, function returns plain objects
     * @returns
     */
    static async find(ids: Array<string>, source?: undefined | null = undefined): Promise<BulkArray<InstanceType<this>>>;
    static async find(ids: Array<string>, source?: boolean | Array<string> = undefined): Promise<SearchArray<SearchHit<Record<string, any>>>>;

    /**
     * Gets entries by given string or array of strings
     * @param ids - Id or Ids to be found
     * @returns
     */
    static get(ids: string): Promise<InstanceType<this>>;
    static get(ids: Array<string>): Promise<BulkArray<InstanceType<this>>>;

    /**
     * Gets heads for given ID or array of IDs
     * @param ids - Id or Ids to be found
     * @returns
     */
    static head(ids: string): Promise<GetGetResult<undefined>>;
    static head(ids: Array<string>): Promise<Array<GetGetResult<undefined>>>;

    /**
     * Deletes entries by given string or array of strings
     * @param ids - Id or Ids to be deleted
     * @param version - Version of document to be deleted
     * @returns ES response
     */
    static delete(ids: string | Array<string>, version?: number = undefined): Promise<BulkResponse>;

    /**
     * Checks if entries exist
     * @param ids - Id or Ids to check
     * @returns Boolean or array of booleans indicating result
     */
    static exists(ids: string): Promise<ExistsResponse>;
    static exists(ids: Array<string>): Promise<Array<boolean>>;

    /**
     * Partially updates given entries
     * @param ids - Id or Ids to be updated
     * @param body - ES body with changes
     * @returns ES response
     */
    static update(ids: string | Array<string>, body: BulkUpdateAction<any, any>): Promise<BulkResponse>;

    /**
     * Returns number of entries in index
     * @param body - Body object
     * @returns ES response
     */
    static count(body?: CountRequest = undefined): Promise<number>;

    /**
     * Partially updates entries
     * @param body - ES body with query and changes
     * @param scrollSize - Optional scroll size
     * @param waitForCompletion - Wait for completion
     * @returns ES response
     */
    static updateByQuery(body: SimplifiedUpdateByQuery, scrollSize?: number = undefined, waitForCompletion?: boolean = true): Promise<UpdateByQueryResponse>;

    /**
     * Deletes entries by query
     * @param body - ES body with query
     * @param scrollSize - Optional scroll size
     * @param waitForCompletion - Wait for completion
     * @returns ES response
     */
    static deleteByQuery(body: SimplifiedDeleteByQuery, scrollSize?: number = undefined, waitForCompletion?: boolean = true): Promise<DeleteByQueryResponse>;

    /**
     * Creates index
     * @param body - Optional settings
     * @param setAlias - True (default) to automatically set an alias to newly created index
     * @returns New index name
     */
    static createIndex(body?: SimplifiedIndicesCreate = undefined, setAlias?: boolean = true): Promise<string>;

    /**
     * Returns ES index of this ODM. Returns undefined when index doesn't exist.
     * @returns - ES index
     */
    static getIndex(): Promise<string>;

    /**
     * Puts a write alias to ES index. Alias is specified by this ODM, index has to be specified.
     * @param index - Index to be aliased
     * @returns
     */
    static aliasIndex(index: string): Promise<void>;

    /**
     * Deletes alias, throws if it doesn't exist. Doesn't touch underlying index
     * @returns
     */
    static deleteAlias(): Promise<void>;

    /**
     * Checks alias existence
     * @returns ES response
     */
    static aliasExists(): Promise<IndicesExistsAliasResponse>;

    /**
     * Checks index existence
     * @returns ES response
     */
    static indexExists(): Promise<IndicesExistsResponse>;

    /**
     * Deletes index along with alias (if exists)
     * @returns ES response
     */
    static deleteIndex(): Promise<void>;

    /**
     * Gets mapping
     * @returns ES response
     */
    static getMapping(): Promise<IndicesGetMappingResponse>;

    /**
     * Puts mapping
     * @param mapping - ES mapping
     * @returns ES response
     */
    static putMapping(mapping: SimplifiedIndicesPutMapping): Promise<IndicesPutMappingResponse>;

    /**
     * Gets settings
     * @param includeDefaults - Include default settings?
     * @returns ES response
     */
    static getSettings(includeDefaults?: boolean = false): Promise<IndicesGetSettingsResponse>;

    /**
     * Puts settings
     * @param settings - ES settings
     * @returns ES response
     */
    static putSettings(settings: SimplifiedIndicesPutSettings): Promise<IndicesPutSettingsResponse>;

    /**
     * Reindex from current model into a new one
     * @param destinationModel - Destination ODM / index
     * @param script - Script source
     * @param scrollSize - Optional scroll size
     * @param waitForCompletion - Wait for completion
     * @returns ES response
     */
    static reindex(destinationModel: this | string, script?: string = undefined, scrollSize?: number = undefined, waitForCompletion?: boolean = true): Promise<ReindexResponse>;

    /**
     * Clones index into a new one. Preserves number of replicas. Input index has to be manually blocked for write (be made read-only).
     * @param settings - Optional settings to use for the new index
     * @returns New index
     */
    static cloneIndex(settings?: Record<string, any> = void 0): Promise<string>;

    /**
     * Refreshed index.
     * @returns ES response
     */
    static refresh(): Promise<IndicesRefreshResponse>;

    /**
     * Opens Point in Time
     * @returns
     */
    static openPIT(): Promise<Id>;

    /**
     * Closes Point in Time
     * @param id
     * @returns
     */
    static closePIT(id: Id): Promise<boolean>;

    /**
     * Saves document to database
     * @param useVersion - If true, sends version to ES
     * @returns
     */
    save(useVersion?: boolean = false): Promise<InstanceType<this>>;

    /**
     * Reloads instance data from ES
     * @returns
     */
    reload(): Promise<void>;

    /**
     * Deletes instance from ES
     * @param useVersion - If true, sends version to ES
     * @returns
     */
    delete(useVersion?: boolean = false): Promise<void>;

    /**
     * Creates clone of this instance
     * @param preserveAttributes - If true, non-enumerable attributes are preserved, except __uuid
     * @returns
     */
    clone(preserveAttributes?: boolean = true): InstanceType<this>;

    /**
     * Runs joi validation on this instance
     * @returns
     */
    validate(): Promise<void>;

    /**
     * Clones class
     * May be used to rewrite some functions / properties
     * @param changes - Changes to apply to cloned object
     * @returns
     */
    static clone(changes?: Record<string, any> = {}): this;

    /**
     * Creates class copy with tenant specified
     * @param newTenant
     * @returns
     */
    static in(newTenant: string): this;

    /**
     * Creates class copy with immediate refresh specified
     * @param newImmediateRefresh
     * @returns
     */
    static immediateRefresh(newImmediateRefresh: boolean | string): this;

    /**
     * Parses index or alias into parts.
     * @param index - Index (or alias) from ES
     * @returns Object with parsed index
     */
    static _parseIndex(index: string): ParsedIndex;

    /**
     * Checks if model is fully specified
     * @param functionName - Name of calling function
     */
    static __checkIfFullySpecified(functionName: string): void;

    /**
     * Returns correct constructor for search function data
     * @param searchResult - Single document found in ES
     * @param constructorCache - Cache object
     * @returns Constructor to be used
     */
    static __getConstructor(searchResult: SearchHit<Record<string, any>>, constructorCache: Record<string, any>): this;

    /**
     * Alters search body
     * @param body
     * @returns
     */
    static _alterSearch(body: Record<string, any>): Record<string, any>;

    /**
     * Returns unpacked version of the data
     * Used when data are saved in another format than they are worked in
     * @param source
     * @returns
     */
    static _unpackData(source: Record<string, any>): Record<string, any>;

    /**
     * Return packed version of the data
     * Used when data are saved in another format than they are worked in
     * @param cache - Object that serve as a cache across multiple packs, may not be presented
     * @returns
     */
    _packData(cache?: Record<string, any> = void 0): Promise<Record<string, any>>;

    /**
     * Function resolved after search / find / find all / get
     * @param instances - Array of newly created instances
     * @param cache - Optional cache object from search function
     * @returns
     */
    static _afterSearch(instances: BulkArray<InstanceType<this>>, cache?: Record<string, any> = void 0): Promise<void>;

    /**
     * Returns best bulk size for the model. This size is used for searching/scrolling/iterating
     * @returns
     */
    static _getBulkSize(): Promise<number>;
}

export {};
