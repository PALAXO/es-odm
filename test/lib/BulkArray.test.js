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

            await expect(emptyArray.save()).to.be.eventually.rejectedWith(`No items to send!`);
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
            await bulk.save();

            expect(myInstance1._id).not.to.be.undefined;
            const results1 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance1._id
            });
            expect(results1.body._source.status).to.equal(data1.status);
            expect(results1.body._source.name).to.equal(data1.name);
            expect(results1.body._source.fullname).to.equal(data1.fullname);

            expect(myInstance2._id).not.to.be.undefined;
            const results2 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance2._id
            });
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
            await bulk.save();

            expect(myInstance1._id).not.to.be.undefined;
            const results1 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance1._id
            });
            expect(results1.body._id).to.equal(`first`);
            expect(results1.body._source.status).to.equal(data1.status);
            expect(results1.body._source.name).to.equal(data1.name);
            expect(results1.body._source.fullname).to.equal(data1.fullname);

            expect(myInstance2._id).not.to.be.undefined;
            const results2 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance2._id
            });
            expect(results2.body._source.status).to.equal(data2.status);
            expect(results2.body._source.name).to.equal(data2.name);
            expect(results2.body._source.fullname).to.equal(data2.fullname);

            expect(myInstance3._id).not.to.be.undefined;
            const results3 = await bootstrapTest.client.get({
                index: MyClass.__fullIndex,
                type: MyClass._type,
                id: myInstance3._id
            });
            expect(results3.body._id).to.equal(`third`);
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
            await bulk.save(true);

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

            expect(results.length).to.equal(3);
            expect(results[0]).to.be.true;
            expect(results[1]).to.be.true;
            expect(results[2]).to.be.true;

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

            expect(results.length).to.equal(3);
            expect(results[0]).to.be.true;
            expect(results[1]).to.be.false;
            expect(results[2]).to.be.false;

            const results1 = await bootstrapTest.client.exists({
                index: myInstance1.constructor.__fullIndex,
                type: myInstance1.constructor._type,
                id: myInstance1._id
            });
            expect(results1.body).to.be.false;
        });
    });
});
