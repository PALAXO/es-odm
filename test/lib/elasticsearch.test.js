import buffer from 'buffer';
import { Readable } from 'stream';
import zlib from 'zlib';

import bootstrapTest from '../bootstrapTests.js';
import { callEs, createClass, esClient, setClient } from '../../index.js';

const MAX_STRING_LENGTH = buffer.constants.MAX_STRING_LENGTH;

describe(`elasticsearch`, function() {
    this.timeout(testTimeout);

    const esUrl = bootstrapTest.nconf.get(`es:url`);

    /**
     * Returns URLs of all connections of the current client
     * @returns {Array<string>} Connection URLs
     */
    function connectionUrls() {
        return esClient.client.connectionPool.connections.map((connection) => connection.url.href);
    }

    /**
     * Returns timeouts of all connections of the current client
     * @returns {Array<number>} Connection timeouts
     */
    function connectionTimeouts() {
        return esClient.client.connectionPool.connections.map((connection) => connection.timeout);
    }

    /**
     * Returns the retry count of the current client - the transport keeps it on a private symbol,
     * and this is the only place it can be observed at all
     * @returns {number} Maximum number of retries
     */
    function transportMaxRetries() {
        const transport = esClient.client.transport;
        const key = Object.getOwnPropertySymbols(transport).find((symbol) => symbol.toString() === `Symbol(max retries)`);
        return transport[key];
    }

    describe(`setClient()`, () => {
        afterEach(() => {
            //The client is a global singleton shared by all already created classes
            setClient(esUrl);
        });

        it(`falls back to the configured URL when no options are given`, async () => {
            setClient();

            expect(connectionUrls()).to.deep.equal([`${esUrl}/`]);
        });

        it(`prefers the additional timeouts over the configured defaults`, async () => {
            setClient(esUrl, { requestTimeoutSeconds: 7, pingTimeoutSeconds: 2, maxRetries: 9, pitTimeoutSeconds: 42 });

            expect(connectionTimeouts()).to.deep.equal([7000]);
            expect(esClient.pitTimeoutSeconds).to.equal(42);
            expect(transportMaxRetries()).to.equal(9);

            //A client without the additional data falls back to the configuration
            setClient(esUrl);
            expect(connectionTimeouts()).to.deep.equal([bootstrapTest.nconf.get(`es:requestTimeoutSeconds`) * 1000]);
            expect(esClient.pitTimeoutSeconds).to.equal(bootstrapTest.nconf.get(`es:pitTimeoutSeconds`));
            expect(transportMaxRetries()).to.equal(bootstrapTest.nconf.get(`es:maxRetries`));
        });

        it(`doesn't overwrite an explicitly specified option`, async () => {
            setClient({ node: esUrl, requestTimeout: 1234 }, { requestTimeoutSeconds: 7 });

            expect(connectionTimeouts()).to.deep.equal([1234]);
        });

        it(`forces the client default when an option is null`, async () => {
            setClient({ node: esUrl, requestTimeout: null, pingTimeout: null, maxRetries: null });

            //Not specified at all -> the ES client uses its own default. Only the timeout is observable here,
            //as the client default of "maxRetries" happens to equal the configured one
            expect(connectionTimeouts()).to.deep.equal([null]);
        });

        it(`accepts a cloud configuration`, async () => {
            const cloudId = `myCloud:${Buffer.from(`example.com$abc123$def456`).toString(`base64`)}`;
            setClient({ cloud: { id: cloudId } });

            expect(connectionUrls()).to.deep.equal([`https://abc123.example.com/`]);
        });

        it(`accepts an object node and doesn't mutate it`, async () => {
            const myOptions = { node: { url: esUrl, id: `myNode` } };
            setClient(myOptions);

            expect(connectionUrls()).to.deep.equal([`${esUrl}/`]);
            expect(connectionTimeouts()).to.deep.equal([bootstrapTest.nconf.get(`es:requestTimeoutSeconds`) * 1000]);
            expect(esClient.client.connectionPool.connections[0].id).to.equal(`myNode`);
            expect(myOptions).to.deep.equal({ node: { url: esUrl, id: `myNode` } });

            //An explicit node timeout is kept
            setClient({ node: { url: esUrl, timeout: 4321 } });
            expect(connectionTimeouts()).to.deep.equal([4321]);
        });

        it(`accepts a single item array of nodes`, async () => {
            setClient([esUrl]);

            expect(connectionUrls()).to.deep.equal([`${esUrl}/`]);
        });

        it(`accepts multiple nodes`, async () => {
            setClient([esUrl, `http://localhost:9201`]);

            expect(connectionUrls()).to.deep.equal([`${esUrl}/`, `http://localhost:9201/`]);
            expect(connectionTimeouts()).to.deep.equal([
                bootstrapTest.nconf.get(`es:requestTimeoutSeconds`) * 1000,
                bootstrapTest.nconf.get(`es:requestTimeoutSeconds`) * 1000
            ]);
        });

        it(`can't use multiple nodes when a custom path is specified`, async () => {
            expect(() => setClient([`${esUrl}/myPrefix`, `http://localhost:9201/myPrefix`]))
                .to.throw(`Unable to parse multiple URLs when custom path is specified.`);
        });

        it(`can't use an unknown node`, async () => {
            expect(() => setClient({ node: 123 })).to.throw(`Unknown ES client node specified.`);
            expect(() => setClient({ nodes: 123 })).to.throw(`Unknown ES client node specified.`);
        });

        it(`replaces the client even for already created classes`, async () => {
            //The class is created while the original client is in place
            const MyClass = createClass(`users`).in(`odmtest`);
            expect(await MyClass.count()).to.be.a(`number`);

            //Swapping the client has to reach it - the path prefix makes the new client recognizable
            setClient({ node: `${esUrl}/myPrefix` });

            let thrownError;
            try {
                await MyClass.count();
            } catch (error) {
                thrownError = error;
            }
            expect(thrownError).not.to.be.undefined;
            expect(JSON.stringify(thrownError.body)).to.include(`/myPrefix/odmtest_users/_count`);
        });

        it(`prefixes the request path when the URL contains a path`, async () => {
            for (const url of [`${esUrl}//myPrefix//`, { url: `${esUrl}/myPrefix` }]) {
                setClient({ node: url });

                let thrownError;
                try {
                    await callEs(`cluster.health`);
                } catch (error) {
                    thrownError = error;
                }

                //The path of the node is prepended to the path of every request
                expect(thrownError).not.to.be.undefined;
                expect(thrownError.statusCode).to.equal(400);
                expect(JSON.stringify(thrownError.body)).to.include(`/myPrefix/_cluster/health`);
            }
        });
    });

    describe(`response stream parsing`, () => {
        it(`returns no body for a response without content`, async () => {
            //A HEAD request has no response body at all
            const response = await callEs(`indices.exists`, { index: `odmtest_users` }, { asStream: true });

            expect(response.statusCode).to.equal(200);
            expect(response.body).to.be.undefined;
        });

        it(`measures the transferred size without changing the response envelope`, async () => {
            const response = await callEs(`search`, { index: `odmtest_users`, query: { match_all: {} } }, { asStream: true });

            //Chunked responses carry no "content-length" header, the measured size must not leak into the envelope
            expect(response.headers[`content-length`]).to.be.undefined;
            expect(response).to.have.keys([`body`, `statusCode`, `headers`, `meta`]);
            expect(JSON.parse(JSON.stringify(response)).__contentLength).to.be.undefined;
            expect(response.__contentLength).to.be.above(0);
        });

        it(`rejects a malformed response`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    notJson: async () => {
                        return { body: Readable.from([Buffer.from(`{ not a JSON`)]), statusCode: 200, headers: {}, meta: {} };
                    },
                    notAStream: async () => {
                        return { body: null, statusCode: 200, headers: {}, meta: {} };
                    },
                    notABuffer: async () => {
                        return { body: Readable.from([{ chunk: `object mode` }], { objectMode: true }), statusCode: 200, headers: {}, meta: {} };
                    }
                };

                await expect(callEs(`notJson`, {}, { asStream: true })).to.be.eventually.rejectedWith(SyntaxError);
                await expect(callEs(`notAStream`, {}, { asStream: true })).to.be.eventually.rejectedWith(`Cannot read properties of null`);
                await expect(callEs(`notABuffer`, {}, { asStream: true })).to.be.eventually.rejectedWith(`must be of type string or an instance of Buffer`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`rejects an unknown content encoding`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    exotic: async () => {
                        return {
                            body: Readable.from([Buffer.from(`{"ok":true}`)]),
                            statusCode: 200,
                            headers: { 'content-encoding': `exotic` },
                            meta: {}
                        };
                    }
                };

                //Handing the undecoded bytes to the JSON parser would fail far from the real cause
                await expect(callEs(`exotic`, {}, { asStream: true })).to.be.eventually.rejectedWith(`Unknown response content encoding 'exotic'.`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`passes an identity encoded response through`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    plain: async () => {
                        return {
                            body: Readable.from([Buffer.from(`{"ok":true}`)]),
                            statusCode: 200,
                            headers: { 'content-encoding': `identity` },
                            meta: {}
                        };
                    }
                };

                const response = await callEs(`plain`, {}, { asStream: true });
                expect(response.body).to.deep.equal({ ok: true });
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`decompresses a deflated response`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    deflated: async () => {
                        return {
                            body: Readable.from([zlib.deflateSync(Buffer.from(JSON.stringify({ deflated: true })))]),
                            statusCode: 200,
                            headers: { 'content-encoding': `DEFLATE` },
                            meta: {}
                        };
                    }
                };

                const response = await callEs(`deflated`, {}, { asStream: true });
                expect(response.body.deflated).to.be.true;
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`decompresses a gzipped response`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    zipped: async () => {
                        return {
                            body: Readable.from([zlib.gzipSync(Buffer.from(JSON.stringify({ zipped: true })))]),
                            statusCode: 200,
                            headers: { 'content-encoding': `gzip` },
                            meta: {}
                        };
                    }
                };

                const response = await callEs(`zipped`, {}, { asStream: true });
                expect(response.body.zipped).to.be.true;
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`decompresses a brotli compressed response`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    brotlied: async () => {
                        return {
                            body: Readable.from([zlib.brotliCompressSync(Buffer.from(JSON.stringify({ brotlied: true })))]),
                            statusCode: 200,
                            headers: { 'content-encoding': `BR` },
                            meta: {}
                        };
                    }
                };

                const response = await callEs(`brotlied`, {}, { asStream: true });
                expect(response.body.brotlied).to.be.true;
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`rejects a response which is not compressed as its header claims`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    lying: async () => {
                        return {
                            body: Readable.from([Buffer.from(JSON.stringify({ plain: true }))]),
                            statusCode: 200,
                            headers: { 'content-encoding': `gzip` },
                            meta: {}
                        };
                    }
                };

                //The decompressor fails and the failure has to reach the caller instead of a half parsed body
                await expect(callEs(`lying`, {}, { asStream: true })).to.be.eventually.rejected;
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`rejects when a chunk cannot be read`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    unreadable: async () => {
                        const evilChunk = {
                            get length() {
                                throw Error(`Chunk cannot be read.`);
                            }
                        };

                        return { body: Readable.from([evilChunk], { objectMode: true }), statusCode: 200, headers: {}, meta: {} };
                    }
                };

                await expect(callEs(`unreadable`, {}, { asStream: true })).to.be.eventually.rejectedWith(`Chunk cannot be read.`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`rejects a malformed response too large to be cached`, async () => {
            //A chunk pretending to be larger than the maximum string length - the response is parsed by "stream-json" instead of being cached
            class HugeChunk extends Uint8Array {
                get length() {
                    return MAX_STRING_LENGTH;
                }
            }

            const originalClient = esClient.client;
            try {
                esClient.client = {
                    hugeNotJson: async () => {
                        const chunk = new HugeChunk(Buffer.from(`{ not a JSON`));
                        return { body: Readable.from([chunk], { objectMode: true }), statusCode: 200, headers: {}, meta: {} };
                    }
                };

                //The message has to come from "stream-json" - any other rejection would mean the fallback was never reached
                await expect(callEs(`hugeNotJson`, {}, { asStream: true })).to.be.eventually.rejectedWith(`Parser cannot parse input`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`keeps the status code of an error response which is not JSON`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    proxyError: async () => {
                        //A proxy in front of ES answers with its own HTML error page
                        return {
                            body: Readable.from([Buffer.from(`<html><body>413 Request Entity Too Large</body></html>`)]),
                            statusCode: 413,
                            headers: {},
                            meta: {}
                        };
                    }
                };

                let thrownError;
                try {
                    await callEs(`proxyError`, {}, { asStream: true });
                } catch (error) {
                    thrownError = error;
                }

                expect(thrownError).not.to.be.undefined;
                expect(thrownError.statusCode).to.equal(413);
                expect(thrownError.body).to.include(`413 Request Entity Too Large`);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`rejects a stream error`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    broken: async () => {
                        const stream = new Readable({
                            read() {
                                this.destroy(Error(`Stream is broken.`));
                            }
                        });
                        return { body: stream, statusCode: 200, headers: {}, meta: {} };
                    }
                };

                await expect(callEs(`broken`, {}, { asStream: true })).to.be.eventually.rejectedWith(`Stream is broken.`);
            } finally {
                esClient.client = originalClient;
            }
        });
    });
});
