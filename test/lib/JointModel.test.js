import Joi from 'joi';
import bootstrapTest from '../bootstrapTests.js';
import { createClass, BaseModel, JointModel, BulkArray } from '../../index.js';

describe(`JointModel class`, function() {
    this.timeout(testTimeout);

    describe(`recordSearch()`, () => {
        it(`can't record model without correct index`, () => {
            const jointModel = new JointModel();

            //Anything which is not an ODM class is refused right away - the exact wording comes from the engine
            expect(() => jointModel.recordSearch({})).to.throw();
            expect(() => jointModel.recordSearch({ alias: {} })).to.throw();
            expect(() => jointModel.recordSearch()).to.throw();
        });

        it(`can't record model with wildcard in index`, () => {
            const jointModel = new JointModel();

            expect(() => jointModel.recordSearch(createClass(`users`, Joi.object()))).to.throw(`You cannot use 'recordSearch' with current tenant '*', full alias is '*_users'!`);
            expect(() => jointModel.recordSearch(createClass(`users`, Joi.object()).in(`?`))).to.throw(`You cannot use 'recordSearch' with current tenant '?', full alias is '?_users'!`);
        });

        it(`can record correct model`, async () => {
            const jointModel = new JointModel();
            const MyClass = createClass(`users`, Joi.object()).in(`odmtest`);

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
            await rewritten.search(query1);
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].queries.length).to.equal(1);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query1.query);

            const query2 = {
                query: {
                    myQuery: `myQuery2`
                }
            };
            await rewritten.search(query2);
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].queries.length).to.equal(2);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query1.query);
            expect(jointModel.models[0].queries[1]).to.deep.equal(query2.query);
        });

        it(`can record multiple models`, async () => {
            const jointModel = new JointModel();
            const MyClass1 = createClass(`users`, Joi.object()).in(`odmtest`);
            const MyClass2 = createClass(`documents`, Joi.object()).in(`odmtest`);

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
            await rewritten2.search(query1);
            expect(jointModel.models.length).to.equal(2);
            expect(jointModel.models[0].queries.length).to.equal(0);
            expect(jointModel.models[1].queries.length).to.equal(1);
            expect(jointModel.models[1].queries[0]).to.deep.equal(query1.query);

            const query2 = {
                query: {
                    myQuery: `myQuery2`
                }
            };
            await rewritten1.search(query2);
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
            await rewritten2.search(query3);
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
            await rewritten3.search(query4);
            expect(jointModel.models.length).to.equal(3);
            expect(jointModel.models[0].queries.length).to.equal(1);
            expect(jointModel.models[0].queries[0]).to.deep.equal(query2.query);
            expect(jointModel.models[1].queries.length).to.equal(2);
            expect(jointModel.models[1].queries[0]).to.deep.equal(query1.query);
            expect(jointModel.models[1].queries[1]).to.deep.equal(query3.query);
            expect(jointModel.models[2].queries.length).to.equal(1);
            expect(jointModel.models[2].queries[0]).to.deep.equal(query4.query);
        });

        it(`can't record ambiguous models`, () => {
            //Two models sharing one alias, distinguished only by "__constructorIdentifier"
            class TypeA extends createClass(`users`, Joi.object()) {
                static get __constructorIdentifier() {
                    return `${super.__constructorIdentifier}-typeA`;
                }
            }
            class TypeB extends createClass(`users`, Joi.object()) {
                static get __constructorIdentifier() {
                    return `${super.__constructorIdentifier}-typeB`;
                }
            }
            const jointModel = new JointModel();
            jointModel.recordSearch(TypeA.in(`odmtest`));
            expect(() => jointModel.recordSearch(TypeB.in(`odmtest`))).to.throw(`The ODM model alias matches multiple index constructors!`);

            //One identifier over multiple aliases
            class SameIdentifier extends createClass(`documents`, Joi.object()) {
                static get __constructorIdentifier() {
                    return `fixedIdentifier`;
                }
            }
            const jointModel2 = new JointModel();
            jointModel2.recordSearch(SameIdentifier.in(`odmtest`));
            expect(() => jointModel2.recordSearch(SameIdentifier.in(`other`))).to.throw(`The ODM model constructor matches multiple index aliases!`);
        });

        it(`can't use other read functions on a recording model`, async () => {
            const jointModel = new JointModel();
            const RecordingClass = jointModel.recordSearch(createClass(`users`, Joi.object()).in(`odmtest`));

            await expect(RecordingClass.findAll()).to.be.eventually.rejectedWith(`Only 'search' can be called on a recording clone!`);
            await expect(RecordingClass.find(`someId`)).to.be.eventually.rejectedWith(`Only 'search' can be called on a recording clone!`);
            expect(() => RecordingClass.bulkIterator()).to.throw(`Only 'search' can be called on a recording clone!`);
            expect(() => RecordingClass.itemIterator()).to.throw(`Only 'search' can be called on a recording clone!`);
        });

        it(`uses single internal model for duplicate OdmModels`, async () => {
            const jointModel = new JointModel();

            const MyClass1 = createClass(`users`, Joi.object()).in(`odmtest`);
            const rewritten1 = jointModel.recordSearch(MyClass1);
            expect(rewritten1.alias).to.equal(MyClass1.alias);

            const MyClass2 = createClass(`documents`, Joi.object()).in(`odmtest`);
            const rewritten2 = jointModel.recordSearch(MyClass2);
            expect(rewritten2.alias).to.equal(MyClass2.alias);

            const MyClass3 = createClass(`documents`, Joi.object()).in(`odmtest`);
            const rewritten3 = jointModel.recordSearch(MyClass3);
            expect(rewritten3.alias).to.equal(MyClass3.alias);

            const MyClass4 = createClass(`users`, Joi.object()).in(`odmtest`);
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
            await rewritten1.search(query1);

            const query2 = {
                query: {
                    myQuery: `myQuery2`
                }
            };
            await rewritten2.search(query2);

            const query3 = {
                query: {
                    myQuery: `myQuery3`
                }
            };
            await rewritten3.search(query3);

            const query4 = {
                query: {
                    myQuery: `myQuery4`
                }
            };
            await rewritten4.search(query4);

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
            defaultDocument = {
                index: `odmtest_documents`,
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

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`odmtest`));
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

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`odmtest`));
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
            let MyClass = createClass(`users`).in(`odmtest`);
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

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`odmtest`));
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

            const OriginalUserClass = createClass(`users`).in(`odmtest`);
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

            const OriginalDocumentClass = createClass(`documents`).in(`odmtest`);
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

            const OriginalUserClass = createClass(`users`).in(`odmtest`);
            let userAfterFunctionCalled = false;
            OriginalUserClass._afterSearch = function() {
                userAfterFunctionCalled = true;
            };

            const OriginalDocumentClass = createClass(`documents`).in(`odmtest`);
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

            const OriginalUserClass = createClass(`users`).in(`odmtest`);
            const OriginalDocumentClass = createClass(`documents`).in(`odmtest`);

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

            const OriginalUserClass = createClass(`users`).in(`odmtest`);
            const OriginalDocumentClass = createClass(`documents`).in(`odmtest`);

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

            const OriginalUserClass = createClass(`users`).in(`odmtest`);
            const OriginalDocumentClass = createClass(`documents`).in(`odmtest`);

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

            const OriginalUserClass = createClass(`users`).in(`odmtest`);
            const OriginalDocumentClass = createClass(`documents`).in(`odmtest`);

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
                //Plain ES hits, not instances - the raw envelope is what a "source" search returns
                expect(result).not.to.be.an.instanceOf(BaseModel);
                expect(result._id).to.be.a(`string`);
                expect(result._index).to.be.a(`string`);
                expect(result._source).to.be.an(`object`);
            }
        });

        it(`confines every recorded query to the index of its own model`, async () => {
            await bootstrapTest.createIndex(`odmtest_jointa`, `abc123`);
            await bootstrapTest.createIndex(`odmtest_jointb`, `abc123`);
            try {
                const ClassA = createClass(`jointa`).in(`odmtest`);
                const ClassB = createClass(`jointb`).in(`odmtest`);

                //The very same value lives in both indices
                await new ClassA({ tag: `shared` }, `a1`).save();
                await new ClassB({ tag: `shared` }, `b1`).save();

                const jointModel = new JointModel();
                const RecordingA = jointModel.recordSearch(ClassA);
                const RecordingB = jointModel.recordSearch(ClassB);

                //A matches the shared value, B matches nothing at all
                await RecordingA.search({ query: { term: { tag: `shared` } } });
                await RecordingB.search({ query: { term: { tag: `nothing` } } });

                //Without the per-model index restriction A's query would match B's document too
                const results = await jointModel.search();
                expect(results.length).to.equal(1);
                expect(results[0]._id).to.equal(`a1`);
                expect(results[0].constructor.alias).to.equal(ClassA.alias);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_jointa`, `abc123`);
                await bootstrapTest.deleteIndex(`odmtest_jointb`, `abc123`);
            }
        });

        it(`ignores a recorded model which recorded no query`, async () => {
            await bootstrapTest.createIndex(`odmtest_jointa`, `abc123`);
            try {
                const ClassA = createClass(`jointa`).in(`odmtest`);
                //A model registered for a branch which was not taken - its index doesn't even exist
                const ClassMissing = createClass(`jointmissing`).in(`odmtest`);

                await new ClassA({ tag: `present` }, `a1`).save();

                const jointModel = new JointModel();
                const RecordingA = jointModel.recordSearch(ClassA);
                jointModel.recordSearch(ClassMissing);
                await RecordingA.search({ query: { match_all: {} } });

                //Both models are registered, but only the searched one may be reached
                expect(jointModel.alias).to.deep.equal([`odmtest_jointa`, `odmtest_jointmissing`]);
                expect(jointModel.__searchedAlias).to.deep.equal([`odmtest_jointa`]);

                const paged = await jointModel.search({}, 0, 10);
                expect(paged.length).to.equal(1);
                expect(paged[0]._id).to.equal(`a1`);

                //The implicit PIT is opened over the searched indices only
                const all = await jointModel.search({});
                expect(all.length).to.equal(1);
                expect(all[0]._id).to.equal(`a1`);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_jointa`, `abc123`);
            }
        });

        it(`pages by the bulk size of the searched models only`, async () => {
            const jointModel = new JointModel();

            class BigPages extends createClass(`users`) {
                static async _getBulkSize() {
                    return 100;
                }
            }
            class SmallPages extends createClass(`documents`) {
                static async _getBulkSize() {
                    return 1;
                }
            }

            const RecordingUsers = jointModel.recordSearch(BigPages.in(`odmtest`));
            jointModel.recordSearch(SmallPages.in(`odmtest`));

            //Only the model with the bigger pages recorded a query, the other one must not shrink them
            await RecordingUsers.search({ query: { match_all: {} } });
            expect(await jointModel._getBulkSize()).to.equal(100);
        });

        it(`searches with aggregation query`, async () => {
            const jointModel = new JointModel();

            const OriginalUserClass = createClass(`users`).in(`odmtest`);
            const OriginalDocumentClass = createClass(`documents`).in(`odmtest`);

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

            //Only `search` may be called on a recording clone - the index is resolved through the recorded classes
            const [userIndex, documentIndex] = await Promise.all([OriginalUserClass.getIndex(), OriginalDocumentClass.getIndex()]);

            const userAggregations = results.aggregations.index.buckets.find((agg) => agg.key === userIndex);
            expect(userAggregations.doc_count).to.equal(2);

            const documentAggregations = results.aggregations.index.buckets.find((agg) => agg.key === documentIndex);
            expect(documentAggregations.doc_count).to.equal(1);
        });

        it(`skips models whose '_parseIndex' refuses the index of a hit`, async () => {
            const jointModel = new JointModel();

            class PickyUserClass extends createClass(`users`) {
                static _parseIndex(index) {
                    if (!index.startsWith(`odmtest_users`)) {
                        throw Error(`This model doesn't know the index '${index}'.`);
                    }
                    return super._parseIndex(index);
                }
            }

            const UserClass = jointModel.recordSearch(PickyUserClass.in(`odmtest`));
            const DocumentClass = jointModel.recordSearch(createClass(`documents`).in(`odmtest`));

            await UserClass.search({ query: { match_all: {} } });
            await DocumentClass.search({ query: { match_all: {} } });

            const results = await jointModel.search();

            //The refusing model is skipped, every instance is still created by its own model
            expect(results.length).to.equal(3);
            expect(results.filter((item) => item.constructor._name === `users`).length).to.equal(2);
            expect(results.filter((item) => item.constructor._name === `documents`).length).to.equal(1);
        });

        it(`can't search when no model matches the index of a hit`, async () => {
            const jointModel = new JointModel();

            class BrokenClass extends createClass(`users`) {
                static _parseIndex(index) {
                    throw Error(`This model doesn't know the index '${index}'.`);
                }
            }

            const UserClass = jointModel.recordSearch(BrokenClass.in(`odmtest`));
            await UserClass.search({ query: { match_all: {} } });

            await expect(jointModel.search()).to.be.eventually.rejectedWith(`Unable to match index 'odmtest_users-abc123' to any of the recorded models.`);
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
            const size = 35000;
            let bulk;

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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
            const MyClass = createClass(`users`).in(`odmtest`);

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
            let iterations = 0;
            for await (const bulk of bulks) {
                iterations++;
                expect(bulk.length).to.equal(0);
                expect(bulk._total).to.equal(0);
            }

            //The query matches nothing at all - assertions in the loop body would never have run
            expect(iterations).to.equal(0);
        });

        it(`iterates using custom cache`, async () => {
            const size = 50;
            let bulk;

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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
            try {
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

            } finally {
                await myJoint.closePIT(myPIT);
            }
        });

        it(`calls _afterSearch only with the instances of the current page`, async () => {
            const receivedSizes = [];
            class CountingClass extends createClass(`users`, Joi.object()) {
                static async _afterSearch(instances) {
                    receivedSizes.push(instances.length);
                }
                static async _getBulkSize() {
                    return 10;
                }
            }
            const MyClass = CountingClass.in(`odmtest`);

            const myBulk = new BulkArray();
            for (let i = 0; i < 25; i++) {
                myBulk.push(new MyClass({ name: `joint${i}` }, `joint${i}`));
            }
            await myBulk.save();

            const myJoint = new JointModel();
            const RecordingClass = myJoint.recordSearch(MyClass);
            await RecordingClass.search({
                query: {
                    prefix: {
                        name: `joint`
                    }
                }
            });

            let total = 0;
            for await (const bulk of myJoint.bulkIterator()) {
                total += bulk.length;
            }

            expect(total).to.equal(25);
            expect(receivedSizes).to.deep.equal([10, 10, 5]);
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
            const size = 35000;
            let bulk;

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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
            const MyClass = createClass(`users`).in(`odmtest`);

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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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

            const MyUsers = createClass(`users`).in(`odmtest`);
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

            const MyDocuments = createClass(`documents`).in(`odmtest`);
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
            try {
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

            } finally {
                await myJoint.closePIT(myPIT);
            }
        });
    });

    describe(`clearSearch()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument;

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
            defaultDocument = {
                index: `odmtest_documents`,
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

            expect(jointModel.models).to.deep.equal([]);
            await expect(jointModel.search()).to.be.eventually.rejectedWith(`No search has been recorded!`);
        });

        it(`clears when no search is recorded`, async () => {
            const jointModel = new JointModel();

            jointModel.recordSearch(createClass(`users`).in(`odmtest`));

            jointModel.clearSearch();

            //The model stays recorded, only its queries are dropped
            expect(jointModel.models.length).to.equal(1);
            expect(jointModel.models[0].queries).to.deep.equal([]);
            await expect(jointModel.search()).to.be.eventually.rejectedWith(`No search has been recorded!`);
        });

        it(`clears after search is performed but data are not yet received`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`odmtest`));
            await MyClass.search(void 0);

            jointModel.clearSearch();

            await expect(jointModel.search()).to.be.eventually.rejectedWith(`No search has been recorded!`);
        });

        it(`clears after search is performed and data are received`, async () => {
            const jointModel = new JointModel();

            const MyClass = jointModel.recordSearch(createClass(`users`).in(`odmtest`));
            await MyClass.search(void 0);

            //The describe indexes two users and one document, the recorded search matches the users
            let results = await jointModel.search();
            expect(results.length).to.equal(2);

            results = await jointModel.search();
            expect(results.length).to.equal(2);

            jointModel.clearSearch();

            await expect(jointModel.search()).to.be.eventually.rejectedWith(`No search has been recorded!`);

            await MyClass.search(void 0);

            results = await jointModel.search();
            expect(results.length).to.equal(2);
        });
    });

    describe(`search() with an altered query`, () => {
        it(`applies '_alterSearch' of every recorded model`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);
            await new MyUsers({ status: `:)`, name: `happy` }, `happy`).save();
            await new MyUsers({ status: `:(`, name: `sad` }, `sad`).save();

            const jointModel = new JointModel();

            class FilteredUsers extends createClass(`users`) {
                static _alterSearch(body) {
                    body.query = { term: { status: `:)` } };
                    return body;
                }
            }

            const RecordingUsers = jointModel.recordSearch(FilteredUsers.in(`odmtest`));
            await RecordingUsers.search({ query: { match_all: {} } });

            //The hook narrows the recorded query down - a "match_all" would have matched both users
            const results = await jointModel.search();
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(`happy`);
            expect(results[0].status).to.equal(`:)`);
        });
    });

    describe(`search() cursor handling`, () => {
        it(`keeps a body level 'search_after' cursor intact`, async () => {
            await bootstrapTest.createIndex(`odmtest_cursor`, `abc123`);
            try {
                const MyClass = createClass(`cursor`).in(`odmtest`);

                //The last two documents miss the sorted field, so the cursor of the first page carries
                //the missing-value sentinel, which JSON parsing turns into an imprecise 2 ** 63
                await new MyClass({ order: 0, tie: 0 }, `doc0`).save();
                await new MyClass({ order: 1, tie: 1 }, `doc1`).save();
                await new MyClass({ tie: 2 }, `doc2`).save();
                await new MyClass({ tie: 3 }, `doc3`).save();

                const jointModel = new JointModel();
                const RecordingClass = jointModel.recordSearch(MyClass);
                await RecordingClass.search({ query: { match_all: {} } });

                const body = {
                    sort: [{ order: `asc` }, { tie: `asc` }]
                };
                const firstPage = await jointModel.search(body, void 0, 3);
                expect(firstPage.map((item) => item._id)).to.deep.equal([`doc0`, `doc1`, `doc2`]);
                expect(firstPage._lastPosition).to.be.an(`array`);
                expect(firstPage._lastPosition).to.deep.equal([2 ** 63, 2]);

                //The cursor is plain data - a cloned one still pages on, the library restores the exact sentinel
                const secondPage = await jointModel.search({
                    ...body,
                    search_after: structuredClone(firstPage._lastPosition)
                }, void 0, 3);
                expect(secondPage.map((item) => item._id)).to.deep.equal([`doc3`]);

                //The caller's body must remain untouched
                expect(body).to.deep.equal({ sort: [{ order: `asc` }, { tie: `asc` }] });
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_cursor`, `abc123`);
            }
        });
    });

    describe(`openPIT()`, () => {
        it(`can't open PIT with not existing index`, async () => {
            const jointModel = new JointModel();

            jointModel.recordSearch(createClass(`test`).in(`odmtest`));
            await expect(jointModel.openPIT()).to.be.eventually.rejectedWith(`index_not_found_exception`);
        });

        it(`searches using PIT over multiple indices`, async () => {
            const jointModel = new JointModel();

            //Only "search" may be called on a recording clone, so the fixtures are written through the recorded classes
            const OriginalUsers = createClass(`users`).in(`odmtest`);
            const OriginalDocuments = createClass(`documents`).in(`odmtest`);
            const MyUsers = jointModel.recordSearch(OriginalUsers);
            const MyDocuments = jointModel.recordSearch(OriginalDocuments);
            const documentSize = 10;

            const ids = [];
            const myBulk = new BulkArray();
            for (let i = 0; i < documentSize; i++) {
                const id = `${i}`;
                ids.push(id);
                myBulk.push(new OriginalUsers({ name: id }));
                myBulk.push(new OriginalDocuments({ documentTitle: id }));
            }
            await myBulk.save();

            const myPit = await jointModel.openPIT();
            try {
                const anotherBulk = new BulkArray();
                for (let i = 0; i < documentSize; i++) {
                    anotherBulk.push(new OriginalUsers({ name: `another_${i}` }));
                    anotherBulk.push(new OriginalDocuments({ documentTitle: `another_${i}` }));
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


                expect(allResults.length).to.equal(2 * documentSize);
                for (const id of ids) {
                    let index = allResults.findIndex((singleResult) => singleResult.name === id);
                    expect(index).to.be.greaterThanOrEqual(0);
                    allResults.splice(index, 1);

                    index = allResults.findIndex((singleResult) => singleResult.documentTitle === id);
                    expect(index).to.be.greaterThanOrEqual(0);
                    allResults.splice(index, 1);
                }
            } finally {
                await jointModel.closePIT(myPit);
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

            jointModel.recordSearch(createClass(`users`).in(`odmtest`));
            jointModel.recordSearch(createClass(`documents`).in(`odmtest`));
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
            const MyClass = createClass(`users`).in(`odmtest`);
            MyClass._getBulkSize = async function() { return 10; };

            const myJoint = new JointModel();
            myJoint.recordSearch(MyClass);
            const bulkSize = await myJoint._getBulkSize();
            expect(bulkSize).to.be.a(`number`);
            expect(bulkSize).to.equal(10);
        });

        it(`returns bulk value from multiple models`, async () => {
            const MyClass1 = createClass(`users1`).in(`odmtest`);
            MyClass1._getBulkSize = async function() { return 100; };

            const MyClass2 = createClass(`users2`).in(`odmtest`);
            MyClass2._getBulkSize = async function() { return 50; };

            const MyClass3 = createClass(`users3`).in(`odmtest`);
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
