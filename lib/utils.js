import _ from 'lodash';

/** @import BaseModel from './BaseModel.js' */
/** @import BulkArray from './BulkArray.js' */
/** @import MyAction from './Action.js' */
//An aliased typedef instead of "@import" - "JointModel" imports this module back and the cycle confuses the declaration emit
/** @typedef {import('./JointModel.js').default} JointModel */
import { errors } from '@elastic/elasticsearch';
import nconf from './config/config.js';
const MAX_RESULTS = nconf.get(`es:maxResults`);

//JS representation of ES (Java) Long max/min sort sentinels after JSON parsing (rounded to +-2^63)
const MANGLED_LONG_MAX = 2 ** 63;
const MANGLED_LONG_MIN = -(2 ** 63);

export default {
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
    async search(self, myAction, parseResult, returnArray, body, from, size, additional) {
        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        //Shallow copy - the sort may be replaced below and the caller's body must remain intact
        body = { ...body };

        //Body-level "search_after" joins the standard searchAfter machinery (from-guard + sanitization)
        const searchAfterInput = additional?.searchAfter ?? body.search_after;
        body.search_after = void 0;

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
                } else if (_.isString(body.from) && _.isFinite(parseInt(body.from, 10))) {
                    bodyFrom = parseInt(body.from, 10);
                } else {
                    throw Error(`From in body must be a number!`);
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
                } else if (_.isString(body.size) && _.isFinite(parseInt(body.size, 10))) {
                    bodySize = parseInt(body.size, 10);
                } else {
                    throw Error(`Size in body must be a number!`);
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
        const useSearchAfter = !_.isNil(searchAfterInput);

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
                mySize = checkBulkSize(await self._getBulkSize());
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
            const myAlias = (usePIT) ? void 0 : self.__searchedAlias;
            let mySearchAfter = (useSearchAfter) ? sanitizeSearchAfter(searchAfterInput) : void 0;

            //An implicit PIT needs the sort for its "search_after" paging, the "autoPitSort" flag is honored for explicit PITs only
            if (usePIT && _.isEmpty(body.sort) && (isImplicitPIT || additional?.autoPitSort !== false)) {
                body.sort = [{ _shard_doc: `asc` }];
            }
            esResults = await myAction.callEs(`search`, myAlias, body, myFrom, mySize, additional?.source, additional?.trackTotalHits, mySearchAfter, pitID, additional?.refresh);
            checkShardFailures(esResults);

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
            let fetchMore = false;
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

                //The requested window may be exhausted purely by skipping (e.g. zero size)
                if (counter >= from + size) {
                    full = true;
                }

                //Check if perform another search request; the fetched page is parsed by the next loop iteration
                fetchMore = (isImplicitPIT && esResults.body.hits.hits.length >= mySize && !full);
                if (fetchMore) {
                    pitID = esResults.body.pit_id;
                    mySearchAfter = sanitizeSearchAfter(esResults.body.hits.hits[esResults.body.hits.hits.length - 1].sort);
                    esResults = await myAction.callEs(`search`, void 0, body, 0, mySize, additional?.source, false, mySearchAfter, pitID, additional?.refresh);
                    checkShardFailures(esResults);
                }
            } while (fetchMore);

            if (returnArray.length > 0) {
                const lastItem = returnArray[returnArray.length - 1];
                Object.defineProperty(returnArray, `_lastPosition`, {
                    //Raw sort values, plain JSON safe to clone - the Long sentinels are restored when the cursor is sent back
                    value: ((_.isNil(additional?.source)) ? lastItem._sort : lastItem.sort)?.slice(),
                    writable: true,
                    enumerable: false
                });
            }
        } finally {
            //Close implicitly opened PIT even when a search request failed; prefer the freshest known ID
            if (isImplicitPIT) {
                const finalPitID = esResults?.body?.pit_id ?? pitID;
                if (!_.isEmpty(finalPitID)) {
                    await self.closePIT(finalPitID);
                }
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
        const originalProperties = Object.keys(myInstance);
        const newProperties = Object.keys(newInstance);
        const toDeleteProperties = _.difference(originalProperties, newProperties);

        //Sync all enumerable properties
        Object.assign(myInstance, newInstance);
        for (const key of toDeleteProperties) {
            delete myInstance[key];
        }

        //Set internal properties
        myInstance._id = newInstance._id;
        myInstance._version = newInstance._version;
        //highlight remains the same
        myInstance._primary_term = newInstance._primary_term;
        myInstance._seq_no = newInstance._seq_no;
        //score remains the same
        //sort remains the same
    },

    /**
     * Returns iterator over bulks
     * @param self          {typeof BaseModel | JointModel}  BaseModel class or JointModel instance
     * @param body          {Object=}       Body object
     * @param additional    {Object=}       Additional data
     * @returns {AsyncGenerator<BulkArray<BaseModel>|Array<Record<string, any>>>}
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
            if (_.isString(instances.pitId)) {
                //ES may replace the ID when it has to switch a shard copy - always page on with the freshest one
                myAdditional.pitId = instances.pitId;
            }

            while (instances.length > 0) {
                yield instances;

                instances = await self.search(myBody, void 0, void 0, myAdditional);
                myAdditional.searchAfter = instances._lastPosition;
                if (_.isString(instances.pitId)) {
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
     * Returns iterator over single documents
     * @param self          {typeof BaseModel | JointModel}  BaseModel class or JointModel instance
     * @param body          {Object=}       Body object
     * @param additional    {Object=}       Additional data
     * @returns {AsyncGenerator<BaseModel|Record<string, any>>}
     */
    async *itemIterator(self, body = void 0, additional = void 0) {
        const myAdditional = (!_.isObject(additional)) ? {} : { ... additional };  //shallow clone
        myAdditional.trackTotalHits = false;

        const myBulkIterator = self.bulkIterator(body, myAdditional);
        for await (const bulk of myBulkIterator) {
            for (const item of bulk) {
                yield item;
            }
        }
    }
};

/**
 * Throws when some shards failed to execute the search, as ES returns partial results with HTTP 200 in such case
 * @param esResults {Object} ES search response
 */
function checkShardFailures(esResults) {
    if (!_.isEmpty(esResults?.body?._shards?.failures)) {
        throw new errors.ResponseError({ body: esResults.body._shards.failures[0], statusCode: 500 });
    }
}

/**
 * Checks the bulk size a model answered with - a non positive one would make the paging loop spin forever
 * @param bulkSize {number} Bulk size returned by "_getBulkSize"
 * @returns {number} The very same bulk size
 */
function checkBulkSize(bulkSize) {
    if (!_.isFinite(bulkSize) || bulkSize <= 0) {
        throw Error(`The "_getBulkSize" function must return a positive number, '${bulkSize}' was returned instead!`);
    }

    return bulkSize;
}

/**
 * Replaces the mangled Long sentinels of a "search_after" cursor with their exact values
 * @param searchAfter {Array<*>=} Cursor to sanitize
 * @returns {Array<*>=} Sanitized cursor
 */
function sanitizeSearchAfter(searchAfter) {
    if (_.isNil(searchAfter)) {
        return searchAfter;
    } else if (!_.isArray(searchAfter)) {
        throw Error(`The "searchAfter" cursor must be an array of the sort values of the last item!`);
    }

    return searchAfter.map((value) => {
        if (value === MANGLED_LONG_MAX) {
            return JSON.rawJSON(`9223372036854775807`);
        } else if (value === MANGLED_LONG_MIN) {
            return JSON.rawJSON(`-9223372036854775808`);
        } else {
            return value;
        }
    });
}
