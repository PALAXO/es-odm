'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const { createClass, BulkArray, BaseModel } = require(`../../app`);

//It uses ES7 Circularo indices
describe(`BaseModel class`, function() {
    this.timeout(testTimeout);

    describe(`class preparations`, () => {
        it(`can't create class without index name`, async () => {
            expect(() => createClass()).to.throw(`You have to specify an index name.`);
        });

        it(`can't create class with empty tenant or with an underscore within a tenant`, async () => {
            expect(() => createClass(`myIndex`, void 0, ``)).to.throw(`Tenant cannot be empty.`);

            expect(() => createClass(`myIndex`, void 0, `test_test`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, `_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, `test_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, `_test`)).to.throw(`Tenant cannot contain underscore.`);

            const myClass = createClass(`myIndex`, void 0);
            expect(() => myClass.in(``)).to.throw(`Tenant must be a string!`);
            expect(() => myClass.in(`_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => myClass.in(`test_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => myClass.in(`_test`)).to.throw(`Tenant cannot contain underscore.`);
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

        it(`creates new class and rewrites tenant`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass.alias).to.equal(`*_myIndex`);

            const myClass = originalClass.in(`myTenant`);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass.alias).to.equal(`*_myIndex`);
            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass.alias).to.equal(`myTenant_myIndex`);

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

            myClass = myClass.in(`test`);
            expect(myClass._tenant).to.equal(`test`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.alias).to.equal(`test_myIndex`);

            myClass = myClass.in(`another`);
            expect(myClass._tenant).to.equal(`another`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.alias).to.equal(`another_myIndex`);
        });
    });

    describe(`static search()`, () => {
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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.search(void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`searches with empty object`, async () => {
            const MyClass = createClass(`users`).in(`test`);
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
            const MyClass = createClass(`users`).in(`test`);
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
            const MyClass = createClass(`users`).in(`test`);
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

        it(`searches using non existing property`, async () => {
            const MyClass = createClass(`users`).in(`test`);
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
            const MyClass = createClass(`documents`).in(`*incorrect`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(0);
            expect(results._total).to.equal(0);
        });

        it(`searches for all documents`, async () => {
            const MyClass = createClass(`documents`);
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
                expect(result.constructor._tenant).to.equal(`test`);
                expect(result._score).to.be.a(`number`);
                await result.save();
            }
        });

        it(`searches without source fields`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, void 0, false);

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
            const MyClass = createClass(`users`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, void 0, [`name`]);

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

        it(`searches for documents with from parameter`, async () => {
            const MyClass = createClass(`documents`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                expect(result.constructor._tenant).to.equal(`test`);
                await result.save();
            }
        });

        it(`searches for documents with from parameter in body`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                from: 1
            });

            expect(results.length).to.equal(1);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                expect(result.constructor._tenant).to.equal(`test`);
                await result.save();
            }
        });

        it(`searches for documents with size parameter`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`searches for documents with size parameter in body`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                size: 1
            });

            expect(results.length).to.equal(1);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`searches for documents with from and size parameters`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, 1, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`searches for documents with from and size parameters in body`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                from: 1,
                size: 1
            });

            expect(results.length).to.equal(1);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`searches for documents with from and size parameters in body and param combined`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                from: 0,
                size: 1000
            }, 1, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`searches for documents with from and size parameters in body and param combined again`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                from: 1
            }, void 0, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                await result.save();
            }
        });

        it(`searches and manually scrolls by max sizes (10k)`, async () => {
            await bootstrapTest.deleteData();

            const MyClass = createClass(`users`).in(`test`);

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

            let results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: {
                    name: {
                        order: `asc`
                    }
                }
            }, void 0, 10000, void 0, 10);
            expect(results.length).to.equal(10000);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00000`);
            expect(results[9999]._id).to.equal(`id_09999`);

            let scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, void 0, scrollId);
            expect(results.length).to.equal(10000);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_10000`);
            expect(results[9999]._id).to.equal(`id_19999`);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, void 0, scrollId);
            expect(results.length).to.equal(10000);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_20000`);
            expect(results[9999]._id).to.equal(`id_29999`);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, void 0, scrollId);
            expect(results.length).to.equal(5000);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_30000`);
            expect(results[4999]._id).to.equal(`id_34999`);
        });

        it(`searches and manually scrolls, takes care about source field`, async () => {
            await bootstrapTest.deleteData();

            const MyClass = createClass(`users`).in(`test`);

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

            let results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: {
                    name: {
                        order: `asc`
                    }
                }
            }, void 0, 10000, `name`, 10);
            expect(results.length).to.equal(10000);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00000`);
            expect(results[9999]._id).to.equal(`id_09999`);
            expect(results[0].constructor._tenant).to.be.undefined;

            let scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, void 0, scrollId);
            expect(results.length).to.equal(10000);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_10000`);
            expect(results[9999]._id).to.equal(`id_19999`);
            expect(results[0].constructor).not.to.be.undefined;

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, `name`, scrollId);
            expect(results.length).to.equal(10000);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_20000`);
            expect(results[9999]._id).to.equal(`id_29999`);
            expect(results[0].constructor._tenant).to.be.undefined;

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, void 0, scrollId);
            expect(results.length).to.equal(5000);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_30000`);
            expect(results[4999]._id).to.equal(`id_34999`);
            expect(results[0].constructor).not.to.be.undefined;
        });

        it(`searches and manually scrolls by custom size`, async () => {
            await bootstrapTest.deleteData();

            const MyClass = createClass(`users`).in(`test`);

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

            let results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: {
                    name: {
                        order: `asc`
                    }
                }
            }, 0, 10, void 0, 10);
            expect(results.length).to.equal(10);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00000`);
            expect(results[9]._id).to.equal(`id_00009`);

            let scrollId = results.scrollId;
            results = await MyClass.search(void 0, 10, void 0, void 0, scrollId);
            expect(results.length).to.equal(0);
            expect(results.scrollId).not.to.be.undefined;

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, 1, 1, void 0, scrollId);
            expect(results.length).to.equal(1);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00021`);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, 0, 0, void 0, scrollId);
            expect(results.length).to.equal(0);
            expect(results.scrollId).not.to.be.undefined;

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, 0, 1000, void 0, scrollId);
            expect(results.length).to.equal(10);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00040`);
            expect(results[9]._id).to.equal(`id_00049`);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, 10, 1000, void 0, scrollId);
            expect(results.length).to.equal(0);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, 2, 1, void 0, scrollId);
            expect(results.length).to.equal(1);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00062`);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, void 0, scrollId);
            expect(results.length).to.equal(10);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00070`);
            expect(results[9]._id).to.equal(`id_00079`);
        });

        it(`searches and manually scrolls by another custom size`, async () => {
            await bootstrapTest.deleteData();

            const MyClass = createClass(`users`).in(`test`);

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

            let results = await MyClass.search({
                query: {
                    match_all: {}
                },
                sort: {
                    name: {
                        order: `asc`
                    }
                }
            }, 50, 100, void 0, 5);
            expect(results.length).to.equal(50);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00050`);
            expect(results[49]._id).to.equal(`id_00099`);

            let scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, void 0, scrollId);
            expect(results.length).to.equal(100);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00100`);
            expect(results[99]._id).to.equal(`id_00199`);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, 1, void 0, scrollId);
            expect(results.length).to.equal(1);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00200`);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, 4999, void 0, void 0, scrollId);
            expect(results.length).to.equal(0);
            expect(results.scrollId).not.to.be.undefined;

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, void 0, void 0, void 0, scrollId);
            expect(results.length).to.equal(100);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00400`);
            expect(results[99]._id).to.equal(`id_00499`);

            scrollId = results.scrollId;
            results = await MyClass.search(void 0, 50, void 0, void 0, scrollId);
            expect(results.length).to.equal(50);
            expect(results.scrollId).not.to.be.undefined;
            expect(results[0]._id).to.equal(`id_00550`);
            expect(results[49]._id).to.equal(`id_00599`);
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
            const MyClass = createClass(`users`).in(`test`);

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
                }
            }, void 0, bulkSize);
            for await (const bulk of bulks) {
                total += bulk.length;
                expect(bulk.length).to.equal(bulkSize);
            }
            expect(total).to.equal(size);
        });

        it(`iterates without any query specified`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const bulks = MyClass.bulkIterator();
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            for await (const bulk of bulks) {
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
        });

        it(`iterates with match_all`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            });

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
        });

        it(`iterates using non existing property`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match: {
                        unknown: `whatever`
                    }
                }
            });

            for await (const bulk of bulks) {
                expect(bulk.length).to.equal(0);
                expect(bulk._total).to.equal(0);
            }
        });

        it(`won't find anything when iterating using incorrect tenant`, async () => {
            const MyClass = createClass(`documents`).in(`*incorrect`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            });

            for await (const bulk of bulks) {
                expect(bulk.length).to.equal(0);
                expect(bulk._total).to.equal(0);
            }
        });

        it(`iterates without source fields`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            }, false);

            for await (const bulk of bulks) {
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
        });

        it(`iterates for specific field only`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            }, [`name`]);

            for await (const bulk of bulks) {
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
        });

        it(`iterates for documents with size parameter`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                }
            }, void 0, 1);

            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            let total = 0;
            for await (const bulk of bulks) {
                total++;
                expect(bulk.length).to.equal(1);
                expect(possibleValues).to.include(bulk[0].html);
            }
            expect(total).to.equal(2);
        });

        it(`iterates for documents with size parameter in body`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const bulks = MyClass.bulkIterator({
                query: {
                    match_all: {}
                },
                size: 1
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
            const MyClass = createClass(`users`).in(`test`);

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
                }
            }, void 0, bulkSize);
            // eslint-disable-next-line no-unused-vars
            for await (const item of items) {
                total++;
            }
            expect(total).to.equal(size);
        });

        it(`iterates without any query specified`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const items = MyClass.itemIterator();
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            for await (const item of items) {
                expect(possibleValues).to.include(item.name);
                expect(item).to.be.an.instanceOf(MyClass);

                expect(item._id).to.be.a(`string`);
                expect(item._primary_term).to.be.a(`number`);
                expect(item._seq_no).to.be.a(`number`);
                expect(item._version).to.be.a(`number`);
                expect(item._score).to.be.a(`number`);
            }
        });

        it(`iterates with match_all`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            });

            const possibleValues = [userObject1.document.name, userObject2.document.name];
            for await (const item of items) {
                expect(possibleValues).to.include(item.name);
                expect(item).to.be.an.instanceOf(MyClass);

                expect(item._id).to.be.a(`string`);
                expect(item._primary_term).to.be.a(`number`);
                expect(item._seq_no).to.be.a(`number`);
                expect(item._version).to.be.a(`number`);
                expect(item._score).to.be.a(`number`);
            }
        });

        it(`iterates using non existing property`, async () => {
            const MyClass = createClass(`users`).in(`test`);
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
            const MyClass = createClass(`documents`).in(`*incorrect`);
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
            const MyClass = createClass(`users`).in(`test`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            }, false);

            for await (const item of items) {
                expect(item._id).not.to.be.undefined;
                expect(item._version).not.to.be.undefined;
                expect(item._primary_term).not.to.be.undefined;
                expect(item._seq_no).not.to.be.undefined;
                expect(item._score).not.to.be.undefined;
                expect(item._source).to.be.undefined;
            }
        });

        it(`iterates for specific field only`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            }, [`name`]);

            for await (const item of items) {
                expect(item._id).not.to.be.undefined;
                expect(item._version).not.to.be.undefined;
                expect(item._primary_term).not.to.be.undefined;
                expect(item._seq_no).not.to.be.undefined;
                expect(item._score).not.to.be.undefined;
                expect(item._source).not.to.be.undefined;
                expect(item._source.name).not.to.be.undefined;
                expect(item._source.status).to.be.undefined;
            }
        });

        it(`iterates for documents with size parameter`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const items = MyClass.itemIterator({
                query: {
                    match_all: {}
                }
            }, void 0, 1);

            const possibleValues = [defaultDocument1.document.html, defaultDocument2.document.html];
            let total = 0;
            for await (const item of items) {
                total++;
                expect(possibleValues).to.include(item.html);
            }
            expect(total).to.equal(2);
        });

        it(`iterates for documents with size parameter in body`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
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
    });

    describe(`static clearScroll()`, () => {
        it(`can't clear scroll without specifying scroll id`, async () => {
            const MyClass = createClass(`users`);

            await expect(MyClass.clearScroll()).to.be.eventually.rejectedWith(`scrollId must be specified!`);
        });

        it(`clears scroll`, async () => {
            const MyClass = createClass(`users`);

            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, void 0, void 0, 10);

            const scrollId = results.scrollId;
            let result = await MyClass.clearScroll(scrollId);
            expect(result).to.be.true;

            //can't clear one more time
            result = await MyClass.clearScroll(scrollId);
            expect(result).to.be.false;
        });
    });

    describe(`static findAll()`, () => {
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

        it(`finds all user entries`, async () => {
            const MyClass = createClass(`users`);
            const results = await MyClass.findAll();

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(2);
            const possibleValues = [userObject1.document.name, userObject2.document.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result.constructor._tenant).to.equal(`test`);
            }
        });

        it(`finds all documents`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
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
    });

    describe(`static find()`, () => {
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

        it(`can't find undefined id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.find()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find non-string id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.find(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.find([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const result = await MyClass.find(`unknown`);
            expect(result).to.deep.equal([]);
        });

        it(`can't find array with not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const results = await MyClass.find([`invalid`, `unknown`]);
            expect(results).to.be.an(`array`);
            expect(results.length).to.equal(0);
        });

        it(`finds given user entry`, async () => {
            const MyClass = createClass(`users`);
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
            const MyClass = createClass(`users`).in(`test`);
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

        it(`finds an array of documents`, async () => {
            const MyClass = createClass(`documents`);
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
            const MyClass = createClass(`documents`);
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
            const MyClass = createClass(`documents`).in(`test`);
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
    });

    describe(`static get()`, () => {
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

        it(`can't get undefined id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.get()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get non-string id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.get(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.get([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get without specifying tenant`, async () => {
            const MyClass = createClass(`documents`);
            await expect(MyClass.get([defaultDocument1.id, defaultDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'get' with current tenant '*', full alias is '*_documents'!`);
        });

        it(`can't get not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.get(`unknown`)).to.be.eventually.rejectedWith(`"found":false`);
        });

        it(`can't get array with not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.get([userObject1.id, `unknown`])).to.be.eventually.rejectedWith(`"found":false`);
        });

        it(`gets given user entry`, async () => {
            const MyClass = createClass(`users`).in(`test`);
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
            const MyClass = createClass(`users`).in(`test`);
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
            const MyClass = createClass(`documents`).in(`test`);
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

    describe(`static delete()`, () => {
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

        it(`can't delete undefined id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.delete()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete non-string id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.delete(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.delete([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete multiple ids when version is specified`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            await expect(MyClass.delete([defaultDocument1.id, defaultDocument2.id], 6)).to.be.eventually.rejectedWith(`You cannot use parameter 'version' with multiple ids specified!`);
        });

        it(`can't delete not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const result = await MyClass.delete([`unknown`]);

            expect(result.items[0].delete.status).to.equal(404);
        });

        it(`deletes given user entry`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const result = await MyClass.delete(userObject1.id);

            expect(result.items[0].delete.status).to.equal(200);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists).to.be.false;
        });

        it(`deletes given user entry in array`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const results = await MyClass.delete([userObject1.id]);

            expect(results.items[0].delete.status).to.equal(200);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists).to.be.false;
        });

        it(`deletes an array of documents`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
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
            const MyClass = createClass(`documents`).in(`test`);
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
            const MyClass = createClass(`documents`).in(`test`);
            await expect(MyClass.delete(`whatever`)).to.be.eventually.rejectedWith(`not_found`);
        });

        it(`can't delete incorrect version`, async () => {
            const record = await bootstrapTest.client.get({
                index: userObject1.index,
                id: userObject1.id
            });
            const storedVersion = record._version;

            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.delete(userObject1.id, storedVersion + 1))
                .to.be.eventually.rejectedWith(`Specified version '${storedVersion + 1}' is different than stored version '${storedVersion}'!`);
        });

        it(`deletes correct version`, async () => {
            const record = await bootstrapTest.client.get({
                index: userObject1.index,
                id: userObject1.id
            });
            const storedVersion = record._version;

            const MyClass = createClass(`users`).in(`test`);
            await MyClass.delete(userObject1.id, storedVersion);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists).to.be.false;
        });
    });

    describe(`static exists()`, () => {
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

        it(`can't check undefined id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.exists()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check non-string id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.exists(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.exists([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`checks not-existing id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const result = await MyClass.exists(`unknown`);

            expect(result).to.be.false;
        });

        it(`checks given user entry`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const result = await MyClass.exists(userObject1.id);

            expect(result).to.be.true;
        });

        it(`checks given user entry in array`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const results = await MyClass.exists([userObject1.id]);

            expect(results.length).to.equal(1);
            expect(results[0]).to.be.true;
        });

        it(`checks an array of documents`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const results = await MyClass.exists([defaultDocument1.id, defaultDocument2.id]);

            expect(results.length).to.equal(2);
            expect(results[0]).to.be.true;
            expect(results[1]).to.be.true;
        });

        it(`checks only existing entries from given array`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
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

        it(`can't update undefined id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.update()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update non-string id`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.update(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update array of non-string ids`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.update([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update without body specified`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            await expect(MyClass.update(`ok`, void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`updates data instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`test`);

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
            const DocumentClass = createClass(`documents`).in(`test`);

            const result = await DocumentClass.update([`document1`, `document1`], {
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
            const DocumentClass = createClass(`documents`).in(`test`);

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
    });

    describe(`static count()`, () => {
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

        it(`counts user entries`, async () => {
            const MyClass = createClass(`users`).in(`test`);
            const count = await MyClass.count();
            expect(count).to.equal(2);
        });

        it(`counts all documents entries`, async () => {
            const MyClass = createClass(`documents`).in(`test`);
            const count = await MyClass.count();
            expect(count).to.equal(2);
        });

        it(`counts all document entries without tenant specified`, async () => {
            const MyClass = createClass(`documents`);
            const count = await MyClass.count();
            expect(count).to.equal(2);
        });

        it(`counts users with specific status`, async () => {
            const MyClass = createClass(`users`).in(`test`);
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
            const MyClass = createClass(`users`);
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
            const MyClass = createClass(`documents`);
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
                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`updates data instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`test`);

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

        it(`updates data instances without tenant specified`, async () => {
            const DocumentClass = createClass(`documents`);

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
    });

    describe(`static deleteByQuery()`, () => {
        let defaultDocument1;
        let defaultDocument2;

        beforeEach(async () => {
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
                bootstrapTest.client.index(defaultDocument1),
                bootstrapTest.client.index(defaultDocument2)
            ]);
        });

        it(`deletes data instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`test`);

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

        it(`deletes data instances without tenant specified`, async () => {
            const DocumentClass = createClass(`documents`);

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
    });

    describe(`static createIndex()`, () => {
        beforeEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_revisions*`
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
            const MyRevisions = createClass(`revisions`).in(`test`);
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

        it(`creates new index but it doesn't set an alias`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`);
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
                index: `test_revisions-*`
            });
            expect(existingIndices.indices).to.be.an(`object`);
            expect(Object.values(existingIndices.indices).length).to.equal(1);
            expect(Object.values(existingIndices.indices)[0]).to.be.an(`object`);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_revisions*`
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
                    index: `test_test`
                });
            } catch (e) {
                //OK
            }
        });

        it(`can't create index with wildcard in index`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.getIndex()).to.be.eventually.rejectedWith(`You cannot use 'getIndex' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`gets real index of existing index`, async () => {
            const MyUsers = createClass(`users`).in(`test`);

            const usersIndex = await MyUsers.getIndex();
            expect(usersIndex).to.be.a(`string`);
            expect(usersIndex).not.to.be.empty;
            const usersIndexExists = await bootstrapTest.client.indices.exists({
                index: usersIndex
            });
            expect(usersIndexExists).to.be.true;

            const MyDocuments = createClass(`documents`).in(`test`);
            const documentsIndex = await MyDocuments.getIndex();
            expect(documentsIndex).to.be.a(`string`);
            expect(documentsIndex).not.to.be.empty;
            const documentsIndexExists = await bootstrapTest.client.indices.exists({
                index: documentsIndex
            });
            expect(documentsIndexExists).to.be.true;
        });

        it(`doesn't return not existing index`, async () => {
            const MyUsers = createClass(`test`).in(`test`);

            const usersIndex = await MyUsers.getIndex();
            expect(usersIndex).to.be.undefined;
        });

        it(`returns correct index even when we don't use aliases`, async () => {
            await bootstrapTest.client.indices.create({
                index: `test_test`
            });

            const MyUsers = createClass(`test`).in(`test`);

            const usersIndex = await MyUsers.getIndex();
            expect(usersIndex).to.equal(MyUsers.alias);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_test`
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
                    index: `test_test-abc`
                });
            } catch (e) {
                //OK
            }
        });

        it(`can't put an alias without index specified`, async () => {
            const MyRevisions = createClass(`test`).in(`test`);

            await expect(MyRevisions.aliasIndex()).to.be.eventually.rejectedWith(`You have to specify an index.`);
        });

        it(`can't put an alias when ODM contains wildcard`, async () => {
            const MyRevisions = createClass(`test`); //tenant is *

            await expect(MyRevisions.aliasIndex(`test`)).to.be.eventually.rejectedWith(`You cannot use 'aliasIndex' with current tenant '*', full alias is '*_test'!`);
        });

        it(`can't use incorrect index`, async () => {
            const MyRevisions = createClass(`test`).in(`test`);

            await expect(MyRevisions.aliasIndex(`a_test`)).to.be.eventually.rejectedWith(`You are specifying incorrect index. Your index transforms into alias 'a_test', ODM alias is 'test_test'.`);
        });

        it(`puts alias to an index`, async () => {
            await bootstrapTest.client.indices.create({
                index: `test_test-abc`
            });
            const MyTest = createClass(`test`).in(`test`);

            let aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyTest.alias
            });
            expect(aliasExists).to.be.false;

            await MyTest.aliasIndex(`test_test-abc`);

            aliasExists = await bootstrapTest.client.indices.existsAlias({
                name: MyTest.alias
            });
            expect(aliasExists).to.be.true;
        });

        it(`can't put an existing alias to another index index`, async () => {
            const MyUsers = createClass(`users`).in(`test`);
            const existingIndex = await MyUsers.getIndex();

            await expect(MyUsers.aliasIndex(existingIndex)).to.be.eventually.rejectedWith(`Alias 'test_users' is already used.`);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_test-abc`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`static deleteAlias()`, () => {
        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`test_test`, `abc`);
            await bootstrapTest.createIndex(`test_test`, `abc`);
        });

        it(`can't delete an alias when ODM contains wildcard`, async () => {
            const MyRevisions = createClass(`test`);   //tenant is '*'

            await expect(MyRevisions.deleteAlias()).to.be.eventually.rejectedWith(`You cannot use 'deleteAlias' with current tenant '*', full alias is '*_test'!`);
        });

        it(`deletes alias from an index`, async () => {
            const MyTest = createClass(`test`).in(`test`);

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
            const MyTest = createClass(`test`).in(`test`);
            await bootstrapTest.client.indices.deleteAlias({
                index: `test_test-abc`,
                name: `test_test`
            });

            await expect(MyTest.deleteAlias()).to.be.eventually.rejectedWith(`Alias 'test_test' doesn't exist.`);
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`test_test`, `abc`);
        });
    });

    describe(`static indexExists()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
            await bootstrapTest.createIndex(`test_revisions`, uuid);
        });

        it(`can't check index with wildcard in index`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.indexExists()).to.be.eventually.rejectedWith(`You cannot use 'existsIndex' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`checks if index exists`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`);

            const exists = await MyRevisions.indexExists();
            expect(exists).to.be.true;
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
        });
    });

    describe(`static deleteIndex()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
            await bootstrapTest.createIndex(`test_revisions`, uuid);
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_test`
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
            const MyRevisions = createClass(`revisions`).in(`test`);

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
                index: `test_test`
            });
            const MyTest = createClass(`test`).in(`test`);

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
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_test`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`static getMapping()`, () => {
        it(`gets mapping of index`, async () => {
            const MyRevisions = createClass(`users`).in(`test`);

            const mapping = await MyRevisions.getMapping();
            expect(mapping).to.be.an(`object`);
            expect(Object.values(mapping)[0]).to.be.an(`object`);
            expect(Object.values(mapping)[0].mappings).to.be.an(`object`);
        });

        it(`gets mapping of multiple indexes`, async () => {
            const MyDocuments = createClass(`documents`);

            const mapping = await MyDocuments.getSettings();
            expect(Object.keys(mapping).length > 1);
        });
    });

    describe(`static putMapping()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
            await bootstrapTest.createIndex(`test_revisions`, uuid);
        });

        it(`can't send empty mapping`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.putMapping()).to.be.eventually.rejectedWith(`You have to specify mapping object.`);
        });

        it(`puts mapping to index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`);

            const mapping = {
                properties: {
                    test: {
                        type: `text`
                    }
                }
            };
            await MyRevisions.putMapping(mapping);

            const response = await bootstrapTest.client.indices.getMapping({
                index: `test_revisions`
            });
            expect(Object.values(response)[0].mappings.properties.test.type).to.equal(`text`);
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
        });
    });

    describe(`static getSettings()`, () => {
        it(`gets settings of index`, async () => {
            const MyUsers = createClass(`users`).in(`test`);

            const settings = await MyUsers.getSettings();
            expect(settings).to.be.an(`object`);
            expect(Object.values(settings)[0]).to.be.an(`object`);
            expect(Object.values(settings)[0].settings).to.be.an(`object`);
        });

        it(`gets settings of index with default settings included`, async () => {
            const MyUsers = createClass(`users`).in(`test`);

            const settings = await MyUsers.getSettings(true);
            expect(settings).to.be.an(`object`);
            expect(Object.values(settings)[0]).to.be.an(`object`);
            expect(Object.values(settings)[0].settings).to.be.an(`object`);
            expect(Object.values(settings)[0].defaults).to.be.an(`object`);
        });

        it(`gets settings of multiple indexes`, async () => {
            const MyDocuments = createClass(`documents`);

            const settings = await MyDocuments.getSettings();
            expect(Object.keys(settings).length > 1);
        });
    });

    describe(`static putSettings()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
            await bootstrapTest.createIndex(`test_revisions`, uuid);
        });

        it(`can't send empty settings`, async () => {
            const MyRevisions = createClass(`revisions`); //tenant is *

            await expect(MyRevisions.putSettings()).to.be.eventually.rejectedWith(`You have to specify settings object.`);
        });

        it(`puts settings to index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`);

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
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
        });
    });

    describe(`static reindex()`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
            await bootstrapTest.createIndex(`test_revisions`, uuid);
        });

        it(`can't reindex index without destination index specified`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`test`);

            await expect(MyDocumentsSource.reindex()).to.be.eventually.rejectedWith(`You must specify destination model!`);
        });

        it(`can't reindex index with wildcard in source index`, async () => {
            const MyDocumentsSource = createClass(`documents`); //tenant is *
            const MyRevisionsDestination = createClass(`revisions`).in(`test`);

            await expect(MyDocumentsSource.reindex(MyRevisionsDestination)).to.be.eventually.rejectedWith(`You cannot use 'reindex-source' with current tenant '*', full alias is '*_documents'!`);
        });

        it(`can't reindex index with wildcard in destination index`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`test`);
            const MyRevisionsDestination = createClass(`revisions`); //tenant is *

            await expect(MyDocumentsSource.reindex(MyRevisionsDestination)).to.be.eventually.rejectedWith(`You cannot use 'reindex-destination' with current tenant '*', full alias is '*_revisions'!`);
        });

        it(`can't reindex when source index doesn't exist`, async () => {
            const MyDocumentsSource = createClass(`incorrect`).in(`test`);
            const MyRevisionsDestination = createClass(`revisions`).in(`test`);

            await expect(MyDocumentsSource.reindex(MyRevisionsDestination)).to.be.eventually.rejectedWith(`index_not_found_exception: [index_not_found_exception] Reason: no such index [test_incorrect]`);
        });

        it(`reindexes model`, async () => {
            const MyDocumentsSource = createClass(`documents`).in(`test`);
            const MyRevisionsDestination = createClass(`revisions`).in(`test`);

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
            const MyDocumentsSource = createClass(`documents`).in(`test`);
            const MyRevisionsDestination = createClass(`revisions`).in(`test`);

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
            const MyDocumentsSource = createClass(`documents`).in(`test`);
            const MyRevisionsDestination = createClass(`revisions`).in(`test`);

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
            const MyDocumentsSource = createClass(`documents`).in(`test`);
            const MyRevisionsDestination = createClass(`revisions`).in(`test`);

            const fromInstance = new MyDocumentsSource({ documentTitle: `:)` }, `test`);
            await fromInstance.save();

            await MyDocumentsSource.reindex(MyRevisionsDestination.alias);

            const toResults = await MyRevisionsDestination.findAll();
            expect(toResults.length).to.equal(1);
            expect(toResults[0].constructor.alias).to.equal(MyRevisionsDestination.alias);
            expect(toResults[0]._id).to.equal(`test`);
            expect(toResults[0].documentTitle).to.equal(`:)`);
        });

        afterEach(async () => {
            await bootstrapTest.deleteIndex(`test_revisions`, uuid);
        });
    });

    describe(`static cloneIndex()`, () => {
        it(`can't clone index with wildcard in source index`, async () => {
            const MyTest = createClass(`test`); //tenant is *

            await expect(MyTest.cloneIndex()).to.be.eventually.rejectedWith(`You cannot use 'clone' with current tenant '*', full alias is '*_test'!`);
        });

        it(`can't clone not existing index`, async () => {
            const MyTest = createClass(`test`).in(`test`);

            await expect(MyTest.cloneIndex()).to.be.eventually.rejectedWith(`index_not_found_exception: [index_not_found_exception] Reason: no such index [test_test]`);
        });

        it(`can't clone when index is not read-only`, async () => {
            await bootstrapTest.client.indices.create({
                index: `test_test`
            });

            const MyTest = createClass(`test`).in(`test`);

            await expect(MyTest.cloneIndex()).to.be.eventually.rejectedWith(`index test_test must be read-only to resize index. use "index.blocks.write=true"`);
        });

        it(`clones aliased model`, async () => {
            const MyTest = createClass(`users`).in(`test`);
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
                index: `test_users*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(2);

            const existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(originalIndex);
            expect(existingIndices).includes(newIndex);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `test_users*`
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
        });

        it(`clones not aliased model`, async () => {
            await bootstrapTest.client.indices.create({
                index: `test_test`
            });

            const MyTest = createClass(`test`).in(`test`);
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
                index: `test_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(2);

            const existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(`test_test`);
            expect(existingIndices).includes(newIndex);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `test_test*`
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

        it(`clones model and specifies settings`, async () => {
            await bootstrapTest.client.indices.create({
                index: `test_test`,
                settings: {
                    index: {
                        refresh_interval: -1
                    }
                }
            });

            const MyTest = createClass(`test`).in(`test`);
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
                    refresh_interval: `5s`
                }
            });

            let indicesStats = await bootstrapTest.client.indices.stats({
                index: `test_test*`
            });
            expect(indicesStats.indices).to.be.an(`object`);
            expect(Object.values(indicesStats.indices).length).to.equal(2);

            const existingIndices = Object.keys(indicesStats.indices);
            expect(existingIndices).includes(`test_test`);
            expect(existingIndices).includes(newIndex);

            await MyTest.deleteIndex();
            indicesStats = await bootstrapTest.client.indices.stats({
                index: `test_test*`
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
            expect(Object.values(newSettings)[0].settings.index.refresh_interval).to.equal(`5s`);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.putSettings({
                    index: `test_users*`,
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
                    index: `test_test*`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`static refresh()`, () => {
        it(`can't refresh not existing index`, async () => {
            const Test = createClass(`test`).in(`test`);
            await expect(Test.refresh()).to.be.eventually.rejectedWith(`index_not_found_exception: [index_not_found_exception] Reason: no such index [test_test]`);
        });

        it(`refreshes single index`, async () => {
            const MyUsers = createClass(`users`).in(`test`).immediateRefresh(false);
            const instance = new MyUsers({ name: `test` });
            await instance.save();

            let foundUsers = await MyUsers.findAll();
            expect(foundUsers.length).to.equal(0);

            await MyUsers.refresh();

            foundUsers = await MyUsers.findAll();
            expect(foundUsers.length).to.equal(1);
            expect(foundUsers[0].name).to.equal(`test`);
        });

        it(`refreshes multiple indices`, async () => {
            const FirstType = createClass(`users`).in(`test`).immediateRefresh(false);
            const firstInstance = new FirstType({ name: `first` });
            await firstInstance.save();

            const SecondType = createClass(`documents`).in(`test`).immediateRefresh(false);
            const secondInstance = new SecondType({ documentTitle: `second` });
            await secondInstance.save();

            let foundFirstUsers = await FirstType.findAll();
            expect(foundFirstUsers.length).to.equal(0);

            let foundSecondUsers = await SecondType.findAll();
            expect(foundSecondUsers.length).to.equal(0);

            await FirstType.refresh();
            await SecondType.refresh();

            foundFirstUsers = await FirstType.findAll();
            expect(foundFirstUsers.length).to.equal(1);
            expect(foundFirstUsers[0].name).to.equal(`first`);

            foundSecondUsers = await SecondType.findAll();
            expect(foundSecondUsers.length).to.equal(1);
            expect(foundSecondUsers[0].documentTitle).to.equal(`second`);
        });
    });

    describe(`save()`, () => {
        it(`can't save invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.object({ status: Joi.array() })).in(`test`);

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
            const MyClass = createClass(`users`, Joi.string()).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`).immediateRefresh(false);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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

        it(`can't save instance when sequence numbers are different`, async () => {
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version + 1);
            await expect(myInstance.save(true)).to.be.eventually.rejectedWith(`Actual version '${savedInstance._version + 1}' is different than stored version '${savedInstance._version}'!`);
        });
    });

    describe(`reload()`, () => {
        it(`reloads instance`, async () => {
            const MyClass = createClass(`users`).in(`test`);

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
        it(`can't delete non-existing object without _id`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await expect(myInstance.delete()).to.be.eventually.rejectedWith(`Document has not been saved into ES yet.`);
        });

        it(`can't delete non-existing object with _id`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);
            await expect(myInstance.delete()).to.be.eventually.rejectedWith(`"result":"not_found"`);
        });

        it(`deletes instance`, async () => {
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version + 1);
            await expect(myInstance.delete(true)).to.be.eventually.rejectedWith(`Actual version '${savedInstance._version + 1}' is different than stored version '${savedInstance._version}'!`);
        });
    });

    describe(`clone()`, () => {
        it(`clones instance`, async () => {
            const MyClass = createClass(`users`).in(`test`);

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
            const MyClass = createClass(`users`).in(`test`);

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

            expect(clone._id).to.be.undefined;
            expect(clone._version).to.be.undefined;
            expect(clone._primary_term).to.be.undefined;
            expect(clone._seq_no).to.be.undefined;
            expect(clone.status).to.equal(`:)`);
            expect(clone.name).to.equal(`xyz`);
            expect(clone.fullname).to.equal(`abc def`);
        });
    });

    describe(`_parseIndex()`, () => {
        it(`parses different indices`, () => {
            const UserClass = createClass(`users`).in(`test`);
            let result = UserClass._parseIndex(`*_users`);
            expect(result.tenant).to.equal(`*`);
            expect(result.name).to.equal(`users`);
            expect(result.alias).to.equal(`*_users`);

            result = UserClass._parseIndex(`*_users-asd123`);
            expect(result.tenant).to.equal(`*`);
            expect(result.name).to.equal(`users`);
            expect(result.alias).to.equal(`*_users`);

            result = UserClass._parseIndex(`test_users`);
            expect(result.tenant).to.equal(`test`);
            expect(result.name).to.equal(`users`);
            expect(result.alias).to.equal(`test_users`);

            result = UserClass._parseIndex(`test_users-asfd321`);
            expect(result.tenant).to.equal(`test`);
            expect(result.name).to.equal(`users`);
            expect(result.alias).to.equal(`test_users`);

            result = UserClass._parseIndex(`test_nvm`);
            expect(result.tenant).to.equal(`test`);
            expect(result.name).to.equal(`nvm`);
            expect(result.alias).to.equal(`test_nvm`);

            const DocumentClass = createClass(`documents`);
            result = DocumentClass._parseIndex(`*_documents`);
            expect(result.tenant).to.equal(`*`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`*_documents`);

            result = DocumentClass._parseIndex(`*_documents-asd123`);
            expect(result.tenant).to.equal(`*`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`*_documents`);

            result = DocumentClass._parseIndex(`test_documents`);
            expect(result.tenant).to.equal(`test`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`test_documents`);

            result = DocumentClass._parseIndex(`test_documents-asfd321`);
            expect(result.tenant).to.equal(`test`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`test_documents`);

            const TestClass = createClass(`test_documents`);
            result = TestClass._parseIndex(`test_test_documents-asfd321`);
            expect(result.tenant).to.equal(`test`);
            expect(result.name).to.equal(`test_documents`);
            expect(result.alias).to.equal(`test_test_documents`);

            result = TestClass._parseIndex(`test_documents-asfd321`);
            expect(result.tenant).to.equal(`test`);
            expect(result.name).to.equal(`documents`);
            expect(result.alias).to.equal(`test_documents`);
        });
    });
});
