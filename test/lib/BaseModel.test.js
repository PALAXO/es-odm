import Joi from 'joi';
import { Readable } from 'stream';

import bootstrapTest from '../bootstrapTests.js';
import { createClass, BulkArray, BaseModel, JointModel, esClient, setClient } from '../../index.js';

describe(`BaseModel class`, function() {
    this.timeout(testTimeout);

    /**
     * Wraps given bulk items into a streamed ES bulk response
     * @param items {Array<Object>} Bulk response items
     * @returns {Object} ES response envelope
     */
    function streamedBulkResponse(items) {
        const body = { took: 1, errors: true, items: items };

        return {
            body: Readable.from([Buffer.from(JSON.stringify(body))]),
            statusCode: 200,
            headers: {},
            meta: {}
        };
    }

    describe(`class preparations`, () => {
        it(`can't create class with a non-string index name`, async () => {
            expect(() => createClass(5)).to.throw(`You have to specify an index name.`);
            expect(() => createClass({ name: `users` })).to.throw(`You have to specify an index name.`);
        });

        it(`can't create class with a non-string tenant`, async () => {
            expect(() => createClass(`users`, void 0, 5)).to.throw(`Tenant cannot be empty.`);
            expect(() => createClass(`users`, void 0, { tenant: `odmtest` })).to.throw(`Tenant cannot be empty.`);
        });

        it(`can't create class without index name`, async () => {
            expect(() => createClass()).to.throw(`You have to specify an index name.`);
        });

        it(`can't create class with empty tenant or with an underscore within a tenant`, async () => {
            expect(() => createClass(`myIndex`, void 0, ``)).to.throw(`Tenant cannot be empty.`);

            expect(() => createClass(`myIndex`, void 0, `odmtest_test`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, `_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, `test_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, `_test`)).to.throw(`Tenant cannot contain underscore.`);

            const myClass = createClass(`myIndex`, void 0);
            expect(() => myClass.in(``)).to.throw(`Tenant must be a string!`);
            expect(() => myClass.in(`_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => myClass.in(`test_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => myClass.in(`_test`)).to.throw(`Tenant cannot contain underscore.`);
        });

        it(`can't create class with a dash within a name`, async () => {
            expect(() => createClass(`my-index`)).to.throw(`Index name cannot contain dash.`);
        });

        it(`creates new class`, async () => {
            const myClass = createClass(`myIndex`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass._tenant).to.equal(`*`);
            expect(myClass.alias).to.equal(`*_myIndex`);

            expect(myClass._immediateRefresh).to.equal(true);
        });

        it(`creates new class with schema`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = createClass(`myIndex`, schema);
            expect(myClass._tenant).to.equal(`*`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.schema).to.deep.equal(schema);

            expect(myClass.alias).to.equal(`*_myIndex`);
        });

        it(`creates new class and rewrites tenant`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            originalClass.myFunction = function () {
                return this._tenant;
            };
            originalClass.x = `:)`;
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass.alias).to.equal(`*_myIndex`);
            expect(originalClass.myFunction()).to.equal(`*`);

            const myClass = originalClass.in(`myTenant`);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass.alias).to.equal(`*_myIndex`);
            expect(originalClass.myFunction()).to.equal(`*`);
            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass.alias).to.equal(`myTenant_myIndex`);
            expect(myClass.myFunction()).to.equal(`myTenant`);

            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.schema).to.deep.equal(schema);
        });

        it(`creates new class and changes immediate refresh`, async () => {
            const schema = Joi.object().keys({}).required();
            const OriginalClass = createClass(`myIndex`, schema);
            expect(OriginalClass._immediateRefresh).to.equal(true);

            const NewClass = OriginalClass.immediateRefresh(false);
            expect(OriginalClass._immediateRefresh).to.equal(true);
            expect(NewClass._immediateRefresh).to.equal(false);

            const MyClass = NewClass.in(`myTenant`);
            expect(OriginalClass._immediateRefresh).to.equal(true);
            expect(NewClass._immediateRefresh).to.equal(false);
            expect(MyClass._immediateRefresh).to.equal(false);
        });

        it(`preserves user defined functions`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            originalClass.myFunction = function () {
                return this._tenant;
            };

            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass.alias).to.equal(`*_myIndex`);
            expect(originalClass.myFunction).not.to.be.undefined;
            expect(originalClass.myFunction()).to.equal(`*`);

            const myClass = originalClass.in(`myTenant`);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass.alias).to.equal(`*_myIndex`);
            expect(originalClass.myFunction).not.to.be.undefined;
            expect(originalClass.myFunction()).to.equal(`*`);

            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass.alias).to.equal(`myTenant_myIndex`);
            expect(myClass.myFunction).not.to.be.undefined;
            expect(myClass.myFunction()).to.equal(`myTenant`);

            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.schema).to.deep.equal(schema);
        });

        it(`preserves user redefined static function`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            originalClass.find = function () {
                return `*`;
            };

            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass.alias).to.equal(`*_myIndex`);
            expect(originalClass.find).not.to.be.undefined;
            expect(originalClass.find()).to.equal(`*`);

            const myClass = originalClass.in(`myTenant`);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass.alias).to.equal(`*_myIndex`);
            expect(originalClass.find).not.to.be.undefined;
            expect(originalClass.find()).to.equal(`*`);

            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass.alias).to.equal(`myTenant_myIndex`);
            expect(myClass.find).not.to.be.undefined;
            expect(myClass.find()).to.equal(`*`);

            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.schema).to.deep.equal(schema);
        });

        it(`clones class`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema).in(`myTenant`);

            expect(originalClass._tenant).to.equal(`myTenant`);
            expect(originalClass._name).to.equal(`myIndex`);
            expect(originalClass.alias).to.equal(`myTenant_myIndex`);
            expect(originalClass.newProperty).to.be.undefined;
            expect(originalClass.anotherProperty).to.be.undefined;
            expect(originalClass.newFunction).to.be.undefined;
            expect(originalClass.anotherFunction).to.be.undefined;

            const changes = {
                newProperty: `new`,
                newFunction: function() {
                    return `newFunction`;
                },
                _name: `rewrittenName`
            };
            const clonedClass = originalClass.clone(changes);
            clonedClass.anotherProperty = `another`;
            clonedClass.anotherFunction = function() {
                return `anotherFunction`;
            };

            expect(originalClass._tenant).to.equal(`myTenant`);
            expect(originalClass._name).to.equal(`myIndex`);
            expect(originalClass.alias).to.equal(`myTenant_myIndex`);
            expect(originalClass.newProperty).to.be.undefined;
            expect(originalClass.anotherProperty).to.be.undefined;
            expect(originalClass.newFunction).to.be.undefined;
            expect(originalClass.anotherFunction).to.be.undefined;

            expect(clonedClass._tenant).to.equal(`myTenant`);
            expect(clonedClass._name).to.equal(`rewrittenName`);
            expect(clonedClass.alias).to.equal(`myTenant_rewrittenName`);
            expect(clonedClass.newProperty).to.equal(`new`);
            expect(clonedClass.anotherProperty).to.equal(`another`);
            expect(clonedClass.newFunction()).to.equal(`newFunction`);
            expect(clonedClass.anotherFunction()).to.equal(`anotherFunction`);
        });

        it(`creates new class and changes tenant multiple times`, async () => {
            const schema = Joi.object().keys({}).required();
            let myClass = createClass(`myIndex`, schema);
            expect(myClass._tenant).to.equal(`*`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.alias).to.equal(`*_myIndex`);

            myClass = myClass.in(`odmtest`);
            expect(myClass._tenant).to.equal(`odmtest`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.alias).to.equal(`odmtest_myIndex`);

            myClass = myClass.in(`another`);
            expect(myClass._tenant).to.equal(`another`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.alias).to.equal(`another_myIndex`);
        });

        it(`keeps all the instance metadata non-enumerable`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const instance = new MyClass({ status: `:)`, name: `visible` }, `someId`, 3, `someHighlight`, 5, 7, 1.5, [`sortValue`]);

            //Only the document data may be enumerable - Joi, JSON.stringify and Object.keys must not see the metadata
            expect(Object.keys(instance)).to.deep.equal([`status`, `name`]);
            expect(JSON.parse(JSON.stringify(instance))).to.deep.equal({ status: `:)`, name: `visible` });

            const metadata = [`_id`, `_version`, `_highlight`, `_primary_term`, `_seq_no`, `_score`, `_sort`, `__uuid`];
            for (const property of metadata) {
                expect(Object.getOwnPropertyDescriptor(instance, property).enumerable, property).to.be.false;
            }

            //And every one of them still carries its value
            expect(instance._id).to.equal(`someId`);
            expect(instance._version).to.equal(3);
            expect(instance._highlight).to.equal(`someHighlight`);
            expect(instance._primary_term).to.equal(5);
            expect(instance._seq_no).to.equal(7);
            expect(instance._score).to.equal(1.5);
            expect(instance._sort).to.deep.equal([`sortValue`]);
            expect(instance.__uuid).to.be.a(`string`);
        });
    });

    describe(`static search()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`,
                    documentTitle: `doc_1`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`,
                    documentTitle: `doc_2`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`cannot specify lower than zero from`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({}, -1)).to.be.eventually.rejectedWith(`From can't be lower than zero!`);
        });

        it(`cannot specify lower than zero from as string`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({}, `-1`)).to.be.eventually.rejectedWith(`From can't be lower than zero!`);
        });

        it(`cannot specify lower than zero from in body`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({ from: -1 })).to.be.eventually.rejectedWith(`From in body can't be lower than zero!`);
        });

        it(`cannot specify lower than zero from as string in body`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({ from: `-1` })).to.be.eventually.rejectedWith(`From in body can't be lower than zero!`);
        });

        it(`cannot specify lower than zero size`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({}, void 0, -1)).to.be.eventually.rejectedWith(`Size can't be lower than zero!`);
        });

        it(`cannot specify lower than zero size as string`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({}, void 0, `-1`)).to.be.eventually.rejectedWith(`Size can't be lower than zero!`);
        });

        it(`cannot specify lower than zero size in body`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({ size: -1 })).to.be.eventually.rejectedWith(`Size in body can't be lower than zero!`);
        });

        it(`cannot specify lower than zero size as string in body`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({ size: `-1` })).to.be.eventually.rejectedWith(`Size in body can't be lower than zero!`);
        });

        it(`cannot specify non zero from along with explicit PIT`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const pitId = await MyClass.openPIT();
            try {
                await expect(MyClass.search({
                    query: {
                        match_all: {}
                    }
                }, 15, void 0, { pitId: pitId })).to.be.eventually.rejectedWith(`In case of specifying "pitId" parameter the "from" parameter must result to zero.`);
            } finally {
                await MyClass.closePIT(pitId);
            }
        });

        it(`cannot use searchAfter with from parameter`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.search({}, 10, 10, { searchAfter: [`fake`] })).to.be.eventually.rejectedWith(`In case of specifying "searchAfter" parameter the "from" parameter must result to zero.`);
        });

        it(`cannot use searchAfter with a non zero from resolved from the body`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.search({}, 10, void 0, { searchAfter: [`fake`] })).to.be.eventually.rejectedWith(`In case of specifying "searchAfter" parameter the "from" parameter must result to zero.`);
        });

        it(`tests higher amount of data`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    name: `name_${i}`
                });
            }

            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            let results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, 15000, 15000);
            expect(results.length).to.equal(15000);

            results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, 30000, 1);
            expect(results.length).to.equal(1);
        });

        it(`searches with incorrect body`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.search(true)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`searches with empty object`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.search({});

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(2);
            expect(results._total).to.equal(2);
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);

                expect(result._id).to.be.a(`string`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._version).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);
            }
        });

        it(`searches with match_all`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(2);
            expect(results._total).to.equal(2);
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);

                expect(result._id).to.be.a(`string`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._version).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);
            }
        });

        it(`searches for single entry`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            });

            expect(results.length).to.equal(1);
            expect(results._total).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._score).to.be.a(`number`);
            expect(results[0].status).to.equal(userObject1.document.status);
            expect(results[0].name).to.equal(userObject1.document.name);
        });

        it(`searches with custom cache`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            let instances, cache;
            MyClass._afterSearch = async function (newInstances, newCache) {
                instances = newInstances;
                cache = newCache;
            };
            const results = await MyClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            }, void 0, void 0, { cache: { custom: true } });

            expect(results.length).to.equal(1);
            expect(results._total).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._score).to.be.a(`number`);
            expect(results[0].status).to.equal(userObject1.document.status);
            expect(results[0].name).to.equal(userObject1.document.name);

            expect(instances.length).to.equal(1);
            expect(instances[0]).to.equal(results[0]);
            expect(cache?.custom).to.equal(true);
        });

        it(`searches using non existing property`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match: {
                        unknown: `whatever`
                    }
                }
            });

            expect(results.length).to.equal(0);
            expect(results._total).to.equal(0);
        });

        it(`won't find anything when searches using incorrect tenant`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*incorrect`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(0);
            expect(results._total).to.equal(0);
        });

        it(`searches for all documents`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(2);
            expect(results._total).to.equal(2);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct tenant and can save
                expect(result.constructor._tenant).to.equal(`odmtest`);
                expect(result._score).to.be.a(`number`);
                await result.save();
            }
        });

        it(`searches without source fields`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, void 0, { source: false });

            expect(results.length).to.equal(2);

            expect(results[0]._id).not.to.be.undefined;
            expect(results[0]._version).not.to.be.undefined;
            expect(results[0]._primary_term).not.to.be.undefined;
            expect(results[0]._seq_no).not.to.be.undefined;
            expect(results[0]._score).not.to.be.undefined;
            expect(results[0]._source).to.be.undefined;

            expect(results[1]._id).not.to.be.undefined;
            expect(results[1]._version).not.to.be.undefined;
            expect(results[1]._primary_term).not.to.be.undefined;
            expect(results[1]._seq_no).not.to.be.undefined;
            expect(results[1]._score).not.to.be.undefined;
            expect(results[1]._source).to.be.undefined;
        });

        it(`searches for specific field only`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, void 0, { source: [`name`] });

            expect(results.length).to.equal(2);

            expect(results[0]._id).not.to.be.undefined;
            expect(results[0]._version).not.to.be.undefined;
            expect(results[0]._primary_term).not.to.be.undefined;
            expect(results[0]._seq_no).not.to.be.undefined;
            expect(results[0]._score).not.to.be.undefined;
            expect(results[0]._source).not.to.be.undefined;
            expect(results[0]._source.name).not.to.be.undefined;
            expect(results[0]._source.status).to.be.undefined;

            expect(results[1]._id).not.to.be.undefined;
            expect(results[1]._version).not.to.be.undefined;
            expect(results[1]._primary_term).not.to.be.undefined;
            expect(results[1]._seq_no).not.to.be.undefined;
            expect(results[1]._score).not.to.be.undefined;
            expect(results[1]._source).not.to.be.undefined;
            expect(results[1]._source.name).not.to.be.undefined;
            expect(results[1]._source.status).to.be.undefined;
        });

        it(`searches for documents with a "from" parameter`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }]
            }, 1);

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            expect(results[0].constructor._tenant).to.equal(`odmtest`);
            await results[0].save();
        });

        it(`searches for documents with a string "from" parameter`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }]
            }, `1`);

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            expect(results[0].constructor._tenant).to.equal(`odmtest`);
            await results[0].save();
        });

        it(`searches for documents with a "from" parameter in the body`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }],
                from: 1
            });

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            expect(results[0].constructor._tenant).to.equal(`odmtest`);
            await results[0].save();
        });

        it(`searches for documents with a string "from" parameter in the body`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }],
                from: `1`
            });

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            expect(results[0].constructor._tenant).to.equal(`odmtest`);
            await results[0].save();
        });

        it(`searches for documents with a "size" parameter`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }]
            }, void 0, 1);

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_1`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`searches for documents with a string "size" parameter`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }]
            }, void 0, `1`);

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_1`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`searches for documents with a "size" parameter in the body`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }],
                size: 1
            });

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_1`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`searches for documents with a string "size" parameter in the body`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }],
                size: `1`
            });

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_1`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`searches for documents with "from" and "size" parameters`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }]
            }, 1, 1);

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`searches for documents with string "from" and "size" parameters`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }]
            }, `1`, `1`);

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`searches for documents with "from" and "size" parameters in the body`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }],
                from: 1,
                size: 1
            });

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`searches for documents with string "from" and "size" parameters in the body`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }],
                from: `1`,
                size: `1`
            });

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`prefers the "from" and "size" parameters over the ones in the body`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }],
                from: 0,
                size: 1000
            }, 1, 1);

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`combines the "from" of the body with the "size" parameter`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [{ documentTitle: `asc` }],
                from: 1
            }, void 0, 1);

            expect(results.length).to.equal(1);
            expect(results[0].documentTitle).to.equal(`doc_2`);
            expect(results[0].html).to.equal(`d_default`);
            await results[0].save();
        });

        it(`searches and manually paginates by max sizes (10k)`, async () => {
            await bootstrapTest.deleteData();

            const MyClass = createClass(`users`).in(`odmtest`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass.alias,
                        _id: `id_${`00000${i}`.substr(-5)}`
                    }
                });
                bulk.push({
                    name: `name_${`00000${i}`.substr(-5)}`
                });
            }

            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const pitId = await MyClass.openPIT();
            let results;
            try {
                const myBody = {
                    query: {
                        match_all: {}
                    },
                    sort: {
                        name: {
                            order: `asc`
                        }
                    }
                };

                results = await MyClass.search(myBody, 0, 10000, { pitId: pitId });
                expect(results.length).to.equal(10000);
                expect(results.pitId).not.to.be.undefined;
                expect(results[0]._id).to.equal(`id_00000`);
                expect(results[9999]._id).to.equal(`id_09999`);

                results = await MyClass.search(myBody, void 0, 10000, { pitId: results.pitId, searchAfter: results._lastPosition });
                expect(results.length).to.equal(10000);
                expect(results.pitId).not.to.be.undefined;
                expect(results[0]._id).to.equal(`id_10000`);
                expect(results[9999]._id).to.equal(`id_19999`);

                results = await MyClass.search(myBody, void 0, 10000, { pitId: results.pitId, searchAfter: results._lastPosition });
                expect(results.length).to.equal(10000);
                expect(results.pitId).not.to.be.undefined;
                expect(results[0]._id).to.equal(`id_20000`);
                expect(results[9999]._id).to.equal(`id_29999`);

                results = await MyClass.search(myBody, void 0, 10000, { pitId: results.pitId, searchAfter: results._lastPosition });
                expect(results.length).to.equal(5000);
                expect(results.pitId).not.to.be.undefined;
                expect(results[0]._id).to.equal(`id_30000`);
                expect(results[4999]._id).to.equal(`id_34999`);

            } finally {
                await MyClass.closePIT(results?.pitId ?? pitId);
            }
        });

        it(`searches and manually paginates, takes care about source field`, async () => {
            await bootstrapTest.deleteData();

            const MyClass = createClass(`users`).in(`odmtest`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass.alias,
                        _id: `id_${`00000${i}`.substr(-5)}`
                    }
                });
                bulk.push({
                    name: `name_${`00000${i}`.substr(-5)}`
                });
            }

            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const pitId = await MyClass.openPIT();
            let results;
            try {
                const myBody = {
                    query: {
                        match_all: {}
                    },
                    sort: {
                        name: {
                            order: `asc`
                        }
                    }
                };

                results = await MyClass.search(myBody, void 0, 10000, { pitId: pitId, source: `name` });
                expect(results.length).to.equal(10000);
                expect(results.pitId).not.to.be.undefined;
                expect(results[0]._id).to.equal(`id_00000`);
                expect(results[9999]._id).to.equal(`id_09999`);
                expect(results[0].constructor._tenant).to.be.undefined;

                results = await MyClass.search(myBody, void 0, 10000, { pitId: results.pitId, searchAfter: results._lastPosition });
                expect(results.length).to.equal(10000);
                expect(results.pitId).not.to.be.undefined;
                expect(results[0]._id).to.equal(`id_10000`);
                expect(results[9999]._id).to.equal(`id_19999`);
                expect(results[0]).to.be.an.instanceOf(MyClass);

                results = await MyClass.search(myBody, void 0, 10000, { pitId: results.pitId, searchAfter: results._lastPosition, source: `name` });
                expect(results.length).to.equal(10000);
                expect(results.pitId).not.to.be.undefined;
                expect(results[0]._id).to.equal(`id_20000`);
                expect(results[9999]._id).to.equal(`id_29999`);
                expect(results[0].constructor._tenant).to.be.undefined;

                results = await MyClass.search(myBody, void 0, 10000, { pitId: results.pitId, searchAfter: results._lastPosition });
                expect(results.length).to.equal(5000);
                expect(results.pitId).not.to.be.undefined;
                expect(results[0]._id).to.equal(`id_30000`);
                expect(results[4999]._id).to.equal(`id_34999`);
                expect(results[0].constructor).not.to.be.undefined;

            } finally {
                await MyClass.closePIT(results?.pitId ?? pitId);
            }
        });

        it(`populates '_total' only when the additional option allows it`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const tracked = await MyClass.search({ query: { match_all: {} } }, 0, 10, { trackTotalHits: true });
            expect(tracked._total).to.equal(2);

            //The option switches the ES "track_total_hits" off, so the total cannot be known
            const untracked = await MyClass.search({ query: { match_all: {} } }, 0, 10, { trackTotalHits: false });
            expect(untracked.length).to.equal(2);
            expect(untracked._total).to.be.undefined;
        });

        it(`serves a request beyond the result window instead of failing`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            //"from + size" of exactly the window is served by a plain search
            const atTheWindow = await MyClass.search({ query: { match_all: {} } }, 9998, 2);
            expect(atTheWindow.length).to.equal(0);

            //One more and ES itself would refuse the request - the library switches to an implicit PIT instead
            const overTheWindow = await MyClass.search({ query: { match_all: {} } }, 9999, 2);
            expect(overTheWindow.length).to.equal(0);

            await expect(bootstrapTest.client.search({
                index: `odmtest_users`,
                query: { match_all: {} },
                from: 9999,
                size: 2
            })).to.be.eventually.rejectedWith(`Result window is too large`);
        });

        it(`caps the page size of an explicit PIT to the result window`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const pitId = await MyClass.openPIT();
            try {
                //ES refuses a size above the result window, the library caps it before asking
                const results = await MyClass.search({ query: { match_all: {} } }, 0, 20000, { pitId: pitId });
                expect(results.length).to.equal(2);

                await expect(bootstrapTest.client.search({
                    index: `odmtest_users`,
                    query: { match_all: {} },
                    size: 20000
                })).to.be.eventually.rejectedWith(`Result window is too large`);
            } finally {
                await MyClass.closePIT(pitId);
            }
        });

        it(`searches using implicit PIT with searchAfter specified`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            let result = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: {
                    name: {
                        order: `asc`
                    }
                }
            }, void 0, 1);
            expect(result.length).to.equal(1);

            result = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: {
                    name: {
                        order: `asc`
                    }
                }
            }, 0, void 0, { searchAfter: result._lastPosition });
            expect(result.length).to.equal(1);

            result = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: {
                    name: {
                        order: `asc`
                    }
                }
            }, 0, void 0, { searchAfter: result._lastPosition });
            expect(result.length).to.equal(0);
        });

        it(`doesn't mutate the input search body`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const pitBody = {
                query: {
                    match_all: {}
                }
            };
            await MyClass.search(pitBody);  //no from/size -> implicit PIT
            expect(pitBody.sort).to.be.undefined;

            const sortBody = {
                query: {
                    match_all: {}
                },
                sort: [{ name: { order: `asc` } }]
            };
            await MyClass.search(sortBody, 0, 10);
            expect(sortBody.sort).to.deep.equal([{ name: { order: `asc` } }]);
        });

        it(`searches with '_score' sort`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: [`_score`]
            }, 0, 10);
            expect(results.length).to.equal(2);     //the two beforeEach fixture users
        });

        it(`sorts documents missing the sort field last`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await new MyClass({ status: `:)`, name: `b`, fullname: `b` }, `named1`).save();
            await new MyClass({ status: `:)`, name: `a`, fullname: `a` }, `named2`).save();
            await new MyClass({ status: `:)` }, `unnamed`).save();

            //Fixture users "happy" and "sad" from beforeEach take part too
            const asc = await MyClass.search({ query: { match_all: {} }, sort: [{ name: `asc` }] }, 0, 10);
            expect(asc.map((item) => item.name ?? `<missing>`).join(`,`)).to.equal(`a,b,happy,sad,<missing>`);

            const desc = await MyClass.search({ query: { match_all: {} }, sort: [{ name: `desc` }] }, 0, 10);
            expect(desc.map((item) => item.name ?? `<missing>`).join(`,`)).to.equal(`sad,happy,b,a,<missing>`);
        });

        it(`paginates over documents missing the sort field`, async () => {
            await bootstrapTest.createIndex(`odmtest_paging`, `abc123`);
            try {
                class PagingClass extends createClass(`paging`) {
                    static async _getBulkSize() {
                        return 2;
                    }
                }
                const MyClass = PagingClass.in(`odmtest`);

                for (let i = 0; i < 3; i++) {
                    await new MyClass({ order: i, when: `2026-01-0${i + 1}T00:00:00Z` }, `full${i}`).save();
                }
                for (let i = 0; i < 3; i++) {
                    await new MyClass({ note: `no sort fields` }, `empty${i}`).save();
                }

                //Implicit PIT paging (bulk size 2) crosses the missing-value sentinel: ascending (Long.MAX) on a number, descending (Long.MIN) on a date
                const numberAsc = await MyClass.search({ query: { match_all: {} }, sort: [{ order: `asc` }] });
                expect(numberAsc.length).to.equal(6);
                expect(numberAsc.slice(0, 3).map((item) => item._id).join(`,`)).to.equal(`full0,full1,full2`);

                const dateDesc = await MyClass.search({ query: { match_all: {} }, sort: [{ when: `desc` }] });
                expect(dateDesc.length).to.equal(6);
                expect(dateDesc.slice(0, 3).map((item) => item._id).join(`,`)).to.equal(`full2,full1,full0`);

                //Missing documents come last, each exactly once
                for (const results of [numberAsc, dateDesc]) {
                    expect([...results.slice(3).map((item) => item._id)].sort().join(`,`)).to.equal(`empty0,empty1,empty2`);
                }

                //JSON-mangled sentinel from an externally stored position is accepted even for a date field
                const oldPosition = await MyClass.search({ query: { match_all: {} }, sort: [{ when: `asc` }] }, 0, 10, { searchAfter: [2 ** 63] });
                expect(oldPosition.length).to.equal(0);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_paging`, `abc123`);
            }
        });

        it(`pages on with a cloned missing-value cursor`, async () => {
            await bootstrapTest.createIndex(`odmtest_cloned`, `abc123`);
            try {
                //A consumer hook deep cloning the body, a body level cursor included
                class CloningClass extends createClass(`cloned`) {
                    static _alterSearch(body) {
                        return structuredClone(body);
                    }
                }
                const MyClass = CloningClass.in(`odmtest`);

                await new MyClass({ order: 0, tie: 0 }, `doc0`).save();
                await new MyClass({ tie: 1 }, `doc1`).save();
                await new MyClass({ tie: 2 }, `doc2`).save();

                const sort = [{ order: `asc` }, { tie: `asc` }];
                const firstPage = await MyClass.search({ query: { match_all: {} }, sort: sort }, void 0, 2);
                expect(firstPage.map((item) => item._id)).to.deep.equal([`doc0`, `doc1`]);
                expect(firstPage._lastPosition).to.deep.equal([2 ** 63, 1]);

                const viaBody = await MyClass.search({ query: { match_all: {} }, sort: sort, search_after: firstPage._lastPosition }, void 0, 2);
                expect(viaBody.map((item) => item._id)).to.deep.equal([`doc2`]);

                const viaAdditional = await MyClass.search({ query: { match_all: {} }, sort: sort }, void 0, 2, { searchAfter: structuredClone(firstPage._lastPosition) });
                expect(viaAdditional.map((item) => item._id)).to.deep.equal([`doc2`]);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_cloned`, `abc123`);
            }
        });

        it(`closes the implicitly opened PIT when the search request fails`, async () => {
            //The PIT functions of the class itself are the observable contract - a cluster wide counter cannot tell
            //"closed again" from "never opened", and this cluster may serve other clients meanwhile
            const openedIds = [];
            const closedIds = [];
            class SpyClass extends createClass(`users`) {
                static async openPIT() {
                    const id = await super.openPIT();
                    openedIds.push(id);
                    return id;
                }

                static async closePIT(id) {
                    closedIds.push(id);
                    return super.closePIT(id);
                }
            }
            const MyClass = SpyClass.in(`odmtest`);

            await expect(MyClass.search({ query: { nonsense: {} } })).to.be.eventually.rejected;    //no from/size -> implicit PIT, invalid query

            expect(openedIds.length).to.equal(1);
            expect(closedIds).to.deep.equal(openedIds);

            //The PIT really is gone - ES refuses to search in it again
            await expect(bootstrapTest.client.search({ pit: { id: openedIds[0] } })).to.be.eventually.rejected;
        });

        it(`throws with a status code when some shards fail`, async () => {
            //Conflicting mappings across tenants -> sorting fails on one shard, ES returns partial results with HTTP 200
            await bootstrapTest.client.indices.create({ index: `odmtesta_shardfail`, mappings: { properties: { k: { type: `keyword` } } } });
            await bootstrapTest.client.indices.create({ index: `odmtestb_shardfail`, mappings: { properties: { k: { type: `text` } } } });
            try {
                await bootstrapTest.client.index({ index: `odmtesta_shardfail`, id: `a`, document: { k: `a` }, refresh: true });
                await bootstrapTest.client.index({ index: `odmtestb_shardfail`, id: `b`, document: { k: `b` }, refresh: true });

                const MyClass = createClass(`shardfail`).in(`odmtest*`);   //wildcard tenant
                let thrownError;
                try {
                    await MyClass.search({ sort: [{ k: `asc` }] }, 0, 10);
                } catch (error) {
                    thrownError = error;
                }

                expect(thrownError).not.to.be.undefined;
                expect(thrownError.statusCode).to.equal(500);
                expect(thrownError.body.index).to.equal(`odmtestb_shardfail`);
            } finally {
                await bootstrapTest.client.indices.delete({ index: `odmtesta_shardfail,odmtestb_shardfail` });
            }
        });

        it(`works with response compression enabled`, async () => {
            const esUrl = bootstrapTest.nconf.get(`es:url`);
            setClient({ node: esUrl, compression: true });
            try {
                const MyClass = createClass(`users`).in(`odmtest`);
                await new MyClass({ status: `:)`, name: `zip`, fullname: `zip zip` }, `compressed1`).save();

                //search and mget are streamed endpoints - their responses arrive compressed
                const results = await MyClass.search({ query: { match: { name: `zip` } } }, 0, 10);
                expect(results.length).to.equal(1);
                expect(results[0].fullname).to.equal(`zip zip`);

                const single = await MyClass.get(`compressed1`);
                expect(single.fullname).to.equal(`zip zip`);
            } finally {
                setClient(esUrl);
            }
        });

        it(`refuses a '_getBulkSize' which is not a positive number`, async () => {
            class BrokenClass extends createClass(`users`) {
                static async _getBulkSize() {
                    return 0;
                }
            }
            const MyClass = BrokenClass.in(`odmtest`);

            //Without the check the paging loop would never fetch anything and never end
            await expect(MyClass.search({ query: { match_all: {} } }))
                .to.be.eventually.rejectedWith(`The "_getBulkSize" function must return a positive number, '0' was returned instead!`);
        });

        it(`refuses a 'searchAfter' cursor which is not an array`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({}, void 0, 10, { searchAfter: `nonsense` }))
                .to.be.eventually.rejectedWith(`The "searchAfter" cursor must be an array of the sort values of the last item!`);
        });

        it(`returns all documents when the last implicit PIT page is partial`, async () => {
            await bootstrapTest.createIndex(`odmtest_partial`, `abc123`);
            try {
                class PagingClass extends createClass(`partial`) {
                    static async _getBulkSize() {
                        return 2;
                    }
                }
                const MyClass = PagingClass.in(`odmtest`);
                for (let i = 0; i < 5; i++) {
                    await new MyClass({ value: i }, `doc${i}`).save();
                }

                //5 documents over pages of 2 -> the last page holds a single document
                const results = await MyClass.search({ query: { match_all: {} } });
                expect(results.length).to.equal(5);
                expect(new Set(results.map((item) => item._id)).size).to.equal(5);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_partial`, `abc123`);
            }
        });

        it(`paginates implicit PIT even with disabled autoPitSort`, async () => {
            await bootstrapTest.createIndex(`odmtest_autosort`, `abc123`);
            try {
                class PagingClass extends createClass(`autosort`) {
                    static async _getBulkSize() {
                        return 2;
                    }
                }
                const MyClass = PagingClass.in(`odmtest`);
                for (let i = 0; i < 5; i++) {
                    await new MyClass({ value: i }, `doc${i}`).save();
                }

                const results = await MyClass.search({ query: { match_all: {} } }, void 0, void 0, { autoPitSort: false });
                expect(results.length).to.equal(5);
                expect(new Set(results.map((item) => item._id)).size).to.equal(5);  //no duplicated pages
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_autosort`, `abc123`);
            }
        });

        it(`honors body-level 'search_after' and 'track_total_hits'`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const firstPage = await MyClass.search({ query: { match_all: {} }, sort: [{ name: `asc` }] }, 0, 10);
            expect(firstPage.length).to.equal(2);
            expect(firstPage._total).to.equal(2);

            const secondPage = await MyClass.search({ query: { match_all: {} }, sort: [{ name: `asc` }], search_after: firstPage[0]._sort }, 0, 10);
            expect(secondPage.length).to.equal(1);
            expect(secondPage[0]._id).to.equal(firstPage[1]._id);

            const untracked = await MyClass.search({ query: { match_all: {} }, track_total_hits: false }, 0, 10);
            expect(untracked.length).to.equal(2);
            expect(untracked._total).to.be.undefined;

            //Body-level search_after still respects the "from" guard
            await expect(MyClass.search({ query: { match_all: {} }, sort: [{ name: `asc` }], search_after: firstPage[0]._sort }, 5, 10))
                .to.be.eventually.rejectedWith(`the "from" parameter must result to zero`);
        });

        it(`can't search with non-numeric from or size in body`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.search({ query: { match_all: {} }, from: `abc` })).to.be.eventually.rejectedWith(`From in body must be a number!`);
            await expect(MyClass.search({ query: { match_all: {} }, size: `abc` })).to.be.eventually.rejectedWith(`Size in body must be a number!`);
        });

        it(`validates the body before calling '_alterSearch'`, async () => {
            class AlteringClass extends createClass(`users`) {
                static _alterSearch(body) {
                    body.query = {
                        match_all: {}
                    };
                    return body;
                }
            }

            await expect(AlteringClass.in(`odmtest`).search(null)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`searches with a wildcard in the name and instantiates results`, async () => {
            await bootstrapTest.createIndex(`odmtest_wilda`, `abc123`);
            await bootstrapTest.createIndex(`odmtest_wildb`, `abc123`);
            try {
                await new (createClass(`wilda`).in(`odmtest`))({ value: `a` }, `w1`).save();
                await new (createClass(`wildb`).in(`odmtest`))({ value: `b` }, `w2`).save();

                const results = await createClass(`wild*`).in(`odmtest`).search({ query: { match_all: {} } }, 0, 10);
                expect(results.length).to.equal(2);
                expect(results.map((item) => item.constructor._name).sort().join(`,`)).to.equal(`wilda,wildb`);
                expect(results.map((item) => item.constructor._tenant).join(`,`)).to.equal(`odmtest,odmtest`);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_wilda`, `abc123`);
                await bootstrapTest.deleteIndex(`odmtest_wildb`, `abc123`);
            }
        });

        it(`accepts client options with 'nodes' array and doesn't mutate them`, async () => {
            const esUrl = bootstrapTest.nconf.get(`es:url`);
            const myOptions = { nodes: [esUrl] };
            setClient(myOptions);
            try {
                const results = await createClass(`users`).in(`odmtest`).findAll();
                expect(results.length).to.equal(2);
                expect(myOptions).to.deep.equal({ nodes: [esUrl] });    //caller options remain intact
            } finally {
                setClient(esUrl);
            }
        });

        it(`can't search when '_alterSearch' returns something else than an object`, async () => {
            class AlteringClass extends createClass(`users`) {
                static _alterSearch() {
                    return void 0;
                }
            }

            await expect(AlteringClass.in(`odmtest`).search({ query: { match_all: {} } }, 0, 10))
                .to.be.eventually.rejectedWith(`Body must be an object!`);
        });
    });

    describe(`search() highlighting`, () => {
        it(`carries the ES highlight into the instances`, async () => {
            const uuid = `abc123`;
            await bootstrapTest.createIndex(`odmtest_highlighted`, uuid);
            try {
                const MyClass = createClass(`highlighted`).in(`odmtest`);
                await new MyClass({ text: `the quick brown fox` }, `highlighted1`).save();

                const results = await MyClass.search({
                    query: {
                        match: {
                            text: `brown`
                        }
                    },
                    highlight: {
                        fields: {
                            text: {}
                        }
                    }
                });

                expect(results.length).to.equal(1);
                expect(results[0]._highlight).to.be.an(`object`);
                expect(results[0]._highlight.text).to.be.an(`array`);
                expect(results[0]._highlight.text[0]).to.include(`<em>brown</em>`);

                //The highlight is metadata, so it stays out of the document data
                expect(Object.keys(results[0])).to.deep.equal([`text`]);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_highlighted`, uuid);
            }
        });
    });

    describe(`static *bulkIterator()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`tests higher amount of data`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await MyClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            });

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    name: `name_${i}`
                });
            }

            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            let total = 0;
            let bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            });
            for await (const bulk of bulks) {
                total += bulk.length;
            }
            expect(total).to.equal(size);

            total = 0;
            const bulkSize = 100;
            bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                },
                size: bulkSize
            });
            for await (const bulk of bulks) {
                total += bulk.length;
                expect(bulk.length).to.equal(bulkSize);
            }
            expect(total).to.equal(size);
        });

        it(`iterates without any query specified`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const bulks = MyClass.bulkIterator();
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            let iterations = 0;
            for await (const bulk of bulks) {
                iterations++;
                for (const result of bulk) {
                    expect(possibleValues).to.include(result.name);
                    expect(result).to.be.an.instanceOf(MyClass);

                    expect(result._id).to.be.a(`string`);
                    expect(result._primary_term).to.be.a(`number`);
                    expect(result._seq_no).to.be.a(`number`);
                    expect(result._version).to.be.a(`number`);
                    expect(result._score).to.be.a(`number`);
                }
            }
            expect(iterations).to.equal(1);
        });

        it(`iterates with match_all`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            });

            const possibleValues = [userObject1.document.name, userObject2.document.name];
            let iterations = 0;
            for await (const bulk of bulks) {
                iterations++;
                expect(bulk.length).to.equal(2);
                expect(bulk._total).to.equal(2);
                for (const result of bulk) {
                    expect(possibleValues).to.include(result.name);
                    expect(result).to.be.an.instanceOf(MyClass);

                    expect(result._id).to.be.a(`string`);
                    expect(result._primary_term).to.be.a(`number`);
                    expect(result._seq_no).to.be.a(`number`);
                    expect(result._version).to.be.a(`number`);
                    expect(result._score).to.be.a(`number`);
                }
            }
            expect(iterations).to.equal(1);
        });

        it(`iterates with custom cache`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            let instances, cache;
            MyClass._afterSearch = async function (newInstances, newCache) {
                instances = newInstances;
                cache = newCache;
            };

            const bulks = MyClass.bulkIterator(void 0, { cache: { custom: true } });
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            for await (const bulk of bulks) {
                expect(bulk.length).to.equal(2);
                expect(bulk._total).to.equal(2);
                for (const result of bulk) {
                    expect(possibleValues).to.include(result.name);
                    expect(result).to.be.an.instanceOf(MyClass);

                    expect(result._id).to.be.a(`string`);
                    expect(result._primary_term).to.be.a(`number`);
                    expect(result._seq_no).to.be.a(`number`);
                    expect(result._version).to.be.a(`number`);
                    expect(result._score).to.be.a(`number`);
                }
            }

            expect(instances.length).to.equal(2);
            expect(cache?.custom).to.equal(true);
        });

        it(`iterates using non existing property`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match: {
                        unknown: `whatever`
                    }
                }
            });

            let iterations = 0;
            for await (const bulk of bulks) {
                iterations++;
                void bulk;
            }

            //The iterator yields nothing at all - an assertion placed in the loop body would never run
            expect(iterations).to.equal(0);
        });

        it(`won't find anything when iterating using incorrect tenant`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*incorrect`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            });

            let iterations = 0;
            for await (const bulk of bulks) {
                iterations++;
                void bulk;
            }

            expect(iterations).to.equal(0);
        });

        it(`iterates without source fields`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            }, { source: false });

            let iterations = 0;
            for await (const bulk of bulks) {
                iterations++;
                expect(bulk.length).to.equal(2);

                expect(bulk[0]._id).not.to.be.undefined;
                expect(bulk[0]._version).not.to.be.undefined;
                expect(bulk[0]._primary_term).not.to.be.undefined;
                expect(bulk[0]._seq_no).not.to.be.undefined;
                expect(bulk[0]._score).not.to.be.undefined;
                expect(bulk[0]._source).to.be.undefined;

                expect(bulk[1]._id).not.to.be.undefined;
                expect(bulk[1]._version).not.to.be.undefined;
                expect(bulk[1]._primary_term).not.to.be.undefined;
                expect(bulk[1]._seq_no).not.to.be.undefined;
                expect(bulk[1]._score).not.to.be.undefined;
                expect(bulk[1]._source).to.be.undefined;
            }
            expect(iterations).to.equal(1);
        });

        it(`iterates for specific field only`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            }, { source: [`name`] });

            let iterations = 0;
            for await (const bulk of bulks) {
                iterations++;
                expect(bulk.length).to.equal(2);

                expect(bulk[0]._id).not.to.be.undefined;
                expect(bulk[0]._version).not.to.be.undefined;
                expect(bulk[0]._primary_term).not.to.be.undefined;
                expect(bulk[0]._seq_no).not.to.be.undefined;
                expect(bulk[0]._score).not.to.be.undefined;
                expect(bulk[0]._source).not.to.be.undefined;
                expect(bulk[0]._source.name).not.to.be.undefined;
                expect(bulk[0]._source.status).to.be.undefined;

                expect(bulk[1]._id).not.to.be.undefined;
                expect(bulk[1]._version).not.to.be.undefined;
                expect(bulk[1]._primary_term).not.to.be.undefined;
                expect(bulk[1]._seq_no).not.to.be.undefined;
                expect(bulk[1]._score).not.to.be.undefined;
                expect(bulk[1]._source).not.to.be.undefined;
                expect(bulk[1]._source.name).not.to.be.undefined;
                expect(bulk[1]._source.status).to.be.undefined;
            }
            expect(iterations).to.equal(1);
        });

        it(`iterates for documents with size parameter`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }, size: 1
            });

            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            let total = 0;
            for await (const bulk of bulks) {
                total++;
                expect(bulk.length).to.equal(1);
                expect(possibleValues).to.include(bulk[0].html);
            }
            expect(total).to.equal(2);
        });

        it(`iterates using explicitly specified PIT ID`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);

            const myPIT = await MyClass.openPIT();
            try {
                let bulks = MyClass.bulkIterator({
                    query: {
                        match_all: {}
                    }, size: 1
                }, { pitId: myPIT });

                let possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
                let total = 0;
                for await (const bulk of bulks) {
                    total++;
                    expect(bulk.length).to.equal(1);
                    expect(possibleValues).to.include(bulk[0].html);
                }
                expect(total).to.equal(2);

                //And repeat again with the same PIT
                bulks = MyClass.bulkIterator({
                    query: {
                        match_all: {}
                    }, size: 1
                }, { pitId: myPIT });

                possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
                total = 0;
                for await (const bulk of bulks) {
                    total++;
                    expect(bulk.length).to.equal(1);
                    expect(possibleValues).to.include(bulk[0].html);
                }
                expect(total).to.equal(2);

            } finally {
                await MyClass.closePIT(myPIT);
            }
        });
    });

    describe(`static *itemIterator()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`tests higher amount of data`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await MyClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            });

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    name: `name_${i}`
                });
            }

            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            let total = 0;
            let items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            });
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(size);

            total = 0;
            const bulkSize = 100;
            items = MyClass.itemIterator({
                query: {
                    match_all: {}
                },
                size: bulkSize
            });
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(size);
        });

        it(`iterates without any query specified`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const items = MyClass.itemIterator();
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            let iterations = 0;
            for await (const item of items) {
                iterations++;
                expect(possibleValues).to.include(item.name);
                expect(item).to.be.an.instanceOf(MyClass);

                expect(item._id).to.be.a(`string`);
                expect(item._primary_term).to.be.a(`number`);
                expect(item._seq_no).to.be.a(`number`);
                expect(item._version).to.be.a(`number`);
                expect(item._score).to.be.a(`number`);
            }
            expect(iterations).to.equal(2);
        });

        it(`iterates with match_all`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            });

            const possibleValues = [userObject1.document.name, userObject2.document.name];
            let iterations = 0;
            for await (const item of items) {
                iterations++;
                expect(possibleValues).to.include(item.name);
                expect(item).to.be.an.instanceOf(MyClass);

                expect(item._id).to.be.a(`string`);
                expect(item._primary_term).to.be.a(`number`);
                expect(item._seq_no).to.be.a(`number`);
                expect(item._version).to.be.a(`number`);
                expect(item._score).to.be.a(`number`);
            }
            expect(iterations).to.equal(2);
        });

        it(`iterates using custom cache`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            let instances, cache;
            MyClass._afterSearch = async function (newInstances, newCache) {
                instances = newInstances;
                cache = newCache;
            };

            const items = MyClass.itemIterator(void 0, { cache: { custom: true } });

            const possibleValues = [userObject1.document.name, userObject2.document.name];
            let iterations = 0;
            for await (const item of items) {
                iterations++;
                expect(possibleValues).to.include(item.name);
                expect(item).to.be.an.instanceOf(MyClass);

                expect(item._id).to.be.a(`string`);
                expect(item._primary_term).to.be.a(`number`);
                expect(item._seq_no).to.be.a(`number`);
                expect(item._version).to.be.a(`number`);
                expect(item._score).to.be.a(`number`);
            }
            expect(iterations).to.equal(2);

            expect(instances.length).to.equal(2);
            expect(cache?.custom).to.equal(true);
        });

        it(`iterates using non existing property`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const items = MyClass.itemIterator({
                query: {
                    match: {
                        unknown: `whatever`
                    }
                }
            });

            let total = 0;
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(0);
        });

        it(`won't find anything when iterating using incorrect tenant`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*incorrect`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            });

            let total = 0;
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(0);
        });

        it(`iterates without source fields`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            }, { source: false });

            let iterations = 0;
            for await (const item of items) {
                iterations++;
                expect(item._id).not.to.be.undefined;
                expect(item._version).not.to.be.undefined;
                expect(item._primary_term).not.to.be.undefined;
                expect(item._seq_no).not.to.be.undefined;
                expect(item._score).not.to.be.undefined;
                expect(item._source).to.be.undefined;
            }
            expect(iterations).to.equal(2);
        });

        it(`iterates for specific field only`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            }, { source: [`name`] });

            let iterations = 0;
            for await (const item of items) {
                iterations++;
                expect(item._id).not.to.be.undefined;
                expect(item._version).not.to.be.undefined;
                expect(item._primary_term).not.to.be.undefined;
                expect(item._seq_no).not.to.be.undefined;
                expect(item._score).not.to.be.undefined;
                expect(item._source).not.to.be.undefined;
                expect(item._source.name).not.to.be.undefined;
                expect(item._source.status).to.be.undefined;
            }
            expect(iterations).to.equal(2);
        });

        it(`iterates for documents with size parameter`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                },
                size: 1
            });

            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            let total = 0;
            for await (const item of items) {
                total++;
                expect(possibleValues).to.include(item.html);
            }
            expect(total).to.equal(2);
        });

        it(`iterates using explicitly specified PIT ID`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];

            const myPIT = await MyClass.openPIT();
            try {
                let items = MyClass.itemIterator({
                    query: {
                        match_all: {}
                    },
                    size: 1
                }, { pitId: myPIT });
                let total = 0;
                for await (const item of items) {
                    total++;
                    expect(possibleValues).to.include(item.html);
                }
                expect(total).to.equal(2);

                //And repeat again with the same PIT
                items = MyClass.itemIterator({
                    query: {
                        match_all: {}
                    },
                    size: 1
                }, { pitId: myPIT });
                total = 0;
                for await (const item of items) {
                    total++;
                    expect(possibleValues).to.include(item.html);
                }
                expect(total).to.equal(2);

            } finally {
                await MyClass.closePIT(myPIT);
            }
        });
    });

    describe(`static findAll()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`finds all user entries`, async () => {
            const MyClass = createClass(`users`).in(`odmtest*`);
            const results = await MyClass.findAll();

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(2);
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result.constructor._tenant).to.equal(`odmtest`);
            }
        });

        it(`finds all documents`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.findAll();

            expect(results.length).to.equal(2);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);

                await result.save();
            }
        });

        it(`finds all documents with source specified`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.findAll(true);

            //With "source" given the entries are plain ES objects, not instances
            expect(results).to.be.an(`array`);
            expect(results).not.to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(2);

            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(result).not.to.be.instanceOf(MyClass);
                expect(result._id).to.be.a(`string`);
                expect(possibleValues).to.include(result._source.html);
            }
        });

        it(`finds all documents with specific source fields only`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.findAll([`name`]);

            expect(results.length).to.equal(2);
            for (const result of results) {
                expect(result._source.name).not.to.be.undefined;
                expect(result._source.status).to.be.undefined;
            }
        });
    });

    describe(`static find()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`can't find undefined id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.find()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find non-string id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.find(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.find([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.find(`unknown`);
            expect(result).to.be.instanceOf(BulkArray);
            expect(result.length).to.equal(0);

            //The missing id is recorded in the status ledger - this is what distinguishes "find" from "search"
            const status = result.esStatus();
            expect(status.errors).to.be.true;
            expect(status.count).to.equal(1);
            expect(status.items.length).to.equal(1);
            expect(status.items[0].id).to.equal(`unknown`);
            expect(status.items[0].index).to.equal(MyClass.alias);
            expect(status.items[0].status).to.equal(404);
            expect(status.items[0].type).to.equal(`RESOURCE:NOT_FOUND`);
            expect(status.items[0].message).to.equal(`Item not found`);
        });

        it(`can't find array with not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.find([`invalid`, `unknown`]);
            expect(results).to.be.an(`array`);
            expect(results.length).to.equal(0);

            const status = results.esStatus();
            expect(status.errors).to.be.true;
            expect(status.count).to.equal(2);
            expect(status.items.map((item) => item.id).sort()).to.deep.equal([`invalid`, `unknown`]);
            for (const item of status.items) {
                expect(item.index).to.equal(MyClass.alias);
                expect(item.status).to.equal(404);
                expect(item.type).to.equal(`RESOURCE:NOT_FOUND`);
            }
        });

        it(`records only the missing ids when some of them are found`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.find([`unknown`, defaultDocument1.id]);

            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(defaultDocument1.id);

            //The ledger holds a record for the found item too, but only the missing one is a failure
            const status = results.esStatus();
            expect(status.errors).to.be.true;
            expect(status.count).to.equal(2);
            expect(status.items.length).to.equal(1);
            expect(status.items[0].id).to.equal(`unknown`);
            expect(status.items[0].status).to.equal(404);

            const allStatus = results.esStatus(true);
            expect(allStatus.items.length).to.equal(2);
            expect(allStatus.items.map((item) => item.id).sort()).to.deep.equal([defaultDocument1.id, `unknown`].sort());
        });

        it(`records no missing id when the plain objects are requested`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.find([`unknown`, defaultDocument1.id], true);

            //With "source" given a plain array is returned, so there is no ledger to record into
            expect(results).to.be.an(`array`);
            expect(results).not.to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(defaultDocument1.id);
        });

        it(`finds given user entry`, async () => {
            const MyClass = createClass(`users`).in(`odmtest*`);
            const results = await MyClass.find(userObject1.id);

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
            expect(results[0]._score).to.be.a(`number`);
            expect(results[0].name).to.equal(userObject1.document.name);
            expect(results[0].status).to.equal(userObject1.document.status);
        });

        it(`finds given user entry in array`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.find([userObject1.id]);

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
            expect(results[0]._score).to.be.a(`number`);
            expect(results[0].name).to.equal(userObject1.document.name);
            expect(results[0].status).to.equal(userObject1.document.status);
        });

        it(`finds an array of documents with a wildcard tenant`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*`);
            const results = await MyClass.find([defaultDocument1.id, defaultDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [defaultDocument1.id, defaultDocument2.id];
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`finds only existing ids from array`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*`);
            const results = await MyClass.find([`unknown`, defaultDocument1.id, defaultDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [defaultDocument1.id, defaultDocument2.id];
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`finds an array of documents`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.find([defaultDocument1.id, defaultDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [defaultDocument1.id, defaultDocument2.id];
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`finds an array of documents with source specified`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.find([defaultDocument1.id, defaultDocument2.id], true);

            expect(results.length).to.equal(2);
            const possibleIds = [defaultDocument1.id, defaultDocument2.id];
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result._source.html);
            }
        });

        it(`finds the same id across multiple tenants`, async () => {
            await bootstrapTest.createIndex(`odmtestdupa_dupfind`, `abc123`);
            await bootstrapTest.createIndex(`odmtestdupb_dupfind`, `abc123`);
            try {
                const MyClass = createClass(`dupfind`).in(`odmtest*`);     //wildcard tenant
                await new (MyClass.in(`odmtestdupa`))({ value: `a` }, `shared`).save();
                await new (MyClass.in(`odmtestdupb`))({ value: `b` }, `shared`).save();

                const results = await MyClass.find([`shared`]);
                expect(results.length).to.equal(2);
                expect(results.map((item) => item.constructor._tenant).sort().join(`,`)).to.equal(`odmtestdupa,odmtestdupb`);
            } finally {
                await bootstrapTest.deleteIndex(`odmtestdupa_dupfind`, `abc123`);
                await bootstrapTest.deleteIndex(`odmtestdupb_dupfind`, `abc123`);
            }
        });
    });

    describe(`static get()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`can't get undefined id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.get()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`calls '_afterSearch' with the loaded instances`, async () => {
            let seenInstances = void 0;
            let cachePassed = `untouched`;
            class HookedClass extends createClass(`users`) {
                static async _afterSearch(instances, cache) {
                    seenInstances = instances;
                    cachePassed = cache;
                    for (const instance of instances) {
                        instance.name = `${instance.name}!`;
                    }
                }
            }

            const MyClass = HookedClass.in(`odmtest`);
            const result = await MyClass.get(userObject1.id);

            //The hook may enrich the loaded instances, so its result has to reach the caller
            expect(seenInstances).to.be.an(`array`);
            expect(seenInstances.length).to.equal(1);
            expect(seenInstances[0]).to.be.an.instanceOf(MyClass);
            expect(result.name).to.equal(`${userObject1.document.name}!`);

            //"get" takes no "additional" argument, so it has no cache to pass on
            expect(cachePassed).to.be.undefined;
        });

        it(`can't get non-string id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.get(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.get([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get without specifying tenant`, async () => {
            const MyClass = createClass(`documents`);
            await expect(MyClass.get([defaultDocument1.id, defaultDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'get' with current tenant '*', full alias is '*_documents'!`);
        });

        it(`can't get not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.get(`unknown`)).to.be.eventually.rejectedWith(`"found":false`);
        });

        it(`can't get array with not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.get([userObject1.id, `unknown`])).to.be.eventually.rejectedWith(`"found":false`);
        });

        it(`gets empty field when empty array is specified`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.get([]);
            expect(result).to.be.instanceOf(BulkArray);
            expect(result.length).to.equal(0);
        });

        it(`gets given user entry`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.get(userObject1.id);
            expect(result).to.be.instanceOf(BaseModel);

            expect(result._id).to.equal(userObject1.id);
            expect(result._version).to.be.a(`number`);
            expect(result._primary_term).to.be.a(`number`);
            expect(result._seq_no).to.be.a(`number`);
            expect(result._score).to.be.a(`number`);
            expect(result._score).to.equal(1);
            expect(result.name).to.equal(userObject1.document.name);
            expect(result.status).to.equal(userObject1.document.status);
        });

        it(`gets given user entry in array`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.get([userObject1.id]);

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
            expect(results[0]._score).to.be.a(`number`);
            expect(results[0]._score).to.equal(1);
            expect(results[0].name).to.equal(userObject1.document.name);
            expect(results[0].status).to.equal(userObject1.document.status);
        });

        it(`gets an array of documents`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.get([defaultDocument1.id, defaultDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [defaultDocument1.id, defaultDocument2.id];
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);
                expect(result._score).to.equal(1);
                expect(possibleValues).to.include(result.html);
                await result.save();
            }
        });
    });

    describe(`static head()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`can't head undefined id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.head()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't head non-string id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.head(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't head array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.head([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't head without specifying tenant`, async () => {
            const MyClass = createClass(`documents`);
            await expect(MyClass.head([defaultDocument1.id, defaultDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'head' with current tenant '*', full alias is '*_documents'!`);
        });

        it(`can't head not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.head(`unknown`)).to.be.eventually.rejectedWith(`"found":false`);
        });

        it(`can't head array with not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.head([userObject1.id, `unknown`])).to.be.eventually.rejectedWith(`"found":false`);
        });

        it(`heads empty field when empty array is specified`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.head([]);
            expect(result).to.be.an(`array`);
            expect(result.length).to.equal(0);
        });

        it(`heads given user entry`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.head(userObject1.id);

            expect(result._id).to.equal(userObject1.id);
            expect(result._index).to.be.a(`string`);
            expect(result._version).to.be.a(`number`);
            expect(result._primary_term).to.be.a(`number`);
            expect(result._seq_no).to.be.a(`number`);

            //"head" asks for the metadata only - the document data must not come with it
            expect(result._source).to.be.undefined;
            expect(result.found).to.be.true;
        });

        it(`heads given user entry in array`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.head([userObject1.id]);

            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._index).to.be.a(`string`);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
        });

        it(`heads an array of documents`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.head([defaultDocument1.id, defaultDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [defaultDocument1.id, defaultDocument2.id];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._index).to.be.a(`string`);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
            }
        });
    });

    describe(`static delete()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`can't delete undefined id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.delete()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete non-string id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.delete(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.delete([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete multiple ids when version is specified`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            let thrownError;
            try {
                await MyClass.delete([defaultDocument1.id, defaultDocument2.id], 6);
            } catch (e) {
                thrownError = e;
            }
            expect(thrownError).not.to.be.undefined;
            expect(thrownError.message).to.equal(`You cannot use parameter 'version' with multiple ids specified!`);
            expect(thrownError.statusCode).to.equal(400);
        });

        it(`can't delete not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.delete(`unknown`)).to.be.eventually.rejectedWith(`not_found`);
        });

        it(`can't delete not-existing id in array`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.delete([`unknown`]);

            expect(result.items[0].delete.status).to.equal(404);
        });

        it(`deletes given user entry`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.delete(userObject1.id);

            expect(result.items[0].delete.status).to.equal(200);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists).to.be.false;
        });

        it(`deletes given user entry in array`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.delete([userObject1.id]);

            expect(results.items[0].delete.status).to.equal(200);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists).to.be.false;
        });

        it(`deletes an array of documents`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.delete([defaultDocument1.id, defaultDocument2.id]);

            expect(results.items[0].delete.status).to.equal(200);
            expect(results.items[1].delete.status).to.equal(200);

            const exists1 = await bootstrapTest.client.exists({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(exists1).to.be.false;

            const exists2 = await bootstrapTest.client.exists({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(exists2).to.be.false;
        });

        it(`deletes only existing entries from given array`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.delete([`not`, defaultDocument1.id, defaultDocument2.id, `existing`]);

            expect(results.items[0].delete.status).to.equal(404);
            expect(results.items[1].delete.status).to.equal(200);
            expect(results.items[2].delete.status).to.equal(200);
            expect(results.items[3].delete.status).to.equal(404);

            const exists1 = await bootstrapTest.client.exists({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(exists1).to.be.false;

            const exists2 = await bootstrapTest.client.exists({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(exists2).to.be.false;
        });

        it(`throws error when deleting single incorrect instance`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            await expect(MyClass.delete(`whatever`)).to.be.eventually.rejectedWith(`not_found`);
        });

        it(`can't delete incorrect version`, async () => {
            const record = await bootstrapTest.client.get({
                index: userObject1.index,
                id: userObject1.id
            });
            const storedVersion = record._version;

            const MyClass = createClass(`users`).in(`odmtest`);

            //Consumers branch on the status code, not on the message
            let thrownError;
            try {
                await MyClass.delete(userObject1.id, storedVersion + 1);
            } catch (e) {
                thrownError = e;
            }
            expect(thrownError).not.to.be.undefined;
            expect(thrownError.message).to.equal(`Specified version '${storedVersion + 1}' is different than stored version '${storedVersion}'!`);
            expect(thrownError.statusCode).to.equal(409);
        });

        it(`deletes correct version`, async () => {
            const record = await bootstrapTest.client.get({
                index: userObject1.index,
                id: userObject1.id
            });
            const storedVersion = record._version;

            const MyClass = createClass(`users`).in(`odmtest`);
            await MyClass.delete(userObject1.id, storedVersion);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists).to.be.false;
        });

        it(`returns an empty response for an empty array of ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const result = await MyClass.delete([]);
            expect(result).to.deep.equal({ errors: false, items: [], took: 0 });
        });

        it(`reports the ES error reason, with a generic message as the fallback`, async () => {
            const originalClient = esClient.client;
            let responseItem;
            try {
                esClient.client = {
                    bulk: async () => {
                        return streamedBulkResponse([responseItem]);
                    }
                };
                const MyClass = createClass(`users`).in(`odmtest`);

                responseItem = { delete: { _id: `nothing`, status: 409, error: { reason: `Version conflict happened.` } } };
                let thrownError;
                try {
                    await MyClass.delete(`nothing`);
                } catch (error) {
                    thrownError = error;
                }
                expect(thrownError).not.to.be.undefined;
                expect(thrownError.message).to.equal(`Version conflict happened.`);
                expect(thrownError.statusCode).to.equal(409);

                //Neither "error.reason" nor "result" is present in the response
                responseItem = { delete: { _id: `nothing`, status: 500 } };
                thrownError = void 0;
                try {
                    await MyClass.delete(`nothing`);
                } catch (error) {
                    thrownError = error;
                }
                expect(thrownError).not.to.be.undefined;
                expect(thrownError.message).to.equal(`Error happened during delete of item with id nothing`);
                expect(thrownError.statusCode).to.equal(500);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`doesn't refresh the index when the immediate refresh is disabled`, async () => {
            //The fixture index has "refresh_interval: -1" - a delete stays invisible until something refreshes
            const MyClass = createClass(`users`).in(`odmtest`).immediateRefresh(false);
            await MyClass.delete(`ok`);

            const stale = await bootstrapTest.client.search({ index: `odmtest_users`, query: { ids: { values: [`ok`] } } });
            expect(stale.hits.total.value).to.equal(1);

            await MyClass.refresh();
            const fresh = await bootstrapTest.client.search({ index: `odmtest_users`, query: { ids: { values: [`ok`] } } });
            expect(fresh.hits.total.value).to.equal(0);
        });
    });

    describe(`static exists()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`can't check undefined id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.exists()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check non-string id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.exists(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.exists([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`checks not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.exists(`unknown`);

            expect(result).to.be.false;
        });

        it(`checks empty array of ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.exists([]);
            expect(results).to.deep.equal([]);
        });

        it(`checks given user entry`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const result = await MyClass.exists(userObject1.id);

            expect(result).to.be.true;
        });

        it(`checks given user entry in array`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const results = await MyClass.exists([userObject1.id]);

            expect(results.length).to.equal(1);
            expect(results[0]).to.be.true;
        });

        it(`checks an array of documents`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.exists([defaultDocument1.id, defaultDocument2.id]);

            expect(results.length).to.equal(2);
            expect(results[0]).to.be.true;
            expect(results[1]).to.be.true;
        });

        it(`checks only existing entries from given array`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const results = await MyClass.exists([`not`, defaultDocument1.id, defaultDocument2.id, `existing`]);

            expect(results.length).to.equal(4);
            expect(results[0]).to.be.false;
            expect(results[1]).to.be.true;
            expect(results[2]).to.be.true;
            expect(results[3]).to.be.false;
        });

    });

    describe(`static update()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`can't update undefined id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.update()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update non-string id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.update(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.update([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update without body specified`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await expect(MyClass.update(`ok`, void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`updates data instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            const result = await DocumentClass.update([`document1`, `document2`], {
                doc: {
                    documentTitle: `:)`
                }
            });

            expect(result.items[0].update.status).to.equal(200);
            expect(result.items[1].update.status).to.equal(200);

            const results1 = await bootstrapTest.client.get({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(results2._source.documentTitle).to.equal(`:)`);
        });

        it(`can't update incorrect instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            const result = await DocumentClass.update([`document1`, `document2`], {
                doc: {
                    name: `:)`
                }
            });

            expect(result.items[0].update.status).to.equal(400);
            expect(result.items[1].update.status).to.equal(400);

            const results1 = await bootstrapTest.client.get({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1._source.name).to.be.undefined;

            const results2 = await bootstrapTest.client.get({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(results2._source.name).to.be.undefined;
        });

        it(`throws error when updating single incorrect instance`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            await expect(DocumentClass.update(`document1`, {
                doc: {
                    name: `:)`
                }
            })).to.be.eventually.rejectedWith(`mapping set to strict, dynamic introduction of [name] within [_doc] is not allowed`);

            const results1 = await bootstrapTest.client.get({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1._source.name).to.be.undefined;
        });

        it(`returns an empty response for an empty array of ids`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const result = await MyClass.update([], { doc: { status: `:D` } });
            expect(result).to.deep.equal({ errors: false, items: [], took: 0 });
        });

        it(`reports a generic message when ES doesn't provide any`, async () => {
            const originalClient = esClient.client;
            try {
                esClient.client = {
                    bulk: async () => {
                        //Neither "error.reason" nor "result" is present in the response
                        return streamedBulkResponse([{ update: { _id: `nothing`, status: 500 } }]);
                    }
                };

                let thrownError;
                try {
                    await createClass(`users`).in(`odmtest`).update(`nothing`, { doc: { status: `:D` } });
                } catch (error) {
                    thrownError = error;
                }

                expect(thrownError).not.to.be.undefined;
                expect(thrownError.message).to.equal(`Error happened during update of item with id nothing`);
                expect(thrownError.statusCode).to.equal(500);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`doesn't refresh the index when the immediate refresh is disabled`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`).immediateRefresh(false);
            await MyClass.update(`ok`, { doc: { name: `renamed` } });

            const stale = await bootstrapTest.client.search({ index: `odmtest_users`, query: { match: { name: `renamed` } } });
            expect(stale.hits.total.value).to.equal(0);

            await MyClass.refresh();
            const fresh = await bootstrapTest.client.search({ index: `odmtest_users`, query: { match: { name: `renamed` } } });
            expect(fresh.hits.total.value).to.equal(1);
        });
    });

    describe(`static count()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`counts user entries`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const count = await MyClass.count();
            expect(count).to.equal(2);
        });

        it(`counts without a body when '_alterSearch' is overridden`, async () => {
            class FilteredClass extends createClass(`users`) {
                static _alterSearch(body) {
                    body.query = {
                        term: {
                            status: `:)`
                        }
                    };
                    return body;
                }
            }

            const count = await FilteredClass.in(`odmtest`).count();
            expect(count).to.equal(1);
        });

        it(`counts all documents entries`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`);
            const count = await MyClass.count();
            expect(count).to.equal(2);
        });

        it(`counts all document entries with a wildcard tenant`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*`);
            const count = await MyClass.count();
            expect(count).to.equal(2);
        });

        it(`counts users with specific status`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const count = await MyClass.count({
                query: {
                    term: {
                        status: `:)`
                    }
                }
            });
            expect(count).to.equal(1);
        });

        it(`counts users with one of multiple statuses`, async () => {
            const MyClass = createClass(`users`).in(`odmtest*`);
            const count = await MyClass.count({
                query: {
                    bool: {
                        should: [{
                            term: {
                                status: `:)`
                            }
                        }, {
                            term: {
                                status: `:(`
                            }
                        }]
                    }
                }
            });
            expect(count).to.equal(2);
        });

        it(`counts documents with specific ids`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest*`);
            const count = await MyClass.count({
                query: {
                    ids: {
                        values: [`document1`, `document2`]
                    }
                }
            });
            expect(count).to.equal(2);
        });
    });

    describe(`static updateByQuery()`, () => {
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`updates data instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            const result = await DocumentClass.updateByQuery({
                query: {
                    match_all: {}
                },

                script: {
                    source: `ctx._source.documentTitle = ':)'`,
                    lang: `painless`
                }
            });
            expect(result.updated).to.equal(2);

            const results1 = await bootstrapTest.client.get({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(results2._source.documentTitle).to.equal(`:)`);
        });

        it(`updates data instances with custom specified scroll size parameter`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            const result = await DocumentClass.updateByQuery({
                query: {
                    match_all: {}
                },

                script: {
                    source: `ctx._source.documentTitle = ':)'`,
                    lang: `painless`
                }
            }, 1);
            expect(result.updated).to.equal(2);

            const results1 = await bootstrapTest.client.get({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(results2._source.documentTitle).to.equal(`:)`);
        });

        it(`updates data instances with a wildcard tenant`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest*`);

            const result = await DocumentClass.updateByQuery({
                query: {
                    match_all: {}
                },

                script: {
                    source: `ctx._source.documentTitle = ':)'`,
                    lang: `painless`
                }
            });
            expect(result.updated).to.equal(2);

            const results1 = await bootstrapTest.client.get({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(results2._source.documentTitle).to.equal(`:)`);
        });

        it(`updates data instances with 'wait_for' immediate refresh`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`).immediateRefresh(`wait_for`);

            const result = await MyClass.updateByQuery({
                query: {
                    match_all: {}
                },
                script: {
                    source: `ctx._source.html = 'updated'`,
                    lang: `painless`
                }
            });
            expect(result.updated).to.equal(2);
        });

        it(`refreshes the index with the 'wait_for' immediate refresh`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`).immediateRefresh(`wait_for`);

            const result = await MyClass.updateByQuery({
                query: {
                    match_all: {}
                },
                script: {
                    source: `ctx._source.documentTitle = 'awaited'`,
                    lang: `painless`
                }
            });
            expect(result.updated).to.equal(2);

            //"wait_for" must still reach ES as a refresh - the fixture index never refreshes on its own
            const visible = await bootstrapTest.client.search({
                index: `odmtest_documents`,
                query: {
                    term: {
                        documentTitle: `awaited`
                    }
                }
            });
            expect(visible.hits.hits.length).to.equal(2);
        });

        it(`doesn't refresh the index when the immediate refresh is disabled`, async () => {
            const MyClass = createClass(`documents`).in(`odmtest`).immediateRefresh(false);

            const result = await MyClass.updateByQuery({
                query: {
                    match_all: {}
                },
                script: {
                    source: `ctx._source.documentTitle = 'silent'`,
                    lang: `painless`
                }
            });
            expect(result.updated).to.equal(2);

            //"refresh_interval" of the fixture index is -1, so an unrefreshed update stays invisible to a search
            const notVisible = await bootstrapTest.client.search({
                index: `odmtest_documents`,
                query: {
                    term: {
                        documentTitle: `silent`
                    }
                }
            });
            expect(notVisible.hits.hits.length).to.equal(0);

            await bootstrapTest.client.indices.refresh({
                index: `odmtest_documents`
            });
            const visible = await bootstrapTest.client.search({
                index: `odmtest_documents`,
                query: {
                    term: {
                        documentTitle: `silent`
                    }
                }
            });
            expect(visible.hits.hits.length).to.equal(2);
        });

        it(`updates only what '_alterSearch' allows`, async () => {
            class FilteredClass extends createClass(`documents`) {
                static _alterSearch(body) {
                    body.query = {
                        ids: {
                            values: [`document1`]
                        }
                    };
                    return body;
                }
            }

            //The hook narrows the query down to a single document - the "match_all" below would have updated both
            const result = await FilteredClass.in(`odmtest`).updateByQuery({
                query: {
                    match_all: {}
                },
                script: {
                    source: `ctx._source.documentTitle = 'altered'`,
                    lang: `painless`
                }
            });
            expect(result.updated).to.equal(1);

            const updated = await bootstrapTest.client.get({
                index: `odmtest_documents`,
                id: `document1`
            });
            expect(updated._source.documentTitle).to.equal(`altered`);

            const untouched = await bootstrapTest.client.get({
                index: `odmtest_documents`,
                id: `document2`
            });
            expect(untouched._source.documentTitle).to.be.undefined;
        });
    });

    describe(`static deleteByQuery()`, () => {
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            defaultDocument1 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `odmtest_documents`,
                document: {
                    html: `d_default`
                },
                id: `document2`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`deletes data instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            const result = await DocumentClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            expect(result.deleted).to.equal(2);

            const results1 = await bootstrapTest.client.exists({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(results2).to.be.false;
        });

        it(`deletes data instances with custom specified scroll size parameter`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            const result = await DocumentClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            }, 1);
            expect(result.deleted).to.equal(2);

            const results1 = await bootstrapTest.client.exists({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(results2).to.be.false;
        });

        it(`deletes data instances with a wildcard tenant`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest*`);

            const result = await DocumentClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            expect(result.deleted).to.equal(2);

            const results1 = await bootstrapTest.client.exists({
                index: defaultDocument1.index,
                id: defaultDocument1.id
            });
            expect(results1).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: defaultDocument2.index,
                id: defaultDocument2.id
            });
            expect(results2).to.be.false;
        });

        it(`doesn't refresh the index when the immediate refresh is disabled`, async () => {
            const DocumentClass = createClass(`documents`).in(`odmtest`).immediateRefresh(false);

            const result = await DocumentClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            expect(result.deleted).to.equal(2);

            //The documents are gone, but an unrefreshed delete is still invisible to a search
            const notVisible = await bootstrapTest.client.search({
                index: `odmtest_documents`,
                query: {
                    match_all: {}
                }
            });
            expect(notVisible.hits.hits.length).to.equal(2);

            await bootstrapTest.client.indices.refresh({
                index: `odmtest_documents`
            });
            const visible = await bootstrapTest.client.search({
                index: `odmtest_documents`,
                query: {
                    match_all: {}
                }
            });
            expect(visible.hits.hits.length).to.equal(0);
        });

        it(`deletes only what '_alterSearch' allows`, async () => {
            class FilteredClass extends createClass(`documents`) {
                static _alterSearch(body) {
                    body.query = {
                        ids: {
                            values: [`document1`]
                        }
                    };
                    return body;
                }
            }

            //The hook narrows the query down to a single document - the "match_all" below would have deleted both
            const result = await FilteredClass.in(`odmtest`).deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            expect(result.deleted).to.equal(1);

            expect(await bootstrapTest.client.exists({
                index: `odmtest_documents`,
                id: `document1`
            })).to.be.false;
            expect(await bootstrapTest.client.exists({
                index: `odmtest_documents`,
                id: `document2`
            })).to.be.true;
        });
    });

    describe(`static getTask() / waitForTask()`, () => {
        it(`can't be used without task id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            await expect(MyClass.getTask()).to.be.eventually.rejectedWith(`Task ID must be specified!`);
            await expect(MyClass.waitForTask(``)).to.be.eventually.rejectedWith(`Task ID must be specified!`);
        });

        it(`refuses a poll interval or a wait limit which is not a positive number`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            //A zero or a NaN interval would turn the waiting into a busy loop hammering the cluster
            await expect(MyClass.waitForTask(`someTask`, 0)).to.be.eventually.rejectedWith(`Poll interval must be a positive number!`);
            await expect(MyClass.waitForTask(`someTask`, -1)).to.be.eventually.rejectedWith(`Poll interval must be a positive number!`);
            await expect(MyClass.waitForTask(`someTask`, `2`)).to.be.eventually.rejectedWith(`Poll interval must be a positive number!`);
            await expect(MyClass.waitForTask(`someTask`, Number.NaN)).to.be.eventually.rejectedWith(`Poll interval must be a positive number!`);
            await expect(MyClass.waitForTask(`someTask`, Number.POSITIVE_INFINITY)).to.be.eventually.rejectedWith(`Poll interval must be a positive number!`);

            await expect(MyClass.waitForTask(`someTask`, 1, 0)).to.be.eventually.rejectedWith(`Maximum wait time must be a positive number!`);
            await expect(MyClass.waitForTask(`someTask`, 1, `10`)).to.be.eventually.rejectedWith(`Maximum wait time must be a positive number!`);
        });

        it(`gives up on a task which doesn't complete within the maximum wait time`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            //A task which never reports completion - the real cluster cannot be asked for one which hangs forever
            const originalClient = esClient.client;
            let calls = 0;
            try {
                esClient.client = {
                    tasks: {
                        get: async () => {
                            calls++;
                            return { body: { completed: false }, statusCode: 200, headers: {}, meta: {} };
                        }
                    }
                };

                const start = Date.now();
                await expect(MyClass.waitForTask(`neverEnding`, 0.1, 0.5))
                    .to.be.eventually.rejectedWith(`Task 'neverEnding' hasn't completed within 0.5 seconds.`);

                //It really polled repeatedly and really stopped at the limit
                expect(calls).to.be.above(1);
                expect(Date.now() - start).to.be.below(2000);
            } finally {
                esClient.client = originalClient;
            }
        });

        it(`returns the task once it completes within the maximum wait time`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            for (let i = 0; i < 5; i++) {
                await new MyClass({ status: `:)`, name: `limited${i}`, fullname: `limited ${i}` }, `limited${i}`).save();
            }

            const response = await MyClass.updateByQuery({
                query: {
                    match_all: {}
                },
                script: {
                    source: `ctx._source.status = ':|'`,
                    lang: `painless`
                }
            }, void 0, false);

            const task = await MyClass.waitForTask(response.task, 0.5, 60);
            expect(task.completed).to.be.true;
            expect(task.response.updated).to.equal(5);
        });

        it(`waits for an asynchronously started updateByQuery`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            for (let i = 0; i < 5; i++) {
                await new MyClass({ status: `:)`, name: `task${i}`, fullname: `task ${i}` }, `task${i}`).save();
            }

            const response = await MyClass.updateByQuery({
                query: {
                    match_all: {}
                },
                script: {
                    source: `ctx._source.status = ':|'`,
                    lang: `painless`
                }
            }, void 0, false);
            expect(response.task).to.be.a(`string`);

            const task = await MyClass.waitForTask(response.task, 1);
            expect(task.completed).to.be.true;
            expect(task.response.updated).to.equal(5);

            //Completed task can still be fetched
            const state = await MyClass.getTask(response.task);
            expect(state.completed).to.be.true;
        });

        it(`throws when the awaited task failed`, async () => {
            const MySource = createClass(`tasksource`).in(`odmtest`);
            const MyDestination = createClass(`taskdestination`).in(`odmtest`);

            try {
                //The source index doesn't exist - the task is created but fails
                const response = await MySource.reindex(MyDestination, void 0, void 0, false);
                expect(response.task).to.be.a(`string`);

                let thrownError;
                try {
                    await MySource.waitForTask(response.task, 1);
                } catch (error) {
                    thrownError = error;
                }

                expect(thrownError).not.to.be.undefined;
                expect(thrownError.statusCode).to.equal(500);
                expect(thrownError.body.type).to.equal(`index_not_found_exception`);
            } finally {
                try {
                    await bootstrapTest.client.indices.delete({ index: `odmtest_taskdestination*` });
                } catch (error) {
                    //OK
                }
            }
        });
    });

    describe(`static createIndex()`, () => {
        beforeEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_revisions*`
                });
            } catch (e) {
                //OK
            }
        });

        it(`can't create index with wildcard in index`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.createIndex()).to.be.eventually.rejectedWith(`You cannot use 'createIndex' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`creates new index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);
            await MyRevisions.createIndex();

            const indexExists = await bootstrapTest.client.indices.exists({
                index: MyRevisions.alias
            });
            expect(indexExists).to.be.true;

            const aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyRevisions.alias
            });
            expect(aliasExists).to.be.true;

            const realIndex = await MyRevisions.getIndex();
            expect(realIndex).not.to.be.undefined;
            expect(realIndex).not.to.equal(MyRevisions.alias);

            const existingIndex = await bootstrapTest.client.indices.exists({
                index: realIndex
            });
            expect(existingIndex).to.be.true;
        });

        it(`creates new index with given settings and mappings`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);
            await MyRevisions.createIndex({
                settings: {
                    index: {
                        refresh_interval: `-1`
                    }
                },
                mappings: {
                    dynamic: `strict`,
                    properties: {
                        revisionTitle: {
                            type: `keyword`
                        }
                    }
                }
            });

            const realIndex = await MyRevisions.getIndex();
            const settings = await bootstrapTest.client.indices.getSettings({
                index: realIndex
            });
            expect(settings[realIndex].settings.index.refresh_interval).to.equal(`-1`);

            const mappings = await bootstrapTest.client.indices.getMapping({
                index: realIndex
            });
            expect(mappings[realIndex].mappings.dynamic).to.equal(`strict`);
            expect(mappings[realIndex].mappings.properties.revisionTitle.type).to.equal(`keyword`);

            //The strict mapping given in the body really is in force
            await expect(new MyRevisions({ unknownField: `:)` }, `test`).save()).to.be.eventually.rejectedWith(`strict_dynamic_mapping_exception`);
        });

        it(`creates new index but it doesn't set an alias`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);
            await MyRevisions.createIndex(void 0, false);

            const indexExists = await bootstrapTest.client.indices.exists({
                index: MyRevisions.alias
            });
            expect(indexExists).to.be.false;

            const aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyRevisions.alias
            });
            expect(aliasExists).to.be.false;

            const existingIndices = await bootstrapTest.client.indices.stats({
                index: `odmtest_revisions-*`
            });
            expect(existingIndices.indices).to.be.an(`object`);
            expect(Object.values(existingIndices.indices).length).to.equal(1);
            expect(Object.values(existingIndices.indices)[0]).to.be.an(`object`);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_revisions*`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`static getIndex()`, () => {
        beforeEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test`
                });
            } catch (e) {
                //OK
            }
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test-1`
                });
            } catch (e) {
                //OK
            }
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test-2`
                });
            } catch (e) {
                //OK
            }
        });

        it(`can't get index with wildcard in tenant`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.getIndex()).to.be.eventually.rejectedWith(`You cannot use 'getIndex' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`throws when there are two indices for an alias`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test-1`
            });
            await bootstrapTest.client.indices.create({
                index: `odmtest_test-2`
            });
            await bootstrapTest.client.indices.putAlias({
                index: [`odmtest_test-1`, `odmtest_test-2`],
                name: `odmtest_test`,
                is_write_index: false
            });

            const MyTest = createClass(`test`).in(`odmtest`);

            await expect(MyTest.getIndex()).to.be.eventually.rejectedWith(`Found multiple indices to alias.`);
        });

        it(`gets real index of existing index`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);

            const usersIndex = await MyUsers.getIndex();
            expect(usersIndex).to.be.a(`string`);
            expect(usersIndex).not.to.be.empty;
            const usersIndexExists = await bootstrapTest.client.indices.exists({
                index: usersIndex
            });
            expect(usersIndexExists).to.be.true;

            const MyDocuments = createClass(`documents`).in(`odmtest`);
            const documentsIndex = await MyDocuments.getIndex();
            expect(documentsIndex).to.be.a(`string`);
            expect(documentsIndex).not.to.be.empty;
            const documentsIndexExists = await bootstrapTest.client.indices.exists({
                index: documentsIndex
            });
            expect(documentsIndexExists).to.be.true;
        });

        it(`doesn't return not existing index`, async () => {
            const MyUsers = createClass(`test`).in(`odmtest`);

            const usersIndex = await MyUsers.getIndex();
            expect(usersIndex).to.be.undefined;
        });

        it(`returns correct index even when we don't use aliases`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`
            });

            const MyUsers = createClass(`test`).in(`odmtest`);

            const usersIndex = await MyUsers.getIndex();
            expect(usersIndex).to.equal(MyUsers.alias);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test`
                });
            } catch (e) {
                //OK
            }
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test-1`
                });
            } catch (e) {
                //OK
            }
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test-2`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`static aliasIndex()`, () => {
        beforeEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test-abc`
                });
            } catch (e) {
                //OK
            }
        });

        it(`can't put an alias without index specified`, async () => {
            const MyRevisions = createClass(`test`).in(`odmtest`);

            await expect(MyRevisions.aliasIndex()).to.be.eventually.rejectedWith(`You have to specify an index.`);
        });

        it(`can't put an alias when ODM contains wildcard`, async () => {
            const MyRevisions = createClass(`test`); //tenant is *

            await expect(MyRevisions.aliasIndex(`test`)).to.be.eventually.rejectedWith(`You cannot use 'aliasIndex' with current tenant '*', full alias is '*_test'!`);
        });

        it(`can't use incorrect index`, async () => {
            const MyRevisions = createClass(`test`).in(`odmtest`);

            await expect(MyRevisions.aliasIndex(`a_test`)).to.be.eventually.rejectedWith(`You are specifying incorrect index. Your index transforms into alias 'a_test', ODM alias is 'odmtest_test'.`);
        });

        it(`puts alias to an index`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test-abc`
            });
            const MyTest = createClass(`test`).in(`odmtest`);

            let aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyTest.alias
            });
            expect(aliasExists).to.be.false;

            await MyTest.aliasIndex(`odmtest_test-abc`);

            aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyTest.alias
            });
            expect(aliasExists).to.be.true;
        });

        it(`can't put an existing alias to another index index`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);
            const existingIndex = await MyUsers.getIndex();

            await expect(MyUsers.aliasIndex(existingIndex)).to.be.eventually.rejectedWith(`Alias 'odmtest_users' is already used.`);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test-abc`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`static swapAlias()`, () => {
        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({ index: `odmtest_swapper*` });
            } catch (error) {
                //OK
            }
        });

        it(`can't swap invalid index`, async () => {
            const MyClass = createClass(`swapper`).in(`odmtest`);

            await expect(MyClass.swapAlias()).to.be.eventually.rejectedWith(`You have to specify an index.`);
            await expect(MyClass.swapAlias(`wrong_swapper-abc`)).to.be.eventually.rejectedWith(`You are specifying incorrect index.`);
            await expect(createClass(`swapper`).swapAlias(`odmtest_swapper-abc`)).to.be.eventually.rejectedWith(`You cannot use 'swapAlias' with current tenant '*'`);
        });

        it(`swaps alias between indices`, async () => {
            const MyClass = createClass(`swapper`).in(`odmtest`);

            const firstIndex = await MyClass.createIndex();                 //creates index and alias
            await new MyClass({ value: `first` }, `doc1`).save();
            const secondIndex = await MyClass.createIndex(void 0, false);   //index only, no alias

            //Swap, the original index stays
            const original = await MyClass.swapAlias(secondIndex);
            expect(original).to.equal(firstIndex);
            expect(await MyClass.getIndex()).to.equal(secondIndex);
            expect(await bootstrapTest.client.indices.exists({ index: firstIndex })).to.be.true;
            expect(await MyClass.count()).to.equal(0);      //alias now points to the empty index

            //Swap back and atomically remove the previously aliased index
            const original2 = await MyClass.swapAlias(firstIndex, true);
            expect(original2).to.equal(secondIndex);
            expect(await MyClass.getIndex()).to.equal(firstIndex);
            expect(await bootstrapTest.client.indices.exists({ index: secondIndex })).to.be.false;
            expect((await MyClass.get(`doc1`)).value).to.equal(`first`);
        });

        it(`swaps alias when nothing is aliased yet`, async () => {
            const MyClass = createClass(`swapper`).in(`odmtest`);
            const newIndex = await MyClass.createIndex(void 0, false);

            const original = await MyClass.swapAlias(newIndex);
            expect(original).to.be.undefined;
            expect(await MyClass.getIndex()).to.equal(newIndex);
        });

        it(`returns without changes when the index is already aliased`, async () => {
            const MyClass = createClass(`swapper`).in(`odmtest`);
            const myIndex = await MyClass.createIndex();

            const original = await MyClass.swapAlias(myIndex);
            expect(original).to.equal(myIndex);
            expect(await MyClass.getIndex()).to.equal(myIndex);
        });

        it(`swaps alias and atomically removes a concrete index occupying the alias name`, async () => {
            const MyClass = createClass(`swapper`).in(`odmtest`);

            //Not an alias at all - a concrete index named as the alias
            await bootstrapTest.client.indices.create({ index: `odmtest_swapper` });
            const newIndex = await MyClass.createIndex(void 0, false);

            const original = await MyClass.swapAlias(newIndex, true);
            expect(original).to.equal(`odmtest_swapper`);
            expect(await MyClass.getIndex()).to.equal(newIndex);
            expect(await MyClass.aliasExists()).to.be.true;
        });

        it(`can't swap alias when a concrete index occupies the alias name`, async () => {
            const MyClass = createClass(`swapper`).in(`odmtest`);

            await bootstrapTest.client.indices.create({ index: `odmtest_swapper` });
            const newIndex = await MyClass.createIndex(void 0, false);

            await expect(MyClass.swapAlias(newIndex))
                .to.be.eventually.rejectedWith(`Index 'odmtest_swapper' occupies the alias name, it must be removed to swap the alias.`);
        });
    });

    describe(`static deleteAlias()`, () => {
        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_test`, `abc`);
            await bootstrapTest.createIndex(`odmtest_test`, `abc`);
        });

        it(`can't delete an alias when ODM contains wildcard`, async () => {
            const MyRevisions = createClass(`test`);   //tenant is '*'

            await expect(MyRevisions.deleteAlias()).to.be.eventually.rejectedWith(`You cannot use 'deleteAlias' with current tenant '*', full alias is '*_test'!`);
        });

        it(`deletes alias from an index`, async () => {
            const MyTest = createClass(`test`).in(`odmtest`);

            let aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyTest.alias
            });
            expect(aliasExists).to.be.true;

            await MyTest.deleteAlias();

            aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyTest.alias
            });
            expect(aliasExists).to.be.false;
        });

        it(`can't delete alias when it doesn't exist`, async () => {
            const MyTest = createClass(`test`).in(`odmtest`);
            await bootstrapTest.client.indices.deleteAlias({
                index: `odmtest_test-abc`,
                name: `odmtest_test`
            });

            await expect(MyTest.deleteAlias()).to.be.eventually.rejectedWith(`Alias 'odmtest_test' doesn't exist.`);
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_test`, `abc`);
        });
    });

    describe(`static aliasExists()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
            await bootstrapTest.createIndex(`odmtest_revisions`, uuid);
        });

        it(`can't check alias with wildcard`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.aliasExists()).to.be.eventually.rejectedWith(`You cannot use 'aliasExists' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`checks if alias exists`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);

            const exists = await MyRevisions.aliasExists();
            expect(exists).to.be.true;
        });

        it(`checks if not existing alias exists`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);
            await MyRevisions.deleteAlias();

            const exists = await MyRevisions.aliasExists();
            expect(exists).to.be.false;
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
        });
    });

    describe(`static indexExists()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
            await bootstrapTest.createIndex(`odmtest_revisions`, uuid);
        });

        it(`can't check index with wildcard in index`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.indexExists()).to.be.eventually.rejectedWith(`You cannot use 'indexExists' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`checks if index exists`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);

            const exists = await MyRevisions.indexExists();
            expect(exists).to.be.true;
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
        });
    });

    describe(`static deleteIndex()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
            await bootstrapTest.createIndex(`odmtest_revisions`, uuid);
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test`
                });
            } catch (e) {
                //OK
            }
        });

        it(`can't delete index with wildcard in index`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.deleteIndex()).to.be.eventually.rejectedWith(`You cannot use 'deleteIndex' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`deletes index along with alias`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);

            const realIndex = await MyRevisions.getIndex();
            expect(realIndex).to.be.a(`string`);
            expect(realIndex).not.to.be.undefined;

            let indexExists = await bootstrapTest.client.indices.exists({
                index: realIndex
            });
            expect(indexExists).to.be.true;
            let aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyRevisions.alias
            });
            expect(aliasExists).to.be.true;

            await MyRevisions.deleteIndex();

            indexExists = await bootstrapTest.client.indices.exists({
                index: realIndex
            });
            expect(indexExists).to.be.false;
            aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyRevisions.alias
            });
            expect(aliasExists).to.be.false;
        });

        it(`deletes index directly (alias not exists)`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`
            });
            const MyTest = createClass(`test`).in(`odmtest`);

            const realIndex = await MyTest.getIndex();
            expect(realIndex).to.be.a(`string`);
            expect(realIndex).not.to.be.undefined;
            expect(realIndex).to.equal(MyTest.alias);

            let indexExists = await bootstrapTest.client.indices.exists({
                index: realIndex
            });
            expect(indexExists).to.be.true;
            let aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyTest.alias
            });
            expect(aliasExists).to.be.false;

            await MyTest.deleteIndex();

            indexExists = await bootstrapTest.client.indices.exists({
                index: realIndex
            });
            expect(indexExists).to.be.false;
            aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyTest.alias
            });
            expect(aliasExists).to.be.false;
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`static getMapping()`, () => {
        it(`gets mapping of index`, async () => {
            const MyRevisions = createClass(`users`).in(`odmtest`);

            const mapping = await MyRevisions.getMapping();
            expect(mapping).to.be.an(`object`);
            expect(Object.values(mapping)[0]).to.be.an(`object`);
            expect(Object.values(mapping)[0].mappings).to.be.an(`object`);
        });

        it(`gets mapping of multiple indexes`, async () => {
            //A second "documents" index in another tenant of the suite namespace, so the wildcard really matches two
            await bootstrapTest.createIndex(`odmtest2_documents`, `abc123`);
            try {
                const MyDocuments = createClass(`documents`).in(`odmtest*`);

                const mapping = await MyDocuments.getMapping();
                const mappedIndices = Object.keys(mapping).sort();

                expect(mappedIndices.length).to.equal(2);
                expect(mappedIndices[0]).to.include(`odmtest2_documents`);
                expect(mappedIndices[1]).to.include(`odmtest_documents`);
                expect(mapping[mappedIndices[1]].mappings.properties.documentTitle.type).to.equal(`keyword`);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest2_documents`, `abc123`);
            }
        });
    });

    describe(`static putMapping()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
            await bootstrapTest.createIndex(`odmtest_revisions`, uuid);
        });

        it(`can't put mapping with wildcard in tenant`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.putMapping({ properties: {} })).to.be.eventually.rejectedWith(`You cannot use 'putMapping' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`can't put mapping without the mapping object`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);

            await expect(MyRevisions.putMapping()).to.be.eventually.rejectedWith(`You have to specify mapping object.`);
        });

        it(`puts mapping to index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);

            const mapping = {
                properties: {
                    test: {
                        type: `text`
                    }
                }
            };
            await MyRevisions.putMapping(mapping);

            const response = await bootstrapTest.client.indices.getMapping({
                index: `odmtest_revisions`
            });
            expect(Object.values(response)[0].mappings.properties.test.type).to.equal(`text`);
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
        });
    });

    describe(`static getSettings()`, () => {
        it(`gets settings of index`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);

            const settings = await MyUsers.getSettings();
            expect(settings).to.be.an(`object`);
            expect(Object.values(settings)[0]).to.be.an(`object`);
            expect(Object.values(settings)[0].settings).to.be.an(`object`);
        });

        it(`gets settings of index with default settings included`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);

            const settings = await MyUsers.getSettings(true);
            expect(settings).to.be.an(`object`);
            expect(Object.values(settings)[0]).to.be.an(`object`);
            expect(Object.values(settings)[0].settings).to.be.an(`object`);
            expect(Object.values(settings)[0].defaults).to.be.an(`object`);
        });

        it(`gets settings of multiple indexes`, async () => {
            await bootstrapTest.createIndex(`odmtest2_documents`, `abc123`);
            try {
                const MyDocuments = createClass(`documents`).in(`odmtest*`);

                const settings = await MyDocuments.getSettings();
                const settledIndices = Object.keys(settings).sort();

                expect(settledIndices.length).to.equal(2);
                expect(settledIndices[0]).to.include(`odmtest2_documents`);
                expect(settledIndices[1]).to.include(`odmtest_documents`);
                expect(settings[settledIndices[1]].settings.index.refresh_interval).to.equal(`-1`);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest2_documents`, `abc123`);
            }
        });
    });

    describe(`static putSettings()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
            await bootstrapTest.createIndex(`odmtest_revisions`, uuid);
        });

        it(`can't put settings with wildcard in tenant`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.putSettings({ index: {} })).to.be.eventually.rejectedWith(`You cannot use 'putSettings' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`can't put settings without the settings object`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);

            await expect(MyRevisions.putSettings()).to.be.eventually.rejectedWith(`You have to specify settings object.`);
        });

        it(`puts settings to index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`odmtest`);

            const originalSettings = await MyRevisions.getSettings(true);
            expect(Object.values(originalSettings)[0].settings.index.number_of_replicas).to.equal(`1`);
            expect(Object.values(originalSettings)[0].settings.index.flush_after_merge).to.be.undefined;

            const settings = {
                number_of_replicas: 2,
                flush_after_merge: `1024mb`
            };
            await MyRevisions.putSettings(settings);

            const newSettings = await MyRevisions.getSettings(true);
            expect(Object.values(newSettings)[0].settings.index.number_of_replicas).to.equal(`2`);
            expect(Object.values(newSettings)[0].settings.index.flush_after_merge).to.equal(`1024mb`);
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
        });
    });

    describe(`static reindex()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
            await bootstrapTest.createIndex(`odmtest_revisions`, uuid);
        });

        it(`can't reindex index without destination index specified`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`odmtest`);

            await expect(MyDocumentsSource.reindex()).to.be.eventually.rejectedWith(`You must specify destination model!`);
        });

        it(`can't reindex index with wildcard in source index`, async () => {
            const MyDocumentsSource = createClass(`documents`); //tenant is *
            const MyRevisionsDestination = createClass(`revisions`).in(`odmtest`);

            await expect(MyDocumentsSource.reindex(MyRevisionsDestination)).to.be.eventually.rejectedWith(`You cannot use 'reindex-source' with current tenant '*', full alias is '*_documents'!`);
        });

        it(`can't reindex index with wildcard in destination index`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`odmtest`);
            const MyRevisionsDestination = createClass(`revisions`); //tenant is *

            await expect(MyDocumentsSource.reindex(MyRevisionsDestination)).to.be.eventually.rejectedWith(`You cannot use 'reindex-destination' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`can't reindex when source index doesn't exist`, async () => {
            const MyDocumentsSource = createClass(`incorrect`).in(`odmtest`);
            const MyRevisionsDestination = createClass(`revisions`).in(`odmtest`);

            await expect(MyDocumentsSource.reindex(MyRevisionsDestination)).to.be.eventually.rejectedWith(`index_not_found_exception`);
        });

        it(`reindexes model`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`odmtest`);
            const MyRevisionsDestination = createClass(`revisions`).in(`odmtest`);

            const fromInstance = new MyDocumentsSource({ documentTitle: `:)` }, `test`);
            await fromInstance.save();

            await MyDocumentsSource.reindex(MyRevisionsDestination);

            const toResults = await MyRevisionsDestination.findAll();
            expect(toResults.length).to.equal(1);
            expect(toResults[0].constructor.alias).to.equal(MyRevisionsDestination.alias);
            expect(toResults[0]._id).to.equal(`test`);
            expect(toResults[0].documentTitle).to.equal(`:)`);
        });

        it(`reindexes model and specifies update script`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`odmtest`);
            const MyRevisionsDestination = createClass(`revisions`).in(`odmtest`);

            const fromInstance = new MyDocumentsSource({ documentTitle: `:)` }, `test`);
            await fromInstance.save();

            await MyDocumentsSource.reindex(MyRevisionsDestination, `ctx._source.documentTitle += "(:";`);

            const toResults = await MyRevisionsDestination.findAll();
            expect(toResults.length).to.equal(1);
            expect(toResults[0].constructor.alias).to.equal(MyRevisionsDestination.alias);
            expect(toResults[0]._id).to.equal(`test`);
            expect(toResults[0].documentTitle).to.equal(`:)(:`);
        });

        it(`reindexes model and represents the destination by index string`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`odmtest`);
            const MyRevisionsDestination = createClass(`revisions`).in(`odmtest`);

            const fromInstance = new MyDocumentsSource({ documentTitle: `:)` }, `test`);
            await fromInstance.save();

            const destinationIndex = await MyRevisionsDestination.getIndex();
            await MyDocumentsSource.reindex(destinationIndex);

            const toResults = await MyRevisionsDestination.findAll();
            expect(toResults.length).to.equal(1);
            expect(toResults[0].constructor.alias).to.equal(MyRevisionsDestination.alias);
            expect(toResults[0]._id).to.equal(`test`);
            expect(toResults[0].documentTitle).to.equal(`:)`);
        });

        it(`reindexes model and represents the destination by alias string`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`odmtest`);
            const MyRevisionsDestination = createClass(`revisions`).in(`odmtest`);

            const fromInstance = new MyDocumentsSource({ documentTitle: `:)` }, `test`);
            await fromInstance.save();

            await MyDocumentsSource.reindex(MyRevisionsDestination.alias);

            const toResults = await MyRevisionsDestination.findAll();
            expect(toResults.length).to.equal(1);
            expect(toResults[0].constructor.alias).to.equal(MyRevisionsDestination.alias);
            expect(toResults[0]._id).to.equal(`test`);
            expect(toResults[0].documentTitle).to.equal(`:)`);
        });

        it(`downgrades the 'wait_for' immediate refresh to a boolean`, async () => {
            //The reindex API accepts no refresh string - the library has to convert it, otherwise ES refuses the call
            const destinationIndex = `odmtest_waitforreindex-abc123`;
            await bootstrapTest.client.indices.create({
                index: destinationIndex,
                settings: {
                    index: {
                        refresh_interval: `-1`
                    }
                }
            });
            await bootstrapTest.client.indices.putAlias({
                index: destinationIndex,
                name: `odmtest_waitforreindex`,
                is_write_index: true
            });

            try {
                const MyDocumentsSource = createClass(`documents`).in(`odmtest`);
                const MyDestination = createClass(`waitforreindex`).in(`odmtest`);

                await new MyDocumentsSource({ documentTitle: `:)` }, `test`).save();
                await MyDocumentsSource.immediateRefresh(`wait_for`).reindex(MyDestination);

                //The string became a boolean true, so the reindexed document is visible right away
                const visible = await bootstrapTest.client.search({
                    index: destinationIndex,
                    query: {
                        match_all: {}
                    }
                });
                expect(visible.hits.hits.length).to.equal(1);
            } finally {
                await bootstrapTest.client.indices.delete({ index: destinationIndex });
            }
        });

        it(`doesn't refresh the destination index when the immediate refresh is disabled`, async () => {
            const destinationIndex = `odmtest_silentreindex-abc123`;
            await bootstrapTest.client.indices.create({
                index: destinationIndex,
                settings: {
                    index: {
                        refresh_interval: `-1`
                    }
                }
            });
            await bootstrapTest.client.indices.putAlias({
                index: destinationIndex,
                name: `odmtest_silentreindex`,
                is_write_index: true
            });

            try {
                const MyDocumentsSource = createClass(`documents`).in(`odmtest`);
                const MyDestination = createClass(`silentreindex`).in(`odmtest`);

                await new MyDocumentsSource({ documentTitle: `:)` }, `test`).save();
                await MyDocumentsSource.immediateRefresh(false).reindex(MyDestination);

                //"refresh_interval" of the destination is -1, so an unrefreshed reindex stays invisible to a search
                const notVisible = await bootstrapTest.client.search({
                    index: destinationIndex,
                    query: {
                        match_all: {}
                    }
                });
                expect(notVisible.hits.hits.length).to.equal(0);

                await bootstrapTest.client.indices.refresh({
                    index: destinationIndex
                });
                const visible = await bootstrapTest.client.search({
                    index: destinationIndex,
                    query: {
                        match_all: {}
                    }
                });
                expect(visible.hits.hits.length).to.equal(1);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_silentreindex`, `abc123`);
            }
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_revisions`, uuid);
        });
    });

    describe(`static cloneIndex()`, () => {
        it(`can't clone index with wildcard in source index`, async () => {
            const MyTest = createClass(`test`); //tenant is *

            await expect(MyTest.cloneIndex()).to.be.eventually.rejectedWith(`You cannot use 'cloneIndex' with current tenant '*', full alias is '*_test'!`);
        });

        it(`can't clone not existing index`, async () => {
            const MyTest = createClass(`test`).in(`odmtest`);

            await expect(MyTest.cloneIndex()).to.be.eventually.rejectedWith(`index_not_found_exception`);
        });

        it(`can't clone when index is not read-only`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`
            });

            const MyTest = createClass(`test`).in(`odmtest`);

            await expect(MyTest.cloneIndex()).to.be.eventually.rejectedWith(`index odmtest_test must be read-only to resize index. use "index.blocks.write=true"`);
        });

        it(`can't clone to index with wildcard`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`
            });

            const MyTest = createClass(`test`).in(`odmtest`);
            await MyTest.putSettings({
                index: {
                    blocks: {
                        write: true
                    }
                }
            });


            await expect(MyTest.cloneIndex(void 0, `*_2test`)).to.be.eventually.rejectedWith(`Specified target index '*_2test' is not valid!`);
        });

        it(`clones aliased model`, async () => {
            try {
                await cloneAliasedModel();
            } finally {
                //The test deletes the bootstrap "odmtest_users" index and aliases a clone instead - restore the fixture
                await bootstrapTest.resetFixtureIndices();
            }
        });

        async function cloneAliasedModel() {
            const MyTest = createClass(`users`).in(`odmtest`);
            const originalIndex = await MyTest.getIndex();

            const instance = new MyTest({ status: `:)` }, `test`);
            await instance.save();
            await MyTest.putSettings({
                index: {
                    blocks: {
                        write: true
                    }
                }
            });

            const newIndex = await MyTest.cloneIndex();
            expect(originalIndex).to.not.equal(newIndex);

            let indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_users*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(2);

            const existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(originalIndex);
            expect(existingIndices).includes(newIndex);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_users*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);
            expect(Object.keys(indicesStats.indices)[0]).to.equal(newIndex);

            await MyTest.aliasIndex(newIndex);
            const results = await MyTest.findAll();
            expect(results.length).to.equal(1);
            expect(results[0].constructor.alias).to.equal(MyTest.alias);
            expect(results[0]._id).to.equal(`test`);
            expect(results[0].status).to.equal(`:)`);
        }

        it(`doesn't modify the given settings`, async () => {
            const MyTest = createClass(`users`).in(`odmtest`);
            const settings = {
                index: {
                    refresh_interval: `-1`
                }
            };
            const originalSettings = JSON.parse(JSON.stringify(settings));

            try {
                await new MyTest({ status: `:)` }, `test`).save();
                await MyTest.putSettings({
                    index: {
                        blocks: {
                            write: true
                        }
                    }
                });

                await MyTest.cloneIndex(settings);

                //The replica count is read from the source index and must not leak into the caller's object
                expect(settings).to.deep.equal(originalSettings);
            } finally {
                await bootstrapTest.resetFixtureIndices();
            }
        });

        it(`clones not aliased model`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`
            });

            const MyTest = createClass(`test`).in(`odmtest`);
            const instance = new MyTest({ status: `:)` }, `test`);
            await instance.save();
            await MyTest.putSettings({
                index: {
                    blocks: {
                        write: true
                    }
                }
            });

            const newIndex = await MyTest.cloneIndex();

            let indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(2);

            const existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(`odmtest_test`);
            expect(existingIndices).includes(newIndex);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);

            await MyTest.aliasIndex(newIndex);
            const results = await MyTest.findAll();
            expect(results.length).to.equal(1);
            expect(results[0].constructor.alias).to.equal(MyTest.alias);
            expect(results[0]._id).to.equal(`test`);
            expect(results[0].status).to.equal(`:)`);
        });

        it(`clones model to custom specified index`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`,
                settings: {
                    index: {
                        refresh_interval: -1
                    }
                }
            });

            const MyTest = createClass(`test`).in(`odmtest`);
            const originalIndex = await MyTest.getIndex();

            const instance = new MyTest({ status: `:)` }, `test`);
            await instance.save();
            await MyTest.putSettings({
                index: {
                    blocks: {
                        write: true
                    }
                }
            });

            const targetIndex = `odmtest_2test-xyz`;
            const newIndex = await MyTest.cloneIndex(void 0, targetIndex);
            expect(originalIndex).to.not.equal(newIndex);
            expect(targetIndex).to.equal(newIndex);

            let indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);
            let existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(originalIndex);

            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_2test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);
            existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(newIndex);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(0);

            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_2test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);
            existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(newIndex);

            const My2Test = createClass(`2test`).in(`odmtest`);
            await My2Test.aliasIndex(newIndex);
            const results = await My2Test.findAll();
            expect(results.length).to.equal(1);
            expect(results[0].constructor.alias).to.equal(My2Test.alias);
            expect(results[0]._id).to.equal(`test`);
            expect(results[0].status).to.equal(`:)`);
        });

        it(`clones model and specifies settings`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`,
                settings: {
                    index: {
                        refresh_interval: -1
                    }
                }
            });

            const MyTest = createClass(`test`).in(`odmtest`);
            const instance = new MyTest({ status: `:)` }, `test`);
            await instance.save();
            await MyTest.putSettings({
                index: {
                    blocks: {
                        write: true
                    }
                }
            });

            const newIndex = await MyTest.cloneIndex({
                index: {
                    number_of_replicas: 2,
                    refresh_interval: `5s`
                }
            });

            let indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(2);

            const existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(`odmtest_test`);
            expect(existingIndices).includes(newIndex);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);

            await MyTest.aliasIndex(newIndex);
            const results = await MyTest.findAll();
            expect(results.length).to.equal(1);
            expect(results[0].constructor.alias).to.equal(MyTest.alias);
            expect(results[0]._id).to.equal(`test`);
            expect(results[0].status).to.equal(`:)`);

            const newSettings = await MyTest.getSettings();
            expect(Object.values(newSettings)[0].settings.index.number_of_replicas).to.equal(`2`);
            expect(Object.values(newSettings)[0].settings.index.refresh_interval).to.equal(`5s`);
        });

        it(`clones model to custom specified index and specifies settings`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`,
                settings: {
                    index: {
                        refresh_interval: -1
                    }
                }
            });

            const MyTest = createClass(`test`).in(`odmtest`);
            const originalIndex = await MyTest.getIndex();

            const instance = new MyTest({ status: `:)` }, `test`);
            await instance.save();
            await MyTest.putSettings({
                index: {
                    blocks: {
                        write: true
                    }
                }
            });

            const targetIndex = `odmtest_2test-xyz`;
            const newIndex = await MyTest.cloneIndex({
                index: {
                    number_of_replicas: 2,
                    refresh_interval: `5s`
                }
            }, targetIndex);
            expect(originalIndex).to.not.equal(newIndex);
            expect(targetIndex).to.equal(newIndex);

            let indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);
            let existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(originalIndex);

            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_2test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);
            existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(newIndex);

            const oldSettings = await MyTest.getSettings();
            expect(Object.values(oldSettings)[0].settings.index.refresh_interval).to.equal(`-1`);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(0);

            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_2test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);
            existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(newIndex);

            const My2Test = createClass(`2test`).in(`odmtest`);
            await My2Test.aliasIndex(newIndex);
            const results = await My2Test.findAll();
            expect(results.length).to.equal(1);
            expect(results[0].constructor.alias).to.equal(My2Test.alias);
            expect(results[0]._id).to.equal(`test`);
            expect(results[0].status).to.equal(`:)`);

            const newSettings = await My2Test.getSettings();
            expect(Object.values(newSettings)[0].settings.index.number_of_replicas).to.equal(`2`);
            expect(Object.values(newSettings)[0].settings.index.refresh_interval).to.equal(`5s`);
        });

        it(`clones model and specifies settings not nested in "index" object`, async () => {
            await bootstrapTest.client.indices.create({
                index: `odmtest_test`,
                settings: {
                    index: {
                        refresh_interval: -1
                    }
                }
            });

            const MyTest = createClass(`test`).in(`odmtest`);
            const instance = new MyTest({ status: `:)` }, `test`);
            await instance.save();
            await MyTest.putSettings({
                index: {
                    blocks: {
                        write: true
                    }
                }
            });

            const newIndex = await MyTest.cloneIndex({
                number_of_replicas: 2,
                refresh_interval: `5s`
            });

            let indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(2);

            const existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(`odmtest_test`);
            expect(existingIndices).includes(newIndex);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `odmtest_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(1);

            await MyTest.aliasIndex(newIndex);
            const results = await MyTest.findAll();
            expect(results.length).to.equal(1);
            expect(results[0].constructor.alias).to.equal(MyTest.alias);
            expect(results[0]._id).to.equal(`test`);
            expect(results[0].status).to.equal(`:)`);

            const newSettings = await MyTest.getSettings();
            expect(Object.values(newSettings)[0].settings.index.number_of_replicas).to.equal(`2`);
            expect(Object.values(newSettings)[0].settings.index.refresh_interval).to.equal(`5s`);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.putSettings({
                    index: `odmtest_users*`,
                    settings: {
                        index: {
                            blocks: {
                                write: null
                            }
                        }
                    }
                });
            } catch (e) {
                //OK
            }

            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_test*`
                });
            } catch (e) {
                //OK
            }

            try {
                await bootstrapTest.client.indices.delete({
                    index: `odmtest_2test*`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`static refresh()`, () => {
        it(`can't refresh not existing index`, async () => {
            const Test = createClass(`test`).in(`odmtest`);
            await expect(Test.refresh()).to.be.eventually.rejectedWith(`index_not_found_exception`);
        });

        it(`refreshes single index`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`).immediateRefresh(false);
            const instance = new MyUsers({ name: `test` });
            await instance.save();

            let foundUsers = await MyUsers.findAll();
            expect(foundUsers.length).to.equal(0);

            await MyUsers.refresh();

            foundUsers = await MyUsers.findAll();
            expect(foundUsers.length).to.equal(1);
            expect(foundUsers[0].name).to.equal(`test`);
        });

        it(`refreshes multiple indices at once`, async () => {
            const FirstType = createClass(`users`).in(`odmtest`).immediateRefresh(false);
            const firstInstance = new FirstType({ name: `first` });
            await firstInstance.save();

            const SecondType = createClass(`documents`).in(`odmtest`).immediateRefresh(false);
            const secondInstance = new SecondType({ documentTitle: `second` });
            await secondInstance.save();

            let foundFirstUsers = await FirstType.findAll();
            expect(foundFirstUsers.length).to.equal(0);

            let foundSecondUsers = await SecondType.findAll();
            expect(foundSecondUsers.length).to.equal(0);

            //A wildcard alias spans both indices - "refresh" is one of the functions which may not be fully specified
            const WildcardType = createClass(`*`).in(`odmtest`);
            await WildcardType.refresh();

            foundFirstUsers = await FirstType.findAll();
            expect(foundFirstUsers.length).to.equal(1);
            expect(foundFirstUsers[0].name).to.equal(`first`);

            foundSecondUsers = await SecondType.findAll();
            expect(foundSecondUsers.length).to.equal(1);
            expect(foundSecondUsers[0].documentTitle).to.equal(`second`);
        });
    });

    describe(`static openPIT()`, () => {
        it(`can't open PIT with not existing index`, async () => {
            const Test = createClass(`test`).in(`odmtest`);
            await expect(Test.openPIT()).to.be.eventually.rejectedWith(`index_not_found_exception`);
        });

        it(`searches using PIT with a custom keep alive`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);
            await new MyUsers({ status: `:)`, name: `kept` }, `kept`).save();

            const myPit = await MyUsers.openPIT();
            try {
                const foundUsers = await MyUsers.search({}, 0, 10, { pitId: myPit, refresh: 30 });
                expect(foundUsers.length).to.equal(1);
                expect(foundUsers[0].name).to.equal(`kept`);
            } finally {
                await MyUsers.closePIT(myPit);
            }
        });

        it(`searches using PIT over single index`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);
            const documentSize = 10;

            const ids = [];
            const myBulk = new BulkArray();
            for (let i = 0; i < documentSize; i++) {
                const id = `${i}`;
                ids.push(id);
                myBulk.push(new MyUsers({ name: id }));
            }
            await myBulk.save();

            const myPit = await MyUsers.openPIT();
            try {
                const anotherBulk = new BulkArray();
                for (let i = 0; i < documentSize; i++) {
                    anotherBulk.push(new MyUsers({ name: `another_${i}` }));
                }
                await anotherBulk.save();

                const allUsers = [];
                let foundUsers;
                do {
                    foundUsers = await MyUsers.search({}, 0, 2, { pitId: foundUsers?.pitId ?? myPit, searchAfter: foundUsers?._lastPosition });
                    allUsers.push(...foundUsers);

                } while (foundUsers.length > 0);


                expect(allUsers.length).to.equal(documentSize);
                for (const id of ids) {
                    const index = allUsers.findIndex((singleUser) => singleUser.name === id);
                    expect(index).to.be.greaterThanOrEqual(0);
                    allUsers.splice(index, 1);
                }
            } finally {
                await MyUsers.closePIT(myPit);
            }
        });

        it(`searches using PIT over multiple indices`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest*`);
            const MyUsers1 = createClass(`users`).in(`odmtest1`);
            const MyUsers2 = createClass(`users`).in(`odmtest2`);
            const documentSize = 10;

            const ids = [];
            const myBulk = new BulkArray();
            for (let i = 0; i < documentSize; i++) {
                const id = `${i}`;
                ids.push(id);
                myBulk.push(new MyUsers1({ name: id }));
                myBulk.push(new MyUsers2({ name: id }));
            }
            await myBulk.save();

            let myPit;
            try {
                myPit = await MyUsers.openPIT();

                const anotherBulk = new BulkArray();
                for (let i = 0; i < documentSize; i++) {
                    anotherBulk.push(new MyUsers1({ name: `another_${i}` }));
                    anotherBulk.push(new MyUsers2({ name: `another_${i}` }));
                }
                await anotherBulk.save();

                const allUsers = [];
                let foundUsers;
                do {
                    foundUsers = await MyUsers.search({}, 0, 2, { pitId: foundUsers?.pitId ?? myPit, searchAfter: foundUsers?._lastPosition });
                    allUsers.push(...foundUsers);

                } while (foundUsers.length > 0);

                expect(allUsers.length).to.equal(2 * documentSize);
                for (const id of ids) {
                    let index = allUsers.findIndex((singleUser) => singleUser.name === id);
                    expect(index).to.be.greaterThanOrEqual(0);
                    allUsers.splice(index, 1);

                    index = allUsers.findIndex((singleUser) => singleUser.name === id);
                    expect(index).to.be.greaterThanOrEqual(0);
                    allUsers.splice(index, 1);
                }
            } finally {
                if (myPit) {
                    await MyUsers.closePIT(myPit);
                }

                //The two tenants create their own indices - a leaked one joins the wildcard searches of later tests
                await bootstrapTest.client.indices.delete({
                    index: `odmtest1_users*,odmtest2_users*`,
                    ignore_unavailable: true
                });
            }
        });
    });

    describe(`static closePIT()`, () => {
        it(`can't close PIT without specifying pitID`, async () => {
            const Test = createClass(`test`).in(`odmtest`);

            await expect(Test.closePIT()).to.be.eventually.rejectedWith(`PIT ID must be specified!`);
        });

        it(`can't close not existing PIT`, async () => {
            const Test = createClass(`test`).in(`odmtest`);
            const result = await Test.closePIT(`wtf`);
            expect(result).to.equal(false);
        });

        it(`closes PIT`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);
            const myPit = await MyUsers.openPIT();

            const result = await MyUsers.closePIT(myPit);
            expect(result).to.equal(true);
        });
    });

    describe(`save()`, () => {
        it(`can't save invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.object({ status: Joi.array() })).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            expect(myInstance).to.be.instanceOf(BaseModel);
            await expect(myInstance.save()).to.be.eventually.rejectedWith(`"status" must be an array`);
        });

        it(`can't save another invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.string()).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            expect(myInstance).to.be.instanceOf(BaseModel);
            await expect(myInstance.save()).to.be.eventually.rejectedWith(`"value" must be a string`);
        });

        it(`saves data instance`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(1);
            expect(results.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves data instance without immediate refresh`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`).immediateRefresh(false);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;

            let results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(0);

            await MyClass.refresh();

            results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(1);
            expect(results.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves another data instance`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const myInstance = new MyClass();
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;
            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(1);
            expect(results.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves data instance with specified id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);
            await myInstance.save();
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(1);
            expect(results.hits.hits[0]._id).to.equal(`myId`);
            expect(results.hits.hits[0]._version).not.to.be.undefined;
            expect(results.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves another data instance with specified id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const myInstance = new MyClass(void 0, `myId`);
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;
            await myInstance.save();
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(1);
            expect(results.hits.hits[0]._id).to.equal(`myId`);
            expect(results.hits.hits[0]._version).not.to.be.undefined;
            expect(results.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`resaves instance`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const myInstance = new MyClass();
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;

            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;
            const oldId = myInstance._id;
            const oldVersion = myInstance._version;
            //primary term should be the same
            const oldSeqNo = myInstance._seq_no;    //even seq_no can stay the same, if primary term changes...

            myInstance.status = `:(`;
            await myInstance.save();
            expect(myInstance._id).to.equal(oldId);
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._version).to.not.equal(oldVersion);
            expect(myInstance._seq_no).not.to.be.undefined;
            expect(myInstance._seq_no).to.not.equal(oldSeqNo);

            const results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(1);
            expect(results.hits.hits[0]._id).to.equal(oldId);
            expect(results.hits.hits[0]._version).to.equal(myInstance._version);
            expect(results.hits.hits[0]._source.status).to.equal(`:(`);
            expect(results.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves instance with specified version`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);

            await myInstance.save();
            const oldId = myInstance._id;
            const oldVersion = myInstance._version;
            const oldSeqNo = myInstance._seq_no;

            await myInstance.save(true);
            expect(myInstance._id).to.equal(oldId);
            expect(myInstance._version).to.not.equal(oldVersion);
            expect(myInstance._seq_no).to.not.equal(oldSeqNo);
        });

        it(`cannot save instance with specified version when _id is not specified`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);

            await myInstance.save();
            myInstance._id = null;

            let thrownError;
            try {
                await myInstance.save(true);
            } catch (e) {
                thrownError = e;
            }
            expect(thrownError).not.to.be.undefined;
            expect(thrownError.message).to.equal(`You cannot use parameter 'useVersion' with model without _id specified.`);
            expect(thrownError.statusCode).to.equal(400);
        });

        it(`can't save instance when sequence numbers are different`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();

            await bootstrapTest.client.index({
                index: MyClass.alias,
                id: myInstance._id,
                document: {
                    status: `:(`
                },
                refresh: true
            });

            await expect(myInstance.save(true)).to.be.eventually.rejectedWith(`version_conflict_engine_exception`);

        });

        it(`saves instance with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();
            const oldId = savedInstance._id;
            const oldVersion = savedInstance._version;
            const oldSeqNo = savedInstance._seq_no;

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version);
            await myInstance.save(true);
            expect(myInstance._id).to.equal(oldId);
            expect(myInstance._version).to.not.equal(oldVersion);
            expect(myInstance._seq_no).to.not.equal(oldSeqNo);
        });

        it(`can't save with specified incorrect version and without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version + 1);
            let thrownError;
            try {
                await myInstance.save(true);
            } catch (e) {
                thrownError = e;
            }
            expect(thrownError).not.to.be.undefined;
            expect(thrownError.message).to.equal(`Actual version '${savedInstance._version + 1}' is different than stored version '${savedInstance._version}'!`);
            expect(thrownError.statusCode).to.equal(409);
        });
    });

    describe(`reload()`, () => {
        it(`throws when instance doesn't have an _id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const myInstance = new MyClass({
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            });
            await expect(myInstance.reload()).to.be.eventually.rejectedWith(`Document has not been saved into ES yet!`);
        });

        it(`reloads instance`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `ok`);
            await myInstance.save();

            myInstance.status = `:(`;
            myInstance.name = `xyz`;
            myInstance.fullname = `incorrect`;
            myInstance._score = 0.5;

            const oldVersion = myInstance._version;
            //primary term may be the same
            const oldSeqNo = myInstance._seq_no;    //even seq_no may be the same if primary term changes...
            const oldScore = myInstance._score;

            await bootstrapTest.client.index({
                index: MyClass.alias,
                id: `ok`,
                document: {
                    status: `:D`,
                    name: `ABC`,
                    fullname: `ABC def`
                },
                refresh: true
            });

            await myInstance.reload();

            expect(myInstance._id).to.equal(`ok`);
            expect(myInstance._version).to.not.equal(oldVersion);
            expect(myInstance._seq_no).to.not.equal(oldSeqNo);
            expect(myInstance._score).to.equal(oldScore);
            expect(myInstance.status).to.equal(`:D`);
            expect(myInstance.name).to.equal(`ABC`);
            expect(myInstance.fullname).to.equal(`ABC def`);
        });
    });

    describe(`delete()`, () => {
        it(`doesn't refresh the index when the immediate refresh is disabled`, async () => {
            //The fixture index has "refresh_interval: -1" - the delete stays invisible until something refreshes
            const MyClass = createClass(`users`).in(`odmtest`).immediateRefresh(false);
            const myInstance = new MyClass({ status: `:)`, name: `unrefreshedDelete` });
            await myInstance.save();
            await MyClass.refresh();
            expect((await bootstrapTest.client.count({ index: MyClass.alias })).count).to.equal(1);

            await myInstance.delete();
            expect((await bootstrapTest.client.count({ index: MyClass.alias })).count).to.equal(1);

            await MyClass.refresh();
            expect((await bootstrapTest.client.count({ index: MyClass.alias })).count).to.equal(0);
        });

        it(`deletes with the 'wait_for' immediate refresh`, async () => {
            //An own index with the default refresh interval - "wait_for" is passed to ES as it is and would block
            //forever on the fixture indices, which never refresh on their own
            await bootstrapTest.createIndex(`odmtest_waitfor`, `abc123`);
            try {
                const MyClass = createClass(`waitfor`).in(`odmtest`).immediateRefresh(`wait_for`);
                const myInstance = new MyClass({ name: `waitForDelete` });
                await myInstance.save();
                expect((await bootstrapTest.client.count({ index: MyClass.alias })).count).to.equal(1);

                await myInstance.delete();
                //The string refresh survives to ES, so the delete is visible without refreshing explicitly
                expect((await bootstrapTest.client.count({ index: MyClass.alias })).count).to.equal(0);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_waitfor`, `abc123`);
            }
        });

        it(`can't delete non-existing object without _id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await expect(myInstance.delete()).to.be.eventually.rejectedWith(`Document has not been saved into ES yet.`);
        });

        it(`can't delete non-existing object with _id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);
            await expect(myInstance.delete()).to.be.eventually.rejectedWith(`"result":"not_found"`);
        });

        it(`deletes instance`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();
            const id = myInstance._id;
            expect(myInstance._version).not.to.be.undefined;
            const version = myInstance._version;

            await myInstance.delete();
            expect(myInstance._id).to.equal(id);
            expect(myInstance._version).to.equal(version);
            expect(myInstance.status).to.equal(`:)`);
            expect(myInstance.name).to.equal(`abc`);
            expect(myInstance.fullname).to.equal(`abc def`);

            const results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(0);
        });

        it(`deletes instance with specified version`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();

            await myInstance.delete(true);

            const results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(0);
        });

        it(`can't delete instance when sequence numbers are different`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();

            await bootstrapTest.client.index({
                index: MyClass.alias,
                id: myInstance._id,
                document: {
                    status: `:(`
                },
                refresh: true
            });

            await expect(myInstance.delete(true)).to.be.eventually.rejectedWith(`version_conflict_engine_exception`);

        });

        it(`deletes instance with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version);
            await myInstance.delete(true);

            const results = await bootstrapTest.client.search({
                index: MyClass.alias,
                query: {
                    match_all: {}
                },
                version: true
            });
            expect(results.hits.total.value).to.equal(0);
        });

        it(`can't delete with specified incorrect version and without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version + 1);
            let thrownError;
            try {
                await myInstance.delete(true);
            } catch (e) {
                thrownError = e;
            }
            expect(thrownError).not.to.be.undefined;
            expect(thrownError.message).to.equal(`Actual version '${savedInstance._version + 1}' is different than stored version '${savedInstance._version}'!`);
            expect(thrownError.statusCode).to.equal(409);
        });
    });

    describe(`reload()`, () => {
        it(`drops a field which no longer exists in the document`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const myInstance = new MyClass({ status: `:)`, name: `full`, fullname: `full name` }, `reloaded`);
            await myInstance.save();

            //The stored document loses one of its fields
            await bootstrapTest.client.index({
                index: `odmtest_users`,
                id: `reloaded`,
                document: { status: `:D`, name: `full` },
                refresh: true
            });

            await myInstance.reload();

            expect(myInstance.status).to.equal(`:D`);
            expect(myInstance.name).to.equal(`full`);
            expect(myInstance.fullname).to.be.undefined;
            expect(Object.keys(myInstance).sort()).to.deep.equal([`name`, `status`]);
        });
    });

    describe(`clone()`, () => {
        it(`clones instance`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `ok`);
            await myInstance.save();
            const clone = myInstance.clone();

            expect(clone._id).to.equal(myInstance._id);
            expect(clone._version).to.equal(myInstance._version);
            expect(clone._primary_term).to.equal(myInstance._primary_term);
            expect(clone._seq_no).to.equal(myInstance._seq_no);
            expect(clone._score).to.equal(myInstance._score);
            expect(clone.status).to.equal(data.status);
            expect(clone.name).to.equal(data.name);
            expect(clone.fullname).to.equal(data.fullname);

            myInstance.status = `:(`;
            clone.name = `xyz`;

            expect(myInstance._id).to.equal(`ok`);
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;
            expect(myInstance.status).to.equal(`:(`);
            expect(myInstance.name).to.equal(`abc`);
            expect(myInstance.fullname).to.equal(`abc def`);

            expect(clone._id).to.equal(myInstance._id);
            expect(clone._version).to.equal(myInstance._version);
            expect(clone._version).to.equal(myInstance._version);
            expect(clone._primary_term).to.equal(myInstance._primary_term);
            expect(clone.status).to.equal(`:)`);
            expect(clone.name).to.equal(`xyz`);
            expect(clone.fullname).to.equal(`abc def`);
        });

        it(`clones instance and discards attributes`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `ok`);
            await myInstance.save();
            const clone = myInstance.clone(false);

            expect(clone._id).to.be.undefined;
            expect(clone._version).to.be.undefined;
            expect(clone._primary_term).to.be.undefined;
            expect(clone._seq_no).to.be.undefined;
            expect(clone._score).to.be.undefined;
            expect(clone.status).to.equal(data.status);
            expect(clone.name).to.equal(data.name);
            expect(clone.fullname).to.equal(data.fullname);

            myInstance.status = `:(`;
            clone.name = `xyz`;

            expect(myInstance._id).to.equal(`ok`);
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;
            expect(myInstance.status).to.equal(`:(`);
            expect(myInstance.name).to.equal(`abc`);
            expect(myInstance.fullname).to.equal(`abc def`);

            expect(clone._id).to.be.undefined;
            expect(clone._version).to.be.undefined;
            expect(clone._primary_term).to.be.undefined;
            expect(clone._seq_no).to.be.undefined;
            expect(clone.status).to.equal(`:)`);
            expect(clone.name).to.equal(`xyz`);
            expect(clone.fullname).to.equal(`abc def`);
        });

        it(`clones every non-enumerable attribute but the uuid`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const highlight = { name: [`<em>abc</em>`] };
            const myInstance = new MyClass({ status: `:)` }, `ok`, 3, highlight, 5, 7, 1.5, [`sortValue`]);

            const preserved = myInstance.clone();
            expect(preserved._id).to.equal(`ok`);
            expect(preserved._version).to.equal(3);
            expect(preserved._highlight).to.deep.equal(highlight);
            expect(preserved._primary_term).to.equal(5);
            expect(preserved._seq_no).to.equal(7);
            expect(preserved._score).to.equal(1.5);
            expect(preserved._sort).to.deep.equal([`sortValue`]);

            //The uuid is the documented exception - a clone is a new item of a BulkArray
            expect(preserved.__uuid).to.be.a(`string`);
            expect(preserved.__uuid).not.to.equal(myInstance.__uuid);

            const discarded = myInstance.clone(false);
            expect(discarded._id).to.be.undefined;
            expect(discarded._version).to.be.undefined;
            expect(discarded._highlight).to.be.undefined;
            expect(discarded._primary_term).to.be.undefined;
            expect(discarded._seq_no).to.be.undefined;
            expect(discarded._score).to.be.undefined;
            expect(discarded._sort).to.be.undefined;
            expect(discarded.__uuid).to.be.a(`string`);
            expect(discarded.__uuid).not.to.equal(myInstance.__uuid);
            expect(discarded.status).to.equal(`:)`);
        });
    });

    describe(`_parseIndex()`, () => {
        it(`parses different indices`, () => {
            const UserClass = createClass(`users`).in(`odmtest`);
            let result = UserClass._parseIndex(`*_users`);
            expect(result.tenant).to.equal(`*`);
            expect(result.name).to.equal(`users`);
            expect(result.alias).to.equal(`*_users`);

            result = UserClass._parseIndex(`*_users-asd123`);
            expect(result.tenant).to.equal(`*`);
            expect(result.name).to.equal(`users`);
            expect(result.alias).to.equal(`*_users`);

            result = UserClass._parseIndex(`odmtest_users`);
            expect(result.tenant).to.equal(`odmtest`);
            expect(result.name).to.equal(`users`);
            expect(result.alias).to.equal(`odmtest_users`);

            result = UserClass._parseIndex(`odmtest_users-asfd321`);
            expect(result.tenant).to.equal(`odmtest`);
            expect(result.name).to.equal(`users`);
            expect(result.alias).to.equal(`odmtest_users`);

            result = UserClass._parseIndex(`odmtest_nvm`);
            expect(result.tenant).to.equal(`odmtest`);
            expect(result.name).to.equal(`nvm`);
            expect(result.alias).to.equal(`odmtest_nvm`);

            const DocumentClass = createClass(`documents`);
            result = DocumentClass._parseIndex(`*_documents`);
            expect(result.tenant).to.equal(`*`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`*_documents`);

            result = DocumentClass._parseIndex(`*_documents-asd123`);
            expect(result.tenant).to.equal(`*`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`*_documents`);

            result = DocumentClass._parseIndex(`odmtest_documents`);
            expect(result.tenant).to.equal(`odmtest`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`odmtest_documents`);

            result = DocumentClass._parseIndex(`odmtest_documents-asfd321`);
            expect(result.tenant).to.equal(`odmtest`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`odmtest_documents`);

            const TestClass = createClass(`test_documents`);
            result = TestClass._parseIndex(`odmtest_test_documents-asfd321`);
            expect(result.tenant).to.equal(`odmtest`);
            expect(result.name).to.equal(`test_documents`);
            expect(result.alias).to.equal(`odmtest_test_documents`);

            result = TestClass._parseIndex(`odmtest_documents-asfd321`);
            expect(result.tenant).to.equal(`odmtest`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`odmtest_documents`);
        });
    });

    describe(`async validate()`, () => {
        it(`throws when data doesn't match`, async () => {
            const MyClass = createClass(`users`, Joi.object({ status: Joi.array() })).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            expect(myInstance).to.be.instanceOf(BaseModel);
            await expect(myInstance.validate()).to.be.eventually.rejectedWith(`"status" must be an array`);
        });

        it(`passes when data match`, async () => {
            const MyClass = createClass(`users`, Joi.object({ status: Joi.string() })).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            expect(myInstance).to.be.instanceOf(BaseModel);
            await myInstance.validate();
        });

        it(`passes when no schema has been specified`, async () => {
            const MyClass = createClass(`users`, null).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            expect(myInstance).to.be.instanceOf(BaseModel);
            await myInstance.validate();
        });
    });

    describe(`async _getBulkSize()`, () => {
        it(`returns bulk value`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const bulkSize = await MyClass._getBulkSize();
            expect(bulkSize).to.be.a(`number`);
            expect(Number.isInteger(bulkSize)).to.be.true;
            expect(bulkSize).to.be.greaterThan(0);
        });
    });

    describe(`recording clone`, () => {
        it(`records the query through 'search' and resolves to undefined`, async () => {
            const jointModel = new JointModel();
            const RecordingClass = jointModel.recordSearch(createClass(`users`).in(`odmtest`));

            const result = await RecordingClass.search({ query: { match_all: {} } });
            expect(result).to.be.undefined;
        });

        it(`refuses every function but 'search'`, async () => {
            const jointModel = new JointModel();
            const RecordingClass = jointModel.recordSearch(createClass(`users`).in(`odmtest`));
            const message = `Only 'search' can be called on a recording clone!`;

            //Document level API
            await expect(RecordingClass.findAll()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.find(`ok`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.get(`ok`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.head(`ok`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.exists(`ok`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.delete(`ok`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.update(`ok`, {})).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.count()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.updateByQuery({})).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.deleteByQuery({})).to.be.eventually.rejectedWith(message);

            //Indices API - the destructive lifecycle included
            await expect(RecordingClass.createIndex()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.getIndex()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.aliasIndex(`odmtest_users-abc123`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.swapAlias(`odmtest_users-abc123`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.deleteAlias()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.putMapping({ properties: {} })).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.putSettings({ index: {} })).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.reindex(`odmtest_documents`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.cloneIndex()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.closePIT(`somePit`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.waitForTask(`someTask`)).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.indexExists()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.aliasExists()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.getMapping()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.getSettings()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.refresh()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.deleteIndex()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.openPIT()).to.be.eventually.rejectedWith(message);
            await expect(RecordingClass.getTask(`someTask`)).to.be.eventually.rejectedWith(message);

            //The iterators refuse synchronously, before any generator is handed out
            expect(() => RecordingClass.bulkIterator()).to.throw(message);
            expect(() => RecordingClass.itemIterator()).to.throw(message);
        });

        it(`refuses the instance functions reaching Elasticsearch`, async () => {
            const jointModel = new JointModel();
            const RecordingClass = jointModel.recordSearch(createClass(`users`).in(`odmtest`));
            const message = `Only 'search' can be called on a recording clone!`;

            const instance = new RecordingClass({ status: `:)`, name: `abc` }, `ok`);
            await expect(instance.save()).to.be.eventually.rejectedWith(message);
            await expect(instance.reload()).to.be.eventually.rejectedWith(message);
            await expect(instance.delete()).to.be.eventually.rejectedWith(message);

            //Neither of these touches Elasticsearch, so both stay usable
            expect(instance.clone()._id).to.equal(`ok`);
            await instance.validate();
        });

        it(`refuses a BulkArray holding its instances`, async () => {
            const jointModel = new JointModel();
            const MyClass = createClass(`users`).in(`odmtest`);
            const RecordingClass = jointModel.recordSearch(MyClass);
            const message = `Only 'search' can be called on a recording clone!`;

            //An instance of a recording clone must not reach Elasticsearch through a bulk either
            const myBulk = new BulkArray(new RecordingClass({ status: `:)`, name: `abc` }, `ok`));
            await expect(myBulk.save()).to.be.eventually.rejectedWith(message);
            await expect(myBulk.delete()).to.be.eventually.rejectedWith(message);
            await expect(myBulk.reload()).to.be.eventually.rejectedWith(message);

            //A single recorded instance among ordinary ones is enough to refuse the whole array
            const mixedBulk = new BulkArray(
                new MyClass({ status: `:)`, name: `ordinary` }, `ordinary`),
                new RecordingClass({ status: `:(`, name: `recorded` }, `recorded`)
            );
            await expect(mixedBulk.save()).to.be.eventually.rejectedWith(message);

            //Nothing of it was written
            expect(await MyClass.count()).to.equal(0);
        });

        it(`leaves the recorded class itself untouched`, async () => {
            const jointModel = new JointModel();
            const MyClass = createClass(`users`).in(`odmtest`);
            jointModel.recordSearch(MyClass);

            //Only the returned clone records, the original class keeps working
            expect(MyClass.__recordSearch).to.be.undefined;
            await new MyClass({ status: `:)`, name: `abc` }, `ok`).save();

            const results = await MyClass.findAll();
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(`ok`);
        });
    });

    describe(`_packData() / _unpackData()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.createIndex(`odmtest_packed`, uuid);
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`odmtest_packed`, uuid);
        });

        /**
         * Model storing its data as a single serialized field
         * @returns {typeof BaseModel} Packing class
         */
        function createPackedClass() {
            return class extends createClass(`packed`) {
                static _unpackData(source) {
                    return JSON.parse(source.packed);
                }

                async _packData(cache = void 0) {
                    if (cache) {
                        cache.packs = (cache.packs ?? 0) + 1;
                    }
                    return { packed: JSON.stringify({ ...this }) };
                }
            }.in(`odmtest`);
        }

        it(`stores the packed data and reads them back unpacked`, async () => {
            const MyClass = createPackedClass();
            await new MyClass({ value: `secret`, count: 5 }, `packed1`).save();

            //Elasticsearch holds the packed form only
            const raw = await bootstrapTest.client.get({
                index: `odmtest_packed`,
                id: `packed1`
            });
            expect(raw._source.packed).to.be.a(`string`);
            expect(raw._source.value).to.be.undefined;

            //"get" unpacks it again
            const loaded = await MyClass.get(`packed1`);
            expect(loaded.value).to.equal(`secret`);
            expect(loaded.count).to.equal(5);
            expect(loaded.packed).to.be.undefined;

            //and so does "search"
            const found = await MyClass.findAll();
            expect(found.length).to.equal(1);
            expect(found[0].value).to.equal(`secret`);
            expect(found[0].packed).to.be.undefined;
        });

        it(`packs every item of a bulk`, async () => {
            const MyClass = createPackedClass();

            const myBulk = new BulkArray(
                new MyClass({ value: `first` }, `packed1`),
                new MyClass({ value: `second` }, `packed2`)
            );
            await myBulk.save();

            const raw = await bootstrapTest.client.get({
                index: `odmtest_packed`,
                id: `packed2`
            });
            expect(raw._source.packed).to.be.a(`string`);
            expect(raw._source.value).to.be.undefined;

            const reloaded = await MyClass.find([`packed1`, `packed2`]);
            expect(reloaded.length).to.equal(2);
            expect(reloaded.map((item) => item.value).sort()).to.deep.equal([`first`, `second`]);
        });

        it(`uses the identity by default`, async () => {
            const MyClass = createClass(`packed`).in(`odmtest`);
            const instance = new MyClass({ value: `plain` }, `packed1`);

            expect(await instance._packData()).to.deep.equal({ value: `plain` });
            expect(MyClass._unpackData({ value: `plain` })).to.deep.equal({ value: `plain` });
        });
    });

    describe(`_generateIndex()`, () => {
        it(`cannot generate index when not fully specified`, async () => {
            const MyClass = createClass(`*`).in(`odmtest`);

            expect(() => MyClass._generateIndex()).to.throw(`You cannot use '_generateIndex' with current base name '*', full alias is 'odmtest_*'!`);
        });

        it(`generates new index`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const newIndex = MyClass._generateIndex();

            const parts = newIndex.split(`_`);
            expect(parts.length).to.equal(2);
            expect(parts[0]).to.equal(`odmtest`);

            const nameParts = parts[1].split(`-`);
            expect(nameParts.length).to.equal(2);
            expect(nameParts[0]).to.equal(`users`);
            expect(nameParts[1].length).to.greaterThan(0);
        });
    });

    describe(`static clone()`, () => {
        it(`clones instance and adds new properties`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            expect(MyClass.custom).to.be.undefined;
            expect(MyClass.anotherCustom).to.be.undefined;

            const ChildClass = MyClass.clone({
                custom: `1`,
                anotherCustom: true
            });

            expect(ChildClass.custom).to.equal(`1`);
            expect(ChildClass.anotherCustom).to.equal(true);

            expect(MyClass.custom).to.be.undefined;
            expect(MyClass.anotherCustom).to.be.undefined;
        });

        it(`clones instance without any new properties`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const ChildClass = MyClass.clone();

            expect(ChildClass).not.to.equal(MyClass);
        });
    });

    describe(`static in()`, () => {
        it(`specifies new tenant`, async () => {
            let MyClass = createClass(`users`);
            expect(MyClass._tenant).to.equal(`*`);

            MyClass = MyClass.in(`odmtest`);
            expect(MyClass._tenant).to.equal(`odmtest`);

            MyClass = MyClass.in(`another`);
            expect(MyClass._tenant).to.equal(`another`);
        });

        it(`returns the same class when tenant matches`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            expect(MyClass._tenant).to.equal(`odmtest`);

            const NewClass = MyClass.in(`odmtest`);
            expect(NewClass._tenant).to.equal(`odmtest`);

            expect(MyClass).to.equal(NewClass);
        });

        it(`cannot specify wrong tenant`, async () => {
            const MyClass = createClass(`users`);

            expect(() => MyClass.in()).to.throw(`Tenant must be a string!`);
            expect(() => MyClass.in(void 0)).to.throw(`Tenant must be a string!`);
            expect(() => MyClass.in(null)).to.throw(`Tenant must be a string!`);
            expect(() => MyClass.in(1)).to.throw(`Tenant must be a string!`);
            expect(() => MyClass.in(true)).to.throw(`Tenant must be a string!`);
            expect(() => MyClass.in({ test: true })).to.throw(`Tenant must be a string!`);
            expect(() => MyClass.in(``)).to.throw(`Tenant must be a string!`);

            expect(() => MyClass.in(`odmtest_test`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => MyClass.in(`_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => MyClass.in(`:_)`)).to.throw(`Tenant cannot contain underscore.`);
        });
    });

    describe(`static immediateRefresh()`, () => {
        it(`specifies new immediate refresh`, async () => {
            let MyClass = createClass(`users`);
            expect(MyClass._immediateRefresh).to.equal(true);

            MyClass = MyClass.immediateRefresh(false);
            expect(MyClass._immediateRefresh).to.equal(false);

            MyClass = MyClass.immediateRefresh(`wait_for`);
            expect(MyClass._immediateRefresh).to.equal(`wait_for`);

            MyClass = MyClass.immediateRefresh(true);
            expect(MyClass._immediateRefresh).to.equal(true);
        });

        it(`returns the same class when the value matches`, async () => {
            const MyClass = createClass(`users`).immediateRefresh(true);
            expect(MyClass._immediateRefresh).to.equal(true);

            const NewClass = MyClass.immediateRefresh(true);
            expect(NewClass._immediateRefresh).to.equal(true);

            expect(MyClass).to.equal(NewClass);
        });

        it(`cannot specify wrong value`, async () => {
            const MyClass = createClass(`users`);

            expect(() => MyClass.immediateRefresh()).to.throw(`Immediate refresh must be a boolean or a string!`);
            expect(() => MyClass.immediateRefresh(void 0)).to.throw(`Immediate refresh must be a boolean or a string!`);
            expect(() => MyClass.immediateRefresh(null)).to.throw(`Immediate refresh must be a boolean or a string!`);
            expect(() => MyClass.immediateRefresh(1)).to.throw(`Immediate refresh must be a boolean or a string!`);
            expect(() => MyClass.immediateRefresh({ test: true })).to.throw(`Immediate refresh must be a boolean or a string!`);
        });
    });

    describe(`static __checkIfFullySpecified()`, () => {
        it(`throws when not fully specified`, async () => {
            //Test "name"
            let MyClass = createClass(`*`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current base name '*', full alias is '*_*'!`);
            MyClass = MyClass.in(`odmtest`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current base name '*', full alias is 'odmtest_*'!`);

            MyClass = createClass(`test*test`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current base name 'test*test', full alias is '*_test*test'!`);
            MyClass = MyClass.in(`odmtest`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current base name 'test*test', full alias is 'odmtest_test*test'!`);

            MyClass = createClass(`test?test`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current base name 'test?test', full alias is '*_test?test'!`);
            MyClass = MyClass.in(`odmtest`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current base name 'test?test', full alias is 'odmtest_test?test'!`);

            //Test "tenant"
            MyClass = createClass(`test`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current tenant '*', full alias is '*_test'!`);
            MyClass = MyClass.in(`test*test`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current tenant 'test*test', full alias is 'test*test_test'!`);
            MyClass = MyClass.in(`test?test`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current tenant 'test?test', full alias is 'test?test_test'!`);
            MyClass = MyClass.in(`odmtest`);
            MyClass.__checkIfFullySpecified(`test`);    //Passes
        });

        it(`throws for an empty base name`, async () => {
            //Not reachable through "createClass", but a "clone" or an overridden "_parseIndex" can produce it
            const MyClass = createClass(`users`).in(`odmtest`).clone({ _name: `` });
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.throw(`You cannot use 'test' with current base name ''`);
        });

        it(`passes when correctly specified`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            expect(() => MyClass.__checkIfFullySpecified(`test`)).to.not.throw();
        });
    });
});
