'use strict';

const _ = require(`lodash`);
const { errors } = require(`@elastic/elasticsearch`);
const nconf = require(`./config/config`);

const configuration = {
    MAX_RESULTS: nconf.get(`es:maxResults`),
    SCROLL_SIZE: nconf.get(`es:scrollSize`),
};

module.exports = {
    /**
     * Creates clone of given class
     * @param BaseClass     {BaseModelType}
     * @param properties    {Object}
     * @returns             {BaseModelType}
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
     * @param self              {BaseModel | JointModel}                    this
     * @param myAction          {MyAction}                                  Action object
     * @param parseResult       {function}                                  Function to parse results
     * @param returnArray       {BulkArray | Array}                         Result array
     * @param defaultScrollSize {number}                                    Scroll size to use
     * @param body              {Object}                                    Body object
     * @param from              {number}                                    Start entry
     * @param size              {number}                                    Number of entries
     * @param source            {String[] | boolean}                        Boolean or optional array with source fields -> if specified, function returns plain objects
     * @param explicitScroll    {string | number}                           Specify scrollId (string) to continue in scrolling, or a number to initialize scrolling (if positive => scroll timeout [s])
     * @param additional        {{cache: Object, scrollRefresh: number}}    Additional data - "cache" is used for "afterSearch" function, "scrollRefresh" is optional scroll refresh timeout
     * @returns                 {Promise<void>}
     */
    async search(self, myAction, parseResult, returnArray, defaultScrollSize, body, from, size, source, explicitScroll, additional) {
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

        //Check if use scroll
        const isExplicitScroll = !_.isNil(explicitScroll);
        const useScroll = ((from + size) > configuration.MAX_RESULTS) || isExplicitScroll;
        const initScroll = isExplicitScroll && _.isString(explicitScroll);
        const myFrom = (useScroll) ? 0 : from;  //For scroll, do not specify real from, always start from 0
        let mySize;
        if (useScroll) {
            if (isExplicitScroll && isExplicitSize) {
                mySize = Math.min(configuration.MAX_RESULTS, size);
            } else {
                if (!_.isFinite(defaultScrollSize)) {
                    mySize = configuration.SCROLL_SIZE;
                } else {
                    mySize = defaultScrollSize;
                }
            }
        } else {
            mySize = size;
        }

        myAction.logParams({
            from: from, size: size, source: source, useScroll: useScroll, explicitScroll: explicitScroll
        });

        let esResults;
        if (initScroll) {
            //We have a scroll id -> use it
            esResults = await myAction.callEs(`scroll`, explicitScroll, additional?.scrollRefresh);
        } else {
            //Normal search
            const myScrollTimeout = (_.isNumber(explicitScroll) && explicitScroll > 0) ? explicitScroll : ((_.isNumber(additional?.scrollRefresh)) ? additional.scrollRefresh : void 0);
            esResults = await myAction.callEs(`search`, self.alias, body, myFrom, mySize, useScroll, source, myScrollTimeout);
        }

        if (!_.isEmpty(esResults?.body?._shards?.failures)) {
            throw new errors.ResponseError({ body: esResults.body._shards.failures[0] });
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
                esResults = await myAction.callEs(`scroll`, esResults.body._scroll_id);
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
            await self.clearScroll(esResults.body._scroll_id);
        }

        if (_.isNil(source)) {
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

        Object.assign(myInstance, newInstance);
    }
};

