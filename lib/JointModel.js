'use strict';

const _ = require(`lodash`);
const Action = require(`./Action`);
const BulkArray = require(`./BulkArray`);
const logger = require(`./logger`);
const utils = require(`./utils`);

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
    }

    /**
     * Returns array of aliases
     * @returns {Array<string>}
     */
    get alias() {
        return this.models.map((model) => model.alias);
    }

    /**
     * Returns cloned model with altered search function. Every performed search is "recorded" to be used later; only "query" parameter from recorded search is used.
     * @template T
     * @param {T} OdmModel
     * @returns {T}
     */
    recordSearch(OdmModel) {
        OdmModel.__checkIfFullySpecified(`recordSearch`);

        logger.debug({
            action: `jointModelRecordSearch`,
            alias: OdmModel.alias,
            msg: `Creating new recording model.`
        });

        let modelObject = this.models.find((model) => {
            return model.alias === OdmModel.alias;
        });
        if (!modelObject) {
            modelObject = {
                model: OdmModel,
                alias: OdmModel.alias,
                queries: [],
                results: []
            };
            this.models.push(modelObject);
        }

        return OdmModel.clone({
            __recordSearch: modelObject.queries
        });
    }

    /**
     * Runs search function with all recorded queries. Supports implicit scrolling, explicit scrolling, searchAfter and Point in Time.
     * @param body          {Object=}    Body object; ignored when explicitly scrolling after the initial request
     * @param from          {number=}    Start entry; cannot be used in case of explicit scrolling or when searchAfter is specified
     * @param size          {number=}    Number of returned entries or bulk size in case of explicit scrolling; cannot be used when explicitly scrolling after the initial request
     * @param additional    {{cache: Object=, source: (boolean|Array<string>)=, scrollId: (string|boolean)=, searchAfter: Array<*>=, pitId: string=, refresh: number=, trackTotalHits: boolean=, autoPitSort: boolean=}}    Additional data
     * - "cache" is cache object passed to "\_afterSearch" function.
     * - "source" is passed to ES "_source" and controls output of this function. If not specified BulkArray with BaseModel instances is returned. Otherwise normal array with plain ES objects is returned.
     * - "scrollId" is used for explicit scrolling. Specify "true" to initialize scrolling, or scroll ID to continue scrolling.
     * - "searchAfter" is array with last item sort result, used for searchAfter deep pagination.
     * - "pitId" is Point in Time ID.
     * - "refresh" is refresh time in seconds used for scrolling or PIT
     * - "trackTotalHits" controls if "\_total" value in resulting field should be populated. Defaults to true, except for searchAfter or search with PIT where it defaults to false.
     * - "autoPitSort" controls whether in case of PIT without any specified "sort" value should be descending "\_shard\_doc" sort automatically passed. Defaults to true.
     * @returns                 {Promise<BulkArray<BaseModel> | Object[]>}
     */
    async search(body = {}, from = void 0, size = void 0, additional = void 0) {
        if ((_.isEmpty(additional?.scrollId) || !_.isString(additional?.scrollId)) && (_.isNil(body) || !_.isObject(body))) {
            throw Error(`Body must be an object!`);
        }

        const myAction = new Action(`jointModelSearch`, this.alias);
        body = _.cloneDeep(body);

        myAction.note(`Preparing queries for joint search.`);
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
                            (_.isNil(query)) ? { match_all : {} } : query
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

        const self = this;
        const returnArray = (_.isNil(additional?.source)) ? new BulkArray() : [];
        const parseResult = function (result) {
            const model = getModel(self.models, result._index);
            if (_.isNil(additional?.source)) {  //Create instance
                const Constructor = model.model;

                const instance = new Constructor(Constructor._unpackData(result._source), result._id, result._version, result.highlight,
                    result._primary_term, result._seq_no, result._score, result.sort);

                //push instance
                returnArray.push(instance);
                model.results.push(instance);

            } else {    //Just push
                returnArray.push(result);
                model.results.push(result);
            }
        };

        await utils.search(this, myAction, parseResult, returnArray, body, from, size, additional);

        myAction.finish({
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
        if (_.isNil(scrollId)) {
            throw Error(`scrollId must be specified!`);
        }

        const myAction = new Action(`jointModelClearScroll`, this.alias);
        const myResult = await myAction.clearScroll(scrollId);

        myAction.finish();

        return myResult;
    }

    /**
     * Returns iterator over bulks
     * @param body          {Object=}    Body object, query parameter is ignored
     * @param additional    {{cache: Object=, source: (boolean|Array<string>)=, refresh: number=, trackTotalHits: boolean=}}    Additional data
     * @returns {AsyncGenerator<BulkArray<BaseModel>|Array<Object>>}
     */
    bulkIterator(body = void 0, additional = void 0) {
        logger.info({
            action: `bulkIterator`,
            alias: this.alias,
            type: `redirect`,
            msg: `Iterating documents by bulks -> calling search functions.`
        });

        return utils.bulkIterator(this, body, additional);
    }

    /**
     * Returns iterator over documents
     * @param body          {Object=}   Body object, query parameter is ignored
     * @param additional    {{cache: Object=, source: (boolean|Array<string>)=, refresh: number=}}    Additional data
     * @returns {AsyncGenerator<BaseModel|Object>}
     */
    itemIterator(body = void 0, additional = void 0) {
        logger.info({
            action: `itemIterator`,
            alias: this.alias,
            type: `redirect`,
            msg: `Iterating documents by items -> calling search functions.`
        });

        return utils.itemIterator(this, body, additional);
    }

    /**
     * Removes all recorded searches
     */
    clearSearch() {
        this.models.forEach((model) => {
            model.queries.length = 0;
            model.results.length = 0;
        });
    }

    /**
     * Opens Point in Time
     * @returns {Promise<string>}
     */
    async openPIT() {
        const myAction = new Action(`jointModelOpenPIT`, this.alias);

        const result = await myAction.callEs(`openPIT`, this.alias);

        myAction.finish();
        return result.body.id;
    }

    /**
     * Closes Point in Time
     * @param id {string}
     * @returns {Promise<boolean>}
     */
    async closePIT(id) {
        if (_.isEmpty(id)) {
            throw Error(`PIT ID must be specified!`);
        }

        const myAction = new Action(`jointModelClosePIT`, this.alias);
        const myResult = await myAction.closePIT(id);

        myAction.finish();
        return myResult;
    }

    /**
     * Calls correct "_afterSearch" functions for search results
     * @param instances {Array<*>} Array of newly created instances
     * @param cache {Object=} Optional cache object from search function
     * @returns {Promise<void>}
     */
    async _afterSearch(instances, cache = void 0) {
        const promises = [];
        for (const model of this.models) {
            if (!_.isEmpty(model.results)) {
                promises.push(model.model._afterSearch(model.results, cache));
            }
        }

        await Promise.all(promises);
    }

    /**
     * Returns best bulk size.
     * @returns {Promise<number>}
     */
    async _getBulkSize() {
        if (_.isEmpty(this.models)) {
            throw Error(`There are no models in JointModel instance.`);
        }

        let bulkSize = void 0;
        for (const model of this.models) {
            const modelBulkSize = await model.model._getBulkSize();
            if (_.isNil(bulkSize) || (modelBulkSize < bulkSize)) {
                bulkSize = modelBulkSize;
            }
        }
        return bulkSize;
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

module.exports = JointModel;
