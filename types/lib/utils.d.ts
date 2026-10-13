import type BaseModel from './BaseModel.js';
import type BulkArray from './BulkArray.js';
import type MyAction from './Action.js';
export type JointModel = import('./JointModel.js').default;
declare const _default: {
    /**
     * Creates clone of given class
     * @template T
     * @param BaseClass     {T}
     * @param properties    {Object}
     * @returns             {T}
     */
    cloneClass<T>(BaseClass: T, properties?: any): T;
    /**
     * Performs ES search
     * @param self              {typeof BaseModel | JointModel}    this
     * @param myAction          {MyAction}                  Action object
     * @param parseResult       {function}                  Function to parse results
     * @param returnArray       {BulkArray | Array}         Result array
     * @param body              {Object}                    Body object
     * @param from              {number | string}           Start entry
     * @param size              {number | string}           Number of entries
     * @param additional        {Object}                    Additional data
     * @returns                 {Promise<void>}
     */
    search(self: typeof BaseModel | JointModel, myAction: MyAction, parseResult: Function, returnArray: BulkArray | any[], body: any, from: number | string, size: number | string, additional: any): Promise<void>;
    /**
     * Replaces data in first instance with data in the second one
     * @param myInstance {BaseModel}
     * @param newInstance {BaseModel}
     */
    reloadInstance(myInstance: BaseModel, newInstance: BaseModel): void;
    /**
     * Returns iterator over bulks
     * @param self          {typeof BaseModel | JointModel}  BaseModel class or JointModel instance
     * @param body          {Object=}       Body object
     * @param additional    {Object=}       Additional data
     * @returns {AsyncGenerator<BulkArray<BaseModel>|Array<Record<string, any>>>}
     */
    bulkIterator(self: typeof BaseModel | JointModel, body?: any | undefined, additional?: any | undefined): AsyncGenerator<BulkArray<BaseModel> | Array<Record<string, any>>>;
    /**
     * Returns iterator over single documents
     * @param self          {typeof BaseModel | JointModel}  BaseModel class or JointModel instance
     * @param body          {Object=}       Body object
     * @param additional    {Object=}       Additional data
     * @returns {AsyncGenerator<BaseModel|Record<string, any>>}
     */
    itemIterator(self: typeof BaseModel | JointModel, body?: any | undefined, additional?: any | undefined): AsyncGenerator<BaseModel | Record<string, any>>;
};
export default _default;
