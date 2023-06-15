'use strict';

const _ = require(`lodash`);
const { errors } = require(`@elastic/elasticsearch`);
const nconf = require(`./config/config`);
const MAX_RESULTS = nconf.get(`es:maxResults`);

module.exports = {
    /**
     * Creates clone of given class
     * @template T
     * @param BaseClass     {T}
     * @param properties    {Object}
     * @returns             {T}
     */
    cloneClass(BaseClass, properties = void 0) {
        const NewClass = class extends BaseClass {};
        if (!_.isNil(properties)) {
            Object.entries(properties).forEach(([key, value]) => {
                NewClass[key] = value;
            });
        }

        //Cosmetic
        Object.defineProperty(NewClass, `name`, {
            value: NewClass.alias,
            writable: false,
            enumerable: false
        });

        return NewClass;
    },

    /**
     * Performs ES search
     * @param self              {BaseModel | JointModel}    this
     * @param myAction          {MyAction}                  Action object
     * @param parseResult       {function}                  Function to parse results
     * @param returnArray       {BulkArray | Array}         Result array
     * @param body              {Object}                    Body object
     * @param from              {number | string}           Start entry
     * @param size              {number | string}           Number of entries
     * @param additional        {Object}                    Additional data
     * @returns                 {Promise<void>}
     */
    async search(self, myAction, parseResult, returnArray, body, from, size, additional) {
        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        //Set correct from and size
        if (_.isString(from)) {
            from = parseInt(from, 10);
        }
        if (_.isString(size)) {
            size = parseInt(size, 10);
        }

        if (_.isFinite(from)) {
            if (from < 0) {
                throw Error(`From can't be lower than zero!`);
            } else {
                //OK
            }
        } else {
            let bodyFrom;
            if (!_.isNil(body?.from)) {
                if (_.isFinite(body.from)) {
                    bodyFrom = body.from;
                } else if (_.isString(body.from)) {
                    bodyFrom = parseInt(body.from, 10);
                }
            }

            if (!_.isNil(bodyFrom)) {
                if (bodyFrom < 0) {
                    throw Error(`From in body can't be lower than zero!`);
                } else {
                    from = bodyFrom;
                }
            } else {
                from = 0;
            }
        }

        let isExplicitSize = true;
        if (_.isFinite(size)) {
            if (size < 0) {
                throw Error(`Size can't be lower than zero!`);
            } else {
                //OK
            }
        } else {
            let bodySize;
            if (!_.isNil(body?.size)) {
                if (_.isFinite(body.size)) {
                    bodySize = body.size;
                } else if (_.isString(body.size)) {
                    bodySize = parseInt(body.size, 10);
                }
            }

            if (!_.isNil(bodySize)) {
                if (bodySize < 0) {
                    throw Error(`Size in body can't be lower than zero!`);
                } else {
                    size = bodySize;
                }
            } else {
                size = Number.MAX_SAFE_INTEGER - from;
                isExplicitSize = false;
            }
        }

        const isExplicitPIT = _.isString(additional?.pitId);
        const isImplicitPIT = ((from + size) > MAX_RESULTS) && !isExplicitPIT;
        const usePIT = (isImplicitPIT || isExplicitPIT);
        const useSearchAfter = !_.isNil(additional?.searchAfter);

        if (useSearchAfter && (from !== 0)) {
            throw Error(`In case of specifying "searchAfter" parameter the "from" parameter must result to zero.`);
        } else if (isExplicitPIT && (from !== 0)) {
            throw Error(`In case of specifying "pitId" parameter the "from" parameter must result to zero.`);
        }

        myAction.logParams({
            from: from, size: size
        });

        const myFrom = (usePIT) ? 0 : from;
        let mySize;
        if (usePIT) {
            if (isExplicitPIT && isExplicitSize) {
                mySize = Math.min(MAX_RESULTS, size);
            } else {
                mySize = await self._getBulkSize();
            }
        } else {
            mySize = size;
        }

        let pitID, esResults;

        try {
            if (usePIT) {
                if (isImplicitPIT) {
                    pitID = await self.openPIT();
                } else {
                    pitID = additional.pitId;
                }
            }
            const myAlias = (usePIT) ? void 0 : self.alias;
            let mySearchAfter = (useSearchAfter) ? additional.searchAfter : void 0;

            if (usePIT && _.isEmpty(body.sort) && additional?.autoPitSort !== false) {
                body.sort = [{ _shard_doc: `asc` }];
            } else if (!_.isEmpty(body.sort)) {
                body.sort = _.castArray(body.sort);
                for (let i = 0; i < body.sort.length; i++) {
                    if (_.isObject(body.sort[i])) {
                        Object.keys(body.sort[i]).forEach((sortKey) => body.sort[i][sortKey] = addSortMissingValue(body.sort[i][sortKey]));
                    } else if (_.isString(body.sort[i])) {
                        if (body.sort[i] === `_score`) {
                            body.sort[i] = { [body.sort[i]]: addSortMissingValue(`desc`) };
                        } else {
                            body.sort[i] = { [body.sort[i]]: addSortMissingValue(`asc`) };
                        }
                    }
                }
            }
            esResults = await myAction.callEs(`search`, myAlias, body, myFrom, mySize, additional?.source, additional?.trackTotalHits, mySearchAfter, pitID, additional?.refresh);
            if (!_.isEmpty(esResults?.body?._shards?.failures)) {
                throw new errors.ResponseError({ body: esResults.body._shards.failures[0] });
            }

            Object.defineProperty(returnArray, `aggregations`, {
                value: esResults.body.aggregations,
                writable: true,
                enumerable: false
            });
            Object.defineProperty(returnArray, `_total`, {
                value: (_.isNumber(esResults.body.hits?.total?.value)) ? esResults.body.hits.total.value : void 0,
                writable: true,
                enumerable: false
            });

            if (isExplicitPIT) {
                Object.defineProperty(returnArray, `pitId`, {
                    value: esResults.body.pit_id,
                    writable: true,
                    enumerable: false
                });
            }

            let counter = 0;
            let full = false;
            do {
                const startIndex = (usePIT) ? Math.min(esResults.body.hits.hits.length, Math.max(0, from - counter)) : 0;
                counter += (usePIT) ? startIndex : from;

                //Iterate over results
                for (let i = startIndex; (i < esResults.body.hits.hits.length) && (counter < from + size); i++) {
                    parseResult(esResults.body.hits.hits[i]);

                    //Increase counter, check if break
                    counter++;
                    if (counter >= from + size) {
                        full = true;
                        break;
                    }
                }

                //Check if perform another search request
                if (isImplicitPIT && esResults.body.hits.hits.length >= mySize && !full) {
                    pitID = esResults.body.pit_id;
                    mySearchAfter = esResults.body.hits.hits[esResults.body.hits.hits.length - 1].sort;
                    esResults = await myAction.callEs(`search`, void 0, body, 0, mySize, additional?.source, false, mySearchAfter, pitID, additional?.refresh);
                }
            } while (isImplicitPIT && esResults.body.hits.hits.length >= mySize && !full);

            if (returnArray.length > 0) {
                const lastItem = returnArray[returnArray.length - 1];
                Object.defineProperty(returnArray, `_lastPosition`, {
                    value: (_.isNil(additional?.source)) ? lastItem._sort : lastItem.sort,
                    writable: true,
                    enumerable: false
                });
            }
        } finally {
            //Close PIT
            if (isImplicitPIT && !_.isEmpty(esResults?.body?.pit_id)) {
                await self.closePIT(esResults.body.pit_id);
            }
        }

        if (_.isNil(additional?.source) && returnArray.length > 0) {
            myAction.note(`Calling _afterSearch function.`);
            await self._afterSearch(returnArray, additional?.cache);
        }
    },

    /**
     * Replaces data in first instance with data in the second one
     * @param myInstance {BaseModel}
     * @param newInstance {BaseModel}
     */
    reloadInstance(myInstance, newInstance) {
        //Delete existing enumerable properties
        for (const key of Object.keys(myInstance)) {
            delete myInstance[key];
        }

        //Set new properties
        myInstance._id = newInstance._id;
        myInstance._version = newInstance._version;
        //highlight remains the same
        myInstance._primary_term = newInstance._primary_term;
        myInstance._seq_no = newInstance._seq_no;
        //score remains the same
        //sort remains the same

        Object.assign(myInstance, newInstance);
    },

    /**
     * Returns iterator over bulks
     * @param self          {Object}        BaseModel
     * @param body          {Object=}       Body object
     * @param additional    {Object=}       Additional data
     * @returns {AsyncGenerator<BulkArray<BaseModel>|Array<Object>>}
     */
    async *bulkIterator(self, body = void 0, additional = void 0) {
        const myAdditional = (!_.isObject(additional)) ? {} : (({ cache, source, refresh, trackTotalHits, pitId }) => ({ cache, source, refresh, trackTotalHits, pitId }))(additional);
        myAdditional.cache = (additional?.cache) ? additional.cache : {};

        let isMyPIT = false;
        if (!_.isString(myAdditional.pitId)) {
            isMyPIT = true;
            myAdditional.pitId = await self.openPIT();
        }
        const myBody = body ?? {};

        try {
            let instances = await self.search(myBody, void 0, void 0, myAdditional);
            myAdditional.searchAfter = instances._lastPosition;
            if (isMyPIT) {
                myAdditional.pitId = instances.pitId;
            }

            while (instances.length > 0) {
                yield instances;

                instances = await self.search(myBody, void 0, void 0, myAdditional);
                myAdditional.searchAfter = instances._lastPosition;
                if (isMyPIT) {
                    myAdditional.pitId = instances.pitId;
                }
            }

        } finally {
            if (isMyPIT && _.isString(myAdditional.pitId)) {
                await self.closePIT(myAdditional.pitId);
            }
        }
    },

    /**
     * Returns iterator over bulks
     * @param self          {Object}        BaseModel
     * @param body          {Object=}       Body object
     * @param additional    {Object=}       Additional data
     * @returns {AsyncGenerator<BulkArray<BaseModel>|Array<Object>>}
     */
    async *itemIterator(self, body = void 0, additional = void 0) {
        const myAdditional = (!_.isObject(additional)) ? {} : { ... additional };  //shallow clone
        myAdditional.trackTotalHits = false;

        const myBulkIterator = self.bulkIterator(body, additional);
        for await (const bulk of myBulkIterator) {
            for (const item of bulk) {
                yield item;
            }
        }
    }
};

/**
 * Adds default missing value to sort
 * ES (Java) uses Long max/min values for missing values, but these cannot be properly represented in JS
 * https://github.com/elastic/elasticsearch-js/issues/662
 * @param sortItem {string | {}}
 * @returns {*}
 */
function addSortMissingValue(sortItem) {
    if (_.isString(sortItem)) {
        if (sortItem === `asc` || sortItem === `desc`) {
            sortItem = {
                order: sortItem
            };
        } else {
            return sortItem;
        }
    }

    if (!_.isNil(sortItem.missing)) {
        return sortItem;
    } else if (sortItem.order === `asc`) {
        sortItem.missing = Number.MAX_SAFE_INTEGER;
    } else if (sortItem.order === `desc`) {
        sortItem.missing = Number.MIN_SAFE_INTEGER;
    }

    return sortItem;
}
