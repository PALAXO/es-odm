'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const { createClass, BulkArray, BaseModel } = require(`../../app`);

//It uses ES6 Circularo indices
describe(`BaseModel class`, function() {
    this.timeout(testTimeout);

    describe(`class preparations`, () => {
        it(`can't create class without index`, async () => {
            expect(() => createClass()).to.throw(`You have to specify an index.`);
        });

        it(`creates new class`, async () => {
            const myClass = createClass(`myIndex`);
            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass._tenant).to.equal(`default`);
            expect(myClass._type).to.equal(`*`);

            expect(myClass.__fullIndex).to.equal(`default_myIndex_*`);
        });

        it(`creates new class with schema`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = createClass(`myIndex`, schema);
            expect(myClass._tenant).to.equal(`default`);
            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
            expect(myClass._type).to.equal(`*`);

            expect(myClass.__fullIndex).to.equal(`default_myIndex_*`);
        });

        it(`creates new class with schema and type`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = createClass(`myIndex`, schema, `myType`);
            expect(myClass._tenant).to.equal(`default`);
            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
            expect(myClass._type).to.equal(`myType`);

            expect(myClass.__fullIndex).to.equal(`default_myIndex`);
        });

        it(`creates new class and rewrites tenant`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema, `myType`);
            originalClass.myFunction = function () {
                return this._tenant;
            };
            originalClass.x = `:)`;
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass.__fullIndex).to.equal(`default_myIndex`);
            expect(originalClass.myFunction()).to.equal(`default`);

            const myClass = originalClass.in(`myTenant`);
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass.__fullIndex).to.equal(`default_myIndex`);
            expect(originalClass.myFunction()).to.equal(`default`);
            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass.__fullIndex).to.equal(`myTenant_myIndex`);
            expect(myClass.myFunction()).to.equal(`myTenant`);

            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
            expect(myClass._type).to.equal(`myType`);
        });

        it(`creates new class and rewrites tenant and type`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._type).to.equal(`*`);
            expect(originalClass.__fullIndex).to.equal(`default_myIndex_*`);

            const myClass = originalClass.in(`myTenant`).type(`myType`);
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._type).to.equal(`*`);
            expect(originalClass.__fullIndex).to.equal(`default_myIndex_*`);
            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._type).to.equal(`myType`);
            expect(myClass.__fullIndex).to.equal(`myTenant_myIndex_myType`);

            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
        });

        it(`preserves user defined functions`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            originalClass.myFunction = function () {
                return this._type;
            };

            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._type).to.equal(`*`);
            expect(originalClass.__fullIndex).to.equal(`default_myIndex_*`);
            expect(originalClass.myFunction).not.to.be.undefined;
            expect(originalClass.myFunction()).to.equal(`*`);

            const myClass = originalClass.in(`myTenant`).type(`myType`);
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._type).to.equal(`*`);
            expect(originalClass.__fullIndex).to.equal(`default_myIndex_*`);
            expect(originalClass.myFunction).not.to.be.undefined;
            expect(originalClass.myFunction()).to.equal(`*`);

            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._type).to.equal(`myType`);
            expect(myClass.__fullIndex).to.equal(`myTenant_myIndex_myType`);
            expect(myClass.myFunction).not.to.be.undefined;
            expect(myClass.myFunction()).to.equal(`myType`);

            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
        });

        it(`preserves user redefined static function`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema);
            originalClass.find = function () {
                return `*`;
            };

            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._type).to.equal(`*`);
            expect(originalClass.__fullIndex).to.equal(`default_myIndex_*`);
            expect(originalClass.find).not.to.be.undefined;
            expect(originalClass.find()).to.equal(`*`);

            const myClass = originalClass.in(`myTenant`).type(`myType`);
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._type).to.equal(`*`);
            expect(originalClass.__fullIndex).to.equal(`default_myIndex_*`);
            expect(originalClass.find).not.to.be.undefined;
            expect(originalClass.find()).to.equal(`*`);

            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._type).to.equal(`myType`);
            expect(myClass.__fullIndex).to.equal(`myTenant_myIndex_myType`);
            expect(myClass.find).not.to.be.undefined;
            expect(myClass.find()).to.equal(`*`);

            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.deep.equal(schema);
        });

        it(`clones class`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = createClass(`myIndex`, schema).type(`myType`).in(`myTenant`);

            expect(originalClass._tenant).to.equal(`myTenant`);
            expect(originalClass._index).to.equal(`myIndex`);
            expect(originalClass._type).to.equal(`myType`);
            expect(originalClass.__fullIndex).to.equal(`myTenant_myIndex_myType`);
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
            clonedClass._index = `rewrittenIndex`;

            expect(originalClass._tenant).to.equal(`myTenant`);
            expect(originalClass._index).to.equal(`myIndex`);
            expect(originalClass._type).to.equal(`myType`);
            expect(originalClass.__fullIndex).to.equal(`myTenant_myIndex_myType`);
            expect(originalClass.newProperty).to.be.undefined;
            expect(originalClass.anotherProperty).to.be.undefined;
            expect(originalClass.newFunction).to.be.undefined;
            expect(originalClass.anotherFunction).to.be.undefined;

            expect(clonedClass._tenant).to.equal(`myTenant`);
            expect(clonedClass._index).to.equal(`rewrittenIndex`);
            expect(clonedClass._type).to.equal(`rewrittenType`);
            expect(clonedClass.__fullIndex).to.equal(`myTenant_rewrittenIndex_rewrittenType`);
            expect(clonedClass.newProperty).to.equal(`new`);
            expect(clonedClass.anotherProperty).to.equal(`another`);
            expect(clonedClass.newFunction()).to.equal(`newFunction`);
            expect(clonedClass.anotherFunction()).to.equal(`anotherFunction`);
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
                type: `user`,
                body: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                type: `user`,
                body: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            folderDocument1 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 2`
                },
                id: `2folder`,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents_d_default`,
                type: `d_default`,
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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const size = 35000;
            const bulk = [];
            for (let i = 0; i < size; i++) {
                bulk.push({
                    index: {
                        _index: MyClass.__fullIndex,
                        _type: MyClass.__esType,
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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.search(void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`searches with empty object`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.search({});

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(2);
            const possibleValues = [userObject1.body.name, userObject2.body.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);
            }
        });

        it(`searches with match_all`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(2);
            const possibleValues = [userObject1.body.name, userObject2.body.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);
            }
        });

        it(`searches for single entry`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            });

            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).not.to.be.undefined;
            expect(results[0].status).to.equal(userObject1.body.status);
            expect(results[0].name).to.equal(userObject1.body.name);
        });

        it(`searches using non existing property`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match: {
                        unknown: `whatever`
                    }
                }
            });

            expect(results.length).to.equal(0);
        });

        it(`searches for all documents`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(3);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`searches for folder documents only`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            });

            expect(results.length).to.equal(2);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(folderDocument1.type);
                await result.save();
            }
        });

        it(`searches without source fields`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, void 0, false);

            expect(results.length).to.equal(2);

            expect(results[0]._id).not.to.be.undefined;
            expect(results[0]._version).not.to.be.undefined;
            expect(results[0]._source).to.be.undefined;

            expect(results[1]._id).not.to.be.undefined;
            expect(results[1]._version).not.to.be.undefined;
            expect(results[1]._source).to.be.undefined;
        });

        it(`searches for specific field only`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match_all: {}
                }
            }, void 0, void 0, [`name`]);

            expect(results.length).to.equal(2);

            expect(results[0]._id).not.to.be.undefined;
            expect(results[0]._version).not.to.be.undefined;
            expect(results[0]._source).not.to.be.undefined;
            expect(results[0]._source.name).not.to.be.undefined;
            expect(results[0]._source.status).to.be.undefined;

            expect(results[1]._id).not.to.be.undefined;
            expect(results[1]._version).not.to.be.undefined;
            expect(results[1]._source).not.to.be.undefined;
            expect(results[1]._source.name).not.to.be.undefined;
            expect(results[1]._source.status).to.be.undefined;
        });

        it(`searches for documents with from parameter`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
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
                await result.save();
            }
        });

        it(`searches for documents with size parameter`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
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

        it(`searches for documents with from and size parameters`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
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
                type: `user`,
                body: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                type: `user`,
                body: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            folderDocument1 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 2`
                },
                id: `2folder`,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents_d_default`,
                type: `d_default`,
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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.findAll();

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(2);
            const possibleValues = [userObject1.body.name, userObject2.body.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);
            }
        });

        it(`finds all documents`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
            const results = await MyClass.findAll();

            expect(results.length).to.equal(3);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html, defaultDocument.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.not.equal(`*`);
                await result.save();
            }
        });

        it(`finds folder documents only`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
            const results = await MyClass.findAll();

            expect(results.length).to.equal(2);
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(folderDocument1.type);
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
                type: `user`,
                body: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                type: `user`,
                body: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            folderDocument1 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 2`
                },
                id: `2folder`,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents_d_default`,
                type: `d_default`,
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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.find()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find non-string id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.find(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.find([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't find not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const result = await MyClass.find(`unknown`);
            expect(result).to.deep.equal([]);
        });

        it(`can't find array with not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.find([`invalid`, `unknown`]);
            expect(results).to.be.an(`array`);
            expect(results.length).to.equal(0);
        });

        it(`finds given user entry`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const result = await MyClass.find(userObject1.id);

            expect(result).to.be.instanceOf(BulkArray);
            expect(result.length).to.equal(1);
            expect(result[0]._id).to.equal(userObject1.id);
            expect(result[0]._version).not.to.be.undefined;
            expect(result[0].name).to.equal(userObject1.body.name);
            expect(result[0].status).to.equal(userObject1.body.status);
        });

        it(`finds given user entry in array`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.find([userObject1.id]);

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).not.to.be.undefined;
            expect(results[0].name).to.equal(userObject1.body.name);
            expect(results[0].status).to.equal(userObject1.body.status);
        });

        it(`finds array of folder documents`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
            const results = await MyClass.find([folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [folderDocument1.id, folderDocument2.id];
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(folderDocument1.type);
                await result.save();
            }
        });

        it(`finds only existing ids from array`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
            const results = await MyClass.find([`unknown`, folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [folderDocument1.id, folderDocument2.id];
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(folderDocument1.type);
                await result.save();
            }
        });

        it(`finds array of folder documents without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
            const results = await MyClass.find([folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [folderDocument1.id, folderDocument2.id];
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(folderDocument1.type);
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
                type: `user`,
                body: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                type: `user`,
                body: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            folderDocument1 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 2`
                },
                id: `2folder`,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents_d_default`,
                type: `d_default`,
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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.get()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get non-string id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.get(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.get([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't get without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
            await expect(MyClass.get([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'get' with current type!`);
        });

        it(`can't get not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.get(`unknown`)).to.be.eventually.rejectedWith(`Response Error`);
        });

        it(`can't get array with not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.get([userObject1.id, `unknown`])).to.be.eventually.rejectedWith(`Response Error`);
        });

        it(`gets given user entry`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const result = await MyClass.get(userObject1.id);
            expect(result).to.be.instanceOf(BaseModel);

            expect(result._id).to.equal(userObject1.id);
            expect(result._version).not.to.be.undefined;
            expect(result.name).to.equal(userObject1.body.name);
            expect(result.status).to.equal(userObject1.body.status);
        });

        it(`gets given user entry in array`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.get([userObject1.id]);

            expect(results).to.be.instanceOf(BulkArray);
            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0]._version).not.to.be.undefined;
            expect(results[0].name).to.equal(userObject1.body.name);
            expect(results[0].status).to.equal(userObject1.body.status);
        });

        it(`gets array of folder documents`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
            const results = await MyClass.get([folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            const possibleIds = [folderDocument1.id, folderDocument2.id];
            const possibleValues = [folderDocument1.body.html, folderDocument2.body.html];
            for (const result of results) {
                expect(possibleIds).to.include(result._id);
                expect(result._version).not.to.be.undefined;
                expect(possibleValues).to.include(result.html);

                //correct type and can save
                expect(result.constructor._type).to.equal(folderDocument1.type);
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
                type: `user`,
                body: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                type: `user`,
                body: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            folderDocument1 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 2`
                },
                id: `2folder`,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents_d_default`,
                type: `d_default`,
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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.delete()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete non-string id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.delete(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.delete([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't delete without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
            await expect(MyClass.delete([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'delete' with current type!`);
        });

        it(`can't delete not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const result = await MyClass.delete(`unknown`);

            expect(result.items[0].delete.status).to.equal(404);
        });

        it(`deletes given user entry`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const result = await MyClass.delete(userObject1.id);

            expect(result.items[0].delete.status).to.equal(200);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                type: userObject1.type,
                id: userObject1.id
            });
            expect(exists.body).to.be.false;
        });

        it(`deletes given user entry in array`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.delete([userObject1.id]);

            expect(results.items[0].delete.status).to.equal(200);

            const exists = await bootstrapTest.client.exists({
                index: userObject1.index,
                type: userObject1.type,
                id: userObject1.id
            });
            expect(exists.body).to.be.false;
        });

        it(`deletes array of folder documents`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
            const results = await MyClass.delete([folderDocument1.id, folderDocument2.id]);

            expect(results.items[0].delete.status).to.equal(200);
            expect(results.items[1].delete.status).to.equal(200);

            const exists1 = await bootstrapTest.client.exists({
                index: folderDocument1.index,
                type: folderDocument1.type,
                id: folderDocument1.id
            });
            expect(exists1.body).to.be.false;

            const exists2 = await bootstrapTest.client.exists({
                index: folderDocument2.index,
                type: folderDocument2.type,
                id: folderDocument2.id
            });
            expect(exists2.body).to.be.false;
        });

        it(`deletes only existing entries from given array`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
            const results = await MyClass.delete([`not`, folderDocument1.id, folderDocument2.id, `existing`]);

            expect(results.items[0].delete.status).to.equal(404);
            expect(results.items[1].delete.status).to.equal(200);
            expect(results.items[2].delete.status).to.equal(200);
            expect(results.items[3].delete.status).to.equal(404);

            const exists1 = await bootstrapTest.client.exists({
                index: folderDocument1.index,
                type: folderDocument1.type,
                id: folderDocument1.id
            });
            expect(exists1.body).to.be.false;

            const exists2 = await bootstrapTest.client.exists({
                index: folderDocument2.index,
                type: folderDocument2.type,
                id: folderDocument2.id
            });
            expect(exists2.body).to.be.false;
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
                type: `user`,
                body: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                type: `user`,
                body: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            folderDocument1 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 2`
                },
                id: `2folder`,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents_d_default`,
                type: `d_default`,
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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.exists()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check non-string id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.exists(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.exists([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't check without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
            await expect(MyClass.exists([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'exists' with current type!`);
        });

        it(`checks not-existing id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const result = await MyClass.exists(`unknown`);

            expect(result).to.be.false;
        });

        it(`checks given user entry`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const result = await MyClass.exists(userObject1.id);

            expect(result).to.be.true;
        });

        it(`checks given user entry in array`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.exists([userObject1.id]);

            expect(results.length).to.equal(1);
            expect(results[0]).to.be.true;
        });

        it(`checks array of folder documents`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
            const results = await MyClass.exists([folderDocument1.id, folderDocument2.id]);

            expect(results.length).to.equal(2);
            expect(results[0]).to.be.true;
            expect(results[1]).to.be.true;
        });

        it(`checks only existing entries from given array`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`).type(`folder`);
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
                type: `user`,
                body: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `test_users`,
                type: `user`,
                body: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            folderDocument1 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 2`
                },
                id: `2folder`,
                refresh: true
            };
            defaultDocument = {
                index: `test_documents_d_default`,
                type: `d_default`,
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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.update()).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update non-string id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.update(5)).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update array of non-string ids`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.update([5, void 0, `:)`])).to.be.eventually.rejectedWith(`You must specify string ID or array of string IDs!`);
        });

        it(`can't update without specifying type`, async () => {
            const MyClass = createClass(`documents`, void 0).in(`test`);
            await expect(MyClass.update([folderDocument1.id, folderDocument2.id])).to.be.eventually.rejectedWith(`You cannot use 'update' with current type!`);
        });

        it(`can't update without body specified`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.update(`ok`, void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`updates data instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`test`).type(`folder`);

            const result = await DocumentClass.update([`1folder`, `2folder`], {
                doc: {
                    documentTitle: `:)`
                }
            });

            expect(result.items[0].update.status).to.equal(200);
            expect(result.items[1].update.status).to.equal(200);

            const results1 = await bootstrapTest.client.get({
                index: folderDocument1.index,
                type: folderDocument1.type,
                id: folderDocument1.id
            });
            expect(results1.body._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: folderDocument2.index,
                type: folderDocument2.type,
                id: folderDocument2.id
            });
            expect(results2.body._source.documentTitle).to.equal(`:)`);
        });

        it(`can't update incorrect instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`test`).type(`folder`);

            const result = await DocumentClass.update([`1folder`, `2folder`], {
                doc: {
                    name: `:)`
                }
            });

            expect(result.items[0].update.status).to.equal(400);
            expect(result.items[1].update.status).to.equal(400);

            const results1 = await bootstrapTest.client.get({
                index: folderDocument1.index,
                type: folderDocument1.type,
                id: folderDocument1.id
            });
            expect(results1.body._source.name).to.be.undefined;

            const results2 = await bootstrapTest.client.get({
                index: folderDocument2.index,
                type: folderDocument2.type,
                id: folderDocument2.id
            });
            expect(results2.body._source.name).to.be.undefined;
        });
    });

    describe(`static updateByQuery()`, () => {
        let folderDocument1;
        let folderDocument2;

        beforeEach(async () => {
            folderDocument1 = {
                index: `test_documents_folder`,
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
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
            const DocumentClass = createClass(`documents`).in(`test`).type(`folder`);

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
                type: folderDocument1.type,
                id: folderDocument1.id
            });
            expect(results1.body._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: folderDocument2.index,
                type: folderDocument2.type,
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
                type: `folder`,
                body: {
                    html: `folder 1`
                },
                id: `1folder`,
                refresh: true
            };
            folderDocument2 = {
                index: `test_documents_folder`,
                type: `folder`,
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
            const DocumentClass = createClass(`documents`).in(`test`).type(`folder`);

            const result = await DocumentClass.deleteByQuery({
                query: {
                    match_all: {}
                }
            });
            expect(result.deleted).to.equal(2);

            const results1 = await bootstrapTest.client.exists({
                index: folderDocument1.index,
                type: folderDocument1.type,
                id: folderDocument1.id
            });
            expect(results1.body).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: folderDocument2.index,
                type: folderDocument2.type,
                id: folderDocument2.id
            });
            expect(results2.body).to.be.false;
        });
    });

    describe(`save()`, () => {
        it(`can't save invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.object({ status: Joi.array() }), `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            expect(myInstance).to.be.instanceOf(BaseModel);
            await expect(myInstance.save()).to.be.eventually.rejectedWith(`child "status" fails because ["status" must be an array]. "name" is not allowed. "fullname" is not allowed`);
        });

        it(`can't save another invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.string(), `user`).in(`test`);

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
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;
            expect(myInstance._version).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves another data instance`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const myInstance = new MyClass();
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;
            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;
            expect(myInstance._version).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves data instance with specified id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);
            await myInstance.save();

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(`myId`);
            expect(results.body.hits.hits[0]._version).not.to.be.undefined;
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves another data instance with specified id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const myInstance = new MyClass(void 0, `myId`);
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;
            await myInstance.save();

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(`myId`);
            expect(results.body.hits.hits[0]._version).not.to.be.undefined;
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`resaves instance`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const myInstance = new MyClass();
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;

            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;
            expect(myInstance._version).not.to.be.undefined;
            const newId = myInstance._id;
            const newVersion = myInstance._version;

            myInstance.status = `:(`;
            await myInstance.save();
            expect(myInstance._id).to.equal(newId);
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance._version).to.not.equal(newVersion);

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(newId);
            expect(results.body.hits.hits[0]._version).to.equal(myInstance._version);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:(`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });
    });

    describe(`delete()`, () => {
        it(`can't delete non-existing object without _id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await expect(myInstance.delete()).to.be.eventually.rejectedWith(`Document has not been saved into ES yet.`);
        });

        it(`can't delete non-existing object with _id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);
            await expect(myInstance.delete()).to.be.eventually.rejectedWith(`Response Error`);
        });

        it(`deletes instance`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

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
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                version: true
            });
            expect(results.body.hits.total).to.equal(0);
        });
    });

    describe(`clone()`, () => {
        it(`clones instance`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `ok`);
            await myInstance.save();
            const clone = myInstance.clone();

            expect(clone._id).to.be.undefined;
            expect(clone._version).to.be.undefined;
            expect(clone.status).to.equal(data.status);
            expect(clone.name).to.equal(data.name);
            expect(clone.fullname).to.equal(data.fullname);

            myInstance.status = `:(`;
            clone.name = `xyz`;

            expect(myInstance._id).to.equal(`ok`);
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance.status).to.equal(`:(`);
            expect(myInstance.name).to.equal(`abc`);
            expect(myInstance.fullname).to.equal(`abc def`);

            expect(clone._id).to.be.undefined;
            expect(clone._version).to.be.undefined;
            expect(clone.status).to.equal(`:)`);
            expect(clone.name).to.equal(`xyz`);
            expect(clone.fullname).to.equal(`abc def`);
        });

        it(`clones instance and sets new id`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `ok`);
            await myInstance.save();
            const clone = myInstance.clone(`ko`);

            expect(clone._id).to.equal(`ko`);
            expect(clone._version).to.be.undefined;
            expect(clone.status).to.equal(data.status);
            expect(clone.name).to.equal(data.name);
            expect(clone.fullname).to.equal(data.fullname);

            myInstance.status = `:(`;
            clone.name = `xyz`;

            expect(myInstance._id).to.equal(`ok`);
            expect(myInstance._version).not.to.be.undefined;
            expect(myInstance.status).to.equal(`:(`);
            expect(myInstance.name).to.equal(`abc`);
            expect(myInstance.fullname).to.equal(`abc def`);

            expect(clone._id).to.equal(`ko`);
            expect(clone._version).to.be.undefined;
            expect(clone.status).to.equal(`:)`);
            expect(clone.name).to.equal(`xyz`);
            expect(clone.fullname).to.equal(`abc def`);
        });
    });
});
