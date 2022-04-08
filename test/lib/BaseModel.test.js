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
            expect(() => createClass(`myIndex`, void 0, void 0, ``)).to.throw(`Tenant cannot be empty.`);

            expect(() => createClass(`myIndex`, void 0, void 0, `test_test`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, void 0, `_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, void 0, `test_`)).to.throw(`Tenant cannot contain underscore.`);
            expect(() => createClass(`myIndex`, void 0, void 0, `_test`)).to.throw(`Tenant cannot contain underscore.`);

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
            expect(myClass._type).to.equal(``);

            expect(myClass._alias).to.equal(`*_myIndex`);
        });

        it(`creates new class with schema`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = createClass(`myIndex`, schema);
            expect(myClass._tenant).to.equal(`*`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
            expect(myClass._type).to.equal(``);

            expect(myClass._alias).to.equal(`*_myIndex`);
        });

        it(`creates new class with schema and type`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = createClass(`myIndex`, schema, `myType`);
            expect(myClass._tenant).to.equal(`*`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
            expect(myClass._type).to.equal(`myType`);

            expect(myClass._alias).to.equal(`*_myIndex_myType`);
        });

        it(`creates new class and rewrites tenant`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema, `myType`);
            originalClass.myFunction = function () {
                return this._tenant;
            };
            originalClass.x = `:)`;
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass._alias).to.equal(`*_myIndex_myType`);
            expect(originalClass.myFunction()).to.equal(`*`);

            const myClass = originalClass.in(`myTenant`);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass._alias).to.equal(`*_myIndex_myType`);
            expect(originalClass.myFunction()).to.equal(`*`);
            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._alias).to.equal(`myTenant_myIndex_myType`);
            expect(myClass.myFunction()).to.equal(`myTenant`);

            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
            expect(myClass._type).to.equal(`myType`);
        });

        it(`creates new class and rewrites tenant and type`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass._type).to.equal(``);
            expect(originalClass._alias).to.equal(`*_myIndex`);

            const myClass = originalClass.in(`myTenant`).type(`myType`);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass._type).to.equal(``);
            expect(originalClass._alias).to.equal(`*_myIndex`);
            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._type).to.equal(`myType`);
            expect(myClass._alias).to.equal(`myTenant_myIndex_myType`);

            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
        });

        it(`preserves user defined functions`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            originalClass.myFunction = function () {
                return this._type;
            };

            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass._type).to.equal(``);
            expect(originalClass._alias).to.equal(`*_myIndex`);
            expect(originalClass.myFunction).not.to.be.undefined;
            expect(originalClass.myFunction()).to.equal(``);

            const myClass = originalClass.in(`myTenant`).type(`myType`);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass._type).to.equal(``);
            expect(originalClass._alias).to.equal(`*_myIndex`);
            expect(originalClass.myFunction).not.to.be.undefined;
            expect(originalClass.myFunction()).to.equal(``);

            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._type).to.equal(`myType`);
            expect(myClass._alias).to.equal(`myTenant_myIndex_myType`);
            expect(myClass.myFunction).not.to.be.undefined;
            expect(myClass.myFunction()).to.equal(`myType`);

            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
        });

        it(`preserves user redefined static function`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            originalClass.find = function () {
                return `*`;
            };

            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass._type).to.equal(``);
            expect(originalClass._alias).to.equal(`*_myIndex`);
            expect(originalClass.find).not.to.be.undefined;
            expect(originalClass.find()).to.equal(`*`);

            const myClass = originalClass.in(`myTenant`).type(`myType`);
            expect(originalClass._tenant).to.equal(`*`);
            expect(originalClass._type).to.equal(``);
            expect(originalClass._alias).to.equal(`*_myIndex`);
            expect(originalClass.find).not.to.be.undefined;
            expect(originalClass.find()).to.equal(`*`);

            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._type).to.equal(`myType`);
            expect(myClass._alias).to.equal(`myTenant_myIndex_myType`);
            expect(myClass.find).not.to.be.undefined;
            expect(myClass.find()).to.equal(`*`);

            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
        });

        it(`clones class`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema).type(`myType`).in(`myTenant`);

            expect(originalClass._tenant).to.equal(`myTenant`);
            expect(originalClass._name).to.equal(`myIndex`);
            expect(originalClass._type).to.equal(`myType`);
            expect(originalClass._alias).to.equal(`myTenant_myIndex_myType`);
            expect(originalClass.newProperty).to.be.undefined;
            expect(originalClass.anotherProperty).to.be.undefined;
            expect(originalClass.newFunction).to.be.undefined;
            expect(originalClass.anotherFunction).to.be.undefined;

            const changes = {
                newProperty: `new`,
                newFunction: function() {
                    return `newFunction`;
                },
                _type: `rewrittenType`
            };
            const clonedClass = originalClass.clone(changes);
            clonedClass.anotherProperty = `another`;
            clonedClass.anotherFunction = function() {
                return `anotherFunction`;
            };
            clonedClass._name = `rewrittenIndex`;

            expect(originalClass._tenant).to.equal(`myTenant`);
            expect(originalClass._name).to.equal(`myIndex`);
            expect(originalClass._type).to.equal(`myType`);
            expect(originalClass._alias).to.equal(`myTenant_myIndex_myType`);
            expect(originalClass.newProperty).to.be.undefined;
            expect(originalClass.anotherProperty).to.be.undefined;
            expect(originalClass.newFunction).to.be.undefined;
            expect(originalClass.anotherFunction).to.be.undefined;

            expect(clonedClass._tenant).to.equal(`myTenant`);
            expect(clonedClass._name).to.equal(`rewrittenIndex`);
            expect(clonedClass._type).to.equal(`rewrittenType`);
            expect(clonedClass._alias).to.equal(`myTenant_rewrittenIndex_rewrittenType`);
            expect(clonedClass.newProperty).to.equal(`new`);
            expect(clonedClass.anotherProperty).to.equal(`another`);
            expect(clonedClass.newFunction()).to.equal(`newFunction`);
            expect(clonedClass.anotherFunction()).to.equal(`anotherFunction`);
        });

        it(`creates new class and changes tenant and type multiple times`, async () => {
            const schema = Joi.object().keys({}).required();
            let myClass = createClass(`myIndex`, schema);
            expect(myClass._tenant).to.equal(`*`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass._type).to.equal(``);
            expect(myClass._alias).to.equal(`*_myIndex`);

            myClass = myClass.in(`test`);
            expect(myClass._tenant).to.equal(`test`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass._type).to.equal(``);
            expect(myClass._alias).to.equal(`test_myIndex`);

            myClass = myClass.type(`typ`);
            expect(myClass._tenant).to.equal(`test`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass._type).to.equal(`typ`);
            expect(myClass._alias).to.equal(`test_myIndex_typ`);

            myClass = myClass.in(`another`);
            expect(myClass._tenant).to.equal(`another`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass._type).to.equal(`typ`);
            expect(myClass._alias).to.equal(`another_myIndex_typ`);

            myClass = myClass.type(``);
            expect(myClass._tenant).to.equal(`another`);
            expect(myClass._name).to.equal(`myIndex`);
            expect(myClass._type).to.equal(``);
            expect(myClass._alias).to.equal(`another_myIndex`);
        });
    });

    describe(`static search()`, () => {
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

        it(`tests higher amount of data`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass._alias,
                        _id: `id_${i}`
                    }
                });
                bulk.push({
                    name: `name_${i}`
                });
            }

            await bootstrapTest.client.bulk({
                body: bulk,
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
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.search(void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`searches with empty object`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const results = await MyClass.search({});

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(2);
            expect(results._total).to.equal(2);
            const possibleValues = [userObject1.body.name, userObject2.body.name];
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
            const MyClass = createClass(`users`, void 0).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(2);
            expect(results._total).to.equal(2);
            const possibleValues = [userObject1.body.name, userObject2.body.name];
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
            const MyClass = createClass(`users`, void 0).in(`test`);
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
            expect(results[0].status).to.equal(userObject1.body.status);
            expect(results[0].name).to.equal(userObject1.body.name);
        });

        it(`searches using non existing property`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
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
            const MyClass = createClass(`documents`, void 0, `*`).in(`incorrect`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(0);
            expect(results._total).to.equal(0);
        });

        it(`searches for all documents`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(3);
            expect(results._total).to.equal(3);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and tenant and can save
                expect(result.constructor._type).to.not.equal(`*`);
                expect(result.constructor._tenant).to.equal(`test`);
                expect(result._score).to.be.a(`number`);
                await result.save();
            }
        });

        it(`searches for folder documents only`, async () => {
            const indexType =`folder`;
            const MyClass = createClass(`documents`, void 0, indexType);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(2);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and tenant and can save
                expect(result.constructor._type).to.equal(indexType);
                expect(result.constructor._tenant).to.equal(`test`);
                expect(result._score).to.be.a(`number`);
                await result.save();
            }
        });

        it(`searches without source fields`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
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
            const MyClass = createClass(`users`, void 0).in(`test`);
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
            const MyClass = createClass(`documents`, void 0, `*`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, 1);

            expect(results.length).to.equal(2);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                expect(result.constructor._tenant).to.equal(`test`);
                await result.save();
            }
        });

        it(`searches for documents with from parameter in body`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                from: 1
            });

            expect(results.length).to.equal(2);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                expect(result.constructor._tenant).to.equal(`test`);
                await result.save();
            }
        });

        it(`searches for documents with size parameter`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`searches for documents with size parameter in body`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                size: 1
            });

            expect(results.length).to.equal(1);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`searches for documents with from and size parameters`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, 1, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`searches for documents with from and size parameters in body`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                from: 1,
                size: 1
            });

            expect(results.length).to.equal(1);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`searches for documents with from and size parameters in body and param combined`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                from: 0,
                size: 1000
            }, 1, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`searches for documents with from and size parameters in body and param combined again`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                },
                from: 1
            }, void 0, 1);

            expect(results.length).to.equal(1);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`normally searches when 0 is passed as scroll timeout`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, void 0, void 0, 0);
            expect(results.length).to.be.greaterThan(0);
            expect(results.scrollId).to.be.undefined;
        });

        it(`searches and manually scrolls by max sizes (10k)`, async () => {
            await bootstrapTest.deleteData();

            const MyClass = createClass(`users`, void 0).in(`test`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass._alias,
                        _id: `id_${`00000${i}`.substr(-5)}`
                    }
                });
                bulk.push({
                    name: `name_${`00000${i}`.substr(-5)}`
                });
            }

            await bootstrapTest.client.bulk({
                body: bulk,
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
            }, void 0, void 0, void 0, 10);
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

            const MyClass = createClass(`users`, void 0).in(`test`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass._alias,
                        _id: `id_${`00000${i}`.substr(-5)}`
                    }
                });
                bulk.push({
                    name: `name_${`00000${i}`.substr(-5)}`
                });
            }

            await bootstrapTest.client.bulk({
                body: bulk,
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
            }, void 0, void 0, `name`, 10);
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

            const MyClass = createClass(`users`, void 0).in(`test`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass._alias,
                        _id: `id_${`00000${i}`.substr(-5)}`
                    }
                });
                bulk.push({
                    name: `name_${`00000${i}`.substr(-5)}`
                });
            }

            await bootstrapTest.client.bulk({
                body: bulk,
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

            const MyClass = createClass(`users`, void 0).in(`test`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass._alias,
                        _id: `id_${`00000${i}`.substr(-5)}`
                    }
                });
                bulk.push({
                    name: `name_${`00000${i}`.substr(-5)}`
                });
            }

            await bootstrapTest.client.bulk({
                body: bulk,
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

    describe(`static clearScroll()`, () => {
        it(`can't clear scroll without specifying scroll id`, async () => {
            const MyClass = createClass(`users`, void 0);

            await expect(MyClass.clearScroll()).to.be.eventually.rejectedWith(`scrollId must be specified!`);
        });

        it(`clears scroll`, async () => {
            const MyClass = createClass(`users`, void 0);

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

        it(`finds all user entries`, async () => {
            const MyClass = createClass(`users`, void 0);
            const results = await MyClass.findAll();

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(2);
            const possibleValues = [userObject1.body.name, userObject2.body.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result.constructor._tenant).to.equal(`test`);
            }
        });

        it(`finds all documents`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.findAll();

            expect(results.length).to.equal(3);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`finds folder documents only`, async () => {
            const indexType =`folder`;
            const MyClass = createClass(`documents`, void 0, indexType);
            const results = await MyClass.findAll();

            expect(results.length).to.equal(2);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);

                //correct type and can save
                expect(result.constructor._type).to.equal(indexType);
                expect(result.constructor._tenant).to.equal(`test`);
                await result.save();
            }
        });
    });

    describe(`static find()`, () => {
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

        it(`can't find undefined id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.find()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find non-string id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.find(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.find([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const result = await MyClass.find(`unknown`);
            expect(result).to.deep.equal([]);
        });

        it(`can't find array with not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const results = await MyClass.find([`invalid`, `unknown`]);
            expect(results).to.be.an(`array`);
            expect(results.length).to.equal(0);
        });

        it(`finds given user entry`, async () => {
            const MyClass = createClass(`users`, void 0);
            const results = await MyClass.find(userObject1.id);

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
            expect(results[0]._score).to.be.a(`number`);
            expect(results[0].name).to.equal(userObject1.body.name);
            expect(results[0].status).to.equal(userObject1.body.status);
        });

        it(`finds given user entry in array`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const results = await MyClass.find([userObject1.id]);

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
            expect(results[0]._score).to.be.a(`number`);
            expect(results[0].name).to.equal(userObject1.body.name);
            expect(results[0].status).to.equal(userObject1.body.status);
        });

        it(`finds array of folder documents`, async () => {
            const indexType =`folder`;
            const MyClass = createClass(`documents`, void 0, indexType);
            const results = await MyClass.find([folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [folderDocument1.id, folderDocument2.id];
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(indexType);
                await result.save();
            }
        });

        it(`finds only existing ids from array`, async () => {
            const indexType =`folder`;
            const MyClass = createClass(`documents`, void 0, indexType);
            const results = await MyClass.find([`unknown`, folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [folderDocument1.id, folderDocument2.id];
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(indexType);
                await result.save();
            }
        });

        it(`finds array of folder documents without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const results = await MyClass.find([folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [folderDocument1.id, folderDocument2.id];
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(`folder`);
                await result.save();
            }
        });
    });

    describe(`static get()`, () => {
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

        it(`can't get undefined id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.get()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get non-string id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.get(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.get([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            await expect(MyClass.get([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'get' with current type '*', full alias is 'test_documents_*'!`);
        });

        it(`can't get without specifying tenant`, async () => {
            const MyClass = createClass(`documents`, void 0);
            await expect(MyClass.get([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'get' with current tenant '*', full alias is '*_documents'!`);
        });

        it(`can't get not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.get(`unknown`)).to.be.eventually.rejectedWith(`Response Error`);
        });

        it(`can't get array with not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.get([userObject1.id, `unknown`])).to.be.eventually.rejectedWith(`Response Error`);
        });

        it(`gets given user entry`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const result = await MyClass.get(userObject1.id);
            expect(result).to.be.instanceOf(BaseModel);

            expect(result._id).to.equal(userObject1.id);
            expect(result._version).to.be.a(`number`);
            expect(result._primary_term).to.be.a(`number`);
            expect(result._seq_no).to.be.a(`number`);
            expect(result._score).to.be.a(`number`);
            expect(result._score).to.equal(1);
            expect(result.name).to.equal(userObject1.body.name);
            expect(result.status).to.equal(userObject1.body.status);
        });

        it(`gets given user entry in array`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const results = await MyClass.get([userObject1.id]);

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).to.be.a(`number`);
            expect(results[0]._primary_term).to.be.a(`number`);
            expect(results[0]._seq_no).to.be.a(`number`);
            expect(results[0]._score).to.be.a(`number`);
            expect(results[0]._score).to.equal(1);
            expect(results[0].name).to.equal(userObject1.body.name);
            expect(results[0].status).to.equal(userObject1.body.status);
        });

        it(`gets array of folder documents`, async () => {
            const indexType =`folder`;
            const MyClass = createClass(`documents`, void 0, indexType).in(`test`);
            const results = await MyClass.get([folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [folderDocument1.id, folderDocument2.id];
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).to.be.a(`number`);
                expect(result._primary_term).to.be.a(`number`);
                expect(result._seq_no).to.be.a(`number`);
                expect(result._score).to.be.a(`number`);
                expect(result._score).to.equal(1);
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(indexType);
                await result.save();
            }
        });
    });

    describe(`static delete()`, () => {
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

        it(`can't delete undefined id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.delete()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete non-string id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.delete(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.delete([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            await expect(MyClass.delete([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'delete' with current type '*', full alias is 'test_documents_*'!`);
        });

        it(`can't delete multiple ids when version is specified`, async () => {
            const MyClass = createClass(`documents`, void 0, `folder`).in(`test`);
            await expect(MyClass.delete([folderDocument1.id, folderDocument2.id], 6)).to.be.eventually.rejectedWith(`You cannot use parameter 'version' with multiple ids specified!`);
        });

        it(`can't delete not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const result = await MyClass.delete([`unknown`]);

            expect(result.items[0].delete.status).to.equal(404);
        });

        it(`deletes given user entry`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const result = await MyClass.delete(userObject1.id);

            expect(result.items[0].delete.status).to.equal(200);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists.body).to.be.false;
        });

        it(`deletes given user entry in array`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const results = await MyClass.delete([userObject1.id]);

            expect(results.items[0].delete.status).to.equal(200);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists.body).to.be.false;
        });

        it(`deletes array of folder documents`, async () => {
            const MyClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const results = await MyClass.delete([folderDocument1.id, folderDocument2.id]);

            expect(results.items[0].delete.status).to.equal(200);
            expect(results.items[1].delete.status).to.equal(200);

            const exists1 = await bootstrapTest.client.exists({
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(exists1.body).to.be.false;

            const exists2 = await bootstrapTest.client.exists({
                index: folderDocument2.index,
                id: folderDocument2.id
            });
            expect(exists2.body).to.be.false;
        });

        it(`deletes only existing entries from given array`, async () => {
            const MyClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const results = await MyClass.delete([`not`, folderDocument1.id, folderDocument2.id, `existing`]);

            expect(results.items[0].delete.status).to.equal(404);
            expect(results.items[1].delete.status).to.equal(200);
            expect(results.items[2].delete.status).to.equal(200);
            expect(results.items[3].delete.status).to.equal(404);

            const exists1 = await bootstrapTest.client.exists({
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(exists1.body).to.be.false;

            const exists2 = await bootstrapTest.client.exists({
                index: folderDocument2.index,
                id: folderDocument2.id
            });
            expect(exists2.body).to.be.false;
        });

        it(`throws error when deleting single incorrect instance`, async () => {
            const MyClass = createClass(`documents`, void 0, `folder`).in(`test`);
            await expect(MyClass.delete(`whatever`)).to.be.eventually.rejectedWith(`not_found`);
        });

        it(`can't delete incorrect version`, async () => {
            const record = await bootstrapTest.client.get({
                index: userObject1.index,
                id: userObject1.id
            });
            const storedVersion = record.body._version;

            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.delete(userObject1.id, storedVersion + 1))
                .to.be.eventually.rejectedWith(`Specified version '${storedVersion + 1}' is different than stored version '${storedVersion}'!`);
        });

        it(`deletes correct version`, async () => {
            const record = await bootstrapTest.client.get({
                index: userObject1.index,
                id: userObject1.id
            });
            const storedVersion = record.body._version;

            const MyClass = createClass(`users`, void 0).in(`test`);
            await MyClass.delete(userObject1.id, storedVersion);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                id: userObject1.id
            });
            expect(exists.body).to.be.false;
        });
    });

    describe(`static exists()`, () => {
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

        it(`can't check undefined id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.exists()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check non-string id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.exists(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.exists([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            await expect(MyClass.exists([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'exists' with current type '*', full alias is 'test_documents_*'!`);
        });

        it(`checks not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const result = await MyClass.exists(`unknown`);

            expect(result).to.be.false;
        });

        it(`checks given user entry`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const result = await MyClass.exists(userObject1.id);

            expect(result).to.be.true;
        });

        it(`checks given user entry in array`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const results = await MyClass.exists([userObject1.id]);

            expect(results.length).to.equal(1);
            expect(results[0]).to.be.true;
        });

        it(`checks array of folder documents`, async () => {
            const MyClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const results = await MyClass.exists([folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            expect(results[0]).to.be.true;
            expect(results[1]).to.be.true;
        });

        it(`checks only existing entries from given array`, async () => {
            const MyClass = createClass(`documents`, void 0, `folder`).in(`test`);
            const results = await MyClass.exists([`not`, folderDocument1.id, folderDocument2.id, `existing`]);

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

        it(`can't update undefined id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.update()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update non-string id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.update(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.update([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            await expect(MyClass.update([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'update' with current type '*', full alias is 'test_documents_*'!`);
        });

        it(`can't update without body specified`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            await expect(MyClass.update(`ok`, void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`updates data instances`, async () => {
            const DocumentClass = createClass(`documents`, void 0, `folder`).in(`test`);

            const result = await DocumentClass.update([`1folder`, `2folder`], {
                doc: {
                    documentTitle: `:)`
                }
            });

            expect(result.items[0].update.status).to.equal(200);
            expect(result.items[1].update.status).to.equal(200);

            const results1 = await bootstrapTest.client.get({
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(results1.body._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: folderDocument2.index,
                id: folderDocument2.id
            });
            expect(results2.body._source.documentTitle).to.equal(`:)`);
        });

        it(`can't update incorrect instances`, async () => {
            const DocumentClass = createClass(`documents`, void 0 , `folder`).in(`test`);

            const result = await DocumentClass.update([`1folder`, `2folder`], {
                doc: {
                    name: `:)`
                }
            });

            expect(result.items[0].update.status).to.equal(400);
            expect(result.items[1].update.status).to.equal(400);

            const results1 = await bootstrapTest.client.get({
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(results1.body._source.name).to.be.undefined;

            const results2 = await bootstrapTest.client.get({
                index: folderDocument2.index,
                id: folderDocument2.id
            });
            expect(results2.body._source.name).to.be.undefined;
        });

        it(`throws error when updating single incorrect instance`, async () => {
            const DocumentClass = createClass(`documents`, void 0, `folder`).in(`test`);

            await expect(DocumentClass.update(`1folder`, {
                doc: {
                    name: `:)`
                }
            })).to.be.eventually.rejectedWith(`mapping set to strict, dynamic introduction of [name] within [_doc] is not allowed`);

            const results1 = await bootstrapTest.client.get({
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(results1.body._source.name).to.be.undefined;
        });
    });

    describe(`static count()`, () => {
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

        it(`counts user entries`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
            const count = await MyClass.count();
            expect(count).to.equal(2);
        });

        it(`counts all documents entries`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`).in(`test`);
            const count = await MyClass.count();
            expect(count).to.equal(3);
        });

        it(`counts all folder entries without tenant specified`, async () => {
            const MyClass = createClass(`documents`, void 0, `folder`);
            const count = await MyClass.count();
            expect(count).to.equal(2);
        });

        it(`counts all documents entries without tenant specified`, async () => {
            const MyClass = createClass(`documents`, void 0, `*`);
            const count = await MyClass.count();
            expect(count).to.equal(3);
        });

        it(`counts users with specific status`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);
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
            const MyClass = createClass(`users`, void 0);
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
            const MyClass = createClass(`documents`, void 0, `*`);
            const count = await MyClass.count({
                query: {
                    ids: {
                        values: [`1folder`, `2folder`]
                    }
                }
            });
            expect(count).to.equal(2);
        });
    });

    describe(`static updateByQuery()`, () => {
        let folderDocument1;
        let folderDocument2;

        beforeEach(async () => {
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

            await Promise.all([
                bootstrapTest.client.index(folderDocument1),
                bootstrapTest.client.index(folderDocument2)
            ]);
        });

        it(`updates data instances`, async () => {
            const DocumentClass = createClass(`documents`, void 0, `folder`).in(`test`);

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
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(results1.body._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: folderDocument2.index,
                id: folderDocument2.id
            });
            expect(results2.body._source.documentTitle).to.equal(`:)`);
        });

        it(`updates data instances without tenant specified`, async () => {
            const DocumentClass = createClass(`documents`, void 0, `folder`);

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
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(results1.body._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: folderDocument2.index,
                id: folderDocument2.id
            });
            expect(results2.body._source.documentTitle).to.equal(`:)`);
        });
    });

    describe(`static deleteByQuery()`, () => {
        let folderDocument1;
        let folderDocument2;

        beforeEach(async () => {
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

            await Promise.all([
                bootstrapTest.client.index(folderDocument1),
                bootstrapTest.client.index(folderDocument2)
            ]);
        });

        it(`deletes data instances`, async () => {
            const DocumentClass = createClass(`documents`, void 0, `folder`).in(`test`);

            const result = await DocumentClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            expect(result.deleted).to.equal(2);

            const results1 = await bootstrapTest.client.exists({
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(results1.body).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: folderDocument2.index,
                id: folderDocument2.id
            });
            expect(results2.body).to.be.false;
        });

        it(`deletes data instances without tenant specified`, async () => {
            const DocumentClass = createClass(`documents`, void 0, `folder`);

            const result = await DocumentClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            expect(result.deleted).to.equal(2);

            const results1 = await bootstrapTest.client.exists({
                index: folderDocument1.index,
                id: folderDocument1.id
            });
            expect(results1.body).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: folderDocument2.index,
                id: folderDocument2.id
            });
            expect(results2.body).to.be.false;
        });
    });

    describe(`createIndex`, () => {
        it(`can't create index with wildcard in index`, async () => {
            const MyRevisions = createClass(`revisions`).type(`test_form`); //tenant is *

            await expect(MyRevisions.createIndex()).to.be.eventually.rejectedWith(`You cannot use 'createIndex' with current tenant '*', full alias is '*_revisions_test_form'!`);
        });

        it(`creates new index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`).type(`test_form`);

            await MyRevisions.createIndex();

            const exists = await bootstrapTest.client.indices.exists({
                index: MyRevisions._alias
            });
            expect(exists.body).to.be.true;
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_revisions-*_test_form`
                });
            } catch (e) {
                //OK
            }
        });
    });

    describe(`indexExists`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await _deleteIndex(`test_revisions_test_form`, uuid);
            await _createIndex(`test_revisions_test_form`, uuid);
        });

        it(`can't check index with wildcard in index`, async () => {
            const MyRevisions = createClass(`revisions`).type(`test_form`); //tenant is *

            await expect(MyRevisions.indexExists()).to.be.eventually.rejectedWith(`You cannot use 'indexExists' with current tenant '*', full alias is '*_revisions_test_form'!`);
        });

        it(`checks if index exists`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`).type(`test_form`);

            const exists = await MyRevisions.indexExists();
            expect(exists).to.be.true;
        });

        afterEach(async () => {
            await _deleteIndex(`test_revisions_test_form`, uuid);
        });
    });

    describe(`deleteIndex`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await _deleteIndex(`test_revisions_test_form`, uuid);
            await _createIndex(`test_revisions_test_form`, uuid);
        });

        it(`can't delete index with wildcard in index`, async () => {
            const MyRevisions = createClass(`revisions`).type(`test_form`); //tenant is *

            await expect(MyRevisions.deleteIndex()).to.be.eventually.rejectedWith(`You cannot use 'deleteIndex' with current tenant '*', full alias is '*_revisions_test_form'!`);
        });

        it(`deletes index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`).type(`test_form`);

            await MyRevisions.deleteIndex();

            const exists = await bootstrapTest.client.indices.exists({
                index: MyRevisions._alias
            });
            expect(exists.body).to.be.false;
        });

        afterEach(async () => {
            await _deleteIndex(`test_revisions_test_form`, uuid);
        });
    });

    describe(`getMapping`, () => {
        it(`gets mapping of index`, async () => {
            const MyRevisions = createClass(`users`).in(`test`);

            const mapping = await MyRevisions.getMapping();
            expect(mapping).to.be.an(`object`);
            expect(mapping.test_users).to.be.an(`object`);
            expect(mapping.test_users.mappings).to.be.an(`object`);
        });

        it(`gets mapping of multiple indexes`, async () => {
            const MyDocuments = createClass(`documents`).type(`*`);

            const mapping = await MyDocuments.getSettings();
            expect(Object.keys(mapping).length > 1);
        });
    });

    describe(`putMapping`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await _deleteIndex(`test_revisions_test_form`, uuid);
            await _createIndex(`test_revisions_test_form`, uuid);
        });

        it(`can't send empty mapping`, async () => {
            const MyRevisions = createClass(`revisions`).type(`test_form`); //tenant is *

            await expect(MyRevisions.putMapping()).to.be.eventually.rejectedWith(`You have to specify mapping object.`);
        });

        it(`puts mapping to index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`).type(`test_form`);

            const mapping = {
                properties: {
                    test: {
                        type: `text`
                    }
                }
            };
            await MyRevisions.putMapping(mapping);

            const response = await bootstrapTest.client.indices.getMapping({
                index: `test_revisions_test_form`
            });
            expect(Object.values(response.body)[0].mappings.properties.test.type).to.equal(`text`);
        });

        afterEach(async () => {
            await _deleteIndex(`test_revisions_test_form`, uuid);
        });
    });

    describe(`getSettings`, () => {
        it(`gets settings of index`, async () => {
            const MyUsers = createClass(`users`).in(`test`);

            const settings = await MyUsers.getSettings();
            expect(settings).to.be.an(`object`);
            expect(settings.test_users).to.be.an(`object`);
            expect(settings.test_users.settings).to.be.an(`object`);
        });

        it(`gets settings of index with default settings included`, async () => {
            const MyUsers = createClass(`users`).in(`test`);

            const settings = await MyUsers.getSettings(true);
            expect(settings).to.be.an(`object`);
            expect(settings.test_users).to.be.an(`object`);
            expect(settings.test_users.settings).to.be.an(`object`);
            expect(settings.test_users.defaults).to.be.an(`object`);
        });

        it(`gets settings of multiple indexes`, async () => {
            const MyDocuments = createClass(`documents`).type(`*`);

            const settings = await MyDocuments.getSettings();
            expect(Object.keys(settings).length > 1);
        });
    });

    describe(`putSettings`, () => {
        const uuid = `abc123`;

        beforeEach(async () => {
            await _deleteIndex(`test_revisions_test_form`, uuid);
            await _createIndex(`test_revisions_test_form`, uuid);
        });

        it(`can't send empty settings`, async () => {
            const MyRevisions = createClass(`revisions`).type(`test_form`); //tenant is *

            await expect(MyRevisions.putSettings()).to.be.eventually.rejectedWith(`You have to specify settings object.`);
        });

        it(`puts settings to index`, async () => {
            const MyRevisions = createClass(`revisions`).in(`test`).type(`test_form`);

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
            await _deleteIndex(`test_revisions_test_form`, uuid);
        });
    });

    describe(`reindex`, () => {
        it(`can't reindex index without destination index specified`, async () => {
            const MyRevisionsSource = createClass(`revisions`).in(`test`).type(`from`);

            await expect(MyRevisionsSource.reindex()).to.be.eventually.rejectedWith(`You must specify destination model!`);
        });

        it(`can't reindex index with wildcard in source index`, async () => {
            const MyRevisionsSource = createClass(`revisions`).type(`from`); //tenant is *
            const MyRevisionsDestination = createClass(`revisions`).in(`test`).type(`to`);

            await expect(MyRevisionsSource.reindex(MyRevisionsDestination)).to.be.eventually.rejectedWith(`You cannot use 'reindex-source' with current tenant '*', full alias is '*_revisions_from'!`);
        });

        it(`can't reindex index with wildcard in destination index`, async () => {
            const MyRevisionsSource = createClass(`revisions`).in(`test`).type(`from`);
            const MyRevisionsDestination = createClass(`revisions`).type(`to`); //tenant is *

            await expect(MyRevisionsSource.reindex(MyRevisionsDestination)).to.be.eventually.rejectedWith(`You cannot use 'reindex-destination' with current tenant '*', full alias is '*_revisions_to'!`);
        });

        it(`reindexes models`, async () => {
            await bootstrapTest.client.indices.create({
                index: `test_revisions_from`
            });
            await bootstrapTest.client.indices.create({
                index: `test_revisions_to`
            });

            const MyRevisionsSource = createClass(`revisions`).in(`test`).type(`from`);
            const MyRevisionsDestination = createClass(`revisions`).in(`test`).type(`to`);

            await bootstrapTest.client.index({
                index: MyRevisionsSource._alias,
                id: `test`,
                body: {
                    status: `:)`
                },
                refresh: true
            });

            await MyRevisionsSource.reindex(MyRevisionsDestination);

            const results = await bootstrapTest.client.search({
                index: MyRevisionsDestination._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.hits.length).to.equal(1);
            expect(results.body.hits.hits[0]._index).to.equal(MyRevisionsDestination._alias);
            expect(results.body.hits.hits[0]._id).to.equal(`test`);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
        });

        afterEach(async () => {
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_revisions_from`
                });
            } catch (e) {
                //OK
            }
            try {
                await bootstrapTest.client.indices.delete({
                    index: `test_revisions_to`
                });
            } catch (e) {
                //OK
            }
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
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total.value).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves another data instance`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total.value).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves data instance with specified id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total.value).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(`myId`);
            expect(results.body.hits.hits[0]._version).not.to.be.undefined;
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves another data instance with specified id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const myInstance = new MyClass(void 0, `myId`);
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;
            await myInstance.save();
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._primary_term).not.to.be.undefined;
            expect(myInstance._seq_no).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total.value).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(`myId`);
            expect(results.body.hits.hits[0]._version).not.to.be.undefined;
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`resaves instance`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total.value).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(oldId);
            expect(results.body.hits.hits[0]._version).to.equal(myInstance._version);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:(`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves instance with specified version`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
            const MyClass = createClass(`users`, void 0).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();

            await bootstrapTest.client.index({
                index: MyClass._alias,
                id: myInstance._id,
                body: {
                    status: `:(`
                },
                refresh: true
            });

            await expect(myInstance.save(true)).to.be.eventually.rejectedWith(`version_conflict_engine_exception`);

        });

        it(`saves instance with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
            const MyClass = createClass(`users`, void 0).in(`test`);

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
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                id: `ok`,
                body: {
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
            const MyClass = createClass(`users`, void 0).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await expect(myInstance.delete()).to.be.eventually.rejectedWith(`Document has not been saved into ES yet.`);
        });

        it(`can't delete non-existing object with _id`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);
            await expect(myInstance.delete()).to.be.eventually.rejectedWith(`Response Error`);
        });

        it(`deletes instance`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total.value).to.equal(0);
        });

        it(`deletes instance with specified version`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();

            await myInstance.delete(true);

            const results = await bootstrapTest.client.search({
                index: MyClass._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total.value).to.equal(0);
        });

        it(`can't delete instance when sequence numbers are different`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();

            await bootstrapTest.client.index({
                index: MyClass._alias,
                id: myInstance._id,
                body: {
                    status: `:(`
                },
                refresh: true
            });

            await expect(myInstance.delete(true)).to.be.eventually.rejectedWith(`version_conflict_engine_exception`);

        });

        it(`deletes instance with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total.value).to.equal(0);
        });

        it(`can't delete with specified incorrect version and without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
            const MyClass = createClass(`users`, void 0).in(`test`);

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
            const MyClass = createClass(`users`, void 0).in(`test`);

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

    async function _createIndex(alias, uuid) {
        const indexParts = alias.split(`_`);
        indexParts[1] += `-${uuid}`;
        const index = indexParts.join(`_`);

        await bootstrapTest.client.indices.create({
            index: index
        });
        await bootstrapTest.client.indices.putAlias({
            index: index,
            name: alias,
            body: {
                is_write_index: true
            }
        });
    }

    async function _deleteIndex(alias, uuid) {
        const indexParts = alias.split(`_`);
        indexParts[1] += `-${uuid}`;
        const index = indexParts.join(`_`);

        try {
            await bootstrapTest.client.indices.delete({
                index: index
            });
        } catch (e) {
            //OK
        }
        try {
            await bootstrapTest.client.indices.deleteAlias({
                index: index,
                name: alias,
            });
        } catch (e) {
            //OK
        }
    }
});
