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
        if ((_.isEmpty(additional?.scrollId) || !_.isString(additional?.scrollId)) && (_.isNil(body) || (!_.isObject(body)))) {
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

        let isExplicitSize = true;
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
                isExplicitSize = false;
            }
        }

        //Check scrolling type
        const isExplicitScroll = !!additional?.scrollId;
        const useScroll = ((from + size) > MAX_RESULTS) || isExplicitScroll;
        const useSearchAfter = !_.isNil(additional?.searchAfter);
        const usePointInTime = !_.isNil(additional?.pitId);
        const callScroll = isExplicitScroll && _.isString(additional?.scrollId);
        const trackTotalHits = !(_.isNil(additional?.trackTotalHits) && (useSearchAfter || usePointInTime));

        if ((isExplicitScroll || useSearchAfter) && from !== 0) {
            throw Error(`In case of explicit scrolling or using searchAfter function the "from" parameter must be zero.`);
        } else if (callScroll && (from !== 0 || isExplicitSize)) {
            throw Error(`In case of explicit scrolling the "from" parameter must be zero and "size" parameter cannot be specified in repeated scrolling.`);
        } else if (useScroll && (useSearchAfter || usePointInTime)) {
            throw Error(`You cannot use scrolling along with searchAfter or Point in Time.`);
        }

        myAction.logParams({
            from: from, size: size, useScroll: useScroll
        });

        let esResults;
        if (callScroll) {
            //We have a scroll id -> use it
            esResults = await myAction.callEs(`scroll`, additional.scrollId, additional.refresh);
        } else {
            //Normal search
            const myFrom = (useScroll) ? 0 : from;  //For scroll, do not specify real from, always start from 0
            let mySize;
            if (useScroll) {
                if (isExplicitScroll && isExplicitSize) {
                    mySize = Math.min(MAX_RESULTS, size);
                } else {
                    mySize = await self._getBulkSize();
                }
            } else {
                mySize = size;
            }

            const myAlias = (usePointInTime) ? void 0 : self.alias;
            const mySearchAfter = (useSearchAfter) ? additional.searchAfter : void 0;
            const myPointInTime = (usePointInTime) ? additional.pitId : void 0;
            if (usePointInTime && _.isEmpty(body.sort) && additional?.autoPitSort !== false) {
                body.sort = [{ _shard_doc: `desc` }];
            }
            esResults = await myAction.callEs(`search`, myAlias, body, myFrom, mySize, additional?.source, trackTotalHits, useScroll, mySearchAfter, myPointInTime, additional?.refresh);
        }

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

        if (usePointInTime) {
            Object.defineProperty(returnArray, `pitId`, {
                value: esResults.body.pit_id,
                writable: true,
                enumerable: false
            });
        }
        if (isExplicitScroll) {
            Object.defineProperty(returnArray, `scrollId`, {
                value: esResults.body._scroll_id,
                writable: true,
                enumerable: false
            });
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
                parseResult(esResults.body.hits.hits[i]);

                //Increase counter, check if break
                counter++;
                if (counter >= from + size) {
                    full = true;
                    break;
                }
            }

            //Check if perform scroll request
            if (!isExplicitScroll && useScroll && esResults.body.hits.hits.length > 0 && !full) {
                esResults = await myAction.callEs(`scroll`, esResults.body._scroll_id, additional?.refresh);
            }
        } while (!isExplicitScroll && useScroll && esResults.body.hits.hits.length > 0 && !full);

        if (returnArray.length > 0) {
            const lastItem = returnArray[returnArray.length - 1];
            Object.defineProperty(returnArray, `_lastPosition`, {
                value: (_.isNil(additional?.source)) ? lastItem._sort : lastItem.sort,
                writable: true,
                enumerable: false
            });
        }

        //Clear scroll
        if (!isExplicitScroll && useScroll && !_.isEmpty(esResults.body._scroll_id)) {
            await self.clearScroll(esResults.body._scroll_id);
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
    async *bulkIterator(self, body, additional) {
        const myAdditional = (!_.isObject(additional)) ? {} : (({ cache, source, refresh, trackTotalHits }) => ({ cache, source, refresh, trackTotalHits }))(additional);
        //Always set the cache object and prepare the scrollId
        myAdditional.cache = (additional?.cache) ? additional.cache : {};
        myAdditional.scrollId = true;

        try {
            let instances = await self.search(body ?? {}, void 0, void 0, myAdditional);
            myAdditional.scrollId = instances.scrollId;

            while (instances.length > 0) {
                yield instances;

                instances = await self.search(void 0, void 0, void 0, myAdditional);
                myAdditional.scrollId = instances.scrollId;
            }

        } finally {
            if (_.isString(myAdditional.scrollId)) {
                await self.clearScroll(myAdditional.scrollId);
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
    async *itemIterator(self, body, additional) {
        const myBulkIterator = self.bulkIterator(body, additional);
        for await (const bulk of myBulkIterator) {
            for (const item of bulk) {
                yield item;
            }
        }
    }
};

