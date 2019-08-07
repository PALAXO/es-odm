'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const { createClass, BulkArray } = require(`../../app`);

//It uses ES6 Circularo indices
describe(`BulkArray class`, function() {
    this.timeout(testTimeout);

    describe(`class preparations`, () => {
        it(`works like array`, () => {
            const bulk = new BulkArray(`1`, `2`);
            expect(bulk).to.be.instanceOf(Array);

            expect(bulk.length).to.equal(2);
            expect(bulk[0]).to.equal(`1`);
            expect(bulk[1]).to.equal(`2`);

            bulk.push(`3`);
            expect(bulk.length).to.equal(3);
            expect(bulk[0]).to.equal(`1`);
            expect(bulk[1]).to.equal(`2`);
            expect(bulk[2]).to.equal(`3`);

            const returned = bulk.pop();
            expect(returned).to.equal(`3`);
            expect(bulk.length).to.equal(2);
            expect(bulk[0]).to.equal(`1`);
            expect(bulk[1]).to.equal(`2`);
        });
    });

    describe(`save()`, () => {
        it(`can't save empty array`, async () => {
            const emptyArray = new BulkArray();
            await expect(emptyArray.save()).to.be.eventually.rejectedWith(`Array is empty!`);
        });

        it(`can't save array without BaseModel instance`, async () => {
            const emptyArray = new BulkArray(`:)`, `:(`);
            emptyArray.push(5);

            await expect(emptyArray.save()).to.be.eventually.rejectedWith(`Incorrect item type at index 0!`);
        });

        it(`can't save invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.string(), `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);

            const bulk = new BulkArray(myInstance);
            await expect(bulk.save()).to.be.eventually.rejectedWith(`"value" must be a string`);
        });

        it(`can't save valid and invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.object().keys({ field: Joi.any().required() }), `user`).in(`test`);

            const data1 = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance1 = new MyClass(data1, `myId1`);

            const data2 = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`,
                field: `myField`
            };
            const myInstance2 = new MyClass(data2, `myId2`);

            const bulk = new BulkArray(myInstance1, myInstance2);
            await expect(bulk.save()).to.be.eventually.rejectedWith(`child "field" fails because ["field" is required]`);
        });

        it(`saves data instances`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const data1 = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance1 = new MyClass(data1);

            const data2 = {
                status: `:(`,
                name: `cde`,
                fullname: `cde xyz`
            };
            const myInstance2 = new MyClass(data2);

            const bulk = new BulkArray(myInstance1, myInstance2);
            const result = await bulk.save(true);

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(2);
            expect(result.items[0].index.result).to.equal(`created`);
            expect(result.items[1].index.result).to.equal(`created`);

            expect(myInstance1._id).not.to.be.undefined;
            expect(myInstance1._version).not.to.be.undefined;
            const results1 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance1._id
            });
            expect(results1.body._version).to.equal(myInstance1._version);
            expect(results1.body._source.status).to.equal(data1.status);
            expect(results1.body._source.name).to.equal(data1.name);
            expect(results1.body._source.fullname).to.equal(data1.fullname);

            expect(myInstance2._id).not.to.be.undefined;
            expect(myInstance2._version).not.to.be.undefined;
            const results2 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance2._id
            });
            expect(results2.body._version).to.equal(myInstance2._version);
            expect(results2.body._source.status).to.equal(data2.status);
            expect(results2.body._source.name).to.equal(data2.name);
            expect(results2.body._source.fullname).to.equal(data2.fullname);

            expect(myInstance1._id).to.not.equal(myInstance2._id);
        });

        it(`saves data instance with some ids specified and saved`, async () => {
            const MyClass = createClass(`users`, void 0, `user`).in(`test`);

            const data1 = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance1 = new MyClass(data1, `first`);
            await myInstance1.save();

            const data2 = {
                status: `:(`,
                name: `cde`,
                fullname: `cde xyz`
            };
            const myInstance2 = new MyClass(data2);

            const data3 = {
                status: `:O`,
                name: `xyz`,
                fullname: `xyz xxx`
            };
            const myInstance3 = new MyClass(data3, `third`);

            const bulk = new BulkArray(myInstance1, myInstance2, myInstance3);
            const result = await bulk.save(true);

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(3);
            expect(result.items[0].index.result).to.equal(`updated`);
            expect(result.items[1].index.result).to.equal(`created`);
            expect(result.items[2].index.result).to.equal(`created`);

            expect(myInstance1._id).not.to.be.undefined;
            expect(myInstance1._version).not.to.be.undefined;
            const results1 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance1._id
            });
            expect(results1.body._id).to.equal(`first`);
            expect(results1.body._version).to.equal(myInstance1._version);
            expect(results1.body._source.status).to.equal(data1.status);
            expect(results1.body._source.name).to.equal(data1.name);
            expect(results1.body._source.fullname).to.equal(data1.fullname);

            expect(myInstance2._id).not.to.be.undefined;
            expect(myInstance2._version).not.to.be.undefined;
            const results2 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance2._id
            });
            expect(results2.body._version).to.equal(myInstance2._version);
            expect(results2.body._source.status).to.equal(data2.status);
            expect(results2.body._source.name).to.equal(data2.name);
            expect(results2.body._source.fullname).to.equal(data2.fullname);

            expect(myInstance3._id).not.to.be.undefined;
            expect(myInstance3._version).not.to.be.undefined;
            const results3 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance3._id
            });
            expect(results3.body._id).to.equal(`third`);
            expect(results3.body._version).to.equal(myInstance3._version);
            expect(results3.body._source.status).to.equal(data3.status);
            expect(results3.body._source.name).to.equal(data3.name);
            expect(results3.body._source.fullname).to.equal(data3.fullname);
        });

        it(`forces to save invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.string(), `user`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);

            const bulk = new BulkArray(myInstance);
            const result = await bulk.save(true);

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(1);
            expect(result.items[0].index.result).to.equal(`created`);

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
            expect(results.body.hits.hits[0]._version).to.equal(myInstance._version);
            expect(results.body.hits.hits[0]._source.status).to.equal(`:)`);
            expect(results.body.hits.hits[0]._source.name).to.equal(`abc`);
            expect(results.body.hits.hits[0]._source.fullname).to.equal(`abc def`);
        });

        it(`can't save ES invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.string(), `user`).in(`test`);

            const data = {
                unknown: true
            };
            const myInstance = new MyClass(data, `myId`);

            const bulk = new BulkArray(myInstance);
            const result = await bulk.save(true);

            expect(result.errors).to.be.true;
            expect(result.items.length).to.equal(1);
            expect(result.items[0].index.status).to.equal(400);

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

    describe(`delete()`, () => {
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

        it(`can't delete empty array`, async () => {
            const emptyArray = new BulkArray();
            await expect(emptyArray.delete()).to.be.eventually.rejectedWith(`Array is empty!`);
        });

        it(`deletes data instances`, async () => {
            const UserClass = createClass(`users`, void 0, `user`).in(`test`);
            const DocumentClass = createClass(`documents`).in(`test`);

            const myInstance1 = await UserClass.get(`ok`);
            const myInstance2 = await DocumentClass.find(`1folder`);
            const myInstance3 = await DocumentClass.find(`2folder`);

            const bulk = new BulkArray(myInstance1, myInstance2, myInstance3);
            const results = await bulk.delete();

            expect(results.errors).to.be.false;
            expect(results.items.length).to.equal(3);
            expect(results.items[0].delete.result).to.equal(`deleted`);
            expect(results.items[1].delete.result).to.equal(`deleted`);
            expect(results.items[2].delete.result).to.equal(`deleted`);

            const results1 = await bootstrapTest.client.exists({
                index: myInstance1.constructor.__fullIndex,
                type: myInstance1.constructor._type,
                id: myInstance1._id
            });
            expect(results1.body).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: myInstance2.constructor.__fullIndex,
                type: myInstance2.constructor._type,
                id: myInstance2._id
            });
            expect(results2.body).to.be.false;

            const results3 = await bootstrapTest.client.exists({
                index: myInstance3.constructor.__fullIndex,
                type: myInstance3.constructor._type,
                id: myInstance3._id
            });
            expect(results3.body).to.be.false;
        });

        it(`deletes only correct and saved data instances`, async () => {
            const UserClass = createClass(`users`, void 0, `user`).in(`test`);

            const myInstance1 = await UserClass.get(`ok`);
            const myInstance2 = new UserClass({}, `invalid`);

            const bulk = new BulkArray(myInstance1, myInstance2, `incorrect`);
            const results = await bulk.delete();

            expect(results.errors).to.be.true;
            expect(results.items.length).to.equal(3);
            expect(results.items[0].delete.result).to.equal(`deleted`);
            expect(results.items[1].delete.result).to.equal(`not_found`);
            expect(results.items[2].delete.status).to.equal(404);

            const results1 = await bootstrapTest.client.exists({
                index: myInstance1.constructor.__fullIndex,
                type: myInstance1.constructor._type,
                id: myInstance1._id
            });
            expect(results1.body).to.be.false;
        });
    });

    describe(`update()`, () => {
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

        it(`can't update empty array`, async () => {
            const emptyArray = new BulkArray();
            await expect(emptyArray.update({})).to.be.eventually.rejectedWith(`Array is empty!`);
        });

        it(`can't update without body specified`, async () => {
            const emptyArray = new BulkArray();
            await expect(emptyArray.update(void 0)).to.be.eventually.rejectedWith(`Body must be an object!`);
        });

        it(`updates data instances`, async () => {
            const DocumentClass = createClass(`documents`).in(`test`);

            const myInstance1 = await DocumentClass.find(`1folder`);
            const myInstance2 = await DocumentClass.find(`2folder`);

            const bulk = new BulkArray(myInstance1, myInstance2);
            const result = await bulk.update({
                doc: {
                    documentTitle: `:)`
                }
            });

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(2);
            expect(result.items[0].update.result).to.equal(`updated`);
            expect(result.items[1].update.result).to.equal(`updated`);

            const results1 = await bootstrapTest.client.get({
                index: myInstance1.constructor.__fullIndex,
                type: myInstance1.constructor._type,
                id: myInstance1._id
            });
            expect(results1.body._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: myInstance2.constructor.__fullIndex,
                type: myInstance2.constructor._type,
                id: myInstance2._id
            });
            expect(results2.body._source.documentTitle).to.equal(`:)`);
        });

        it(`updates only correct instances`, async () => {
            const UserClass = createClass(`users`, void 0, `user`).in(`test`);
            const DocumentClass = createClass(`documents`).in(`test`);

            const myInstance1 = await DocumentClass.find(`1folder`);
            const myInstance2 = await DocumentClass.find(`2folder`);
            const myInstance3 = await UserClass.get(`ok`);

            const bulk = new BulkArray(myInstance1, myInstance2, myInstance3);
            const result = await bulk.update({
                doc: {
                    documentTitle: `:)`
                }
            });

            expect(result.errors).to.be.true;
            expect(result.items.length).to.equal(3);
            expect(result.items[0].update.result).to.equal(`updated`);
            expect(result.items[1].update.result).to.equal(`updated`);
            expect(result.items[2].update.status).to.equal(400);

            const results1 = await bootstrapTest.client.get({
                index: myInstance1.constructor.__fullIndex,
                type: myInstance1.constructor._type,
                id: myInstance1._id
            });
            expect(results1.body._source.documentTitle).to.equal(`:)`);

            const results2 = await bootstrapTest.client.get({
                index: myInstance2.constructor.__fullIndex,
                type: myInstance2.constructor._type,
                id: myInstance2._id
            });
            expect(results2.body._source.documentTitle).to.equal(`:)`);
        });
    });
});