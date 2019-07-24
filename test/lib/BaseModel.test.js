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

            expect(myClass._fullIndex).to.equal(`default_myIndex_*`);
        });

        it(`creates new class with schema`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = model(`myIndex`, schema);
            expect(myClass._tenant).to.equal(`default`);
            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.equal(schema);
            expect(myClass._type).to.equal(`*`);

            expect(myClass._fullIndex).to.equal(`default_myIndex_*`);
        });

        it(`creates new class with schema and type`, async () => {
            const schema = Joi.object().keys({}).required();
            const myClass = model(`myIndex`, schema, `myType`);
            expect(myClass._tenant).to.equal(`default`);
            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.equal(schema);
            expect(myClass._type).to.equal(`myType`);

            expect(myClass._fullIndex).to.equal(`default_myIndex`);
        });

        it(`creates new class and rewrites tenant`, async () => {
            const schema = Joi.object().keys({}).required();
            const originalClass = model(`myIndex`, schema, `myType`);
            originalClass.myFunction = function () {
                return this._tenant;
            };
            originalClass.x = `:)`;
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._fullIndex).to.equal(`default_myIndex`);
            expect(originalClass.myFunction()).to.equal(`default`);

            const myClass = originalClass.in(`myTenant`);
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._fullIndex).to.equal(`default_myIndex`);
            expect(originalClass.myFunction()).to.equal(`default`);
            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._fullIndex).to.equal(`myTenant_myIndex`);
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
            expect(originalClass._fullIndex).to.equal(`default_myIndex_*`);

            const myClass = originalClass.in(`myTenant`).type(`myType`);
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._type).to.equal(`*`);
            expect(originalClass._fullIndex).to.equal(`default_myIndex_*`);
            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._type).to.equal(`myType`);
            expect(myClass._fullIndex).to.equal(`myTenant_myIndex_myType`);

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
            expect(originalClass._fullIndex).to.equal(`default_myIndex_*`);
            expect(originalClass.myFunction).not.to.be.undefined;
            expect(originalClass.myFunction()).to.equal(`*`);

            const myClass = originalClass.in(`myTenant`).type(`myType`);
            expect(originalClass._tenant).to.equal(`default`);
            expect(originalClass._type).to.equal(`*`);
            expect(originalClass._fullIndex).to.equal(`default_myIndex_*`);
            expect(originalClass.myFunction).not.to.be.undefined;
            expect(originalClass.myFunction()).to.equal(`*`);

            expect(myClass._tenant).to.equal(`myTenant`);
            expect(myClass._type).to.equal(`myType`);
            expect(myClass._fullIndex).to.equal(`myTenant_myIndex_myType`);
            expect(myClass.myFunction).not.to.be.undefined;
            expect(myClass.myFunction()).to.equal(`myType`);

            expect(myClass._index).to.equal(`myIndex`);
            expect(myClass.__schema).to.equal(schema);
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
                index: MyClass._fullIndex,
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
                index: MyClass._fullIndex,
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
                index: MyClass._fullIndex,
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
                index: MyClass._fullIndex,
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
                index: MyClass._fullIndex,
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
                index: MyClass._fullIndex,
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
            const MyClass = model(`users`, Joi.string(), `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await expect(myInstance.reload()).to.be.eventually.rejectedWith(`Document has not been saved into ES yet.`);
        });

        it(`can't reload non-existing object with _id`, async () => {
            const MyClass = model(`users`, Joi.string(), `user`).in(`test`);

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
                index: MyClass._fullIndex,
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
                index: MyClass._fullIndex,
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
                index: myInstance.constructor._fullIndex,
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
                index: MyClass._fullIndex,
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
