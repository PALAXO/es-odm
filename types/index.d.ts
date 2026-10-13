import Joi from 'joi';
import BaseModel from './lib/BaseModel.js';
import JointModel from './lib/JointModel.js';
import BulkArray from './lib/BulkArray.js';
import { esClient, setClient, esErrors } from './lib/elasticsearch.js';
export type SearchResult<T extends BaseModel> = import('./lib/BulkArray.js').SearchResult<T>;
export type SearchMetadata = import('./lib/BulkArray.js').SearchMetadata;
export type SearchBody = import('./lib/BaseModel.js').SearchBody;
export type SearchAdditional = import('./lib/BaseModel.js').SearchAdditional;
export type CountBody = import('./lib/BaseModel.js').CountBody;
export type UpdateByQueryBody = import('./lib/BaseModel.js').UpdateByQueryBody;
export type DeleteByQueryBody = import('./lib/BaseModel.js').DeleteByQueryBody;
export type CreateIndexBody = import('./lib/BaseModel.js').CreateIndexBody;
export type PutMappingBody = import('./lib/BaseModel.js').PutMappingBody;
export type BulkItemStatus = import('./lib/BulkArray.js').BulkItemStatus;
export type BulkEsStatus = import('./lib/BulkArray.js').BulkEsStatus;
export type EsResponse = import('./lib/elasticsearch.js').EsResponse;
/**
 * @template {BaseModel} T
 * @typedef {import('./lib/BulkArray.js').SearchResult<T>} SearchResult
 */
/** @typedef {import('./lib/BulkArray.js').SearchMetadata} SearchMetadata */
/** @typedef {import('./lib/BaseModel.js').SearchBody} SearchBody */
/** @typedef {import('./lib/BaseModel.js').SearchAdditional} SearchAdditional */
/** @typedef {import('./lib/BaseModel.js').CountBody} CountBody */
/** @typedef {import('./lib/BaseModel.js').UpdateByQueryBody} UpdateByQueryBody */
/** @typedef {import('./lib/BaseModel.js').DeleteByQueryBody} DeleteByQueryBody */
/** @typedef {import('./lib/BaseModel.js').CreateIndexBody} CreateIndexBody */
/** @typedef {import('./lib/BaseModel.js').PutMappingBody} PutMappingBody */
/** @typedef {import('./lib/BulkArray.js').BulkItemStatus} BulkItemStatus */
/** @typedef {import('./lib/BulkArray.js').BulkEsStatus} BulkEsStatus */
/** @typedef {import('./lib/elasticsearch.js').EsResponse} EsResponse */
/**
 * Creates a new model class
 * @template {abstract new (...args: any) => BaseModel} [B=typeof BaseModel]
 * @param name          {string}            Base name of the index
 * @param schema        {Joi.Schema=}       Joi schema of the instances
 * @param tenant        {string=}           Tenant, a wildcard by default
 * @param Base          {B=}                Class to extend - BaseModel itself or a subclass of it, so that the models may share
 *                                          members of their own; the created class keeps its type
 * @returns             {B}                 New subclass of the given base class
 */
declare function createClass<B extends abstract new (...args: any) => BaseModel = typeof BaseModel>(name: string, schema?: Joi.Schema | undefined, tenant?: string | undefined, Base?: B | undefined): B;
/**
 * Sets ODM configuration
 * - "warning" holds the thresholds at or above which a single ODM call logs a warning, zero disables a threshold
 * - "retries" is the policy of repeating a call ES answered with 429: the call is repeated at most "maxRetries" times,
 *   waiting "100 * base ^ attempt" milliseconds before each attempt. Not to be confused with the "maxRetries" of
 *   "setClient", which the ES client applies to connection failures itself
 * @param configuration {{warning?: {downloadedMiB?: string | number, searchCalls?: string | number}, retries?: {base?: string | number, maxRetries?: string | number}}=}
 */
declare function setConfiguration(configuration?: {
    warning?: {
        downloadedMiB?: string | number;
        searchCalls?: string | number;
    };
    retries?: {
        base?: string | number;
        maxRetries?: string | number;
    };
} | undefined): void;
/**
 * Calls an arbitrary ES API through the library's client, with the standard 429 retry, logging and streamed-response handling
 * @param functionPath {string} Dot-separated path of the ES client API, e.g. "indices.stats" or "snapshot.create"
 * @param params {Record<string, any>=} API parameters
 * @param additional {{asStream?: boolean}=} "asStream" streams the response and parses it, bypassing the maximum string length
 * @returns {Promise<EsResponse>} Full ES response envelope
 */
declare function callEs(functionPath: string, params?: Record<string, any> | undefined, additional?: {
    asStream?: boolean;
} | undefined): Promise<EsResponse>;
/**
 * Sends given operations through the ES Bulk API, splitting the payload when it is too large
 * All operations must be of the same type, payload lines must directly follow their operation line
 * @param operations {NonNullable<import('@elastic/elasticsearch').estypes.BulkRequest['operations']>} Bulk API operations
 * @param refresh {boolean | string=} "refresh" parameter of the bulk API
 * @returns {Promise<import('@elastic/elasticsearch').estypes.BulkResponse>} ES bulk response
 */
declare function sendBulk(operations: NonNullable<import('@elastic/elasticsearch').estypes.BulkRequest['operations']>, refresh?: (boolean | string) | undefined): Promise<import('@elastic/elasticsearch').estypes.BulkResponse>;
export { createClass, BaseModel, BulkArray, JointModel, esClient, setClient, esErrors, setConfiguration, callEs, sendBulk };
export declare const setLoggerConfig: (config?: Record<string, any> | undefined) => void;
export declare const setLoggerUidFunction: (newUidFunction: Function) => void;
