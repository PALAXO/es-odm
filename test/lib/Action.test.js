import { Readable } from 'stream';

import bootstrapTest from '../bootstrapTests.js';
import { callEs, createClass, esClient, esErrors, sendBulk, setConfiguration, setLoggerConfig } from '../../index.js';

describe(`Action class`, function() {
    this.timeout(testTimeout);

    /**
     * Wraps given object into a streamed ES response, as returned by the streamed ES endpoints
     * @param body {Object} Response body
     * @param headers {Object=} Response headers
     * @returns {Object} ES response envelope
     */
    function streamedResponse(body, headers = {}) {
        return {
            body: Readable.from([Buffer.from(JSON.stringify(body))]),
            statusCode: 200,
            headers: headers,
            meta: {}
        };
    }

    /**
     * Creates a bulk response matching given operations
     * @param operations {Array<Object>} Bulk operations
     * @param errors {boolean} True to fail all the items
     * @returns {Object} ES bulk response body
     */
    function bulkResponseBody(operations, errors = false) {
        const items = [];
        for (let i = 0; i < operations.length; i += 2) {
            items.push({
                index: {
                    _id: operations[i].index._id,
                    status: (errors) ? 400 : 201,
                    result: (errors) ? void 0 : `created`
                }
            });
        }

        return {
            took: 1,
            errors: errors,
            items: items
        };
    }

    /**
     * Creates bulk operations for given number of documents
     * @param count {number} Number of documents
     * @returns {Array<Object>} Bulk operations
     */
    function bulkOperations(count) {
        const operations = [];
        for (let i = 0; i < count; i++) {
            operations.push({ index: { _index: `odmtest_users`, _id: `bulked${i}` } });
            operations.push({ status: `:)`, name: `bulked${i}` });
        }
        return operations;
    }

    describe(`callEs()`, () => {
        it(`repeats the call when ES responds with 429`, async () => {
            const originalClient = esClient.client;
            let callCounter = 0;
            try {
                esClient.client = {
                    tooManyRequests: async () => {
                        callCounter++;
                        if (callCounter <= 2) {
                            const error = Error(`Too Many Requests`);
                            error.statusCode = 429;
                            throw error;
                        }
                        return { body: { finally: `ok` }, statusCode: 200, headers: {}, meta: {} };
                    }
                };

                const result = await callEs(`tooManyRequests`);
                expect(callCounter).to.equal(3);
                expect(result.body.finally).to.equal(`ok`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`doesn't repeat the call when ES responds with an unavailable status`, async () => {
            //A 5xx gives no guarantee that the call was not executed, so repeating it could duplicate a write
            for (const statusCode of [500, 502, 503, 504]) {
                const originalClient = esClient.client;
                let callCounter = 0;
                try {
                    esClient.client = {
                        unavailable: async () => {
                            callCounter++;
                            const error = Error(`Service Unavailable`);
                            error.statusCode = statusCode;
                            throw error;
                        }
                    };

                    await expect(callEs(`unavailable`)).to.be.eventually.rejectedWith(`Service Unavailable`);
                    expect(callCounter).to.equal(1);
                } finally {
                    esClient.client = originalClient;
                }
            }
        });

        it(`doesn't repeat the call for a status which is not retriable`, async () => {
            const originalClient = esClient.client;
            let callCounter = 0;
            try {
                esClient.client = {
                    badRequest: async () => {
                        callCounter++;
                        const error = Error(`Bad Request`);
                        error.statusCode = 400;
                        throw error;
                    }
                };

                await expect(callEs(`badRequest`)).to.be.eventually.rejectedWith(`Bad Request`);
                expect(callCounter).to.equal(1);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`gives up repeating after the configured number of retries`, async () => {
            const originalClient = esClient.client;
            let callCounter = 0;
            try {
                esClient.client = {
                    tooManyRequests: async () => {
                        callCounter++;
                        const error = Error(`Too Many Requests`);
                        error.statusCode = 429;
                        throw error;
                    }
                };

                await expect(callEs(`tooManyRequests`)).to.be.eventually.rejectedWith(`Too Many Requests`);

                //The initial call plus all the retries
                expect(callCounter).to.equal(bootstrapTest.nconf.get(`es:retries:maxRetries`) + 1);
            } finally {
                esClient.client = originalClient;
            }
        });

        describe(`batch writing APIs`, () => {
            //What ES answers when a by-query or reindex call gives up on a rejected batch - the counts report what it wrote
            const rejectedAfter = (counts) => new esErrors.ResponseError({
                body: {
                    took: 10, timed_out: false, total: 10, updated: 0, created: 0, deleted: 0, batches: 2, version_conflicts: 0, noops: 0,
                    failures: [{ status: 429, cause: { type: `es_rejected_execution_exception` } }],
                    ...counts
                },
                statusCode: 429, headers: {}, warnings: null, meta: {}
            });
            //What ES answers when it refuses a request before starting it
            const rejectedBeforeStart = () => new esErrors.ResponseError({
                body: { error: { type: `es_rejected_execution_exception` }, status: 429 },
                statusCode: 429, headers: {}, warnings: null, meta: {}
            });
            const succeeded = { body: { updated: 10, created: 10, deleted: 10, failures: [] }, statusCode: 200, headers: {}, meta: {} };

            let originalClient;
            beforeEach(() => {
                originalClient = esClient.client;
            });
            afterEach(() => {
                esClient.client = originalClient;
            });

            /**
             * Replaces the client by a stub answering the given API with the given answers, one per call
             * @param apiName {string} Name of the client API
             * @param answers {Array<*>} Errors to throw or responses to return, the last one repeats
             * @returns {{calls: number}} Call counter
             */
            const stubApi = (apiName, answers) => {
                const counter = { calls: 0 };
                esClient.client = {
                    [apiName]: async () => {
                        const answer = answers[Math.min(counter.calls, answers.length - 1)];
                        counter.calls++;
                        if (answer instanceof Error) {
                            throw answer;
                        }
                        return answer;
                    }
                };
                return counter;
            };

            it(`doesn't repeat an updateByQuery which ES rejected after writing`, async () => {
                const MyClass = createClass(`users`).in(`odmtest`);
                const counter = stubApi(`updateByQuery`, [rejectedAfter({ updated: 3 })]);

                let thrownError;
                try {
                    await MyClass.updateByQuery({ query: { match_all: {} }, script: { source: `ctx._source.counter += 1` } });
                } catch (e) {
                    thrownError = e;
                }

                //Repeating it would add one more to the three documents ES already wrote
                expect(counter.calls).to.equal(1);
                expect(thrownError).to.be.an.instanceOf(esErrors.ResponseError);
                expect(thrownError.statusCode).to.equal(429);
                expect(thrownError.body.updated).to.equal(3);
            });

            it(`doesn't repeat a deleteByQuery or a reindex which ES rejected after writing`, async () => {
                const MyClass = createClass(`users`).in(`odmtest`);
                const MyDestination = createClass(`documents`).in(`odmtest`);

                const deleteCounter = stubApi(`deleteByQuery`, [rejectedAfter({ deleted: 2 })]);
                await expect(MyClass.deleteByQuery({ query: { match_all: {} } })).to.be.eventually.rejectedWith(esErrors.ResponseError);
                expect(deleteCounter.calls).to.equal(1);

                const reindexCounter = stubApi(`reindex`, [rejectedAfter({ created: 2 })]);
                await expect(MyClass.reindex(MyDestination)).to.be.eventually.rejectedWith(esErrors.ResponseError);
                expect(reindexCounter.calls).to.equal(1);
            });

            it(`doesn't repeat a raw batch writing call which ES rejected after writing`, async () => {
                const counter = stubApi(`updateByQuery`, [rejectedAfter({ updated: 1 })]);

                await expect(callEs(`updateByQuery`, { index: `odmtest_users` })).to.be.eventually.rejectedWith(esErrors.ResponseError);
                expect(counter.calls).to.equal(1);
            });

            it(`repeats a batch writing call which ES rejected before writing anything`, async () => {
                const MyClass = createClass(`users`).in(`odmtest`);

                //Refused before it started
                const refusedCounter = stubApi(`updateByQuery`, [rejectedBeforeStart(), succeeded]);
                const refusedResult = await MyClass.updateByQuery({ query: { match_all: {} }, script: { source: `ctx._source.counter += 1` } });
                expect(refusedCounter.calls).to.equal(2);
                expect(refusedResult.updated).to.equal(10);

                //Started, but gave up already on its first batch - nothing is written, so it is safe to send again
                const emptyCounter = stubApi(`deleteByQuery`, [rejectedAfter({}), succeeded]);
                const emptyResult = await MyClass.deleteByQuery({ query: { match_all: {} } });
                expect(emptyCounter.calls).to.equal(2);
                expect(emptyResult.deleted).to.equal(10);
            });

            it(`keeps repeating a rejected call of any other API`, async () => {
                //The counts of a batch writing answer mean nothing for an API which does not write in batches
                const counter = stubApi(`count`, [rejectedAfter({ updated: 3 }), { body: { count: 7 }, statusCode: 200, headers: {}, meta: {} }]);

                const counted = await createClass(`users`).in(`odmtest`).count({ query: { match_all: {} } });
                expect(counter.calls).to.equal(2);
                expect(counted).to.equal(7);
            });
        });

        it(`follows the retry policy set at runtime`, async () => {
            const originalRetries = { ...bootstrapTest.nconf.get(`es:retries`) };
            const originalClient = esClient.client;
            let callCounter = 0;
            try {
                esClient.client = {
                    tooManyRequests: async () => {
                        callCounter++;
                        const error = Error(`Too Many Requests`);
                        error.statusCode = 429;
                        throw error;
                    }
                };

                //A consumer with an own nconf instance has no other way to reach the policy
                setConfiguration({ retries: { base: 1, maxRetries: 2 } });
                expect(bootstrapTest.nconf.get(`es:retries`)).to.deep.equal({ base: 1, maxRetries: 2 });

                const start = Date.now();
                await expect(callEs(`tooManyRequests`)).to.be.eventually.rejectedWith(`Too Many Requests`);
                expect(callCounter).to.equal(3);
                //A base of one waits about 100 ms before each retry, the default base would wait 200 + 400 ms
                expect(Date.now() - start).to.be.below(500);

                //Nonsense values are ignored, the policy stays as it was
                setConfiguration({ retries: { base: 0, maxRetries: -1 } });
                setConfiguration({ retries: { base: `nonsense`, maxRetries: `nonsense` } });
                expect(bootstrapTest.nconf.get(`es:retries`)).to.deep.equal({ base: 1, maxRetries: 2 });

                //Zero retries is a valid policy - the call is not repeated at all
                setConfiguration({ retries: { maxRetries: `0` } });
                callCounter = 0;
                await expect(callEs(`tooManyRequests`)).to.be.eventually.rejectedWith(`Too Many Requests`);
                expect(callCounter).to.equal(1);
            } finally {
                esClient.client = originalClient;
                bootstrapTest.nconf.set(`es:retries:base`, originalRetries.base);
                bootstrapTest.nconf.set(`es:retries:maxRetries`, originalRetries.maxRetries);
            }
        });
    });

    describe(`sendBulk()`, () => {
        it(`splits the payload when ES responds with 413 and merges the responses`, async () => {
            const originalClient = esClient.client;
            const usedBulkSizes = [];
            try {
                esClient.client = {
                    bulk: async ({ operations }) => {
                        if (operations.length > 2) {
                            const error = Error(`Request Entity Too Large`);
                            error.meta = { statusCode: 413 };
                            throw error;
                        }

                        usedBulkSizes.push(operations.length);
                        //Only the second chunk fails - the merged response must report the errors
                        return streamedResponse(bulkResponseBody(operations, usedBulkSizes.length === 2));
                    }
                };

                const response = await sendBulk(bulkOperations(3));

                //Sizes 6 and 4 were refused, the payload was finally sent by chunks of 2
                expect(usedBulkSizes).to.deep.equal([2, 2, 2]);
                expect(response.took).to.equal(3);
                expect(response.errors).to.be.true;
                expect(response.items.length).to.equal(3);
                expect(response.items.map((item) => item.index.status)).to.deep.equal([201, 400, 201]);
                expect(response.items.map((item) => item.index._id)).to.deep.equal([`bulked0`, `bulked1`, `bulked2`]);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`splits the payload also on the 'Invalid string length' error`, async () => {
            const originalClient = esClient.client;
            const usedBulkSizes = [];
            try {
                esClient.client = {
                    bulk: async ({ operations }) => {
                        if (operations.length > 4) {
                            throw Error(`Invalid string length`);
                        }

                        usedBulkSizes.push(operations.length);
                        return streamedResponse(bulkResponseBody(operations));
                    }
                };

                const response = await sendBulk(bulkOperations(4));

                expect(usedBulkSizes).to.deep.equal([4, 4]);
                expect(response.errors).to.be.false;
                expect(response.items.length).to.equal(4);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`can't split the payload below two operations`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    bulk: async () => {
                        const error = Error(`Request Entity Too Large`);
                        error.meta = { statusCode: 413 };
                        throw error;
                    }
                };

                let thrownError;
                try {
                    await sendBulk(bulkOperations(3));
                } catch (e) {
                    thrownError = e;
                }

                expect(thrownError).not.to.be.undefined;
                expect(thrownError.message).to.equal(`Bulk operation failed despite the bulk size is 2.`);

                //The status of the original failure has to survive, consumers map ES errors by it
                expect(thrownError.statusCode).to.equal(413);
                expect(thrownError.meta.statusCode).to.equal(413);
                expect(thrownError.cause.message).to.equal(`Request Entity Too Large`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`reports a payload which is too long for a string without a status code`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    bulk: async () => {
                        //The V8 error of the client serializer carries no ES response at all
                        throw new RangeError(`Invalid string length`);
                    }
                };

                let thrownError;
                try {
                    await sendBulk(bulkOperations(3));
                } catch (e) {
                    thrownError = e;
                }

                expect(thrownError).not.to.be.undefined;
                expect(thrownError.message).to.equal(`Bulk operation failed despite the bulk size is 2.`);
                expect(thrownError.statusCode).to.be.undefined;
                expect(thrownError.cause.message).to.equal(`Invalid string length`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`rethrows any other bulk error`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    bulk: async () => {
                        throw Error(`Something completely different.`);
                    }
                };

                await expect(sendBulk(bulkOperations(3)))
                    .to.be.eventually.rejectedWith(`Something completely different.`);
            } finally {
                esClient.client = originalClient;
            }
        });
    });

    describe(`telemetry`, () => {
        afterEach(() => {
            //The logger is a global singleton
            setLoggerConfig();
        });

        /**
         * Runs given function with every logger record reaching the captured stdout
         * @param myFunction {function} Function to run
         * @returns {Promise<Array<Object>>} Logger records of the call
         */
        async function recordsOf(myFunction) {
            setLoggerConfig({ name: `es-odm`, streams: [{ level: `trace`, type: `console` }] });
            return bootstrapTest.captureStdout(myFunction);
        }

        it(`reports the whole record chain of a single ODM call`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await new MyClass({ status: `:)`, name: `logged` }, `logged`).save();

            const records = await recordsOf(async () => {
                await MyClass.search({ query: { match_all: {} } }, 0, 10);
            });

            //The "note" comes from the "_afterSearch" step of the search engine
            const ofSearch = records.filter((record) => record.action === `search`);
            expect(ofSearch.map((record) => record.type)).to.deep.equal([
                `apiRequest`, `apiParams`, `esRequest`, `esResponse`, `note`, `apiResponse`
            ]);

            //One call, one correlation id shared by every record of it
            const logIds = new Set(ofSearch.map((record) => record.logId));
            expect(logIds.size).to.equal(1);
            expect([...logIds][0]).to.be.a(`string`);

            for (const record of ofSearch) {
                expect(record.alias).to.equal(MyClass.alias);
            }

            //The parameters of the call are logged separately from its request record
            const params = ofSearch.find((record) => record.type === `apiParams`);
            expect(params.parameters).to.deep.equal({ from: 0, size: 10 });

            //The closing record carries the summary the warning thresholds are evaluated from
            const response = ofSearch.find((record) => record.type === `apiResponse`);
            expect(response.summary.esCalls).to.equal(1);
            expect(response.summary.contentLength).to.be.above(0);
            expect(response.summary.calculatedTook).to.be.above(0);
            expect(response.totalTime).to.be.above(0);
            expect(response.items).to.equal(1);
        });

        it(`reports a failed ES call and stops the chain`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const records = await recordsOf(async () => {
                await expect(MyClass.search({ query: { nonsense: {} } })).to.be.eventually.rejected;
            });

            const ofSearch = records.filter((record) => record.action === `search`);
            expect(ofSearch.map((record) => record.type)).to.deep.equal([
                `apiRequest`, `apiParams`, `esRequest`, `esError`
            ]);

            //A failed call never reaches "finish", so no closing record is written
            expect(ofSearch.some((record) => record.type === `apiResponse`)).to.be.false;
            expect(ofSearch.at(-1).msg).to.include(`Calling ES API thrown an error`);
        });

        it(`correlates the records of concurrent calls separately`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const records = await recordsOf(async () => {
                await Promise.all([MyClass.count(), MyClass.count()]);
            });

            const ofCount = records.filter((record) => record.action === `count`);
            const logIds = new Set(ofCount.map((record) => record.logId));
            expect(logIds.size).to.equal(2);

            //Every call produces its own complete chain - "count" logs no parameters of its own
            for (const logId of logIds) {
                const chain = ofCount.filter((record) => record.logId === logId);
                expect(chain.map((record) => record.type)).to.deep.equal([
                    `apiRequest`, `esRequest`, `esResponse`, `apiResponse`
                ]);
            }
        });
    });

    describe(`warning thresholds`, () => {
        afterEach(() => {
            //The thresholds are stored in the global configuration
            setConfiguration({ warning: { downloadedMiB: 0, searchCalls: 0 } });
        });

        it(`warns about too many search calls`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await new MyClass({ status: `:)`, name: `warned` }, `warned`).save();

            setConfiguration({ warning: { searchCalls: 1 } });

            const records = await bootstrapTest.captureStdout(async () => {
                await MyClass.search({ query: { match_all: {} } }, 0, 10);
            });

            const warnings = records.filter((record) => record.type === `warning`);
            expect(warnings.length).to.equal(1);
            expect(warnings[0].action).to.equal(`search`);
            expect(warnings[0].msg).to.equal(`Used 1 internal ES search calls to finish single ODM API request.`);
        });

        it(`doesn't warn about search calls of another action`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await new MyClass({ status: `:)`, name: `unwarned` }, `unwarned`).save();

            setConfiguration({ warning: { searchCalls: 1 } });

            const records = await bootstrapTest.captureStdout(async () => {
                await MyClass.count();
            });

            expect(records.filter((record) => record.type === `warning`).length).to.equal(0);
        });

        it(`warns about too much downloaded data of a streamed response`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);

            //Streamed responses are chunked and carry no "content-length" header - roughly 1.5 MiB of text
            const bigText = `word `.repeat(60000);
            for (let i = 0; i < 5; i++) {
                await new MyClass({ documentTitle: `big${i}`, text: bigText }, `big${i}`).save();
            }

            setConfiguration({ warning: { downloadedMiB: 1 } });

            const records = await bootstrapTest.captureStdout(async () => {
                await MyClass.search({ query: { match_all: {} } }, 0, 10);
            });

            const warnings = records.filter((record) => record.type === `warning`);
            expect(warnings.length).to.equal(1);
            expect(warnings[0].action).to.equal(`search`);
            expect(warnings[0].msg).to.match(/^Downloaded \d+\.\d\d MiB during single ODM API request\.$/);
        });

        it(`warns about too much downloaded data`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    huge: async () => {
                        //Only the header is taken into account, the response itself may be small
                        return { body: { ok: true }, statusCode: 200, headers: { 'content-length': `${3 * 1048576}` }, meta: {} };
                    }
                };

                setConfiguration({ warning: { downloadedMiB: `2` } });

                const records = await bootstrapTest.captureStdout(async () => {
                    await callEs(`huge`);
                });

                const warnings = records.filter((record) => record.type === `warning`);
                expect(warnings.length).to.equal(1);
                expect(warnings[0].action).to.equal(`callEs`);
                expect(warnings[0].msg).to.equal(`Downloaded 3.00 MiB during single ODM API request.`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`ignores an invalid configuration`, async () => {
            setConfiguration({ warning: { downloadedMiB: 5, searchCalls: 5 } });

            setConfiguration();
            setConfiguration({});
            setConfiguration({ warning: {} });
            setConfiguration({ warning: { downloadedMiB: `nonsense`, searchCalls: `nonsense` } });
            setConfiguration({ warning: { downloadedMiB: `10abc`, searchCalls: `10abc` } });    //parsed as 10 before
            setConfiguration({ warning: { downloadedMiB: null, searchCalls: [] } });

            expect(bootstrapTest.nconf.get(`warning:downloadedB`)).to.equal(5 * 1048576);
            expect(bootstrapTest.nconf.get(`warning:searchCalls`)).to.equal(5);

            //A fraction of a MiB is a valid value, it used to be truncated to zero and disabled the warning
            setConfiguration({ warning: { downloadedMiB: 0.5, searchCalls: `7` } });
            expect(bootstrapTest.nconf.get(`warning:downloadedB`)).to.equal(524288);
            expect(bootstrapTest.nconf.get(`warning:searchCalls`)).to.equal(7);
        });
    });
});
