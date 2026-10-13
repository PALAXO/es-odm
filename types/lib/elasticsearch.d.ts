import { Client, errors } from '@elastic/elasticsearch';
export type EsResponse = {
    /**
     * Response body, already parsed
     */
    body: any;
    /**
     * HTTP status code of the response
     */
    statusCode: number;
    /**
     * Response headers
     */
    headers: Record<string, any>;
    /**
     * ES client metadata of the call
     */
    meta: any;
};
/**
 * Full ES response envelope, as returned by every wrapper of this module
 * @typedef {Object} EsResponse
 * @property {*} body Response body, already parsed
 * @property {number} statusCode HTTP status code of the response
 * @property {Record<string, any>} headers Response headers
 * @property {Object} meta ES client metadata of the call
 */
declare class Elasticsearch {
    client: Client;
    /** @type {number} */
    pitTimeoutSeconds: number;
    constructor();
    /**
     * Indexes given document
     * @param index        {string} Index or alias to write into
     * @param document     {Object} Document data
     * @param id           {string=} Document ID
     * @param primary_term {number | string=} "if_primary_term" of the optimistic concurrency control
     * @param seq_no       {number | string=} "if_seq_no" of the optimistic concurrency control
     * @param refresh      {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    index(index: string, document: any, id?: string | undefined, primary_term?: (number | string) | undefined, seq_no?: (number | string) | undefined, refresh?: (boolean | string) | undefined): Promise<EsResponse>;
    /**
     * Updates all the documents matching given query
     * @param index             {string | Array<string>} Index, alias or their list
     * @param body              {Object} ES body with the query and the script
     * @param scrollSize        {number} Scroll size
     * @param waitForCompletion {boolean=} False to return a task ID instead of awaiting the result
     * @param refresh           {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    updateByQuery(index: string | Array<string>, body: any, scrollSize: number, waitForCompletion?: boolean | undefined, refresh?: (boolean | string) | undefined): Promise<EsResponse>;
    /**
     * Deletes given document
     * @param index        {string} Index or alias to delete from
     * @param id           {string} Document ID
     * @param primary_term {number | string=} "if_primary_term" of the optimistic concurrency control
     * @param seq_no       {number | string=} "if_seq_no" of the optimistic concurrency control
     * @param refresh      {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    delete(index: string, id: string, primary_term?: (number | string) | undefined, seq_no?: (number | string) | undefined, refresh?: (boolean | string) | undefined): Promise<EsResponse>;
    /**
     * Deletes all the documents matching given query
     * @param index             {string | Array<string>} Index, alias or their list
     * @param body              {Object} ES body with the query
     * @param scrollSize        {number} Scroll size
     * @param waitForCompletion {boolean=} False to return a task ID instead of awaiting the result
     * @param refresh           {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    deleteByQuery(index: string | Array<string>, body: any, scrollSize: number, waitForCompletion?: boolean | undefined, refresh?: (boolean | string) | undefined): Promise<EsResponse>;
    /**
     * Searches for documents
     * @param index          {string | Array<string>} Index, alias or their list; undefined when a PIT is used
     * @param body           {Object} ES body with the query
     * @param from           {number} Start entry
     * @param size           {number} Number of entries
     * @param source         {boolean | Array<string>=} ES "_source" parameter
     * @param trackTotalHits {boolean=} ES "track_total_hits" parameter
     * @param searchAfter    {Array<*>=} Sort values of the last entry of the previous page
     * @param pointInTime    {string=} Point in Time ID
     * @param refresh        {number=} Point in Time keep alive in seconds
     * @returns {Promise<EsResponse>} ES response
     */
    search(index: string | Array<string>, body: any, from: number, size: number, source?: (boolean | Array<string>) | undefined, trackTotalHits?: boolean | undefined, searchAfter?: Array<any> | undefined, pointInTime?: string | undefined, refresh?: number | undefined): Promise<EsResponse>;
    /**
     * Returns documents of given IDs
     * @param index  {string} Index or alias
     * @param ids    {Array<string>} Document IDs
     * @param source {boolean | Array<string>=} ES "_source" parameter
     * @returns {Promise<EsResponse>} ES response
     */
    mget(index: string, ids: Array<string>, source?: (boolean | Array<string>) | undefined): Promise<EsResponse>;
    /**
     * Checks whether given document exists
     * @param index {string} Index or alias
     * @param id    {string} Document ID
     * @returns {Promise<EsResponse>} ES response
     */
    exists(index: string, id: string): Promise<EsResponse>;
    /**
     * Counts the documents matching given query
     * @param index {string | Array<string>} Index, alias or their list
     * @param body  {Object=} ES body with the query
     * @returns {Promise<EsResponse>} ES response
     */
    count(index: string | Array<string>, body?: any | undefined): Promise<EsResponse>;
    /**
     * Sends given operations through the Bulk API
     * @param operations {Array<Object>} Bulk API operations
     * @param refresh    {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    bulk(operations: Array<any>, refresh?: (boolean | string) | undefined): Promise<EsResponse>;
    /**
     * Creates given index
     * @param index {string} Index to be created
     * @param body  {Object=} ES body with the settings and the mappings
     * @returns {Promise<EsResponse>} ES response
     */
    createIndex(index: string, body?: any | undefined): Promise<EsResponse>;
    /**
     * Deletes given index
     * @param index {string} Index to be deleted
     * @returns {Promise<EsResponse>} ES response
     */
    deleteIndex(index: string): Promise<EsResponse>;
    /**
     * Checks whether given index exists
     * @param index {string} Index to be checked
     * @returns {Promise<EsResponse>} ES response
     */
    existsIndex(index: string): Promise<EsResponse>;
    /**
     * Returns the indices given alias points to
     * @param alias {string} Alias to be resolved
     * @returns {Promise<EsResponse>} ES response
     */
    getIndicesFromAlias(alias: string): Promise<EsResponse>;
    /**
     * Checks whether given alias exists
     * @param alias {string} Alias to be checked
     * @returns {Promise<EsResponse>} ES response
     */
    existsAlias(alias: string): Promise<EsResponse>;
    /**
     * Puts given write alias to given index
     * @param index {string} Index to be aliased
     * @param alias {string} Alias to be created
     * @returns {Promise<EsResponse>} ES response
     */
    putAlias(index: string, alias: string): Promise<EsResponse>;
    /**
     * Deletes given alias
     * @param index {string} Aliased index
     * @param alias {string} Alias to be deleted
     * @returns {Promise<EsResponse>} ES response
     */
    deleteAlias(index: string, alias: string): Promise<EsResponse>;
    /**
     * Refreshes given indices
     * @param index {string | Array<string>} Index, alias or their list
     * @returns {Promise<EsResponse>} ES response
     */
    refresh(index: string | Array<string>): Promise<EsResponse>;
    /**
     * Returns the mappings of given indices
     * @param index {string | Array<string>} Index, alias or their list
     * @returns {Promise<EsResponse>} ES response
     */
    getMapping(index: string | Array<string>): Promise<EsResponse>;
    /**
     * Puts given mapping to given indices
     * @param index   {string | Array<string>} Index, alias or their list
     * @param mapping {Object} ES mapping
     * @returns {Promise<EsResponse>} ES response
     */
    putMapping(index: string | Array<string>, mapping: any): Promise<EsResponse>;
    /**
     * Returns the settings of given indices
     * @param index           {string | Array<string>} Index, alias or their list
     * @param includeDefaults {boolean=} True to include the ES defaults
     * @returns {Promise<EsResponse>} ES response
     */
    getSettings(index: string | Array<string>, includeDefaults?: boolean | undefined): Promise<EsResponse>;
    /**
     * Puts given settings to given indices
     * @param index    {string | Array<string>} Index, alias or their list
     * @param settings {Object} ES settings
     * @returns {Promise<EsResponse>} ES response
     */
    putSettings(index: string | Array<string>, settings: any): Promise<EsResponse>;
    /**
     * Reindexes documents from one index into another
     * @param source            {Object} ES reindex source
     * @param dest              {Object} ES reindex destination
     * @param script            {Object=} ES script altering the reindexed documents
     * @param waitForCompletion {boolean=} False to return a task ID instead of awaiting the result
     * @param refresh           {boolean | string=} "refresh" parameter of the API
     * @returns {Promise<EsResponse>} ES response
     */
    reindex(source: any, dest: any, script?: any | undefined, waitForCompletion?: boolean | undefined, refresh?: (boolean | string) | undefined): Promise<EsResponse>;
    /**
     * Clones given index into a new one
     * @param source   {string} Index to be cloned
     * @param target   {string} New index
     * @param settings {Object=} ES settings of the new index
     * @returns {Promise<EsResponse>} ES response
     */
    clone(source: string, target: string, settings?: any | undefined): Promise<EsResponse>;
    /**
     * Performs given alias actions atomically
     * @param actions {Array<Object>} ES alias actions performed atomically
     * @returns {Promise<EsResponse>} ES response
     */
    updateAliases(actions: Array<any>): Promise<EsResponse>;
    /**
     * Returns the current state of given task
     * @param taskId {string} Task ID
     * @returns {Promise<EsResponse>} ES response
     */
    getTask(taskId: string): Promise<EsResponse>;
    /**
     * Calls an arbitrary ES client API given by its dot-separated path, e.g. "indices.stats" or "snapshot.create"
     * @param functionPath {string} Dot-separated path of the client API
     * @param params {Object=} API parameters
     * @param additional {{asStream?: boolean}=} "asStream" streams the response and parses it, bypassing the maximum string length
     * @returns {Promise<EsResponse>} ES response
     */
    call(functionPath: string, params?: any | undefined, additional?: {
        asStream?: boolean;
    } | undefined): Promise<EsResponse>;
    /**
     * Opens Point in Time
     * @param index     {string | Array<string>} Index, alias or their list
     * @param keepAlive {number=} Point in Time keep alive in seconds
     * @returns {Promise<EsResponse>} ES response
     */
    openPIT(index: string | Array<string>, keepAlive?: number | undefined): Promise<EsResponse>;
    /**
     * Closes Point in Time
     * @param id {string} Point in Time ID
     * @returns {Promise<EsResponse>} ES response
     */
    closePIT(id: string): Promise<EsResponse>;
}
declare const esClient: Elasticsearch;
/**
 * Sets new ES client instance
 * @param options {string | Array<string> | Record<string, any>}
 * @param additional {{ pitTimeoutSeconds?: number, requestTimeoutSeconds?: number, pingTimeoutSeconds?: number, maxRetries?: number }}
 */
declare function setClient(options: string | Array<string> | Record<string, any>, additional?: {
    pitTimeoutSeconds?: number;
    requestTimeoutSeconds?: number;
    pingTimeoutSeconds?: number;
    maxRetries?: number;
}): void;
export { esClient, setClient, errors as esErrors };
