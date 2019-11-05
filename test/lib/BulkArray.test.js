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
            await expect(bulk.save()).to.be.eventually.rejectedWith(`"field" is required. "status" is not allowed. "name" is not allowed. "fullname" is not allowed`);
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
            const result = await bulk.save(false);

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
            const result = await bulk.save(false);

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

        it(`deletes data instances`, async () => {
            const UserClass = createClass(`users`, void 0, `user`).in(`test`);
            const DocumentClass = createClass(`documents`).in(`test`);

            const myInstance1 = await UserClass.get(`ok`);
            const myInstance2 = (await DocumentClass.find(`1folder`))[0];
            const myInstance3 = (await DocumentClass.find(`2folder`))[0];

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

    describe(`functional tests`, () => {
        it(`Bulk status test`, async () => {
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
            const payload1 = bulk.payload(myInstance1);
            payload1.pay = `load`;
            payload1.load = `pay`;

            //=====================
            let status = bulk.status;
            expect(status[myInstance1.__uuid].id).to.equal(myInstance1._id);
            expect(status[myInstance1.__uuid].status).to.be.undefined;
            expect(status[myInstance1.__uuid].payload.pay).to.equal(`load`);
            expect(status[myInstance1.__uuid].payload.load).to.equal(`pay`);

            expect(status[myInstance2.__uuid].id).to.be.undefined;
            expect(status[myInstance2.__uuid].status).to.be.undefined;

            expect(status[myInstance3.__uuid].id).to.equal(myInstance3._id);
            expect(status[myInstance3.__uuid].status).to.be.undefined;

            //=====================
            await bulk.save(false);

            status = bulk.status;
            expect(status[myInstance1.__uuid].id).to.equal(myInstance1._id);
            expect(status[myInstance1.__uuid].status).to.equal(200);
            expect(status[myInstance1.__uuid].payload.pay).to.equal(`load`);
            expect(status[myInstance1.__uuid].payload.load).to.equal(`pay`);

            expect(status[myInstance2.__uuid].id).to.equal(myInstance2._id);
            expect(status[myInstance2.__uuid].status).to.equal(201);

            expect(status[myInstance3.__uuid].id).to.equal(myInstance3._id);
            expect(status[myInstance3.__uuid].status).to.equal(201);

            //=====================
            bulk.reject(myInstance1, 500, `Velky spatny`);
            payload1.pay = `toWin`;

            status = bulk.status;
            expect(status[myInstance1.__uuid].id).to.equal(myInstance1._id);
            expect(status[myInstance1.__uuid].status).to.equal(500);
            expect(status[myInstance1.__uuid].message).to.equal(`Velky spatny`);
            expect(status[myInstance1.__uuid].payload.pay).to.equal(`toWin`);
            expect(status[myInstance1.__uuid].payload.load).to.equal(`pay`);

            expect(status[myInstance2.__uuid].id).to.equal(myInstance2._id);
            expect(status[myInstance2.__uuid].status).to.equal(201);

            expect(status[myInstance3.__uuid].id).to.equal(myInstance3._id);
            expect(status[myInstance3.__uuid].status).to.equal(201);

            expect(bulk.length).to.equal(3);
            bulk.clear();
            expect(bulk.length).to.equal(2);

            //=====================
            bulk.finish(myInstance3, 123, `Dekuji vam za odpoved`);
            const payload3 = bulk.payload(myInstance3);
            payload3.any = `thing`;

            status = bulk.status;
            expect(status[myInstance1.__uuid].id).to.equal(myInstance1._id);
            expect(status[myInstance1.__uuid].status).to.equal(500);
            expect(status[myInstance1.__uuid].message).to.equal(`Velky spatny`);
            expect(status[myInstance1.__uuid].payload.pay).to.equal(`toWin`);
            expect(status[myInstance1.__uuid].payload.load).to.equal(`pay`);

            expect(status[myInstance2.__uuid].id).to.equal(myInstance2._id);
            expect(status[myInstance2.__uuid].status).to.equal(201);

            expect(status[myInstance3.__uuid].id).to.equal(myInstance3._id);
            expect(status[myInstance3.__uuid].status).to.equal(123);
            expect(status[myInstance3.__uuid].message).to.equal(`Dekuji vam za odpoved`);
            expect(status[myInstance3.__uuid].payload.any).to.equal(`thing`);

            expect(bulk.length).to.equal(2);

            //=====================
            await bulk.delete();

            status = bulk.status;
            expect(status[myInstance1.__uuid].id).to.equal(myInstance1._id);
            expect(status[myInstance1.__uuid].status).to.equal(500);
            expect(status[myInstance1.__uuid].message).to.equal(`Velky spatny`);
            expect(status[myInstance1.__uuid].payload.pay).to.equal(`toWin`);
            expect(status[myInstance1.__uuid].payload.load).to.equal(`pay`);

            expect(status[myInstance2.__uuid].id).to.equal(myInstance2._id);
            expect(status[myInstance2.__uuid].status).to.equal(200);

            expect(status[myInstance3.__uuid].id).to.equal(myInstance3._id);
            expect(status[myInstance3.__uuid].status).to.equal(123);
            expect(status[myInstance3.__uuid].message).to.equal(`Dekuji vam za odpoved`);
            expect(status[myInstance3.__uuid].payload.any).to.equal(`thing`);

            expect(bulk.length).to.equal(2);
            bulk.clear();
            expect(bulk.length).to.equal(1);

            const esStatus = bulk.esStatus();
            expect(esStatus.count).to.equal(3);
            expect(esStatus.errors).to.be.true;
            expect(esStatus.items.length).to.equal(3);
        });
    });
});
