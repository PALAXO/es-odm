'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const model = require(`../../app`);

//TODO - maybe prepare ES test indices, now I use Circularo...
describe(`BaseModel class`, function() {
    this.timeout(testTimeout);

    describe(`class preparations`, () => {
        it(`can't create class without index`, async () => {
            expect(() => model()).to.throw(`You have to specify index.`);
        });

        it(`creates new class`, async () => {
            const myClass = model(`myIndex`);
            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass._tenant).to.equal(`default`);
            expect(myClass._type).to.equal(`*`);

            expect(myClass.__fullIndex).to.equal(`default_myIndex_*`);
        });

        it(`creates new class with schema`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = model(`myIndex`, schema);
            expect(myClass._tenant).to.equal(`default`);
            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.equal(schema);
            expect(myClass._type).to.equal(`*`);

            expect(myClass.__fullIndex).to.equal(`default_myIndex_*`);
        });

        it(`creates new class with schema and type`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = model(`myIndex`, schema, `myType`);
            expect(myClass._tenant).to.equal(`default`);
            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.equal(schema);
            expect(myClass._type).to.equal(`myType`);

            expect(myClass.__fullIndex).to.equal(`default_myIndex`);
        });

        it(`creates new class and rewrites tenant`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = model(`myIndex`, schema, `myType`);
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
            expect(myClass.__schema).to.equal(schema);
            expect(myClass._type).to.equal(`myType`);
        });

        it(`creates new class and rewrites tenant and type`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = model(`myIndex`, schema);
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
            expect(myClass.__schema).to.equal(schema);
        });

        it(`preserves user defined functions`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = model(`myIndex`, schema);
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
            expect(myClass.__schema).to.equal(schema);
        });

        it(`preserves user redefined static function`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = model(`myIndex`, schema);
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
            expect(myClass.__schema).to.equal(schema);
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

        it(`searches with incorrect body`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);
            await expect(MyClass.search(void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`searches with empty object`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.search({});

            expect(results.length).to.equal(2);
            const possibleValues = [userObject1.body.name, userObject2.body.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);
            }
        });

        it(`searches with match_all`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);
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
            const MyClass = model(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.search({
                query: {
                    match: {
                        status: `:)`
                    }
                }
            });

            expect(results.length).to.equal(1);
            expect(results[0]._id).to.equal(userObject1.id);
            expect(results[0].status).to.equal(userObject1.body.status);
            expect(results[0].name).to.equal(userObject1.body.name);
        });

        it(`searches using non existing property`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);
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
            const MyClass = model(`documents`, void 0).in(`test`);
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
            const MyClass = model(`documents`, void 0).in(`test`).type(`folder`);
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

        it(`searches for all user entries`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);
            const results = await MyClass.findAll();

            expect(results.length).to.equal(2);
            const possibleValues = [userObject1.body.name, userObject2.body.name];
            for (const result of results) {
                expect(possibleValues).to.include(result.name);
            }
        });

        it(`searches for all documents`, async () => {
            const MyClass = model(`documents`, void 0).in(`test`);
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

        it(`searches for folder documents only`, async () => {
            const MyClass = model(`documents`, void 0).in(`test`).type(`folder`);
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

    describe(`save()`, () => {
        it(`can't save invalid data`, async () => {
            const MyClass = model(`users`, Joi.string(), `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await expect(myInstance.save()).to.be.eventually.rejectedWith(`"value" must be a string`);
        });

        it(`saves data instance`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves another data instance`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

            const myInstance = new MyClass();
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;
            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves data instance with specified id`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

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
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(`myId`);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`saves another data instance with specified id`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

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
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(`myId`);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`forces to save invalid data`, async () => {
            const MyClass = model(`users`, Joi.string(), `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);
            await myInstance.save(true);

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(`myId`);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`resaves instance`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

            const myInstance = new MyClass();
            myInstance.status = `:)`;
            myInstance.name = `abc`;
            myInstance.fullname = `abc def`;

            await myInstance.save();
            expect(myInstance._id).not.to.be.undefined;
            const newId = myInstance._id;

            myInstance.status = `:(`;
            await myInstance.save();
            expect(myInstance._id).to.equal(newId);

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._id).to.equal(newId);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:(`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });
    });

    describe(`reload()`, () => {
        it(`can't reload non-existing object without _id`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await expect(myInstance.reload()).to.be.eventually.rejectedWith(`Document has not been saved into ES yet.`);
        });

        it(`can't reload non-existing object with _id`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);
            await expect(myInstance.reload()).to.be.eventually.rejectedWith(`Response Error`);
        });

        it(`reloads instance`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();
            const id = myInstance._id;

            await myInstance.reload();
            expect(myInstance._id).to.equal(id);
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
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`reloads instance and drops made changes`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();
            const id = myInstance._id;

            myInstance.staus = `:(`;
            myInstance.name = `XYZ`;
            myInstance.unknown = `known`;

            await myInstance.reload();
            expect(myInstance._id).to.equal(id);
            expect(myInstance.status).to.equal(`:)`);
            expect(myInstance.name).to.equal(`abc`);
            expect(myInstance.fullname).to.equal(`abc def`);
            expect(myInstance.unknown).to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`reloads instance and loads changes from ES`, async () => {
            const MyClass = model(`users`, void 0, `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();
            const id = myInstance._id;

            myInstance.staus = `:(`;
            myInstance.name = `XYZ`;
            myInstance.unknown = `known`;

            await bootstrapTest.client.index({
                index: myInstance.constructor.__fullIndex,
                type: myInstance.constructor._type,
                id: id,
                body: {
                    status: `OK`,
                    name: `Alpha`,
                    fullname: `Alpha Beta`
                },
                refresh: true
            });

            await myInstance.reload();
            expect(myInstance._id).to.equal(id);
            expect(myInstance.status).to.equal(`OK`);
            expect(myInstance.name).to.equal(`Alpha`);
            expect(myInstance.fullname).to.equal(`Alpha Beta`);
            expect(myInstance.unknown).to.be.undefined;

            const results = await bootstrapTest.client.search({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                body: {
                    query: {
                        match_all: {}
                    }
                }
            });
            expect(results.body.hits.total).to.equal(1);
            expect(results.body.hits.hits[0]._source.status).to.equal(`OK`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`Alpha`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`Alpha Beta`);
        });
    });
});
