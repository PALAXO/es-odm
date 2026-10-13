declare class MyAction {
    _uuid: string;
    alias: string | string[];
    action: string;
    time: [number, number];
    parameters: any;
    summary: {
        esCalls: number;
        contentLength: number;
        calculatedTook: number;
    };
    /**
     * @param action {string}
     * @param alias {string | Array<string>}
     */
    constructor(action: string, alias?: string | Array<string>);
    /**
     * Logs debug note
     * @param msg {string} Note message
     */
    note(msg: string): void;
    /**
     * Logs parameters
     * @param parameters {Object} API parameters
     */
    logParams(parameters?: any): void;
    /**
     * Logs API response
     * @param additionalData {Object} Log additional data
     */
    finish(additionalData?: any): void;
    /**
     * Calls ES API
     * @param functionName {string} ES API function name
     * @param args {*} ES API function arguments
     * @returns {Promise<*>} ES API function response
     */
    callEs(functionName: string, ...args: any): Promise<any>;
    /**
     * Closes Point in Time
     * @param id {string}
     * @returns {Promise<boolean>}
     */
    closePIT(id: string): Promise<boolean>;
    /**
     * Sends ES bulk request, handles "Request Entity Too Large" and "Invalid string length"
     * It is necessary for the bulk elements to be of the same type, eg. you cannot mix save and delete requests
     * @param bulkSave {Array<{}>}
     * @param refresh {boolean | string}
     * @param numberOfProcessed {number}
     * @param bulkSize {number}
     * @param responseCache {{took: number, errors: boolean, items: Array<Record<string, any>>}=} Merged response of the already sent chunks
     * @returns {Promise<{}>}
     */
    sendBulk(bulkSave: Array<{}>, refresh?: boolean | string, numberOfProcessed?: number, bulkSize?: number, responseCache?: {
        took: number;
        errors: boolean;
        items: Array<Record<string, any>>;
    } | undefined): Promise<{}>;
    /**
     * Returns promise that waits for given amount of time +- some drift
     * @param sleepTime {number} Sleep time
     * @returns {Promise<void>}
     */
    _sleep(sleepTime: number): Promise<void>;
}
export default MyAction;
