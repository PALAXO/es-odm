'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const { createClass, JointModel, BulkArray } = require(`../../index`);

describe(`JointModel class`, function() {
    this.timeout(testTimeout);

    describe(`recordSearch()`, () => {
        it(`can't record model without correct index`, () => {
            const jointModel = new JointModel();

            expect(() => jointModel.recordSearch({})).to.throw(`OdmModel.__checkIfFullySpecified is not a function`);
            expect(() => jointModel.recordSearch({ alias: {} })).to.throw(`OdmModel.__checkIfFullySpecified is not a function`);
        });

        it(`can't record model with wildcard in index`, () => {
            const jointModel = new JointModel();

            expect(() => jointModel.recordSearch(createClass(`users`, Joi.object()))).to.throw(`You cannot use 'recordSearch' with current tenant '*', full alias is '*_users'!`);
            expect(() => jointModel.recordSearch(createClass(`users`, Joi.object()).in(`?`))).to.throw(`You cannot use 'recordSearch' with current tenant '?', full alias is '?_users'!`);
        });

        it(`can record correct model`, () => {
            const jointModel = new JointModel();
            const MyClass = createClass(`users`, Joi.object()).in(`test`);

            const rewritten = jointModel.recordSearch(MyClass);
            expect(rewritten.alias).to.equal(MyClass.alias);
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].alias).to.equal(MyClass.alias);
            expect(jointModel.models[0].model.alias).to.equal(MyClass.alias);

            const query1 = {
                query: {
                    myQuery: `myQuery1`
                }
            };
            rewritten.search(query1);
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].queries.length).to.equal(1);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query1.query);

            const query2 = {
                query: {
                    myQuery: `myQuery2`
                }
            };
            rewritten.search(query2);
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].queries.length).to.equal(2);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query1.query);
            expect(jointModel.models[0].queries[1]).to.deep.equal(query2.query);
        });

        it(`can record multiple models`, () => {
            const jointModel = new JointModel();
            const MyClass1 = createClass(`users`, Joi.object()).in(`test`);
            const MyClass2 = createClass(`documents`, Joi.object()).in(`test`);

            const rewritten1 = jointModel.recordSearch(MyClass1);
            expect(rewritten1.alias).to.equal(MyClass1.alias);
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].alias).to.equal(MyClass1.alias);
            expect(jointModel.models[0].model.alias).to.equal(MyClass1.alias);

            const rewritten2 = jointModel.recordSearch(MyClass2);
            expect(rewritten2.alias).to.equal(MyClass2.alias);
            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].alias).to.equal(MyClass1.alias);
            expect(jointModel.models[0].model.alias).to.equal(MyClass1.alias);
            expect(jointModel.models[1].alias).to.equal(MyClass2.alias);
            expect(jointModel.models[1].model.alias).to.equal(MyClass2.alias);

            const query1 = {
                query: {
                    myQuery: `myQuery1`
                }
            };
            rewritten2.search(query1);
            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].queries.length).to.equal(0);
            expect(jointModel.models[1].queries.length).to.equal(1);
            expect(jointModel.models[1].queries[0]).to.deep.equal(query1.query);

            const query2 = {
                query: {
                    myQuery: `myQuery2`
                }
            };
            rewritten1.search(query2);
            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].queries.length).to.equal(1);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query2.query);
            expect(jointModel.models[1].queries.length).to.equal(1);
            expect(jointModel.models[1].queries[0]).to.deep.equal(query1.query);

            const query3 = {
                query: {
                    myQuery: `myQuery3`
                }
            };
            rewritten2.search(query3);
            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].queries.length).to.equal(1);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query2.query);
            expect(jointModel.models[1].queries.length).to.equal(2);
            expect(jointModel.models[1].queries[0]).to.deep.equal(query1.query);
            expect(jointModel.models[1].queries[1]).to.deep.equal(query3.query);

            const MyClass3 = createClass(`documents`, Joi.object()).in(`default`);
            const rewritten3 = jointModel.recordSearch(MyClass3);

            const query4 = {
                query: {
                    myQuery: `myQuery4`
                }
            };
            rewritten3.search(query4);
            expect(jointModel.models.length).to.equal(3);
            expect(jointModel.models[0].queries.length).to.equal(1);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query2.query);
            expect(jointModel.models[1].queries.length).to.equal(2);
            expect(jointModel.models[1].queries[0]).to.deep.equal(query1.query);
            expect(jointModel.models[1].queries[1]).to.deep.equal(query3.query);
            expect(jointModel.models[2].queries.length).to.equal(1);
            expect(jointModel.models[2].queries[0]).to.deep.equal(query4.query);
        });

        it(`uses single internal model for duplicate OdmModels`, () => {
            const jointModel = new JointModel();

            const MyClass1 = createClass(`users`, Joi.object()).in(`test`);
            const rewritten1 = jointModel.recordSearch(MyClass1);
            expect(rewritten1.alias).to.equal(MyClass1.alias);

            const MyClass2 = createClass(`documents`, Joi.object()).in(`test`);
            const rewritten2 = jointModel.recordSearch(MyClass2);
            expect(rewritten2.alias).to.equal(MyClass2.alias);

            const MyClass3 = createClass(`documents`, Joi.object()).in(`test`);
            const rewritten3 = jointModel.recordSearch(MyClass3);
            expect(rewritten3.alias).to.equal(MyClass3.alias);

            const MyClass4 = createClass(`users`, Joi.object()).in(`test`);
            const rewritten4 = jointModel.recordSearch(MyClass4);
            expect(rewritten4.alias).to.equal(MyClass4.alias);

            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].alias).to.equal(MyClass1.alias);
            expect(jointModel.models[1].alias).to.equal(MyClass2.alias);

            const query1 = {
                query: {
                    myQuery: `myQuery1`
                }
            };
            rewritten1.search(query1);

            const query2 = {
                query: {
                    myQuery: `myQuery2`
                }
            };
            rewritten2.search(query2);

            const query3 = {
                query: {
                    myQuery: `myQuery3`
                }
            };
            rewritten3.search(query3);

            const query4 = {
                query: {
                    myQuery: `myQuery4`
                }
            };
            rewritten4.search(query4);

            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].queries.length).to.equal(2);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query1.query);
            expect(jointModel.models[0].queries[1]).to.deep.equal(query4.query);
            expect(jointModel.models[1].queries.length).to.equal(2);
            expect(jointModel.models[1].queries[0]).to.deep.equal(query2.query);
            expect(jointModel.models[1].queries[1]).to.deep.equal(query3.query);
        });
    });

    describe(`search()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument;

        beforeEach(async () => {
            userObject1 = {
                index: `test_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents`,
                document: {
                    html: `d_default`
                },
                id: `document`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),
                bootstrapTest.client.index(defaultDocument)
            ]);
        });

        it(`can't search when nothing is recorded`, async () => {
            const jointModel = new JointModel();

            await expect(jointModel.search()).to.be.eventually.rejectedWith(`No search has been recorded!`);
        });

        it(`can't search with incorrect body`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`test`));
            await MyClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            });

            await expect(jointModel.search(`invalid`)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`searches with single recorded query`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`test`));
            await MyClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            });

            const results = await jointModel.search();
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
            let MyClass = createClass(`users`).in(`test`);
            let instances, cache;
            MyClass._afterSearch = async function (newInstances, newCache) {
                instances = newInstances;
                cache = newCache;
            };

            const jointModel = new JointModel();
            MyClass = jointModel.recordSearch(MyClass);

            await MyClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            });

            const results = await jointModel.search(void 0, void 0, void 0, { cache: { custom: true } });
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

        it(`will ignore query in JointModel search`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`test`));
            await MyClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            });

            const results = await jointModel.search({
                query: {
                    match_all: {}
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

        it(`searches with multiple recorded queries`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`).in(`test`);
            let userAfterFunctionCalled = false;
            OriginalUserClass._afterSearch = function() {
                userAfterFunctionCalled = true;
            };
            const UserClass = jointModel.recordSearch(OriginalUserClass);
            await UserClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            });

            const OriginalDocumentClass = createClass(`documents`).in(`test`);
            let documentAfterFunctionCalled = false;
            OriginalDocumentClass._afterSearch = function() {
                documentAfterFunctionCalled = true;
            };
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            const results = await jointModel.search();
            expect(results.length).to.equal(1);
            expect(results._total).to.equal(1);

            expect(userAfterFunctionCalled).to.be.true;
            const userInstances = results.filter((instance) => {
                return instance.constructor.alias === UserClass.alias;
            });
            expect(userInstances.length).to.equal(1);
            expect(userInstances[0]).to.be.instanceOf(OriginalUserClass);
            expect(userInstances[0].status).to.equal(userObject1.document.status);
            expect(userInstances[0].name).to.equal(userObject1.document.name);

            expect(documentAfterFunctionCalled).to.be.false;
            const documentInstances = results.filter((instance) => {
                return instance.constructor.alias === DocumentClass.alias;
            });
            expect(documentInstances.length).to.equal(0);
        });

        it(`searches with multiple recorded queries again`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`).in(`test`);
            let userAfterFunctionCalled = false;
            OriginalUserClass._afterSearch = function() {
                userAfterFunctionCalled = true;
            };

            const OriginalDocumentClass = createClass(`documents`).in(`test`);
            let documentAfterFunctionCalled = false;
            OriginalDocumentClass._afterSearch = function() {
                documentAfterFunctionCalled = true;
            };

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                DocumentClass.search({
                    query: {
                        match_all: {}
                    }
                })
            ]);

            const results = await jointModel.search();
            expect(results.length).to.equal(3);
            expect(results._total).to.equal(3);

            expect(userAfterFunctionCalled).to.be.true;
            const userInstances = results.filter((instance) => {
                return instance.constructor.alias === UserClass.alias;
            });
            expect(userInstances.length).to.equal(2);
            for (const instance of userInstances) {
                expect(instance).to.be.instanceOf(OriginalUserClass);
            }

            expect(documentAfterFunctionCalled).to.be.true;
            const documentInstances = results.filter((instance) => {
                return instance.constructor.alias === DocumentClass.alias;
            });
            expect(documentInstances.length).to.equal(1);
            for (const instance of documentInstances) {
                expect(instance).to.be.instanceOf(OriginalDocumentClass);
            }
        });

        it(`searches with size specified`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                DocumentClass.search({
                    query: {
                        match_all: {}
                    }
                })
            ]);

            const results = await jointModel.search(void 0, 0, 1);
            expect(results.length).to.equal(1);
            expect(results._total).to.equal(3);
        });

        it(`searches with from specified`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                DocumentClass.search({
                    query: {
                        match_all: {}
                    }
                })
            ]);

            const results = await jointModel.search({}, 1);
            expect(results.length).to.equal(2);
            expect(results._total).to.equal(3);
        });

        it(`searches with size and from specified`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                DocumentClass.search({
                    query: {
                        match_all: {}
                    }
                })
            ]);

            const results = await jointModel.search(void 0, 1, 2);
            expect(results.length).to.equal(2);
            expect(results._total).to.equal(3);
        });

        it(`searches for plain objects`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                DocumentClass.search({
                    query: {
                        match_all: {}
                    }
                })
            ]);

            const results = await jointModel.search(void 0, void 0, void 0, { source: true });
            expect(results.length).to.equal(3);
            expect(results._total).to.equal(3);
            for (const result of results) {
                expect(result.constructor.alias).to.be.undefined;
            }
        });

        it(`searches with aggregation query`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                DocumentClass.search({
                    query: {
                        match_all: {}
                    }
                })
            ]);

            const results = await jointModel.search({
                aggs: {
                    index: {
                        terms: {
                            field: `_index`
                        }
                    }
                }
            });
            expect(results.length).to.equal(3);
            expect(results._total).to.equal(3);
            expect(results.aggregations.index.buckets.length).to.equal(2);

            const [userIndex, documentIndex] = await Promise.all([UserClass.getIndex(), DocumentClass.getIndex()]);

            const userAggregations = results.aggregations.index.buckets.find((agg) => agg.key === userIndex);
            expect(userAggregations.doc_count).to.equal(2);

            const documentAggregations = results.aggregations.index.buckets.find((agg) => agg.key === documentIndex);
            expect(documentAggregations.doc_count).to.equal(1);
        });
    });

    describe(`static *bulkIterator()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `test_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `test_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `test_documents`,
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
            const size = 35000;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            let bulks = myJoint.bulkIterator();
            for await (const bulk of bulks) {
                total += bulk.length;
            }
            expect(total).to.equal(2 * size);

            total = 0;
            const bulkSize = 100;
            bulks = myJoint.bulkIterator({ size: bulkSize });
            for await (const bulk of bulks) {
                total += bulk.length;
                expect(bulk.length).to.equal(bulkSize);
            }
            expect(total).to.equal(2 * size);
        });

        it(`iterates using non existing property`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const myJoint = new JointModel();
            const RecordingClass = myJoint.recordSearch(MyClass);
            await RecordingClass.search({
                query: {
                    match: {
                        unknown: `whatever`
                    }
                }
            });

            const bulks = myJoint.bulkIterator();
            for await (const bulk of bulks) {
                expect(bulk.length).to.equal(0);
                expect(bulk._total).to.equal(0);
            }
        });

        it(`iterates using custom cache`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            let instances1, cache1;
            MyUsers._afterSearch = async function (newInstances, newCache) {
                instances1 = newInstances;
                cache1 = newCache;
            };
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            let instances2, cache2;
            MyDocuments._afterSearch = async function (newInstances, newCache) {
                instances2 = newInstances;
                cache2 = newCache;
            };
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            const bulks = myJoint.bulkIterator(void 0, { cache: { custom: true } });
            for await (const bulk of bulks) {
                total += bulk.length;
            }
            expect(total).to.equal(2 * size);

            expect(instances1.length).to.equal(size);
            expect(cache1?.custom).to.equal(true);

            expect(instances2.length).to.equal(size);
            expect(cache2?.custom).to.equal(true);
        });

        it(`iterates without source fields`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            const bulks = myJoint.bulkIterator(void 0, { source: false });
            for await (const bulk of bulks) {
                total += bulk.length;

                for (const item of bulk) {
                    expect(item._id).not.to.be.undefined;
                    expect(item._index).not.to.be.undefined;
                    expect(item._version).not.to.be.undefined;
                    expect(item._primary_term).not.to.be.undefined;
                    expect(item._seq_no).not.to.be.undefined;
                    expect(item._score).not.to.be.undefined;
                    expect(item._source).to.be.undefined;
                }
            }
            expect(total).to.equal(2 * size);
        });

        it(`iterates for specific field only`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            const bulks = myJoint.bulkIterator(void 0, { source: [`name`] });
            for await (const bulk of bulks) {
                total += bulk.length;

                for (const item of bulk) {
                    expect(item._id).not.to.be.undefined;
                    expect(item._index).not.to.be.undefined;
                    expect(item._version).not.to.be.undefined;
                    expect(item._primary_term).not.to.be.undefined;
                    expect(item._seq_no).not.to.be.undefined;
                    expect(item._score).not.to.be.undefined;

                    if (item._index.startsWith(RecordingUsers.alias)) {
                        expect(item._source.name).not.to.be.undefined;
                        expect(item._source.status).to.be.undefined;
                    } else {
                        expect(item._source).to.be.empty;
                    }
                }
            }
            expect(total).to.equal(2 * size);
        });

        it(`iterates for documents with size parameter`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            const bulkSize = 10;
            const bulks = myJoint.bulkIterator({ size: bulkSize });
            for await (const bulk of bulks) {
                total += bulk.length;
                expect(bulk.length).to.equal(bulkSize);

                for (const item of bulk) {
                    if (item.constructor.alias.startsWith(RecordingUsers.alias)) {
                        expect(item.name.substring(0, 4)).to.equal(`name`);
                    } else {
                        expect(item.documentTitle.substring(0, 5)).to.equal(`title`);
                    }
                }
            }
            expect(total).to.equal(2 * size);
        });

        it(`iterates using explicitly specified PIT ID`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            const myPIT = await myJoint.openPIT();

            let total = 0;
            let bulkSize = 10;
            let bulks = myJoint.bulkIterator({ size: bulkSize }, { pitId: myPIT });
            for await (const bulk of bulks) {
                total += bulk.length;
                expect(bulk.length).to.equal(bulkSize);

                for (const item of bulk) {
                    if (item.constructor.alias.startsWith(RecordingUsers.alias)) {
                        expect(item.name.substring(0, 4)).to.equal(`name`);
                    } else {
                        expect(item.documentTitle.substring(0, 5)).to.equal(`title`);
                    }
                }
            }
            expect(total).to.equal(2 * size);

            //And repeat again with the same PIT
            total = 0;
            bulkSize = 10;
            bulks = myJoint.bulkIterator({ size: bulkSize }, { pitId: myPIT });
            for await (const bulk of bulks) {
                total += bulk.length;
                expect(bulk.length).to.equal(bulkSize);

                for (const item of bulk) {
                    if (item.constructor.alias.startsWith(RecordingUsers.alias)) {
                        expect(item.name.substring(0, 4)).to.equal(`name`);
                    } else {
                        expect(item.documentTitle.substring(0, 5)).to.equal(`title`);
                    }
                }
            }
            expect(total).to.equal(2 * size);

            await myJoint.closePIT(myPIT);
        });
    });

    describe(`static *itemIterator()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
            userObject1 = {
                index: `test_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument1 = {
                index: `test_documents`,
                document: {
                    html: `d_default`
                },
                id: `document1`,
                refresh: true
            };
            defaultDocument2 = {
                index: `test_documents`,
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
            const size = 35000;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            let items = myJoint.itemIterator();
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(2 * size);

            total = 0;
            const bulkSize = 100;
            items = myJoint.itemIterator({ size: bulkSize });
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(2 * size);
        });

        it(`iterates using non existing property`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const myJoint = new JointModel();
            const RecordingClass = myJoint.recordSearch(MyClass);
            await RecordingClass.search({
                query: {
                    match: {
                        unknown: `whatever`
                    }
                }
            });

            let total = 0;
            const items = myJoint.itemIterator();
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(0);
        });

        it(`iterates using custom cache`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            let instances1, cache1;
            MyUsers._afterSearch = async function (newInstances, newCache) {
                instances1 = newInstances;
                cache1 = newCache;
            };
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            let instances2, cache2;
            MyDocuments._afterSearch = async function (newInstances, newCache) {
                instances2 = newInstances;
                cache2 = newCache;
            };
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            const items = myJoint.itemIterator(void 0, { cache: { custom: true } });
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(2 * size);

            expect(instances1.length).to.equal(size);
            expect(cache1?.custom).to.equal(true);

            expect(instances2.length).to.equal(size);
            expect(cache2?.custom).to.equal(true);
        });

        it(`iterates without source fields`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            const items = myJoint.itemIterator(void 0, { source: false });
            for await (const item of items) {
                total++;

                expect(item._id).not.to.be.undefined;
                expect(item._index).not.to.be.undefined;
                expect(item._version).not.to.be.undefined;
                expect(item._primary_term).not.to.be.undefined;
                expect(item._seq_no).not.to.be.undefined;
                expect(item._score).not.to.be.undefined;
                expect(item._source).to.be.undefined;
            }
            expect(total).to.equal(2 * size);
        });

        it(`iterates for specific field only`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            const items = myJoint.itemIterator(void 0, { source: [`name`] });
            for await (const item of items) {
                total++;

                expect(item._id).not.to.be.undefined;
                expect(item._index).not.to.be.undefined;
                expect(item._version).not.to.be.undefined;
                expect(item._primary_term).not.to.be.undefined;
                expect(item._seq_no).not.to.be.undefined;
                expect(item._score).not.to.be.undefined;

                if (item._index.startsWith(RecordingUsers.alias)) {
                    expect(item._source.name).not.to.be.undefined;
                    expect(item._source.status).to.be.undefined;
                } else {
                    expect(item._source).to.be.empty;
                }
            }
            expect(total).to.equal(2 * size);
        });

        it(`iterates for documents with size parameter`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            let total = 0;
            const bulkSize = 10;
            const items = myJoint.itemIterator({ size: bulkSize });
            for await (const item of items) {
                total++;

                if (item.constructor.alias.startsWith(RecordingUsers.alias)) {
                    expect(item.name.substring(0, 4)).to.equal(`name`);
                } else {
                    expect(item.documentTitle.substring(0, 5)).to.equal(`title`);
                }
            }
            expect(total).to.equal(2 * size);
        });

        it(`iterates using explicitly specified PIT ID`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`test`);
            await MyUsers.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyUsers.alias,
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

            const MyDocuments = createClass(`documents`).in(`test`);
            await MyDocuments.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyDocuments.alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    documentTitle: `title_${i}`
                });
            }
            await bootstrapTest.client.bulk({
                operations: bulk,
                refresh: true
            });

            const myJoint = new JointModel();
            const RecordingUsers = myJoint.recordSearch(MyUsers);
            await RecordingUsers.search();
            const RecordingDocuments = myJoint.recordSearch(MyDocuments);
            await RecordingDocuments.search();

            const myPIT = await myJoint.openPIT();

            let total = 0;
            let bulkSize = 10;
            let items = myJoint.itemIterator({ size: bulkSize }, { pitId: myPIT });
            for await (const item of items) {
                total++;

                if (item.constructor.alias.startsWith(RecordingUsers.alias)) {
                    expect(item.name.substring(0, 4)).to.equal(`name`);
                } else {
                    expect(item.documentTitle.substring(0, 5)).to.equal(`title`);
                }
            }
            expect(total).to.equal(2 * size);

            //And repeat again with the same PIT
            total = 0;
            bulkSize = 10;
            items = myJoint.itemIterator({ size: bulkSize }, { pitId: myPIT });
            for await (const item of items) {
                total++;

                if (item.constructor.alias.startsWith(RecordingUsers.alias)) {
                    expect(item.name.substring(0, 4)).to.equal(`name`);
                } else {
                    expect(item.documentTitle.substring(0, 5)).to.equal(`title`);
                }
            }
            expect(total).to.equal(2 * size);

            await myJoint.closePIT(myPIT);
        });
    });

    describe(`clearSearch()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument;

        beforeEach(async () => {
            userObject1 = {
                index: `test_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents`,
                document: {
                    html: `d_default`
                },
                id: `document`,
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),
                bootstrapTest.client.index(defaultDocument)
            ]);
        });

        it(`Clears when no model specified`, async () => {
            const jointModel = new JointModel();

            jointModel.clearSearch();
        });

        it(`clears when no search is recorded`, async () => {
            const jointModel = new JointModel();

            jointModel.recordSearch(createClass(`users`).in(`test`));

            jointModel.clearSearch();
        });

        it(`clears after search is performed but data are not yet received`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`test`));
            await MyClass.search(void 0);

            jointModel.clearSearch();

            await expect(jointModel.search()).to.be.eventually.rejectedWith(`No search has been recorded!`);
        });

        it(`clears after search is performed and data are received`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`test`));
            await MyClass.search(void 0);

            let results = await jointModel.search();
            expect(results.length).to.greaterThanOrEqual(0);

            results = await jointModel.search();
            expect(results.length).to.greaterThanOrEqual(0);

            jointModel.clearSearch();

            await expect(jointModel.search()).to.be.eventually.rejectedWith(`No search has been recorded!`);

            await MyClass.search(void 0);

            results = await jointModel.search();
            expect(results.length).to.greaterThanOrEqual(0);
        });
    });

    describe(`openPIT()`, () => {
        it(`can't open PIT with not existing index`, async () => {
            const jointModel = new JointModel();

            jointModel.recordSearch(createClass(`test`).in(`test`));
            await expect(jointModel.openPIT()).to.be.eventually.rejectedWith(`index_not_found_exception: [index_not_found_exception] Reason: no such index [test_test]`);
        });

        it(`searches using PIT over multiple indices`, async () => {
            const jointModel = new JointModel();

            const MyUsers = jointModel.recordSearch(createClass(`users`).in(`test`));
            const MyDocuments = jointModel.recordSearch(createClass(`documents`).in(`test`));
            const documentSize = 10;

            const ids = [];
            const myBulk = new BulkArray();
            for (let i = 0; i < documentSize; i++) {
                const id = `${i}`;
                ids.push(id);
                myBulk.push(new MyUsers({ name: id }));
                myBulk.push(new MyDocuments({ documentTitle: id }));
            }
            await myBulk.save();

            const myPit = await jointModel.openPIT();

            const anotherBulk = new BulkArray();
            for (let i = 0; i < documentSize; i++) {
                anotherBulk.push(new MyUsers({ name: `another_${i}` }));
                anotherBulk.push(new MyDocuments({ documentTitle: `another_${i}` }));
            }
            await anotherBulk.save();

            await MyUsers.search({});
            await MyDocuments.search({});

            const allResults = [];
            let foundResults;
            do {
                foundResults = await jointModel.search({}, 0, 2, { pitId: foundResults?.pitId ?? myPit, searchAfter: foundResults?._lastPosition });
                allResults.push(...foundResults);

            } while (foundResults.length > 0);

            await jointModel.closePIT(myPit);

            expect(allResults.length).to.equal(2 * documentSize);
            for (const id of ids) {
                let index = allResults.findIndex((singleResult) => singleResult.name === id);
                expect(index).to.be.greaterThanOrEqual(0);
                allResults.splice(index, 1);

                index = allResults.findIndex((singleResult) => singleResult.documentTitle === id);
                expect(index).to.be.greaterThanOrEqual(0);
                allResults.splice(index, 1);
            }
        });
    });

    describe(`closePIT()`, () => {
        it(`can't close PIT without specifying pitID`, async () => {
            const jointModel = new JointModel();

            await expect(jointModel.closePIT()).to.be.eventually.rejectedWith(`PIT ID must be specified!`);
        });

        it(`can't close not existing PIT`, async () => {
            const jointModel = new JointModel();
            const result = await jointModel.closePIT(`wtf`);
            expect(result).to.equal(false);
        });

        it(`closes PIT`, async () => {
            const jointModel = new JointModel();

            jointModel.recordSearch(createClass(`users`).in(`test`));
            jointModel.recordSearch(createClass(`documents`).in(`test`));
            const myPit = await jointModel.openPIT();

            const result = await jointModel.closePIT(myPit);
            expect(result).to.equal(true);
        });
    });

    describe(`async _getBulkSize()`, () => {
        it(`throws when there are no models`, async () => {
            const myJoint = new JointModel();
            await expect(myJoint._getBulkSize()).to.be.eventually.rejectedWith(`There are no models in JointModel instance.`);
        });

        it(`returns bulk value from single model`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            MyClass._getBulkSize = async function() { return 10; };

            const myJoint = new JointModel();
            myJoint.recordSearch(MyClass);
            const bulkSize = await myJoint._getBulkSize();
            expect(bulkSize).to.be.a(`number`);
            expect(bulkSize).to.equal(10);
        });

        it(`returns bulk value from multiple models`, async () => {
            const MyClass1 = createClass(`users1`).in(`test`);
            MyClass1._getBulkSize = async function() { return 100; };

            const MyClass2 = createClass(`users2`).in(`test`);
            MyClass2._getBulkSize = async function() { return 50; };

            const MyClass3 = createClass(`users3`).in(`test`);
            MyClass3._getBulkSize = async function() { return 85; };

            const myJoint = new JointModel();
            myJoint.recordSearch(MyClass1);
            myJoint.recordSearch(MyClass2);
            myJoint.recordSearch(MyClass3);
            const bulkSize = await myJoint._getBulkSize();
            expect(bulkSize).to.be.a(`number`);
            expect(bulkSize).to.equal(50);
        });
    });
});