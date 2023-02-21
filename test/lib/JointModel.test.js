'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const { createClass, JointModel, BulkArray } = require(`../../app`);

//It uses ES7 Circularo indices
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

            await expect(jointModel.search(`invalid`)).to.be.eventually.rejectedWith(`Incorrect body has been specified!`);
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

            const results = await jointModel.search(void 0, void 0, void 0, true);
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

            let myPIT = await jointModel.openPIT();

            const anotherBulk = new BulkArray();
            for (let i = 0; i < documentSize; i++) {
                anotherBulk.push(new MyUsers({ name: `another_${i}` }));
                anotherBulk.push(new MyDocuments({ documentTitle: `another_${i}` }));
            }
            await anotherBulk.save();

            await MyUsers.search({});
            await MyDocuments.search({});

            const allResults = [];
            let foundResults, searchAfter;
            do {
                foundResults = await jointModel.search({ size: 2, pit: { id: myPIT, keep_alive: `60s` }, sort: [{ _shard_doc: `asc` }], search_after: searchAfter, track_total_hits: false });
                allResults.push(...foundResults);

                myPIT = foundResults?.pitID;
                searchAfter = foundResults[foundResults.length - 1]?._sort;

            } while (foundResults.length > 0);

            await jointModel.closePIT(myPIT);

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
        it(`can't close not existing PIT`, async () => {
            const jointModel = new JointModel();
            const result = await jointModel.closePIT(`wtf`);
            expect(result).to.equal(false);
        });

        it(`closes PIT`, async () => {
            const jointModel = new JointModel();

            jointModel.recordSearch(createClass(`users`).in(`test`));
            jointModel.recordSearch(createClass(`documents`).in(`test`));
            const myPIT = await jointModel.openPIT();

            const result = await jointModel.closePIT(myPIT);
            expect(result).to.equal(true);
        });
    });
});