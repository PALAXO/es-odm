'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const { createClass, JointModel } = require(`../../app`);

//It uses ES7 Circularo indices
describe(`JointModel class`, function() {
    this.timeout(testTimeout);

    describe(`recordSearch()`, () => {
        it(`can't record model without correct index`, () => {
            const jointModel = new JointModel();

            expect(() => jointModel.recordSearch({})).to.throw(`Model doesn't have specified index!`);
            expect(() => jointModel.recordSearch({ __fullIndex: {} })).to.throw(`Model doesn't have specified index!`);
        });

        it(`can't record model with wildcard in index`, () => {
            const jointModel = new JointModel();

            expect(() => jointModel.recordSearch(createClass(`users`, Joi.object()))).to.throw(`Model index cannot contain wildcards!`);
            expect(() => jointModel.recordSearch(createClass(`users`, Joi.object()).in(`?`))).to.throw(`Model index cannot contain wildcards!`);
        });

        it(`can record correct model`, () => {
            const jointModel = new JointModel();
            const MyClass = createClass(`users`, Joi.object()).in(`test`);

            const rewritten = jointModel.recordSearch(MyClass);
            expect(rewritten.__fullIndex).to.equal(MyClass.__fullIndex);
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].index).to.equal(MyClass.__fullIndex);
            expect(jointModel.models[0].model.__fullIndex).to.equal(MyClass.__fullIndex);

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
            const MyClass2 = createClass(`documents`, Joi.object(), `folder`).in(`test`);

            const rewritten1 = jointModel.recordSearch(MyClass1);
            expect(rewritten1.__fullIndex).to.equal(MyClass1.__fullIndex);
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].index).to.equal(MyClass1.__fullIndex);
            expect(jointModel.models[0].model.__fullIndex).to.equal(MyClass1.__fullIndex);

            const rewritten2 = jointModel.recordSearch(MyClass2);
            expect(rewritten2.__fullIndex).to.equal(MyClass2.__fullIndex);
            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].index).to.equal(MyClass1.__fullIndex);
            expect(jointModel.models[0].model.__fullIndex).to.equal(MyClass1.__fullIndex);
            expect(jointModel.models[1].index).to.equal(MyClass2.__fullIndex);
            expect(jointModel.models[1].model.__fullIndex).to.equal(MyClass2.__fullIndex);

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

            const MyClass3 = createClass(`documents`, Joi.object(), `folder`).in(`default`);
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
            expect(rewritten1.__fullIndex).to.equal(MyClass1.__fullIndex);

            const MyClass2 = createClass(`documents`, Joi.object(), `folder`).in(`test`);
            const rewritten2 = jointModel.recordSearch(MyClass2);
            expect(rewritten2.__fullIndex).to.equal(MyClass2.__fullIndex);

            const MyClass3 = createClass(`documents`, Joi.object(), `folder`).in(`test`);
            const rewritten3 = jointModel.recordSearch(MyClass3);
            expect(rewritten3.__fullIndex).to.equal(MyClass3.__fullIndex);

            const MyClass4 = createClass(`users`, Joi.object()).in(`test`);
            const rewritten4 = jointModel.recordSearch(MyClass4);
            expect(rewritten4.__fullIndex).to.equal(MyClass4.__fullIndex);

            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].index).to.equal(MyClass1.__fullIndex);
            expect(jointModel.models[1].index).to.equal(MyClass2.__fullIndex);

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
        let folderDocument1;
        let folderDocument2;
        let defaultDocument;

        beforeEach(async () => {
            userObject1 = {
                index: `test_users`,
                body: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                body: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            folderDocument1 = {
                index: `test_documents_folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                body: {
                    html: `folder 2`
                },
                id: `2folder`,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents_d_default`,
                body: {
                    html: `d_default`
                },
                refresh: true
            };

            await Promise.all([
                bootstrapTest.client.index(userObject1),
                bootstrapTest.client.index(userObject2),

                bootstrapTest.client.index(folderDocument1),
                bootstrapTest.client.index(folderDocument2),
                bootstrapTest.client.index(defaultDocument)
            ]);
        });

        it(`can't search when nothing is recorded`, async () => {
            const jointModel = new JointModel();

            await expect(jointModel.search()).to.be.eventually.rejectedWith(`No search has been recorded!`);
        });

        it(`can't search with incorrect body`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`, void 0).in(`test`));
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

            const MyClass = jointModel.recordSearch(createClass(`users`, void 0).in(`test`));
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
            expect(results[0].status).to.equal(userObject1.body.status);
            expect(results[0].name).to.equal(userObject1.body.name);
        });

        it(`will ignore query in JointModel search`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`, void 0).in(`test`));
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
            expect(results[0].status).to.equal(userObject1.body.status);
            expect(results[0].name).to.equal(userObject1.body.name);
        });

        it(`searches with multiple recorded queries`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`, void 0).in(`test`);
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

            const OriginalFolderClass = createClass(`documents`, void 0, `folder`).in(`test`);
            let folderAfterFunctionCalled = false;
            OriginalFolderClass._afterSearch = function() {
                folderAfterFunctionCalled = true;
            };
            const FolderClass = jointModel.recordSearch(OriginalFolderClass);
            await FolderClass.search({
                query: {
                    match_all: {}
                }
            });

            const OriginalDocumentClass = createClass(`documents`, void 0, `d_default`).in(`test`);
            let documentAfterFunctionCalled = false;
            OriginalDocumentClass._afterSearch = function() {
                documentAfterFunctionCalled = true;
            };
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            const results = await jointModel.search();
            expect(results.length).to.equal(3);
            expect(results._total).to.equal(3);

            expect(userAfterFunctionCalled).to.be.true;
            const userInstances = results.filter((instance) => {
                return instance.constructor.__fullIndex === UserClass.__fullIndex;
            });
            expect(userInstances.length).to.equal(1);
            expect(userInstances[0]).to.be.instanceOf(OriginalUserClass);
            expect(userInstances[0].status).to.equal(userObject1.body.status);
            expect(userInstances[0].name).to.equal(userObject1.body.name);

            expect(folderAfterFunctionCalled).to.be.true;
            const folderInstances = results.filter((instance) => {
                return instance.constructor.__fullIndex === FolderClass.__fullIndex;
            });
            expect(folderInstances.length).to.equal(2);
            const expectedValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const folderInstance of folderInstances) {
                expect(folderInstance).to.be.instanceOf(OriginalFolderClass);
                expect(expectedValues).to.include(folderInstance.html);
            }

            expect(documentAfterFunctionCalled).to.be.false;
            const documentInstances = results.filter((instance) => {
                return instance.constructor.__fullIndex === DocumentClass.__fullIndex;
            });
            expect(documentInstances.length).to.equal(0);
        });

        it(`searches with multiple recorded queries again`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`, void 0).in(`test`);
            let userAfterFunctionCalled = false;
            OriginalUserClass._afterSearch = function() {
                userAfterFunctionCalled = true;
            };

            const OriginalFolderClass = createClass(`documents`, void 0, `folder`).in(`test`);
            let folderAfterFunctionCalled = false;
            OriginalFolderClass._afterSearch = function() {
                folderAfterFunctionCalled = true;
            };

            const OriginalDocumentClass = createClass(`documents`, void 0, `d_default`).in(`test`);
            let documentAfterFunctionCalled = false;
            OriginalDocumentClass._afterSearch = function() {
                documentAfterFunctionCalled = true;
            };

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const FolderClass = jointModel.recordSearch(OriginalFolderClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                FolderClass.search({
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
            expect(results.length).to.equal(5);
            expect(results._total).to.equal(5);

            expect(userAfterFunctionCalled).to.be.true;
            const userInstances = results.filter((instance) => {
                return instance.constructor.__fullIndex === UserClass.__fullIndex;
            });
            expect(userInstances.length).to.equal(2);
            for (const instance of userInstances) {
                expect(instance).to.be.instanceOf(OriginalUserClass);
            }

            expect(folderAfterFunctionCalled).to.be.true;
            const folderInstances = results.filter((instance) => {
                return instance.constructor.__fullIndex === FolderClass.__fullIndex;
            });
            expect(folderInstances.length).to.equal(2);
            for (const instance of folderInstances) {
                expect(instance).to.be.instanceOf(OriginalFolderClass);
            }

            expect(documentAfterFunctionCalled).to.be.true;
            const documentInstances = results.filter((instance) => {
                return instance.constructor.__fullIndex === DocumentClass.__fullIndex;
            });
            expect(documentInstances.length).to.equal(1);
            for (const instance of documentInstances) {
                expect(instance).to.be.instanceOf(OriginalDocumentClass);
            }
        });

        it(`searches with size specified`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`, void 0).in(`test`);
            const OriginalFolderClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`, void 0, `d_default`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const FolderClass = jointModel.recordSearch(OriginalFolderClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                FolderClass.search({
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
            expect(results._total).to.equal(5);
        });

        it(`searches with from specified`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`, void 0).in(`test`);
            const OriginalFolderClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`, void 0, `d_default`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const FolderClass = jointModel.recordSearch(OriginalFolderClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                FolderClass.search({
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
            expect(results.length).to.equal(4);
            expect(results._total).to.equal(5);
        });

        it(`searches with size and from specified`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`, void 0).in(`test`);
            const OriginalFolderClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`, void 0, `d_default`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const FolderClass = jointModel.recordSearch(OriginalFolderClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                FolderClass.search({
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
            expect(results._total).to.equal(5);
        });

        it(`searches for plain objects`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`, void 0).in(`test`);
            const OriginalFolderClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`, void 0, `d_default`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const FolderClass = jointModel.recordSearch(OriginalFolderClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                FolderClass.search({
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
            expect(results.length).to.equal(5);
            expect(results._total).to.be.undefined;
            for (const result of results) {
                expect(result.constructor.__fullIndex).to.be.undefined;
            }
        });

        it(`searches with aggregation query`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`, void 0).in(`test`);
            const OriginalFolderClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const OriginalDocumentClass = createClass(`documents`, void 0, `d_default`).in(`test`);

            const UserClass = jointModel.recordSearch(OriginalUserClass);
            const FolderClass = jointModel.recordSearch(OriginalFolderClass);
            const DocumentClass = jointModel.recordSearch(OriginalDocumentClass);

            await Promise.all([
                UserClass.search({
                    query: {
                        match_all: {}
                    }
                }),
                FolderClass.search({
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
            expect(results.length).to.equal(5);
            expect(results._total).to.equal(5);
            expect(results.aggregations.index.buckets.length).to.equal(3);

            const userAggregations = results.aggregations.index.buckets.find((agg) => agg.key === UserClass.__fullIndex);
            expect(userAggregations.doc_count).to.equal(2);

            const folderAggregations = results.aggregations.index.buckets.find((agg) => agg.key === FolderClass.__fullIndex);
            expect(folderAggregations.doc_count).to.equal(2);

            const documentAggregations = results.aggregations.index.buckets.find((agg) => agg.key === DocumentClass.__fullIndex);
            expect(documentAggregations.doc_count).to.equal(1);
        });
    });
});