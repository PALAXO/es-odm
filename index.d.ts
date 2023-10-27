import BaseModel from "./lib/BaseModel";
import BulkArray from "./lib/BulkArray";
import JointModel from "./lib/JointModel";
import { esClient, setClient, esErrors } from "./lib/elasticsearch";
import { setLoggerConfig, setLoggerUidFunction } from "./lib/logger";

interface OdmConfiguration {
    warning: {
        downloadedMiB: string | number,
        searchCalls: string | number
    }
}

function createClass<T extends typeof BaseModel>(name: string, schema: any = Joi.object(), tenant: string = `*`): T;
type BaseModel = typeof BaseModel;
type BulkArray = typeof BulkArray;
type JointModel = typeof JointModel;

/**
 * Sets ODM configuration
 * @param configuration - new ODM configuration
 * - "warning.downloadedMiB" is number of MiB downloaded per single ODM API request. Once reached, it will log warning message.
 * - "warning.searchCalls" is number of internal ES search calls. Once reached, it will log warning message.
 */
function setConfiguration(configuration: OdmConfiguration) : void;

export {
    createClass,
    BaseModel, BulkArray, JointModel,
    esClient as esClient, setClient, esErrors as esErrors,
    setLoggerConfig, setLoggerUidFunction,
    setConfiguration
}
