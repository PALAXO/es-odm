'use strict';

const _ = require(`lodash`);
const logger = require(`./logger`);
const nconf = require(`./config/config`);
const { esClient, esErrors } = require(`./ElasticSearch`);
const BulkArray = require(`./BulkArray`);

const defaultConfiguration = {
    MAX_RESULTS: nconf.get(`es:maxResults`)
};

class JointModel  {
    constructor() {
        logger.trace({
            action: `jointModelConstructor`,
            msg: `Creating new JointModel instance.`
        });

        /**
         * @type {Array<*>}
         */
        this.models = [];

        /**
         * @type {Array<string>}
         */
        this.finalAlias = void 0;
    }

    /**
     * Returns cloned model with rewritten search function. Every performed search is "recorded" to be used later.
     * @template T
     * @param {T} OdmModel
     * @returns {T}
     */
    recordSearch(OdmModel) {
        if (_.isEmpty(OdmModel?._alias) || !_.isString(OdmModel._alias)) {
            throw Error(`Model doesn't have specified alias!`);
        } else if (OdmModel._alias.includes(`*`) || OdmModel._alias.includes(`?`)) {
            throw Error(`Model alias cannot contain wildcards!`);
        }

        logger.debug({
            action: `jointModelRecordSearch`,
            alias: OdmModel._alias,
            msg: `Creating new recording model.`
        });

        let modelObject = this.models.find((model) => {
            return model.alias === OdmModel._alias;
        });
        if (!modelObject) {
            modelObject = {
                model: OdmModel,
                alias: OdmModel._alias,
                queries: [],
                results: []
            };
            this.models.push(modelObject);
        }

        const clone = OdmModel.clone();
        clone.search = function(query) {
            modelObject.queries.push(query.query);
        };
        return clone;
    }

    /**
     * Runs search function with all recorded queries
     * @param body              {Object}                        Optional search body, query parameter will be replaced
     * @param from              {number}                        Start entry
     * @param size              {number}                        Number of entries
     * @param source            {String[] | boolean}            Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param explicitScroll    {string | number}               Specify number (>0) to return scrollId, or scrollId (string) to continue in search
     * @returns                 {Promise<BulkArray<BaseModel> | Object[]>}
     */
    async search(body = {}, from = void 0, size = void 0, source = void 0, explicitScroll = void 0) {
        if (!_.isObject(body)) {
            throw Error(`Incorrect body has been specified!`);
        }

        logger.info({
            action: `jointModelSearch`,
            msg: `Preparing queries for joint search.`
        });

        body = _.cloneDeep(body);

        const partialQueries = [];
        for (const model of this.models) {  //Go through models
            if (_.isEmpty(model.queries)) {
                continue;
            }

            for (const query of model.queries) {    //Go through queries
                partialQueries.push({
                    bool: {
                        must: [
                            {
                                term: {
                                    _index: model.alias
                                }
                            },
                            query
                        ]
                    }
                });
            }
        }

        if (_.isEmpty(partialQueries)) {
            throw Error(`No search has been recorded!`);
        }

        body.query = {
            bool: {
                should: partialQueries
            }
        };
        this.finalAlias = this.models.map((model) => model.alias);

        return this._search(body, from, size, source, explicitScroll);
    }

    /**
     * Performs ES search
     * @param body              {Object}                        Body object
     * @param from              {number}                        Start entry
     * @param size              {number}                        Number of entries
     * @param source            {String[] | boolean}            Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param explicitScroll    {string | number}               Specify number (>0) to return scrollId, or scrollId (string) to continue in search
     * @returns                 {Promise<BulkArray<BaseModel> | Object[]>}
     */
    async _search(body, from = void 0, size = void 0, source = void 0, explicitScroll = void 0) {
        if ((_.isEmpty(explicitScroll) || !_.isString(explicitScroll)) && (_.isNil(body) || (!_.isObject(body) && !_.isString(body)))) {
            throw Error(`Body must be an object!`);
        }

        const myLog = logger.createLogger(esClient, `jointModelInternalSearch`, this.finalAlias);

        //Set correct from and size
        if (typeof from === `string`) {
            from = parseInt(from, 10);
        }
        if (typeof size === `string`) {
            size = parseInt(size, 10);
        }

        if (_.isFinite(from)) {
            if (from < 0) {
                throw Error(`From can't be lower than zero!`);
            } else {
                //OK
            }
        } else {
            if (!_.isEmpty(body) && _.isFinite(body.from)) {
                if (body.from < 0) {
                    throw Error(`From in body can't be lower than zero!`);
                } else {
                    from = body.from;
                }
            } else {
                from = 0;
            }
        }

        if (_.isFinite(size)) {
            if (size < 0) {
                throw Error(`Size can't be lower than zero!`);
            } else {
                //OK
            }
        } else {
            if (!_.isEmpty(body) && _.isFinite(body.size)) {
                if (body.size < 0) {
                    throw Error(`Size in body can't be lower than zero!`);
                } else {
                    size = body.size;
                }
            } else {
                size = Number.MAX_SAFE_INTEGER - from;
            }
        }

        const returnArray = (_.isNil(source)) ? new BulkArray() : [];

        //Check if use scroll
        const isExplicitScroll = !!explicitScroll;
        const useScroll = ((from + size) > defaultConfiguration.MAX_RESULTS) || isExplicitScroll;
        const initScroll = isExplicitScroll && _.isString(explicitScroll);
        const myFrom = (useScroll) ? 0 : from;  //For scroll, do not specify real from, always start from 0
        const mySize = (useScroll) ? ((isExplicitScroll) ? Math.min(defaultConfiguration.MAX_RESULTS, size) : defaultConfiguration.MAX_RESULTS) : size;

        myLog.logApiRequest({
            from: from, size: size, source: source, useScroll: useScroll, explicitScroll: explicitScroll
        }, `Searching for records.`);

        let esResults;
        if (initScroll) {
            //We have a scroll id -> use it
            esResults = await myLog.callEsApi(`scroll`, explicitScroll);
        } else {
            //Normal search
            esResults = await myLog.callEsApi(`search`, this.finalAlias, body, myFrom, mySize, useScroll, source, (isExplicitScroll) ? explicitScroll: void 0);
        }

        if (!_.isEmpty(esResults?.body?._shards?.failures)) {
            throw new esErrors.ResponseError({ body: esResults.body._shards.failures });
        }

        if (esResults.body.aggregations) {
            Object.defineProperty(returnArray, `aggregations`, {
                value: esResults.body.aggregations,
                writable: true,
                enumerable: false
            });
        }
        if (_.isNil(source)) {
            returnArray._total = esResults.body.hits.total.value;
        }

        let counter = 0;
        let full = false;
        do {
            //Start index for current results
            const startIndex = (useScroll) ? Math.min(esResults.body.hits.hits.length, Math.max(0, from - counter)) : 0;
            //Counter of read records including 'from' (from + size)
            counter += (useScroll) ? startIndex : from;

            //Iterate over results
            for (let i = startIndex; (i < esResults.body.hits.hits.length) && (counter < from + size); i++) {
                const result = esResults.body.hits.hits[i];

                const model = getModel(this.models, result._index);
                if (_.isNil(source)) {  //Create instance
                    const Constructor = model.model;

                    const instance = new Constructor(result._source, result._id, result._version, result.highlight,
                        result._primary_term, result._seq_no, result._score);

                    //push instance
                    returnArray.push(instance);
                    model.results.push(instance);

                } else {    //Just push
                    returnArray.push(result);
                    model.results.push(result);
                }

                //Increase counter, check if break
                counter++;
                if (counter >= from + size) {
                    full = true;
                    break;
                }
            }

            //Check if perform scroll request
            if (!isExplicitScroll && useScroll && esResults.body.hits.hits.length > 0 && !full) {
                esResults = await myLog.callEsApi(`scroll`, esResults.body._scroll_id);
            } else if (isExplicitScroll) {
                Object.defineProperty(returnArray, `scrollId`, {
                    value: esResults.body._scroll_id,
                    writable: true,
                    enumerable: false
                });
            }
        } while (!isExplicitScroll && useScroll && esResults.body.hits.hits.length > 0 && !full);

        //Clear scroll
        if (!isExplicitScroll && useScroll && !_.isEmpty(esResults.body._scroll_id)) {
            //Run it asynchronously
            myLog.note(`Calling clearScroll asynchronously.`);
            this.clearScroll(esResults.body._scroll_id);
        }

        if (_.isNil(source)) {
            myLog.note(`Calling _afterSearch function.`);
            await this._afterSearch();
        }

        myLog.logApiResponse( `Records searched.`, {
            items: returnArray.length
        });

        return returnArray;
    }

    /**
     * Clears ES scroll ID
     * @param scrollId          {string}    Scroll ID
     * @returns {Promise<boolean>}
     */
    async clearScroll(scrollId) {
        if (_.isEmpty(scrollId)) {
            throw Error(`scrollId must be specified!`);
        }

        const myLog = logger.createLogger(esClient, `jointModelClearScroll`, this.finalAlias);

        myLog.logApiRequest({
            scrollId: scrollId
        }, `Clearing search scroll.`);

        let myResult;
        try {
            const result = await myLog.callEsApi(`clearScroll`, scrollId);
            myResult = result.body.succeeded;

        } catch (e) {
            myResult = false;
        }

        myLog.logApiResponse(`Finished scroll clearing`);

        return myResult;
    }

    /**
     * Calls correct "_afterSearch" functions for search results
     * @returns {Promise<void>}
     * @private
     */
    async _afterSearch() {
        const promises = [];
        for (const model of this.models) {
            if (!_.isEmpty(model.results)) {
                promises.push(model.model._afterSearch(model.results));
            }
        }

        await Promise.all(promises);
    }
}

/**
 * Returns correct model object for given index
 * @param models {Array<*>} Models
 * @param index {string} Index
 * @returns {Object} Model object
 */
function getModel(models, index) {
    for (const model of models) {
        try {
            if (model.alias === model.model._parseIndex(index).alias) {
                return model;
            }
        } catch (e) {
            //OK
        }
    }
}

module.exports = { JointModel };
