'use strict';

const Joi = require(`@hapi/joi`);
const bootstrapTest = require(`../bootstrapTests`);
const { createClass, BulkArray } = require(`../../app`);

//It uses ES7 Circularo indices
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
        it(`can't save invalid data`, async () => {
            const MyClass = createClass(`users`, Joi.string()).in(`test`);

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
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                id: myInstance1._id
            });
            expect(results1.body._version).to.equal(myInstance1._version);
            expect(results1.body._primary_term).to.equal(myInstance1._primary_term);
            expect(results1.body._seq_no).to.equal(myInstance1._seq_no);
            expect(results1.body._source.status).to.equal(data1.status);
            expect(results1.body._source.name).to.equal(data1.name);
            expect(results1.body._source.fullname).to.equal(data1.fullname);

            expect(myInstance2._id).not.to.be.undefined;
            expect(myInstance2._version).not.to.be.undefined;
            expect(myInstance2._primary_term).not.to.be.undefined;
            expect(myInstance2._seq_no).not.to.be.undefined;
            const results2 = await bootstrapTest.client.get({
                index: MyClass._alias,
                id: myInstance2._id
            });
            expect(results2.body._version).to.equal(myInstance2._version);
            expect(results2.body._primary_term).to.equal(myInstance2._primary_term);
            expect(results2.body._seq_no).to.equal(myInstance2._seq_no);
            expect(results2.body._source.status).to.equal(data2.status);
            expect(results2.body._source.name).to.equal(data2.name);
            expect(results2.body._source.fullname).to.equal(data2.fullname);

            expect(myInstance1._id).to.not.equal(myInstance2._id);
        });

        it(`saves data instance with some ids specified and saved`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                id: myInstance1._id
            });
            expect(results1.body._id).to.equal(`first`);
            expect(results1.body._version).to.equal(myInstance1._version);
            expect(results1.body._primary_term).to.equal(myInstance1._primary_term);
            expect(results1.body._seq_no).to.equal(myInstance1._seq_no);
            expect(results1.body._source.status).to.equal(data1.status);
            expect(results1.body._source.name).to.equal(data1.name);
            expect(results1.body._source.fullname).to.equal(data1.fullname);

            expect(myInstance2._id).not.to.be.undefined;
            expect(myInstance2._version).not.to.be.undefined;
            expect(myInstance2._primary_term).not.to.be.undefined;
            expect(myInstance2._seq_no).not.to.be.undefined;
            const results2 = await bootstrapTest.client.get({
                index: MyClass._alias,
                id: myInstance2._id
            });
            expect(results2.body._version).to.equal(myInstance2._version);
            expect(results2.body._primary_term).to.equal(myInstance2._primary_term);
            expect(results2.body._seq_no).to.equal(myInstance2._seq_no);
            expect(results2.body._source.status).to.equal(data2.status);
            expect(results2.body._source.name).to.equal(data2.name);
            expect(results2.body._source.fullname).to.equal(data2.fullname);

            expect(myInstance3._id).not.to.be.undefined;
            expect(myInstance3._version).not.to.be.undefined;
            expect(myInstance3._primary_term).not.to.be.undefined;
            expect(myInstance3._seq_no).not.to.be.undefined;
            const results3 = await bootstrapTest.client.get({
                index: MyClass._alias,
                id: myInstance3._id
            });
            expect(results3.body._id).to.equal(`third`);
            expect(results3.body._version).to.equal(myInstance3._version);
            expect(results3.body._primary_term).to.equal(myInstance3._primary_term);
            expect(results3.body._seq_no).to.equal(myInstance3._seq_no);
            expect(results3.body._source.status).to.equal(data3.status);
            expect(results3.body._source.name).to.equal(data3.name);
            expect(results3.body._source.fullname).to.equal(data3.fullname);
        });

        it(`can't use parameter 'useVersion' for not yet indexed records`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const data1 = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance1 = new MyClass(data1, `first`, 666);

            const bulk = new BulkArray(myInstance1);
            await expect(bulk.save(true)).to.be.eventually.rejectedWith(`Response Error`);
        });

        it(`saves array with specified version`, async () => {
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

            const bulk = new BulkArray(myInstance);
            await bulk.save(true);

            expect(myInstance._id).to.equal(oldId);
            expect(myInstance._version).to.not.equal(oldVersion);
            expect(myInstance._seq_no).to.not.equal(oldSeqNo);
        });

        it(`can't save array when sequence numbers are different`, async () => {
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

            const bulk = new BulkArray(myInstance);
            const result = await bulk.save(true);

            expect(result.errors).to.be.true;
            expect(result.items.length).to.equal(1);
            expect(result.items[0].index.status).to.equal(409);
            expect(result.items[0].index.error.type).to.equal(`version_conflict_engine_exception`);
        });

        it(`saves array with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
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
            const bulk = new BulkArray(myInstance);

            await bulk.save(true);
            expect(myInstance._id).to.equal(oldId);
            expect(myInstance._version).to.not.equal(oldVersion);
            expect(myInstance._seq_no).to.not.equal(oldSeqNo);
        });

        it(`can't save array with specified incorrect version and without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version + 1);

            const bulk = new BulkArray(myInstance);
            await expect(bulk.save(true)).to.be.eventually.rejectedWith(`For item with id '${savedInstance._id}' in alias '${savedInstance.constructor._alias}', specified version '${savedInstance._version + 1}', another version '${savedInstance._version}' was found!`);
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

        it(`deletes data instances`, async () => {
            const UserClass = createClass(`users`, void 0).in(`test`);
            const DocumentClass = createClass(`documents`, void 0, `*`).in(`test`);

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
                index: myInstance1.constructor._alias,
                id: myInstance1._id
            });
            expect(results1.body).to.be.false;

            const results2 = await bootstrapTest.client.exists({
                index: myInstance2.constructor._alias,
                id: myInstance2._id
            });
            expect(results2.body).to.be.false;

            const results3 = await bootstrapTest.client.exists({
                index: myInstance3.constructor._alias,
                id: myInstance3._id
            });
            expect(results3.body).to.be.false;
        });

        it(`deletes only correct and saved data instances`, async () => {
            const UserClass = createClass(`users`, void 0).in(`test`);

            const myInstance1 = await UserClass.get(`ok`);
            const myInstance2 = new UserClass({}, `invalid`);

            const bulk = new BulkArray(myInstance1, myInstance2, `incorrect`);
            const results = await bulk.delete();

            expect(results.errors).to.be.false;
            expect(results.items.length).to.equal(2);
            expect(results.items[0].delete.result).to.equal(`deleted`);
            expect(results.items[1].delete.result).to.equal(`not_found`);

            const results1 = await bootstrapTest.client.exists({
                index: myInstance1.constructor._alias,
                id: myInstance1._id
            });
            expect(results1.body).to.be.false;
        });

        it(`deletes array with specified version`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                id: myInstance._id
            });
            expect(exists.body).to.be.false;
        });

        it(`can't delete array when sequence numbers are different`, async () => {
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

            const bulk = new BulkArray(myInstance);
            const result = await bulk.delete(true);

            expect(result.errors).to.be.true;
            expect(result.items.length).to.equal(1);
            expect(result.items[0].delete.status).to.equal(409);
            expect(result.items[0].delete.error.type).to.equal(`version_conflict_engine_exception`);

        });

        it(`deletes array with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                id: myInstance._id
            });
            expect(exists.body).to.be.false;
        });

        it(`can't delete array with specified incorrect version and without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const savedInstance = new MyClass(data);
            await savedInstance.save();

            const myInstance = new MyClass(data, savedInstance._id, savedInstance._version + 1);
            const bulk = new BulkArray(myInstance);

            await expect(bulk.delete(true)).to.be.eventually.rejectedWith(`For item with id '${savedInstance._id}' in alias '${savedInstance.constructor._alias}', specified version '${savedInstance._version + 1}', another version '${savedInstance._version}' was found!`);
        });
    });

    describe(`reload()`, () => {
        it(`reloads bulk array`, async () => {
            const MyClass = createClass(`users`, void 0).in(`test`);

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
                index: MyClass._alias,
                id: `ok`,
                body: {
                    status: `:D`,
                    name: `ABC`,
                    fullname: `ABC def`
                },
                refresh: true
            });
            await bootstrapTest.client.index({
                index: MyClass._alias,
                id: `ko`,
                body: {
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
            const MyClass = createClass(`users`, void 0).in(`test`);

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
