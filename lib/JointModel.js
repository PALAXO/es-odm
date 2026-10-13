import _ from 'lodash';
import Action from './Action.js';
import BulkArray from './BulkArray.js';
import logger from './logger.js';
import utils from './utils.js';

/** @import BaseModel from './BaseModel.js' */
/** @import { SearchBody, SearchAdditional } from './BaseModel.js' */
/** @import { SearchResult, SearchMetadata } from './BulkArray.js' */

/**
 * A model registered by "recordSearch", together with the queries its recording clone captured
 * @typedef {Object} RecordedModel
 * @property {typeof BaseModel} model Original model class
 * @property {string} identifier Constructor identifier of the model
 * @property {string} alias Alias of the model
 * @property {Array<Record<string, any>>} queries Recorded queries
 */

class JointModel {
    constructor() {
        logger.trace({
            action: `jointModelConstructor`,
            msg: `Creating new JointModel instance.`
        });

        /**
         * @type {Array<RecordedModel>}
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
     * Indices a search really touches - a model which recorded no query contributes no clause to the search,
     * so searching its index could only fail when the index does not exist
     * @returns {Array<string>}
     */
    get __searchedAlias() {
        const searched = this.__searchedModels;
        return searched.map((model) => model.alias);
    }

    /**
     * Models which recorded a query, or all of them when nothing is recorded yet
     * @returns {Array<RecordedModel>} Recorded models
     */
    get __searchedModels() {
        const searched = this.models.filter((model) => !_.isEmpty(model.queries));
        return (_.isEmpty(searched)) ? this.models : searched;
    }

    /**
     * Returns cloned model with altered search function. Every performed search is "recorded" to be used later; only "query" parameter from recorded search is used.
     * "search" of the returned class records the query and resolves to undefined; every function of it which would reach Elasticsearch throws.
     * @template T
     * @param OdmModel {T}
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
            return model.identifier === OdmModel.__constructorIdentifier;
        });
        if (modelObject && (modelObject.alias !== OdmModel.alias)) {
            throw new Error(`The ODM model constructor matches multiple index aliases!`);
        }

        const existingAliasModel = this.models.find((model) => {
            return model.alias === OdmModel.alias;
        });
        if (existingAliasModel && (existingAliasModel.identifier !== OdmModel.__constructorIdentifier)) {
            throw new Error(`The ODM model alias matches multiple index constructors!`);
        }

        if (!modelObject) {
            modelObject = {
                model: OdmModel,
                identifier: OdmModel.__constructorIdentifier,
                alias: OdmModel.alias,
                queries: []
            };
            this.models.push(modelObject);
        }

        return OdmModel.clone({
            __recordSearch: modelObject.queries
        });
    }

    /**
     * Runs search function with all recorded queries. Supports searchAfter and Point in Time.
     * @overload
     * @param body          {SearchBody=}    Body object
     * @param from          {number=}    Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size          {number=}    Number of returned entries or bulk size in case of explicit PIT
     * @param additional    {(Omit<SearchAdditional, 'source'> & {source?: undefined})=}    Additional data
     * - "autoPitSort" controls whether in case of explicit PIT without any specified "sort" value should be ascending "\_shard\_doc" sort automatically passed; an implicit PIT injects it always. Defaults to true.
     * @returns             {Promise<SearchResult<BaseModel>>} BulkArray of instances
     */
    /**
     * Runs search function with all recorded queries. Supports searchAfter and Point in Time.
     * @overload
     * @param body          {SearchBody=}    Body object
     * @param from          {number=}    Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size          {number=}    Number of returned entries or bulk size in case of explicit PIT
     * @param additional    {(Omit<SearchAdditional, 'source'> & {source: (boolean|Array<string>)})=}    Additional data
     * - "autoPitSort" controls whether in case of explicit PIT without any specified "sort" value should be ascending "\_shard\_doc" sort automatically passed; an implicit PIT injects it always. Defaults to true.
     * @returns             {Promise<Array<Record<string, any>> & SearchMetadata>} Array of plain ES objects
     */
    /**
     * Runs search function with all recorded queries. Supports searchAfter and Point in Time.
     * @overload
     * @param body          {SearchBody=}    Body object
     * @param from          {number=}    Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size          {number=}    Number of returned entries or bulk size in case of explicit PIT
     * @param additional    {SearchAdditional=}    Additional data
     * - "autoPitSort" controls whether in case of explicit PIT without any specified "sort" value should be ascending "\_shard\_doc" sort automatically passed; an implicit PIT injects it always. Defaults to true.
     * @returns             {Promise<SearchResult<BaseModel> | Array<Record<string, any>> & SearchMetadata>}
     */
    /**
     * Runs search function with all recorded queries. Supports searchAfter and Point in Time.
     * @param body          {SearchBody=}    Body object
     * @param from          {number=}    Start entry; cannot be used in case of explicit PIT or when searchAfter is specified
     * @param size          {number=}    Number of returned entries or bulk size in case of explicit PIT
     * @param additional    {SearchAdditional=}    Additional data
     * - "autoPitSort" controls whether in case of explicit PIT without any specified "sort" value should be ascending "\_shard\_doc" sort automatically passed; an implicit PIT injects it always. Defaults to true.
     * @returns                 {Promise<SearchResult<BaseModel> | Array<Record<string, any>> & SearchMetadata>}
     */
    async search(body = {}, from = void 0, size = void 0, additional = void 0) {
        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        const myAction = new Action(`jointModelSearch`, this.alias);

        //Shallow copy - only "query" below is replaced, the caller's body must stay untouched
        body = { ...body };

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
            if (_.isNil(additional?.source)) {  //Create instance
                const model = getModel(self.models, result._index);
                const Constructor = model.model;

                //push instance
                returnArray.push(new Constructor(Constructor._unpackData(result._source), result._id, result._version, result.highlight,
                    result._primary_term, result._seq_no, result._score, result.sort));

            } else {    //Just push
                returnArray.push(result);
            }
        };

        await utils.search(this, myAction, parseResult, returnArray, body, from, size, additional);

        myAction.finish({
            items: returnArray.length
        });

        return returnArray;
    }

    /**
     * Returns iterator over bulks
     * @param body          {SearchBody=}    Body object, query parameter is ignored
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number, trackTotalHits?: boolean}}    Additional data
     * @returns {AsyncGenerator<SearchResult<BaseModel>|(Array<Record<string, any>> & SearchMetadata)>}
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
     * @param body          {SearchBody=}   Body object, query parameter is ignored
     * @param additional    {{cache?: Record<string, any>, source?: (boolean|Array<string>), pitId?: string, refresh?: number}}    Additional data
     * @returns {AsyncGenerator<BaseModel|Record<string, any>>}
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
        });
    }

    /**
     * Opens Point in Time
     * @returns {Promise<string>}
     */
    async openPIT() {
        const myAction = new Action(`jointModelOpenPIT`, this.alias);

        const result = await myAction.callEs(`openPIT`, this.__searchedAlias);

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
     * @param cache {Record<string, any>=} Optional cache object from search function
     * @returns {Promise<void>}
     */
    async _afterSearch(instances, cache = void 0) {
        //Group instances of this search by their model
        const groups = new Map();
        for (const instance of instances) {
            const group = groups.get(instance.constructor);
            if (group) {
                group.push(instance);
            } else {
                groups.set(instance.constructor, [instance]);
            }
        }

        const promises = [];
        for (const [Constructor, myInstances] of groups) {
            promises.push(Constructor._afterSearch(myInstances, cache));
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
        for (const model of this.__searchedModels) {
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
 * @param models {Array<RecordedModel>} Models
 * @param index {string} Index
 * @returns {RecordedModel} Model object
 */
function getModel(models, index) {
    for (const model of models) {
        try {
            if (model.alias === model.model._parseIndex(index).alias) {
                return model;
            }
        } catch (e) {
            //A model whose "_parseIndex" refuses this index simply is not the one searched for
        }
    }

    throw Error(`Unable to match index '${index}' to any of the recorded models.`);
}

export default JointModel;
