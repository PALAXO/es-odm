import BulkArray from './BulkArray.js';
import type { SearchResult, SearchMetadata } from './BulkArray.js';
export type SearchBody = Omit<import('@elastic/elasticsearch').estypes.SearchRequest, 'index' | '_source' | 'seq_no_primary_term' | 'version' | 'pit' | 'track_scores' | 'scroll'>;
export type CountBody = Omit<import('@elastic/elasticsearch').estypes.CountRequest, 'index'>;
export type UpdateByQueryBody = Omit<import('@elastic/elasticsearch').estypes.UpdateByQueryRequest, 'index' | 'scroll_size' | 'refresh' | 'version' | 'slices' | 'wait_for_completion'>;
export type DeleteByQueryBody = Omit<import('@elastic/elasticsearch').estypes.DeleteByQueryRequest, 'index' | 'scroll_size' | 'refresh' | 'version' | 'slices' | 'wait_for_completion'>;
export type CreateIndexBody = Omit<import('@elastic/elasticsearch').estypes.IndicesCreateRequest, 'index'>;
export type PutMappingBody = Omit<import('@elastic/elasticsearch').estypes.IndicesPutMappingRequest, 'index'>;
export type SearchAdditional = {
    /**
     * Cache object passed to the "_afterSearch" function
     */
    cache?: Record<string, any> | undefined;
    /**
     * Passed to ES "_source" and controls the output of the function. If not specified, a BulkArray of instances is returned, otherwise a plain array of ES objects
     */
    source?: (boolean | Array<string>) | undefined;
    /**
     * Sort values of the last item, used for the "search_after" deep pagination
     */
    searchAfter?: Array<any> | undefined;
    /**
     * Point in Time ID. When specified it is used as an explicit PIT and it is not closed. Each call returns a single page - "size" capped at "es:maxResults", or "_getBulkSize()" hits without an explicit "size"
     */
    pitId?: string | undefined;
    /**
     * Point in Time keep alive in seconds
     */
    refresh?: number | undefined;
    /**
     * Controls whether the "_total" value of the result is populated. Defaults to true
     */
    trackTotalHits?: boolean | undefined;
    /**
     * Controls whether an explicit PIT without any specified "sort" gets an ascending "_shard_doc" sort; an implicit PIT injects it always. Defaults to true
     */
    autoPitSort?: boolean | undefined;
};
declare class BaseModel {
    /** ES id */
    _id: string | undefined;
    /** ES version */
    _version: number | undefined;
    /** ES highlight */
    _highlight: Record<string, Array<string>> | undefined;
    /** ES primary term */
    _primary_term: number | undefined;
    /** ES sequence number */
    _seq_no: number | undefined;
    /** ES score */
    _score: number | undefined;
    /** ES sort */
    _sort: Array<any> | undefined;
    /** Internal uuid */
    __uuid: string;
    /**
     * Joi schema
     * @type {import('joi').Schema}
     */
    static schema: import('joi').Schema;
    /**
     * Tenant, beginning of the index
     * @type {string}
     */
    static _tenant: string;
    /**
     * Base name of the index
     * @type {string}
     */
    static _name: string;
    /**
     * Should write operations specify "refresh: true"?
     * @type {boolean | string}
     */
    static _immediateRefresh: boolean | string;
    /**
     * Special array property, if exists it saves the "search" queries and disables the function
     * Internally used for JointModel "recordSearch"
     * @type {Array<Record<string, any>>}
     */
    static __recordSearch: Array<Record<string, any>>;
    /**
     * Creates new instance
     * @param data          {Record<string, any>=}  Object, from which the instance is constructed
     * @param _id           {string}                ES id
     * @param _version      {number | string}       ES version
     * @param _highlight    {Record<string, Array<string>>} ES highlight
     * @param _primary_term {number | string}       ES primary term
     * @param _seq_no       {number | string}       ES sequence number
     * @param _score        {number}                ES score
     * @param _sort         {Array<*>}              ES sort
     */
    constructor(data?: Record<string, any> | undefined, _id?: string, _version?: number | string, _highlight?: Record<string, Array<string>>, _primary_term?: number | string, _seq_no?: number | string, _score?: number, _sort?: Array<any>);
    /**
     * Returns alias - "<tenant>\_<name>"
     * @returns {string}
     */
    static get alias(): string;
    /**
     * Unique constructor identifier
     * @returns {string}
     */
    static get __constructorIdentifier(): string;
    /**
     * Indices a search of this class really touches - the whole alias, unlike a JointModel, which searches
     * only the indices of the models which recorded a query
     * @returns {string | Array<string>}
     */
    static get __searchedAlias(): string | Array<string>;
    static search<T extends abstract new (...args: any) => BaseModel>(this: T, body?: SearchBody | undefined, from?: number | undefined, size?: number | undefined, additional?: (Omit<SearchAdditional, 'source'> & {
        source?: undefined;
    }) | undefined): Promise<SearchResult<InstanceType<T>>>;
    static search(body?: SearchBody | undefined, from?: number | undefined, size?: number | undefined, additional?: (Omit<SearchAdditional, 'source'> & {
        source: (boolean | Array<string>);
    }) | undefined): Promise<Array<Record<string, any>> & SearchMetadata>;
    static search<T extends abstract new (...args: any) => BaseModel>(this: T, body?: SearchBody | undefined, from?: number | undefined, size?: number | undefined, additional?: SearchAdditional | undefined): Promise<SearchResult<InstanceType<T>> | (Array<Record<string, any>> & SearchMetadata)>;
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: undefined, pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>>}
     */
    /**
     * Returns iterator over bulks
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<Array<Record<string, any>> & SearchMetadata>}
     */
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>|(Array<Record<string, any>> & SearchMetadata)>} Union for a caller resolving "source" at runtime
     */
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>|(Array<Record<string, any>> & SearchMetadata)>}
     */
    static bulkIterator<T extends abstract new (...args: any) => BaseModel>(this: T, body?: SearchBody | undefined, additional?: {
        cache?: Record<string, any>;
        source?: undefined;
        pitId?: string;
        refresh?: number;
        trackTotalHits?: boolean;
    } | undefined): AsyncGenerator<SearchResult<InstanceType<T>>>;
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: undefined, pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>>}
     */
    /**
     * Returns iterator over bulks
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<Array<Record<string, any>> & SearchMetadata>}
     */
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>|(Array<Record<string, any>> & SearchMetadata)>} Union for a caller resolving "source" at runtime
     */
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>|(Array<Record<string, any>> & SearchMetadata)>}
     */
    static bulkIterator(body?: SearchBody | undefined, additional?: {
        cache?: Record<string, any>;
        source: (boolean | Array<string>);
        pitId?: string;
        refresh?: number;
        trackTotalHits?: boolean;
    } | undefined): AsyncGenerator<Array<Record<string, any>> & SearchMetadata>;
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: undefined, pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>>}
     */
    /**
     * Returns iterator over bulks
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<Array<Record<string, any>> & SearchMetadata>}
     */
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}=}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>|(Array<Record<string, any>> & SearchMetadata)>} Union for a caller resolving "source" at runtime
     */
    /**
     * Returns iterator over bulks
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}}    Additional data
     * @returns {AsyncGenerator<SearchResult<InstanceType<T>>|(Array<Record<string, any>> & SearchMetadata)>}
     */
    static bulkIterator<T extends abstract new (...args: any) => BaseModel>(this: T, body?: SearchBody | undefined, additional?: {
        cache?: Record<string, any>;
        source?: (boolean | Array<string>);
        pitId?: string;
        refresh?: number;
        trackTotalHits?: boolean;
    } | undefined): AsyncGenerator<SearchResult<InstanceType<T>> | (Array<Record<string, any>> & SearchMetadata)>;
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: undefined, pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>>}
     */
    /**
     * Returns iterator over documents
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source: (boolean|Array<string>), pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<Record<string, any>>}
     */
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>|Record<string, any>>} Union for a caller resolving "source" at runtime
     */
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>|Record<string, any>>}
     */
    static itemIterator<T extends abstract new (...args: any) => BaseModel>(this: T, body?: SearchBody | undefined, additional?: {
        cache?: Record<string, any>;
        source?: undefined;
        pitId?: string;
        refresh?: number;
    } | undefined): AsyncGenerator<InstanceType<T>>;
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: undefined, pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>>}
     */
    /**
     * Returns iterator over documents
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source: (boolean|Array<string>), pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<Record<string, any>>}
     */
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>|Record<string, any>>} Union for a caller resolving "source" at runtime
     */
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>|Record<string, any>>}
     */
    static itemIterator(body?: SearchBody | undefined, additional?: {
        cache?: Record<string, any>;
        source: (boolean | Array<string>);
        pitId?: string;
        refresh?: number;
    } | undefined): AsyncGenerator<Record<string, any>>;
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: undefined, pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>>}
     */
    /**
     * Returns iterator over documents
     * @overload
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source: (boolean|Array<string>), pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<Record<string, any>>}
     */
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @overload
     * @param this {T}
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}=}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>|Record<string, any>>} Union for a caller resolving "source" at runtime
     */
    /**
     * Returns iterator over documents
     * @template {abstract new (...args: any) => BaseModel} T
     * @this T
     * @param body          {SearchBody=}   Body object
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}}    Additional data
     * @returns {AsyncGenerator<InstanceType<T>|Record<string, any>>}
     */
    static itemIterator<T extends abstract new (...args: any) => BaseModel>(this: T, body?: SearchBody | undefined, additional?: {
        cache?: Record<string, any>;
        source?: (boolean | Array<string>);
        pitId?: string;
        refresh?: number;
    } | undefined): AsyncGenerator<InstanceType<T> | Record<string, any>>;
    static findAll<T extends abstract new (...args: any) => BaseModel>(this: T): Promise<SearchResult<InstanceType<T>>>;
    static findAll(source: Array<string> | boolean): Promise<Array<Record<string, any>> & SearchMetadata>;
    static findAll<T extends abstract new (...args: any) => BaseModel>(this: T, source?: (Array<string> | boolean) | undefined): Promise<SearchResult<InstanceType<T>> | (Array<Record<string, any>> & SearchMetadata)>;
    static find<T extends abstract new (...args: any) => BaseModel>(this: T, ids: string | Array<string>): Promise<SearchResult<InstanceType<T>>>;
    static find(ids: string | Array<string>, source: Array<string> | boolean): Promise<Array<Record<string, any>> & SearchMetadata>;
    static find<T extends abstract new (...args: any) => BaseModel>(this: T, ids: string | Array<string>, source?: (Array<string> | boolean) | undefined): Promise<SearchResult<InstanceType<T>> | (Array<Record<string, any>> & SearchMetadata)>;
    static get<T extends abstract new (...args: any) => BaseModel>(this: T, ids: string): Promise<InstanceType<T>>;
    static get<T extends abstract new (...args: any) => BaseModel>(this: T, ids: Array<string>): Promise<BulkArray<InstanceType<T>>>;
    static get<T extends abstract new (...args: any) => BaseModel>(this: T, ids: string | Array<string>): Promise<InstanceType<T> | BulkArray<InstanceType<T>>>;
    static head(ids: string): Promise<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>>>;
    static head(ids: Array<string>): Promise<Array<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>>>>;
    static head(ids: string | Array<string>): Promise<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>> | Array<import('@elastic/elasticsearch').estypes.GetGetResult<Record<string, any>>>>;
    /**
     * Deletes entries by given string or array of strings
     * @param ids           {string | Array<string>}    Id or Ids to be deleted
     * @param version       {number=}                   Version of document to be deleted
     * @returns             {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>}           ES response
     */
    static delete(ids: string | Array<string>, version?: number | undefined): Promise<import('@elastic/elasticsearch').estypes.BulkResponse>;
    static exists(ids: string): Promise<boolean>;
    static exists(ids: Array<string>): Promise<Array<boolean>>;
    static exists(ids: string | Array<string>): Promise<boolean | Array<boolean>>;
    /**
     * Partially updates given entries
     * @param ids               {string | Array<string>}    Id or Ids to be updated
     * @param body              {import('@elastic/elasticsearch').estypes.BulkUpdateAction}                    ES body with changes
     * @returns                 {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>}           ES response
     */
    static update(ids: string | Array<string>, body: import('@elastic/elasticsearch').estypes.BulkUpdateAction): Promise<import('@elastic/elasticsearch').estypes.BulkResponse>;
    /**
     * Returns number of entries in index
     * @param body  {CountBody=}           Body object
     * @returns     {Promise<number>}   ES response
     */
    static count(body?: CountBody | undefined): Promise<number>;
    /**
     * Partially updates entries
     * @param body              {UpdateByQueryBody}     ES body with query and changes
     * @param scrollSize        {number=}   Optional scroll size
     * @param waitForCompletion {boolean=}  Wait for completion
     * @returns     {Promise<import('@elastic/elasticsearch').estypes.UpdateByQueryResponse>}   ES response
     */
    static updateByQuery(body: UpdateByQueryBody, scrollSize?: number | undefined, waitForCompletion?: boolean | undefined): Promise<import('@elastic/elasticsearch').estypes.UpdateByQueryResponse>;
    /**
     * Deletes entries by query
     * @param body              {DeleteByQueryBody}    ES body with query
     * @param scrollSize        {number=}   Optional scroll size
     * @param waitForCompletion {boolean=}  Wait for completion
     * @returns     {Promise<import('@elastic/elasticsearch').estypes.DeleteByQueryResponse>}   ES response
     */
    static deleteByQuery(body: DeleteByQueryBody, scrollSize?: number | undefined, waitForCompletion?: boolean | undefined): Promise<import('@elastic/elasticsearch').estypes.DeleteByQueryResponse>;
    /**
     * Creates index
     * @param body      {CreateIndexBody=}        Optional settings
     * @param setAlias  {boolean=}      True (default) to automatically set an alias to newly created index
     * @returns     {Promise<string>}   New index name
     */
    static createIndex(body?: CreateIndexBody | undefined, setAlias?: boolean | undefined): Promise<string>;
    /**
     * Returns ES index of this ODM. Returns undefined when index doesn't exist.
     * @returns {Promise<string | void>} ES index
     */
    static getIndex(): Promise<string | void>;
    /**
     * Puts a write alias to ES index. Alias is specified by this ODM, index has to be specified.
     * @param index {string} Index to be aliased
     * @returns {Promise<void>}
     */
    static aliasIndex(index: string): Promise<void>;
    /**
     * Atomically moves the ODM alias to the given index. Alias is specified by this ODM, index has to be specified.
     * @param index {string} Index to be newly aliased
     * @param removeOriginalIndex {boolean=} True to atomically delete the originally aliased index as well
     * @returns {Promise<string | void>} Originally aliased index, if there was any
     */
    static swapAlias(index: string, removeOriginalIndex?: boolean | undefined): Promise<string | void>;
    /**
     * Deletes alias, throws if it doesn't exist. Doesn't touch underlying index
     * @returns {Promise<void>}
     */
    static deleteAlias(): Promise<void>;
    /**
     * Checks alias existence
     * @returns     {Promise<boolean>}   ES response
     */
    static aliasExists(): Promise<boolean>;
    /**
     * Checks index existence
     * @returns     {Promise<boolean>}   ES response
     */
    static indexExists(): Promise<boolean>;
    /**
     * Deletes index along with alias (if exists)
     * @returns     {Promise<void>}   ES response
     */
    static deleteIndex(): Promise<void>;
    /**
     * Gets mapping
     * @returns         {Promise<import('@elastic/elasticsearch').estypes.IndicesGetMappingResponse>}   ES response
     */
    static getMapping(): Promise<import('@elastic/elasticsearch').estypes.IndicesGetMappingResponse>;
    /**
     * Puts mapping
     * @param mapping   {PutMappingBody}            ES mapping
     * @returns         {Promise<import('@elastic/elasticsearch').estypes.IndicesPutMappingResponse>}   ES response
     */
    static putMapping(mapping: PutMappingBody): Promise<import('@elastic/elasticsearch').estypes.IndicesPutMappingResponse>;
    /**
     * Gets settings
     * @param includeDefaults   {boolean=}          Include default settings?
     * @returns                 {Promise<import('@elastic/elasticsearch').estypes.IndicesGetSettingsResponse>}   ES response
     */
    static getSettings(includeDefaults?: boolean | undefined): Promise<import('@elastic/elasticsearch').estypes.IndicesGetSettingsResponse>;
    /**
     * Puts settings
     * @param settings  {import('@elastic/elasticsearch').estypes.IndicesIndexSettings}            ES settings
     * @returns         {Promise<import('@elastic/elasticsearch').estypes.IndicesPutSettingsResponse>}   ES response
     */
    static putSettings(settings: import('@elastic/elasticsearch').estypes.IndicesIndexSettings): Promise<import('@elastic/elasticsearch').estypes.IndicesPutSettingsResponse>;
    /**
     * Reindex from current model into a new one
     * @param destinationModel  {typeof BaseModel | string}    Destination ODM / index
     * @param script            {string=}                   Script source
     * @param scrollSize        {number=}                   Optional scroll size
     * @param waitForCompletion {boolean=}                  Wait for completion
     * @returns                 {Promise<import('@elastic/elasticsearch').estypes.ReindexResponse>}           ES response
     */
    static reindex(destinationModel: typeof BaseModel | string, script?: string | undefined, scrollSize?: number | undefined, waitForCompletion?: boolean | undefined): Promise<import('@elastic/elasticsearch').estypes.ReindexResponse>;
    /**
     * Clones index into a new one. Preserves number of replicas. Input index has to be manually blocked for write (be made read-only).
     * @param settings {import('@elastic/elasticsearch').estypes.IndicesIndexSettings=}    Optional settings to use for the new index
     * @param targetIndex {string=} Optional target index
     * @returns {Promise<string>}   New index
     */
    static cloneIndex(settings?: import('@elastic/elasticsearch').estypes.IndicesIndexSettings | undefined, targetIndex?: string | undefined): Promise<string>;
    /**
     * Refreshed index.
     * @returns {Promise<import('@elastic/elasticsearch').estypes.IndicesRefreshResponse>} ES response
     */
    static refresh(): Promise<import('@elastic/elasticsearch').estypes.IndicesRefreshResponse>;
    /**
     * Opens Point in Time
     * @returns {Promise<string>}
     */
    static openPIT(): Promise<string>;
    /**
     * Closes Point in Time
     * @param id {string}
     * @returns {Promise<boolean>}
     */
    static closePIT(id: string): Promise<boolean>;
    /**
     * Returns the current state of the given task, e.g. of an asynchronously started "reindex" or "updateByQuery"
     * @param taskId {string} Task ID
     * @returns {Promise<import('@elastic/elasticsearch').estypes.TasksGetResponse>} ES response
     */
    static getTask(taskId: string): Promise<import('@elastic/elasticsearch').estypes.TasksGetResponse>;
    /**
     * Repeatedly checks the given task until it completes, e.g. an asynchronously started "reindex" or "updateByQuery"
     * @param taskId {string} Task ID
     * @param pollIntervalSeconds {number=} Interval between the completion checks
     * @param maxWaitSeconds {number=} When specified, the function throws instead of waiting for the task any longer
     * @returns {Promise<import('@elastic/elasticsearch').estypes.TasksGetResponse>} Completed task, its "response" property carries the operation result
     */
    static waitForTask(taskId: string, pollIntervalSeconds?: number | undefined, maxWaitSeconds?: number | undefined): Promise<import('@elastic/elasticsearch').estypes.TasksGetResponse>;
    /**
     * Saves document to database
     * @param useVersion    {boolean=}          If true, sends version to ES
     * @returns             {Promise<this>}
     */
    save(useVersion?: boolean | undefined): Promise<this>;
    /**
     * Reloads instance data from ES
     * @returns {Promise<void>}
     */
    reload(): Promise<void>;
    /**
     * Deletes instance from ES
     * @param useVersion    {boolean=}          If true, sends version to ES
     * @returns             {Promise<void>}
     */
    delete(useVersion?: boolean | undefined): Promise<void>;
    /**
     * Creates clone of this instance
     * @param preserveAttributes    {boolean=}  If true, non-enumerable attributes are preserved, except __uuid
     * @returns     {this}
     */
    clone(preserveAttributes?: boolean | undefined): this;
    /**
     * Runs joi validation on this instance
     * @returns {Promise<void>}
     */
    validate(): Promise<void>;
    /**
     * Clones class
     * May be used to rewrite some functions / properties
     * @template {abstract new (...args: any) => BaseModel} T
     * @this {T}
     * @param changes   {Record<string, any>=}   Changes to apply to cloned object
     * @returns         {T} Copy of this class, keeping the members of a subclass
     */
    static clone<T extends abstract new (...args: any) => BaseModel>(this: T, changes?: Record<string, any> | undefined): T;
    /**
     * Creates class copy with tenant specified
     * @template {abstract new (...args: any) => BaseModel} T
     * @this {T}
     * @param newTenant     {string}
     * @returns             {T} Copy of this class, keeping the members of a subclass
     */
    static in<T extends abstract new (...args: any) => BaseModel>(this: T, newTenant: string): T;
    /**
     * Creates class copy with immediate refresh specified
     * @template {abstract new (...args: any) => BaseModel} T
     * @this {T}
     * @param newImmediateRefresh   {boolean | string}
     * @returns                     {T} Copy of this class, keeping the members of a subclass
     */
    static immediateRefresh<T extends abstract new (...args: any) => BaseModel>(this: T, newImmediateRefresh: boolean | string): T;
    /**
     * Parses index or alias into parts.
     * @param index {string} Index (or alias) from ES
     * @returns {{tenant: string, name: string, alias: string}} Object with parsed index
     */
    static _parseIndex(index: string): {
        tenant: string;
        name: string;
        alias: string;
    };
    /**
     * Checks if model is fully specified
     * @param functionName {string} Name of calling function
     */
    static __checkIfFullySpecified(functionName: string): void;
    /**
     * Returns correct constructor for search function data
     * @param searchResult {import('@elastic/elasticsearch').estypes.SearchHit<Record<string, any>>} Single document found in ES
     * @param constructorCache {Record<string, typeof BaseModel>} Cache object
     * @returns {typeof BaseModel} Constructor to be used
     */
    static __getConstructor(searchResult: import('@elastic/elasticsearch').estypes.SearchHit<Record<string, any>>, constructorCache: Record<string, typeof BaseModel>): typeof BaseModel;
    /**
     * Alters search body
     * @param body {SearchBody}
     * @returns {SearchBody}
     */
    static _alterSearch(body: SearchBody): SearchBody;
    /**
     * Returns unpacked version of the data
     * Used when data are saved in another format than they are worked in
     * @param source {Record<string, any>}
     * @returns {Record<string, any>}
     */
    static _unpackData(source: Record<string, any>): Record<string, any>;
    /**
     * Return packed version of the data
     * Used when data are saved in another format than they are worked in
     * @param cache {Record<string, any>=} Object that serve as a cache across multiple packs, may not be presented
     * @returns {Promise<Record<string, any>>}
     */
    _packData(cache?: Record<string, any> | undefined): Promise<Record<string, any>>;
    /**
     * Function resolved after search / find / find all / get
     * @param instances {Array<BaseModel>} Array of newly created instances
     * @param cache {Record<string, any>=} Optional cache object from search function
     * @returns {Promise<void>}
     */
    static _afterSearch(instances: Array<BaseModel>, cache?: Record<string, any> | undefined): Promise<void>;
    /**
     * Returns best bulk size for the model. This size is used primarily for pagination
     * @returns {Promise<number>}
     */
    static _getBulkSize(): Promise<number>;
    /**
     * Generates new index string, doesn't create any index in ES
     * @returns {string}
     */
    static _generateIndex(): string;
}
export default BaseModel;
