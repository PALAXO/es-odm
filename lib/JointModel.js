'use strict';

const _ = require(`lodash`);
const logger = require(`./logger`);
const nconf = require(`./config/config`);
const { esClient } = require(`./ElasticSearch`);
const BulkArray = require(`./BulkArray`);

const defaultConfiguration = {
    MAX_RESULTS: nconf.get(`es:maxResults`)
};

class JointModel  {
    constructor() {
        /**
         *
         * @type {{model: any, index:string, queries: Array<Object>, results: Array<any>}[]}
         */
        this.models = [];

        /**
         * @type {Array<Object>}
         */
        this.finalQuery = void 0;

        /**
         * @type {Array<string>}
         */
        this.finalIndex = void 0;
    }

    /**
     * Returns cloned model with rewritten search function. Every performed search is "recorded" to be used later.
     * @param {T | typeof BaseModel} OdmModel
     * @returns {T}
     */
    recordSearch(OdmModel) {
        if (_.isEmpty(OdmModel.__fullIndex) || !_.isString(OdmModel.__fullIndex)) {
            throw Error(`Model doesn't have specified index!`);
        } else if (OdmModel.__fullIndex.includes(`*`) || OdmModel.__fullIndex.includes(`?`)) {
            throw Error(`Model index cannot contain wildcards!`);
        }

        let modelObject = this.models.find((model) => {
            return model.index === OdmModel.__fullIndex;
        });
        if (!modelObject) {
            modelObject = {
                model: OdmModel,
                index: OdmModel.__fullIndex,
                queries: [],
                results: []
            };
            this.models.push(modelObject);
        }

        /**
         * @type {T | typeof BaseModel}
         */
        const clone = OdmModel.clone();
        clone.search = function(query) {
            modelObject.queries.push(query.query);
        };
        return clone;
    }

    /**
     * Runs search function with all recorded queries
     * @param aggs              {Object}                        Optional aggregations
     * @param from              {number}                        Start entry
     * @param size              {number}                        Number of entries
     * @param source            {String[] | boolean}            Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param explicitScroll    {string | number}               Specify number (>0) to return scrollId, or scrollId (string) to continue in search
     * @returns                 {Promise<BulkArray<BaseModel> | Object[]>}
     */
    async search(aggs = void 0, from = void 0, size = void 0, source = void 0, explicitScroll = void 0) {
        const partialQueries = [];
        for (const model of this.models) {  //Go through models
            if (_.isEmpty(model.queries)) {
                continue;
            }

            for (const query of model.queries) {    //Go through queries
                partialQueries.push({
                    bool: {
                        filter: [
                            {
                                term: {
                                    _index: model.index
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

        this.finalQuery = {
            query: {
                bool: {
                    should: partialQueries
                }
            },
            aggs: aggs
        };
        this.finalIndex = this.models.map((model) => model.index);

        return this._search(this.finalQuery, from, size, source, explicitScroll);
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

        //Logger stats
        let totalTime = 0;
        let totalSize = 0;
        let scrolls = 0;

        //Check if use scroll
        const isExplicitScroll = !!explicitScroll;
        const useScroll = ((from + size) > defaultConfiguration.MAX_RESULTS) || isExplicitScroll;
        const initScroll = isExplicitScroll && _.isString(explicitScroll);
        const myFrom = (useScroll) ? 0 : from;  //For scroll, do not specify real from, always start from 0
        const mySize = (useScroll) ? ((isExplicitScroll) ? Math.min(defaultConfiguration.MAX_RESULTS, size) : defaultConfiguration.MAX_RESULTS) : size;

        logger.info({
            action: `jointSearch`,
            type: `apiRequest`,
            index: this.finalIndex,
            parameters: {
                from: from, size: size, source: source, useScroll: useScroll, explicitScroll: explicitScroll
            },
            msg: `Searching for records.`
        });

        let esResult;
        if (initScroll) {
            //We have a scroll id -> use it
            esResult = await logger.measure(esClient, `scroll`, explicitScroll);
        } else {
            //Normal search
            esResult = await logger.measure(esClient, `search`, this.finalIndex, body, myFrom, mySize, useScroll, source, (isExplicitScroll) ? explicitScroll: void 0);
        }
        const result = esResult.result;
        totalTime += esResult.time;
        totalSize += parseInt(_.get(result, `headers['content-length']`, `0`), 10);

        //Set aggregations and total size
        let esResults = result;
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

                const model = this._getModel(result._index);
                if (_.isNil(source)) {  //Create instance
                    const constructor = model.model.clone();

                    const instance = new constructor(result._source, result._id, result._version, result.highlight,
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
                const { result, time } = await logger.measure(esClient, `scroll`, esResults.body._scroll_id);
                totalTime += time;
                totalSize += parseInt(_.get(result, `headers['content-length']`, `0`), 10);
                scrolls++;
                esResults = result;
            } else if (isExplicitScroll) {
                Object.defineProperty(returnArray, `scrollId`, {
                    value: esResults.body._scroll_id,
                    writable: true,
                    enumerable: false
                });
            }
        } while (!isExplicitScroll && useScroll && esResults.body.hits.hits.length > 0 && !full);

        logger.info({
            action: `jointSearch`,
            type: `apiResponse`,
            response: {
                took: totalTime,
                contentLength: totalSize,
                scrolls: scrolls
            },
            msg: `Records searched.`
        });

        //Clear scroll
        if (!isExplicitScroll && useScroll && !_.isEmpty(esResults.body._scroll_id)) {
            //Run it asynchronously
            this.clearScroll(esResults.body._scroll_id);
        }

        if (_.isNil(source)) {
            await this._afterSearch();
        }

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

        logger.debug({
            action: `clearScroll`,
            type: `apiRequest`,
            index: this.finalIndex,
            parameters: {
                scrollId: scrollId
            },
            msg: `Asynchronously clearing search scroll.`
        });

        try {
            const { result, time } = await logger.measure(esClient, `clearScroll`, scrollId);
            logger.debug({
                action: `clearScroll`,
                type: `apiResponse`,
                response: {
                    took: time,
                    contentLength: parseInt(_.get(result, `headers['content-length']`, `0`), 10)
                },
                msg: `Scroll cleared.`
            });
            return result.body.succeeded;

        } catch (e) {
            return false;
        }
    }

    /**
     * Returns correct model obejct for given index
     * @param index {string} Index
     * @returns {Object} Model object
     * @private
     */
    _getModel(index) {
        for (const model of this.models) {
            if (model.index === index) {
                return model;
            }
        }
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

module.exports = { JointModel };
