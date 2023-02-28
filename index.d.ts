import BaseModel from "./lib/BaseModel";
import BulkArray from "./lib/BulkArray";
import JointModel from "./lib/JointModel";
import { esClient, setClient, esErrors } from "./lib/elasticsearch";
import { setLoggerConfig, setLoggerUidFunction } from "./lib/logger";

function createClass<T extends typeof BaseModel>(name: string, schema: any = Joi.object(), tenant: string = `*`): T;
type BaseModel = typeof BaseModel;
type BulkArray = typeof BulkArray;
type JointModel = typeof JointModel;

export {
    createClass,
    BaseModel, BulkArray, JointModel,
    esClient as esClient, setClient, esErrors as esErrors,
    setLoggerConfig, setLoggerUidFunction
}
