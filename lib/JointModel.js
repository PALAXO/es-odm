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
     * Returns alias - "<tenant>\_<name>"
     * @returns {Array<string>}
     */
    get alias() {
        return this.models.map((model) => model.alias);
    }

    /**
     * Returns cloned model with rewritten search function. Every performed search is "recorded" to be used later.
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
     * Runs search function with all recorded queries
     * @param body              {Object}                                    Optional search body, query parameter will be replaced
     * @param from              {number}                                    Start entry
     * @param size              {number}                                    Number of entries
     * @param source            {String[] | boolean}                        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param explicitScroll    {string | number}                           Specify number (>0) to return scrollId, or scrollId (string) to continue in search
     * @param additional        {{cache: Object, scrollRefresh: number}}    Additional data - "cache" is used for "afterSearch" function, "scrollRefresh" is scroll refresh timeout
     * @returns                 {Promise<BulkArray<BaseModel> | Object[]>}
     */
    async search(body = {}, from = void 0, size = void 0, source = void 0, explicitScroll = void 0, additional = void 0) {
        if (!_.isObject(body)) {
            throw Error(`Incorrect body has been specified!`);
        }

        const myAction = new Action(`jointModelSearch`, this.alias);

        myAction.note(`Preparing queries for joint search.`);

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
        const returnArray = (_.isNil(source)) ? new BulkArray() : [];
        const parseResult = function (result) {
            const model = getModel(self.models, result._index);
            if (_.isNil(source)) {  //Create instance
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
        let defaultScrollSize = void 0;
        for (const model of this.models) {
            const modelBulkSize = await model.model._getBulkSize();
            if (!_.isFinite(defaultScrollSize) || ((_.isFinite(modelBulkSize)) && (modelBulkSize < defaultScrollSize))) {
                defaultScrollSize = modelBulkSize;
            }
        }

        await utils.search(this, myAction, parseResult, returnArray, defaultScrollSize,
            body, from, size, source, explicitScroll, additional);

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
        if (_.isEmpty(scrollId)) {
            throw Error(`scrollId must be specified!`);
        }

        const myAction = new Action(`jointModelClearScroll`, this.alias);
        const myResult = await myAction.clearScroll(scrollId);

        myAction.finish();

        return myResult;
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
     * @param cache {Object} Optional cache object from search function
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
