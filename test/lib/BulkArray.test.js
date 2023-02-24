'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const { createClass, BulkArray } = require(`../../app`);

describe(`BulkArray class`, function() {
    this.timeout(testTimeout);

    describe(`class preparations`, () => {
        it(`works like an array`, () => {
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
        it(`can't save invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.string()).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data, `myId`);

            let bulk = new BulkArray(myInstance);
            await expect(bulk.save()).to.be.eventually.rejectedWith(`"value" must be a string`);

            bulk = new BulkArray({ });
            await expect(bulk.save()).to.be.eventually.rejectedWith(`Item at position 0 doesn't have internal property "__uuid".`);

            bulk = new BulkArray({ __uuid: `abc` });
            await expect(bulk.save(true)).to.be.eventually.rejectedWith(`Item at position 0 doesn't have specified id and you are using 'useVersion' parameter!`);

            bulk = new BulkArray({ __uuid: `abc`, _id: `test` });
            await expect(bulk.save(true)).to.be.eventually.rejectedWith(`Item at position 0 doesn't have specified version and you are using 'useVersion' parameter!`);
        });

        it(`can't save valid and invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.object().keys({ field: Joi.any().required() })).in(`test`);

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
            await expect(bulk.save()).to.be.eventually.rejectedWith(`"field" is required`);
        });

        it(`saves data instances`, async () => {
            const MyClass = createClass(`users`).in(`test`);

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
            const result = await bulk.save();

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(2);
            expect(result.items[0].index.result).to.equal(`created`);
            expect(result.items[1].index.result).to.equal(`created`);

            expect(myInstance1._id).not.to.be.undefined;
            expect(myInstance1._version).not.to.be.undefined;
            expect(myInstance1._primary_term).not.to.be.undefined;
            expect(myInstance1._seq_no).not.to.be.undefined;
            const results1 = await bootstrapTest.client.get({
                index: MyClass.alias,
                id: myInstance1._id
            });
            expect(results1._version).to.equal(myInstance1._version);
            expect(results1._primary_term).to.equal(myInstance1._primary_term);
            expect(results1._seq_no).to.equal(myInstance1._seq_no);
            expect(results1._source.status).to.equal(data1.status);
            expect(results1._source.name).to.equal(data1.name);
            expect(results1._source.fullname).to.equal(data1.fullname);

            expect(myInstance2._id).not.to.be.undefined;
            expect(myInstance2._version).not.to.be.undefined;
            expect(myInstance2._primary_term).not.to.be.undefined;
            expect(myInstance2._seq_no).not.to.be.undefined;
            const results2 = await bootstrapTest.client.get({
                index: MyClass.alias,
                id: myInstance2._id
            });
            expect(results2._version).to.equal(myInstance2._version);
            expect(results2._primary_term).to.equal(myInstance2._primary_term);
            expect(results2._seq_no).to.equal(myInstance2._seq_no);
            expect(results2._source.status).to.equal(data2.status);
            expect(results2._source.name).to.equal(data2.name);
            expect(results2._source.fullname).to.equal(data2.fullname);

            expect(myInstance1._id).to.not.equal(myInstance2._id);
        });

        it(`saves data instances without immediate refresh`, async () => {
            const MyClass = createClass(`users`).in(`test`);

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
            bulk._immediateRefresh = false;
            const result = await bulk.save();

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(2);
            expect(result.items[0].index.result).to.equal(`created`);
            expect(result.items[1].index.result).to.equal(`created`);

            const beforeRefresh = await MyClass.findAll();
            expect(beforeRefresh.length).to.equal(0);

            await MyClass.refresh();

            const afterRefresh = await MyClass.findAll();
            expect(afterRefresh.length).to.equal(2);
        });

        it(`saves data instance with some ids specified and saved`, async () => {
            const MyClass = createClass(`users`).in(`test`);

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
            const result = await bulk.save();

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(3);
            expect(result.items[0].index.result).to.equal(`updated`);
            expect(result.items[1].index.result).to.equal(`created`);
            expect(result.items[2].index.result).to.equal(`created`);

            expect(myInstance1._id).not.to.be.undefined;
            expect(myInstance1._version).not.to.be.undefined;
            expect(myInstance1._primary_term).not.to.be.undefined;
            expect(myInstance1._seq_no).not.to.be.undefined;
            const results1 = await bootstrapTest.client.get({
                index: MyClass.alias,
                id: myInstance1._id
            });
            expect(results1._id).to.equal(`first`);
            expect(results1._version).to.equal(myInstance1._version);
            expect(results1._primary_term).to.equal(myInstance1._primary_term);
            expect(results1._seq_no).to.equal(myInstance1._seq_no);
            expect(results1._source.status).to.equal(data1.status);
            expect(results1._source.name).to.equal(data1.name);
            expect(results1._source.fullname).to.equal(data1.fullname);

            expect(myInstance2._id).not.to.be.undefined;
            expect(myInstance2._version).not.to.be.undefined;
            expect(myInstance2._primary_term).not.to.be.undefined;
            expect(myInstance2._seq_no).not.to.be.undefined;
            const results2 = await bootstrapTest.client.get({
                index: MyClass.alias,
                id: myInstance2._id
            });
            expect(results2._version).to.equal(myInstance2._version);
            expect(results2._primary_term).to.equal(myInstance2._primary_term);
            expect(results2._seq_no).to.equal(myInstance2._seq_no);
            expect(results2._source.status).to.equal(data2.status);
            expect(results2._source.name).to.equal(data2.name);
            expect(results2._source.fullname).to.equal(data2.fullname);

            expect(myInstance3._id).not.to.be.undefined;
            expect(myInstance3._version).not.to.be.undefined;
            expect(myInstance3._primary_term).not.to.be.undefined;
            expect(myInstance3._seq_no).not.to.be.undefined;
            const results3 = await bootstrapTest.client.get({
                index: MyClass.alias,
                id: myInstance3._id
            });
            expect(results3._id).to.equal(`third`);
            expect(results3._version).to.equal(myInstance3._version);
            expect(results3._primary_term).to.equal(myInstance3._primary_term);
            expect(results3._seq_no).to.equal(myInstance3._seq_no);
            expect(results3._source.status).to.equal(data3.status);
            expect(results3._source.name).to.equal(data3.name);
            expect(results3._source.fullname).to.equal(data3.fullname);
        });

        it(`can't use parameter 'useVersion' for not yet indexed records`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const data1 = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance1 = new MyClass(data1, `first`, 666);

            const bulk = new BulkArray(myInstance1);
            await expect(bulk.save(true)).to.be.eventually.rejectedWith(`Tried to fetch version information but some instances are not in ES.`);
        });

        it(`saves array with specified version`, async () => {
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

            const bulk = new BulkArray(myInstance);
            await bulk.save(true);

            expect(myInstance._id).to.equal(oldId);
            expect(myInstance._version).to.not.equal(oldVersion);
            expect(myInstance._seq_no).to.not.equal(oldSeqNo);
        });

        it(`can't save array when sequence numbers are different`, async () => {
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

            const bulk = new BulkArray(myInstance);
            const result = await bulk.save(true);

            expect(result.errors).to.be.true;
            expect(result.items.length).to.equal(1);
            expect(result.items[0].index.status).to.equal(409);
            expect(result.items[0].index.error.type).to.equal(`version_conflict_engine_exception`);
        });

        it(`saves array with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
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
            const bulk = new BulkArray(myInstance);

            await bulk.save(true);
            expect(myInstance._id).to.equal(oldId);
            expect(myInstance._version).to.not.equal(oldVersion);
            expect(myInstance._seq_no).to.not.equal(oldSeqNo);
        });

        it(`can't save array with specified incorrect version and without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version + 1);

            const bulk = new BulkArray(myInstance);
            await expect(bulk.save(true)).to.be.eventually.rejectedWith(`For item with id '${savedInstance._id}' in alias '${savedInstance.constructor.alias}', specified version '${savedInstance._version + 1}', another version '${savedInstance._version}' was found!`);
        });
    });

    describe(`delete()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument;

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
            defaultDocument = {
                index: `test_documents`,
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

        it(`can't delete invalid data`, async () => {
            let bulk = new BulkArray({ });
            await expect(bulk.delete()).to.be.eventually.rejectedWith(`Item at position 0 doesn't have internal property "__uuid".`);

            bulk = new BulkArray({ __uuid: `abc` });
            await expect(bulk.delete()).to.be.eventually.rejectedWith(`Item at position 0 doesn't specify any alias!`);

            bulk = new BulkArray({ __uuid: `abc`, constructor: { alias: `test*test_test` } });
            await expect(bulk.delete()).to.be.eventually.rejectedWith(`Item at position 0 has wildcard in alias 'test*test_test'!`);

            bulk = new BulkArray({ __uuid: `abc`, constructor: { alias: `test?test_test` } });
            await expect(bulk.delete()).to.be.eventually.rejectedWith(`Item at position 0 has wildcard in alias 'test?test_test'!`);

            bulk = new BulkArray({ __uuid: `abc`, constructor: { alias: `test_test` } });
            await expect(bulk.delete()).to.be.eventually.rejectedWith(`Item at position 0 doesn't have specified id!`);

            bulk = new BulkArray({ __uuid: `abc`, constructor: { alias: `test_test` }, _id: `test` });
            await expect(bulk.delete(true)).to.be.eventually.rejectedWith(`Item at position 0 doesn't have specified version and you are using 'useVersion' parameter!`);
        });

        it(`deletes data instances`, async () => {
            const UserClass = createClass(`users`).in(`test`);
            const DocumentClass = createClass(`documents`).in(`test`);

            const myInstance1 = await UserClass.get(`ok`);
            const myInstance2 = await DocumentClass.get(`document`);

            const bulk = new BulkArray(myInstance1, myInstance2);
            const results = await bulk.delete();

            expect(results.errors).to.be.false;
            expect(results.items.length).to.equal(2);
            expect(results.items[0].delete.result).to.equal(`deleted`);
            expect(results.items[1].delete.result).to.equal(`deleted`);

            const results1 = await bootstrapTest.client.exists({
                index: myInstance1.constructor.alias,
                id: myInstance1._id
            });
            expect(results1).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: myInstance2.constructor.alias,
                id: myInstance2._id
            });
            expect(results2).to.be.false;
        });

        it(`deletes array with specified version`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance = new MyClass(data);
            await myInstance.save();

            const bulk = new BulkArray(myInstance);
            await bulk.delete(true);

            const exists = await bootstrapTest.client.exists({
                index: MyClass.alias,
                id: myInstance._id
            });
            expect(exists).to.be.false;
        });

        it(`can't delete array when sequence numbers are different`, async () => {
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

            const bulk = new BulkArray(myInstance);
            const result = await bulk.delete(true);

            expect(result.errors).to.be.true;
            expect(result.items.length).to.equal(1);
            expect(result.items[0].delete.status).to.equal(409);
            expect(result.items[0].delete.error.type).to.equal(`version_conflict_engine_exception`);

        });

        it(`deletes array with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version);

            const bulk = new BulkArray(myInstance);
            await bulk.delete(true);

            const exists = await bootstrapTest.client.exists({
                index: MyClass.alias,
                id: myInstance._id
            });
            expect(exists).to.be.false;
        });

        it(`can't delete array with specified incorrect version and without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version + 1);
            const bulk = new BulkArray(myInstance);

            await expect(bulk.delete(true)).to.be.eventually.rejectedWith(`For item with id '${savedInstance._id}' in alias '${savedInstance.constructor.alias}', specified version '${savedInstance._version + 1}', another version '${savedInstance._version}' was found!`);
        });
    });

    describe(`reload()`, () => {
        it(`can't reload invalid data`, async () => {
            const bulk = new BulkArray({ });
            await expect(bulk.reload()).to.be.eventually.rejectedWith(`Item at position 0 doesn't have internal property "__uuid".`);
        });

        it(`reloads bulk array`, async () => {
            const MyClass = createClass(`users`).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance1 = new MyClass(data, `ok`);
            const myInstance2 = new MyClass(data, `ko`);

            const bulk = new BulkArray(myInstance1, myInstance2);
            await bulk.save();

            const oldVersion1 = myInstance1._version;
            const oldSeqNo1 = myInstance1._seq_no;

            const oldVersion2 = myInstance2._version;
            const oldSeqNo2 = myInstance2._seq_no;

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
            await bootstrapTest.client.index({
                index: MyClass.alias,
                id: `ko`,
                document: {
                    status: `:/`,
                    name: `DEF`,
                    fullname: `DEF abc`
                },
                refresh: true
            });

            await bulk.reload();

            expect(myInstance1._id).to.equal(`ok`);
            expect(myInstance1._version).to.not.equal(oldVersion1);
            expect(myInstance1._seq_no).to.not.equal(oldSeqNo1);
            expect(myInstance1.status).to.equal(`:D`);
            expect(myInstance1.name).to.equal(`ABC`);
            expect(myInstance1.fullname).to.equal(`ABC def`);

            expect(myInstance2._id).to.equal(`ko`);
            expect(myInstance2._version).to.not.equal(oldVersion2);
            expect(myInstance2._seq_no).to.not.equal(oldSeqNo2);
            expect(myInstance2.status).to.equal(`:/`);
            expect(myInstance2.name).to.equal(`DEF`);
            expect(myInstance2.fullname).to.equal(`DEF abc`);
        });
    });

    describe(`functional tests`, () => {
        it(`Bulk status test`, async () => {
            const MyClass = createClass(`users`).in(`test`);

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

            let esStatus = bulk.esStatus(true);
            expect(esStatus.count).to.equal(3);
            expect(esStatus.errors).to.be.true;
            expect(esStatus.items.length).to.equal(3);

            esStatus = bulk.esStatus();
            expect(esStatus.count).to.equal(3);
            expect(esStatus.errors).to.be.true;
            expect(esStatus.items.length).to.equal(1);
        });
    });
});
