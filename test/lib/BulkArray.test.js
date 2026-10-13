import Joi from 'joi';
import bootstrapTest from '../bootstrapTests.js';
import { createClass, BulkArray } from '../../index.js';
import buffer from 'buffer';
const MAX_STRING_LENGTH = buffer.constants.MAX_STRING_LENGTH;

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
            const MyClass = createClass(`users`, Joi.string()).in(`odmtest`);

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
            const MyClass = createClass(`users`, Joi.object().keys({ field: Joi.any().required() })).in(`odmtest`);

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

            //The invalid item is the second one - a per-item validate-and-write would have written the first
            const bulk = new BulkArray(myInstance2, myInstance1);
            await expect(bulk.save()).to.be.eventually.rejectedWith(`"field" is required`);

            //Nothing at all was written
            expect(await bootstrapTest.client.exists({ index: `odmtest_users`, id: `myId1` })).to.be.false;
            expect(await bootstrapTest.client.exists({ index: `odmtest_users`, id: `myId2` })).to.be.false;
        });

        it(`saves data instances`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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

        it(`saves only active data instances`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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
            bulk.finish(myInstance1);
            const result = await bulk.save();

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(1);
            expect(result.items[0].index.result).to.equal(`created`);

            expect(myInstance1._id).to.be.undefined;

            expect(myInstance2._id).not.to.be.undefined;
            const results = await bootstrapTest.client.exists({
                index: MyClass.alias,
                id: myInstance2._id
            });
            expect(results).to.equal(true);
        });

        it(`doesn't save anything when no active instance is presented`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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
            bulk.finish(myInstance1);
            bulk.reject(myInstance2);
            const result = await bulk.save();

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(0);

            expect(myInstance1._id).to.be.undefined;
            expect(myInstance2._id).to.be.undefined;
        });

        it(`saves data instances without immediate refresh`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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
            const MyClass = createClass(`users`).in(`odmtest`);

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
            const MyClass = createClass(`users`).in(`odmtest`);

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
            const MyClass = createClass(`users`).in(`odmtest`);

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
            const MyClass = createClass(`users`).in(`odmtest`);

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

        it(`keeps concurrency metadata of items which failed to save`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const staleInstance = new MyClass({
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            });
            await staleInstance.save();
            staleInstance.status = `:|`;
            await staleInstance.save();     //second save ensures _seq_no > 0

            const freshInstance = new MyClass({
                status: `:)`,
                name: `def`,
                fullname: `def ghi`
            });
            await freshInstance.save();
            const freshOldVersion = freshInstance._version;

            const oldId = staleInstance._id;
            const oldVersion = staleInstance._version;
            const oldPrimaryTerm = staleInstance._primary_term;
            const oldSeqNo = staleInstance._seq_no;

            //Concurrent update -> "staleInstance" is now stale
            await bootstrapTest.client.index({
                index: MyClass.alias,
                id: staleInstance._id,
                document: {
                    status: `:(`
                },
                refresh: true
            });

            const bulk = new BulkArray(staleInstance, freshInstance);
            const result = await bulk.save(true);

            expect(result.errors).to.be.true;
            expect(result.items.length).to.equal(2);
            expect(result.items[0].index.status).to.equal(409);
            expect(result.items[1].index.status).to.equal(200);

            //Failed item keeps its original concurrency metadata
            expect(staleInstance._id).to.equal(oldId);
            expect(staleInstance._version).to.equal(oldVersion);
            expect(staleInstance._primary_term).to.equal(oldPrimaryTerm);
            expect(staleInstance._seq_no).to.equal(oldSeqNo);

            //Successful item gets the new metadata
            expect(freshInstance._version).to.not.equal(freshOldVersion);
            expect(freshInstance._version).to.equal(result.items[1].index._version);
            expect(freshInstance._seq_no).to.equal(result.items[1].index._seq_no);
        });

        it(`throws with a status code when version prefetch fails`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            //Instance not present in ES at all
            const missingInstance = new MyClass({ status: `:)`, name: `abc`, fullname: `abc def` }, `missingId`, 1);
            let thrownError;
            try {
                await new BulkArray(missingInstance).save(true);
            } catch (error) {
                thrownError = error;
            }
            expect(thrownError.message).to.equal(`Tried to fetch version information but some instances are not in ES.`);
            expect(thrownError.statusCode).to.equal(404);

            //Wrong version discovered during the prefetch
            const myInstance = new MyClass({ status: `:)`, name: `abc`, fullname: `abc def` });
            await myInstance.save();
            const staleInstance = new MyClass({ status: `:|` }, myInstance._id, myInstance._version + 1);   //wrong version, no sequence numbers
            thrownError = void 0;
            try {
                await new BulkArray(staleInstance).save(true);
            } catch (error) {
                thrownError = error;
            }
            expect(thrownError.message).to.include(`another version`);
            expect(thrownError.statusCode).to.equal(409);
        });

        it(`handles version conflict of a document with sequence number zero`, async () => {
            await bootstrapTest.createIndex(`odmtest_seqzero`, `abc123`);
            try {
                const MyClass = createClass(`seqzero`).in(`odmtest`);

                //The very first document written to an index has _seq_no 0
                await new MyClass({ value: `original` }, `doc1`).save();
                const staleInstance = await MyClass.get(`doc1`);
                expect(staleInstance._seq_no).to.equal(0);

                //Concurrent update
                const concurrentInstance = await MyClass.get(`doc1`);
                concurrentInstance.value = `concurrent`;
                await concurrentInstance.save();

                //The conflict must surface as a per-item 409, not as a thrown prefetch error
                staleInstance.value = `stale`;
                const result = await new BulkArray(staleInstance).save(true);

                expect(result.errors).to.be.true;
                expect(result.items.length).to.equal(1);
                expect(result.items[0].index.status).to.equal(409);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_seqzero`, `abc123`);
            }
        });

        it(`clears previous error type once the item saves successfully`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const myInstance = new MyClass({ status: `:)`, name: `abc`, fullname: `abc def` });
            await myInstance.save();
            myInstance.status = `:|`;
            await myInstance.save();    //second save ensures _seq_no > 0

            //Concurrent update -> per-item 409 with an error type in the ledger
            await bootstrapTest.client.index({
                index: MyClass.alias,
                id: myInstance._id,
                document: {
                    status: `:(`
                },
                refresh: true
            });
            const bulk = new BulkArray(myInstance);
            await bulk.save(true);
            expect(bulk.esStatus(true).items[0].status).to.equal(409);
            expect(bulk.esStatus(true).items[0].type).to.equal(`DATABASE:OPERATION_FAILED`);

            //Reload fixes the metadata, a successful save must clear the stale error type
            await bulk.reload();
            await bulk.save(true);
            const finalItem = bulk.esStatus(true).items[0];
            expect(finalItem.status).to.equal(200);
            expect(finalItem.type).to.be.undefined;
        });

        it(`handles large bulks with per-item processing`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const bulk = new BulkArray();
            for (let i = 0; i < 20000; i++) {
                bulk.push(new MyClass({ status: `:)`, name: `big${i}`, fullname: `big ${i}` }, `big${i}`));
            }

            //Payload of a single item, set before any full ledger sweep happened
            bulk.payload(bulk[0]).marker = `kept`;

            for (let i = 0; i < bulk.length; i++) {
                if (i % 2 === 0) {
                    bulk.reject(bulk[i], 403, `rejected`);
                } else if (i % 4 === 1) {
                    bulk.finish(bulk[i], 200, `finished`);
                }
                //every other item stays in progress
            }

            bulk.clear();
            expect(bulk.length).to.equal(5000);

            const esStatus = bulk.esStatus(true);
            expect(esStatus.count).to.equal(20000);
            expect(esStatus.errors).to.be.true;
            expect(esStatus.items.filter((item) => item.status === 403).length).to.equal(10000);
            expect(esStatus.items.filter((item) => item.status === 200).length).to.equal(5000);
            expect(esStatus.items.filter((item) => item.status === void 0).length).to.equal(5000);
            expect(esStatus.items.find((item) => item.id === `big0`).payload.marker).to.equal(`kept`);
        });

        it(`saves array with specified version but without sequence numbers, automatically fetches sequence numbers`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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
            const MyClass = createClass(`users`).in(`odmtest`);

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

        it(`records the original id when the id of an item changes`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const myInstance = new MyClass({ status: `:)`, name: `moved` }, `originalId`);
            const bulk = new BulkArray(myInstance);

            await bulk.save();
            expect(bulk.status[myInstance.__uuid].id).to.equal(`originalId`);
            expect(bulk.payload(myInstance).originalId).to.be.undefined;

            myInstance._id = `newId`;
            await bulk.save();

            expect(bulk.status[myInstance.__uuid].id).to.equal(`newId`);
            expect(bulk.payload(myInstance).originalId).to.equal(`originalId`);
        });

        it(`doesn't record the id ES generated for an item it refused to write`, async () => {
            //The fixture index has a strict mapping - an unknown field makes the item fail, yet ES still reports
            //an id it generated for it. Recording that id would point the status ledger at a document which does not exist
            const MyClass = createClass(`users`).in(`odmtest`);
            const newInstance = new MyClass({ status: `:)`, name: `failed`, unknownField: `:(` });
            const bulk = new BulkArray(newInstance);

            const result = await bulk.save();
            expect(result.errors).to.be.true;
            expect(result.items[0].index.status).to.equal(400);
            expect(result.items[0].index._id).to.be.a(`string`);    //ES generated one anyway

            expect(newInstance._id).to.be.undefined;
            const status = bulk.esStatus(true);
            expect(status.items[0].id).to.be.undefined;
            expect(status.items[0].status).to.equal(400);
            expect(status.items[0].type).to.equal(`DATABASE:OPERATION_FAILED`);

            //Nothing of it reached ES under the generated id
            const found = await bootstrapTest.client.count({ index: `odmtest_users` });
            expect(found.count).to.equal(0);
        });

        it(`keeps the original id of an item which failed to save`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const myInstance = new MyClass({ status: `:)`, name: `kept` }, `keptId`);
            const bulk = new BulkArray(myInstance);
            await bulk.save();
            expect(bulk.status[myInstance.__uuid].id).to.equal(`keptId`);

            //A second save of the same instance fails, the ledger must still point at the document it belongs to
            myInstance.unknownField = `:(`;
            const result = await bulk.save();
            expect(result.errors).to.be.true;
            expect(myInstance._id).to.equal(`keptId`);
            expect(bulk.status[myInstance.__uuid].id).to.equal(`keptId`);
            expect(bulk.payload(myInstance).originalId).to.be.undefined;
        });

        it(`refuses a per item operation on something which is not an instance`, async () => {
            //Without the guard these would create a status record under the key "undefined", which "clear" can never remove
            const bulk = new BulkArray();

            expect(() => bulk.payload({})).to.throw(`Given item doesn't have internal property "__uuid".`);
            expect(() => bulk.reject({})).to.throw(`Given item doesn't have internal property "__uuid".`);
            expect(() => bulk.finish({})).to.throw(`Given item doesn't have internal property "__uuid".`);
            expect(bulk.esStatus(true).count).to.equal(0);
        });

        it(`refreshes per array, independently of the model class`, async () => {
            //The fixture index has "refresh_interval: -1" - only an explicit refresh makes the writes visible
            const MyClass = createClass(`users`).in(`odmtest`).immediateRefresh(false);
            const query = { query: { prefix: { name: `unrefreshed` } } };

            const silentBulk = new BulkArray(new MyClass({ status: `:)`, name: `unrefreshed1` }), new MyClass({ status: `:)`, name: `unrefreshed2` }));
            silentBulk._immediateRefresh = false;
            await silentBulk.save();
            expect(await MyClass.count(query)).to.equal(0);

            //The class flag is irrelevant for the array - its own default still refreshes
            const refreshingBulk = new BulkArray(new MyClass({ status: `:)`, name: `unrefreshed3` }));
            expect(refreshingBulk._immediateRefresh).to.be.true;
            await refreshingBulk.save();
            expect(await MyClass.count(query)).to.equal(3);    //the refresh made the earlier two visible as well
        });
    });

    describe(`save() across several models`, () => {
        it(`fetches the versions of every alias of the array`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);
            const MyDocuments = createClass(`documents`).in(`odmtest`);

            //Written twice, so that the sequence numbers are not the zero of a fresh index
            let savedUserInstance, savedDocumentInstance;
            for (let i = 0; i < 2; i++) {
                savedUserInstance = new MyUsers({ status: `:)`, name: `mixed` }, `mixedUser`);
                await savedUserInstance.save();
                savedDocumentInstance = new MyDocuments({ documentTitle: `mixed` }, `mixedDocument`);
                await savedDocumentInstance.save();
            }

            //The instances carry no sequence numbers, so "save(true)" has to fetch them - grouped per alias
            //ES continues the version sequence of a recreated document, so the real versions have to be read back
            const user = new MyUsers({ status: `:(`, name: `changed` }, `mixedUser`);
            user._version = savedUserInstance._version;
            const document = new MyDocuments({ documentTitle: `changed` }, `mixedDocument`);
            document._version = savedDocumentInstance._version;

            const myBulk = new BulkArray(user, document);
            const result = await myBulk.save(true);

            expect(result.errors).to.be.false;
            expect(result.items.length).to.equal(2);
            expect(user._primary_term).to.be.a(`number`);
            expect(user._seq_no).to.be.a(`number`);
            expect(document._primary_term).to.be.a(`number`);
            expect(document._seq_no).to.be.a(`number`);

            //Both documents really were written, each into its own index
            const savedUser = await bootstrapTest.client.get({ index: `odmtest_users`, id: `mixedUser` });
            expect(savedUser._source.name).to.equal(`changed`);
            const savedDocument = await bootstrapTest.client.get({ index: `odmtest_documents`, id: `mixedDocument` });
            expect(savedDocument._source.documentTitle).to.equal(`changed`);
        });

        it(`reports a version conflict of a single alias of the array`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);
            const MyDocuments = createClass(`documents`).in(`odmtest`);

            let savedUserInstance, savedDocumentInstance;
            for (let i = 0; i < 2; i++) {
                savedUserInstance = new MyUsers({ status: `:)`, name: `mixed` }, `mixedUser`);
                await savedUserInstance.save();
                savedDocumentInstance = new MyDocuments({ documentTitle: `mixed` }, `mixedDocument`);
                await savedDocumentInstance.save();
            }

            //Only the document of the second alias is stale - the version of the first one must be the real one
            const user = new MyUsers({ status: `:(`, name: `changed` }, `mixedUser`);
            user._version = savedUserInstance._version;
            const document = new MyDocuments({ documentTitle: `changed` }, `mixedDocument`);
            document._version = savedDocumentInstance._version + 97;

            const myBulk = new BulkArray(user, document);

            //The stale version belongs to the second alias - the grouped fetch has to notice it
            let thrownError;
            try {
                await myBulk.save(true);
            } catch (e) {
                thrownError = e;
            }
            expect(thrownError).not.to.be.undefined;
            expect(thrownError.statusCode).to.equal(409);
            expect(thrownError.message).to.include(`odmtest_documents`);
            expect(thrownError.message).to.include(`mixedDocument`);

            //The conflict stopped the whole save - not even the valid item of the first alias was written
            const notWritten = await bootstrapTest.client.get({ index: `odmtest_users`, id: `mixedUser` });
            expect(notWritten._source.name).to.equal(`mixed`);
        });
    });

    describe(`delete()`, () => {
        let userObject1;
        let userObject2;
        let defaultDocument;

        beforeEach(async () => {
            userObject1 = {
                index: `odmtest_users`,
                document: {
                    status: `:)`,
                    name: `happy`
                },
                id: `ok`,
                refresh: true
            };
            userObject2 = {
                index: `odmtest_users`,
                document: {
                    status: `:(`,
                    name: `sad`
                },
                id: void 0,
                refresh: true
            };
            defaultDocument = {
                index: `odmtest_documents`,
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

            bulk = new BulkArray({ __uuid: `abc`, constructor: { alias: `odmtest_test` } });
            await expect(bulk.delete()).to.be.eventually.rejectedWith(`Item at position 0 doesn't have specified id!`);

            bulk = new BulkArray({ __uuid: `abc`, constructor: { alias: `odmtest_test` }, _id: `test` });
            await expect(bulk.delete(true)).to.be.eventually.rejectedWith(`Item at position 0 doesn't have specified version and you are using 'useVersion' parameter!`);
        });

        it(`deletes data instances`, async () => {
            const UserClass = createClass(`users`).in(`odmtest`);
            const DocumentClass = createClass(`documents`).in(`odmtest`);

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

        it(`deletes only active data instances`, async () => {
            const UserClass = createClass(`users`).in(`odmtest`);
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            const myInstance1 = await UserClass.get(`ok`);
            const myInstance2 = await DocumentClass.get(`document`);

            const bulk = new BulkArray(myInstance1, myInstance2);
            bulk.finish(myInstance1);
            const results = await bulk.delete();

            expect(results.errors).to.be.false;
            expect(results.items.length).to.equal(1);
            expect(results.items[0].delete.result).to.equal(`deleted`);

            const results1 = await bootstrapTest.client.exists({
                index: myInstance1.constructor.alias,
                id: myInstance1._id
            });
            expect(results1).to.be.true;

            const results2 = await bootstrapTest.client.exists({
                index: myInstance2.constructor.alias,
                id: myInstance2._id
            });
            expect(results2).to.be.false;
        });

        it(`doesn't delete anything when no active instance is presented`, async () => {
            const UserClass = createClass(`users`).in(`odmtest`);
            const DocumentClass = createClass(`documents`).in(`odmtest`);

            const myInstance1 = await UserClass.get(`ok`);
            const myInstance2 = await DocumentClass.get(`document`);

            const bulk = new BulkArray(myInstance1, myInstance2);
            bulk.finish(myInstance1);
            bulk.reject(myInstance2);
            const results = await bulk.delete();

            expect(results.errors).to.be.false;
            expect(results.items.length).to.equal(0);

            const results1 = await bootstrapTest.client.exists({
                index: myInstance1.constructor.alias,
                id: myInstance1._id
            });
            expect(results1).to.be.true;

            const results2 = await bootstrapTest.client.exists({
                index: myInstance2.constructor.alias,
                id: myInstance2._id
            });
            expect(results2).to.be.true;
        });

        it(`deletes array with specified version`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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
            const MyClass = createClass(`users`).in(`odmtest`);

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
            const MyClass = createClass(`users`).in(`odmtest`);

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
            const MyClass = createClass(`users`).in(`odmtest`);

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

        it(`fetches versions by bulks`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const maxResults = bootstrapTest.nconf.get(`es:maxResults`);

            const bulk = new BulkArray();
            for (let i = 0; i <= maxResults; i++) {
                bulk.push(new MyClass({ status: `:)`, name: `versioned${i}` }, `versioned${i}`));
            }
            await bulk.save();

            //Freshly created instances know their version but not the concurrency metadata - those have to be fetched first
            const toDelete = new BulkArray();
            for (const item of bulk) {
                toDelete.push(new MyClass({ status: `:)`, name: item.name }, item._id, item._version));
            }

            //One item more than the maximum -> the versions are fetched by more than a single mget call
            await toDelete.delete(true);

            //The describe fixtures are not a part of this bulk
            expect(await MyClass.count({ query: { prefix: { name: `versioned` } } })).to.equal(0);
        });
    });

    describe(`reload() hooks`, () => {
        it(`unpacks the data and calls '_afterSearch' when reloading`, async () => {
            const uuid = `abc123`;
            await bootstrapTest.createIndex(`odmtest_reloadhooks`, uuid);
            try {
                let seenInstances = void 0;
                class HookedClass extends createClass(`reloadhooks`) {
                    static _unpackData(source) {
                        return JSON.parse(source.packed);
                    }

                    async _packData() {
                        return { packed: JSON.stringify({ ...this }) };
                    }

                    static async _afterSearch(instances) {
                        seenInstances = instances;
                        for (const instance of instances) {
                            instance.enriched = true;
                        }
                    }
                }
                const MyClass = HookedClass.in(`odmtest`);

                const myInstance = new MyClass({ value: `stored` }, `hooked`);
                await new BulkArray(myInstance).save();

                await bootstrapTest.client.index({
                    index: `odmtest_reloadhooks`,
                    id: `hooked`,
                    document: { packed: JSON.stringify({ value: `changed` }) },
                    refresh: true
                });

                await new BulkArray(myInstance).reload();

                //Both hooks of the reload path really ran
                expect(myInstance.value).to.equal(`changed`);
                expect(myInstance.packed).to.be.undefined;
                expect(myInstance.enriched).to.be.true;
                expect(seenInstances).to.be.an(`array`);
                expect(seenInstances.length).to.equal(1);
            } finally {
                await bootstrapTest.deleteIndex(`odmtest_reloadhooks`, uuid);
            }
        });
    });

    describe(`delete() refresh`, () => {
        it(`doesn't refresh the index when the array has the refresh disabled`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const myInstance = new MyClass({ status: `:)`, name: `deleted` }, `silentDelete`);
            await new BulkArray(myInstance).save();

            const silentBulk = new BulkArray(myInstance);
            silentBulk._immediateRefresh = false;
            await silentBulk.delete();

            //The document is gone, but an unrefreshed delete is still invisible to a search
            const notVisible = await bootstrapTest.client.search({
                index: `odmtest_users`,
                query: { term: { name: `deleted` } }
            });
            expect(notVisible.hits.hits.length).to.equal(1);

            await bootstrapTest.client.indices.refresh({ index: `odmtest_users` });
            const visible = await bootstrapTest.client.search({
                index: `odmtest_users`,
                query: { term: { name: `deleted` } }
            });
            expect(visible.hits.hits.length).to.equal(0);
        });
    });

    describe(`reload()`, () => {
        it(`can't reload invalid data`, async () => {
            const bulk = new BulkArray({ });
            await expect(bulk.reload()).to.be.eventually.rejectedWith(`Item at position 0 doesn't have internal property "__uuid".`);
        });

        it(`reloads bulk array`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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

        it(`reloads bulk array and rejects not presented item`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const data = {
                status: `:)`,
                name: `abc`,
                fullname: `abc def`
            };
            const myInstance1 = new MyClass(data, `ok`);

            const bulk = new BulkArray(myInstance1);
            await bulk.save();

            const oldVersion1 = myInstance1._version;
            const oldSeqNo1 = myInstance1._seq_no;

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

            const myInstance2 = new MyClass(data, `ko`);
            bulk.push(myInstance2);
            await bulk.reload();

            //"reload" clears the array on its own - the rejected item must already be gone
            expect(bulk.length).to.equal(1);
            expect(bulk[0]).to.deep.equal(myInstance1);

            bulk.clear();

            expect(bulk.length).to.equal(1);
            expect(myInstance1._id).to.equal(`ok`);
            expect(myInstance1._version).to.not.equal(oldVersion1);
            expect(myInstance1._seq_no).to.not.equal(oldSeqNo1);
            expect(myInstance1.status).to.equal(`:D`);
            expect(myInstance1.name).to.equal(`ABC`);
            expect(myInstance1.fullname).to.equal(`ABC def`);

            expect(bulk.__rejected.length).to.equal(1);
            expect(bulk.__rejected[0]).to.equal(myInstance2);
        });

        it(`reloads only active data instances`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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

            bulk.finish(myInstance1);
            await bulk.reload();

            expect(myInstance1._id).to.equal(`ok`);
            expect(myInstance1._version).to.equal(oldVersion1);
            expect(myInstance1._seq_no).to.equal(oldSeqNo1);
            expect(myInstance1.status).to.equal(`:)`);
            expect(myInstance1.name).to.equal(`abc`);
            expect(myInstance1.fullname).to.equal(`abc def`);

            expect(myInstance2._id).to.equal(`ko`);
            expect(myInstance2._version).to.not.equal(oldVersion2);
            expect(myInstance2._seq_no).to.not.equal(oldSeqNo2);
            expect(myInstance2.status).to.equal(`:/`);
            expect(myInstance2.name).to.equal(`DEF`);
            expect(myInstance2.fullname).to.equal(`DEF abc`);
        });

        it(`doesn't reload anything when no active instance is presented`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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

            bulk.finish(myInstance1);
            bulk.reject(myInstance2);
            await bulk.reload();

            expect(myInstance1._id).to.equal(`ok`);
            expect(myInstance1._version).to.equal(oldVersion1);
            expect(myInstance1._seq_no).to.equal(oldSeqNo1);
            expect(myInstance1.status).to.equal(`:)`);
            expect(myInstance1.name).to.equal(`abc`);
            expect(myInstance1.fullname).to.equal(`abc def`);

            expect(myInstance2._id).to.equal(`ko`);
            expect(myInstance2._version).to.equal(oldVersion2);
            expect(myInstance2._seq_no).to.equal(oldSeqNo2);
            expect(myInstance2.status).to.equal(`:)`);
            expect(myInstance2.name).to.equal(`abc`);
            expect(myInstance2.fullname).to.equal(`abc def`);
        });

        it(`skips items without an id`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const savedInstance = new MyClass({ status: `:)`, name: `saved` }, `saved`);
            const newInstance = new MyClass({ status: `:(`, name: `notSavedYet` });

            const bulk = new BulkArray(savedInstance, newInstance);
            await savedInstance.save();

            await bootstrapTest.client.index({
                index: MyClass.alias,
                id: `saved`,
                document: {
                    status: `:D`,
                    name: `SAVED`
                },
                refresh: true
            });

            await bulk.reload();

            expect(savedInstance.name).to.equal(`SAVED`);
            //The item without an id cannot be reloaded and is left intact
            expect(newInstance.name).to.equal(`notSavedYet`);
            expect(newInstance._id).to.be.undefined;
            expect(bulk.esStatus().errors).to.be.false;
        });

        it(`reloads by bulks`, async () => {
            class SmallBulkClass extends createClass(`users`) {
                static async _getBulkSize() {
                    return 2;
                }
            }
            const MyClass = SmallBulkClass.in(`odmtest`);

            const bulk = new BulkArray();
            for (let i = 0; i < 5; i++) {
                bulk.push(new MyClass({ status: `:)`, name: `reloaded${i}` }, `reloaded${i}`));
            }
            await bulk.save();

            for (let i = 0; i < 5; i++) {
                await bootstrapTest.client.index({
                    index: MyClass.alias,
                    id: `reloaded${i}`,
                    document: {
                        status: `:D`,
                        name: `RELOADED${i}`
                    },
                    refresh: true
                });
            }

            //Five items over bulks of two
            await bulk.reload();

            expect(bulk.map((item) => item.name)).to.deep.equal([`RELOADED0`, `RELOADED1`, `RELOADED2`, `RELOADED3`, `RELOADED4`]);
        });
    });

    describe(`reload() across several models`, () => {
        it(`reloads every group of the array from its own index`, async () => {
            const MyUsers = createClass(`users`).in(`odmtest`);
            const MyDocuments = createClass(`documents`).in(`odmtest`);

            const user = new MyUsers({ status: `:)`, name: `original` }, `mixedUser`);
            const document = new MyDocuments({ documentTitle: `original` }, `mixedDocument`);
            await new BulkArray(user, document).save();

            //Both indices change behind the instances' back
            await bootstrapTest.client.index({
                index: `odmtest_users`,
                id: `mixedUser`,
                document: { status: `:D`, name: `reloaded` },
                refresh: true
            });
            await bootstrapTest.client.index({
                index: `odmtest_documents`,
                id: `mixedDocument`,
                document: { documentTitle: `reloaded` },
                refresh: true
            });

            const userVersion = user._version;
            const documentVersion = document._version;

            const myBulk = new BulkArray(user, document);
            await myBulk.reload();

            //Each instance is refreshed from the index of its own model
            expect(user.name).to.equal(`reloaded`);
            expect(user.status).to.equal(`:D`);
            expect(document.documentTitle).to.equal(`reloaded`);
            expect(user._version).to.be.above(userVersion);
            expect(document._version).to.be.above(documentVersion);
        });
    });

    describe(`importStatus()`, () => {
        it(`imports statuses of another bulk arrays`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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

            const bulk1 = new BulkArray(myInstance1, myInstance2);
            await bulk1.save();

            const bulk2 = new BulkArray(myInstance1);
            await bulk2.delete();

            const myBulk = new BulkArray();
            myBulk.importStatus(bulk1, bulk2);

            const status = Object.values(myBulk.status);
            expect(status.length).to.equal(2);
            const savedItem = status.find((item) => (item.id === myInstance2._id));
            expect(savedItem).not.to.be.undefined;
            const deletedItem = status.find((item) => (item.id === myInstance1._id));
            expect(deletedItem).not.to.be.undefined;

            const esStatus = myBulk.esStatus();
            expect(esStatus.items).to.be.empty;
            expect(esStatus.errors).to.be.false;
            expect(esStatus.count).to.equal(2);

            const esStatusFull = myBulk.esStatus(true);
            expect(esStatusFull.items.length).to.equal(2);
            expect(esStatusFull.errors).to.be.false;
            expect(esStatusFull.count).to.equal(2);
        });

        it(`keeps its own entries and overwrites only the imported ones`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            const ownInstance = new MyClass({ status: `:)`, name: `own` });
            const sharedInstance = new MyClass({ status: `:(`, name: `shared` });

            const myBulk = new BulkArray(ownInstance, sharedInstance);
            myBulk.finish(ownInstance, 200, `own message`);
            myBulk.finish(sharedInstance, 200, `original message`);

            //The foreign array holds a record of the very same item, but a failing one
            const foreignBulk = new BulkArray(sharedInstance);
            foreignBulk.reject(sharedInstance, 400, `imported message`, `IMPORTED:FAILURE`);

            myBulk.importStatus(foreignBulk);

            const status = myBulk.esStatus(true);
            expect(status.count).to.equal(2);
            expect(status.items.length).to.equal(2);

            //The entry which does not exist in the foreign array remains intact
            const own = status.items.find((item) => (item.message === `own message`));
            expect(own).not.to.be.undefined;
            expect(own.status).to.equal(200);

            //The shared one is replaced by the imported record
            const shared = status.items.find((item) => (item.type === `IMPORTED:FAILURE`));
            expect(shared).not.to.be.undefined;
            expect(shared.status).to.equal(400);
            expect(shared.message).to.equal(`imported message`);

            expect(status.errors).to.be.true;
            expect(myBulk.esStatus().items.length).to.equal(1);
        });
    });

    describe(`esStatus() order`, () => {
        /**
         * Returns the ids of the reported records
         * @param bulk {BulkArray} Array to be reported
         * @param includeAll {boolean} Include even the successful records
         * @returns {Array<string>} Ids in the reported order
         */
        function reportedIds(bulk, includeAll = true) {
            return bulk.esStatus(includeAll).items.map((item) => item.id);
        }

        it(`keeps the position of a cleared item`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const a = new MyClass({ name: `a` }, `a`);
            const b = new MyClass({ name: `b` }, `b`);
            const c = new MyClass({ name: `c` }, `c`);
            const bulk = new BulkArray(a, b, c);

            bulk.reject(b);
            bulk.clear();
            expect(bulk.length).to.equal(2);

            expect(reportedIds(bulk)).to.deep.equal([`a`, `b`, `c`]);
        });

        it(`reports an item pushed later after the cleared ones`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const a = new MyClass({ name: `a` }, `a`);
            const n = new MyClass({ name: `n` }, `n`);
            const bulk = new BulkArray(a);

            bulk.finish(a);
            bulk.push(n);
            bulk.clear();
            expect(bulk.length).to.equal(1);

            expect(reportedIds(bulk)).to.deep.equal([`a`, `n`]);
        });

        it(`reports in the input order, not in the order of touching`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const a = new MyClass({ name: `a` }, `a`);
            const b = new MyClass({ name: `b` }, `b`);
            const bulk = new BulkArray(a, b);

            bulk.reject(b);
            bulk.finish(a);

            expect(reportedIds(bulk)).to.deep.equal([`a`, `b`]);
        });

        it(`reports the items pushed between touches in the array order`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const a = new MyClass({ name: `a` }, `a`);
            const n1 = new MyClass({ name: `n1` }, `n1`);
            const n2 = new MyClass({ name: `n2` }, `n2`);
            const bulk = new BulkArray(a);

            bulk.finish(a);
            bulk.push(n1, n2);
            bulk.reject(n2);
            bulk.payload(n1).touched = true;

            expect(reportedIds(bulk)).to.deep.equal([`a`, `n1`, `n2`]);
        });

        it(`records the items pushed after 'clear' before a later not found record`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const [a, b, c, n1, n2] = [`a`, `b`, `c`, `n1`, `n2`].map((id) => new MyClass({ name: id }, id));
            const bulk = new BulkArray(a, b, c);

            bulk.reject(b);
            bulk.reject(c);
            bulk.clear();

            //As many items pushed as were cleared - the length is back where it was before "clear"
            bulk.push(n1, n2);
            bulk.finish(a);
            bulk.notFound(`x`, MyClass.alias);

            expect(reportedIds(bulk)).to.deep.equal([`a`, `b`, `c`, `n1`, `n2`, `x`]);
        });

        it(`reports a not found record of 'find' ahead of the found items`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            await new MyClass({ status: `:)`, name: `a` }, `a`).save();
            await new MyClass({ status: `:)`, name: `b` }, `b`).save();

            const found = await MyClass.find([`a`, `missing`, `b`]);
            expect(found.length).to.equal(2);

            expect(reportedIds(found)).to.deep.equal([`missing`, ...found.map((item) => item._id)]);
        });

        it(`appends the imported records and replaces the held ones in place`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const a = new MyClass({ name: `a` }, `a`);
            const b = new MyClass({ name: `b` }, `b`);
            const c = new MyClass({ name: `c` }, `c`);
            const d = new MyClass({ name: `d` }, `d`);

            const bulk = new BulkArray(a, b);
            bulk.finish(a);
            bulk.finish(b);

            //The foreign array records its items in its own array order - d, b, c
            const foreign = new BulkArray(d, b, c);
            foreign.reject(b, 409, `imported`);

            bulk.importStatus(foreign);

            expect(reportedIds(bulk)).to.deep.equal([`a`, `b`, `d`, `c`]);
            expect(bulk.esStatus(true).items[1].message).to.equal(`imported`);
        });

        it(`keeps the relative order of the failed items`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const a = new MyClass({ name: `a` }, `a`);
            const b = new MyClass({ name: `b` }, `b`);
            const c = new MyClass({ name: `c` }, `c`);
            const d = new MyClass({ name: `d` }, `d`);
            const bulk = new BulkArray(a, b, c, d);

            bulk.reject(d, 400);
            bulk.finish(c);
            bulk.clear();
            bulk.reject(b, 409);

            expect(reportedIds(bulk, false)).to.deep.equal([`b`, `d`]);
            expect(reportedIds(bulk)).to.deep.equal([`a`, `b`, `c`, `d`]);
        });
    });

    describe(`BulkArray item processing`, function() {
        it(`finishes with custom message instead of status code`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            bulk.finish(item, `Operation successful`);

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(200);
            expect(status.message).to.equal(`Operation successful`);
        });

        it(`finishes with statusCode and message`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            bulk.finish(item, 201, `Created`);

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(201);
            expect(status.message).to.equal(`Created`);
        });

        it(`rejects with statusCode, message and type`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            bulk.reject(item, 403, `Forbidden access`, `AUTH:FORBIDDEN`);

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(403);
            expect(status.message).to.equal(`Forbidden access`);
            expect(status.type).to.equal(`AUTH:FORBIDDEN`);
        });

        it(`rejects with Error object`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            const error = new Error(`Something went wrong`);
            error.status = 503;
            error.type = `SYSTEM:ERROR`;

            bulk.reject(item, error);

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(503);
            expect(status.message).to.equal(`Something went wrong`);
            expect(status.type).to.equal(`SYSTEM:ERROR`);
        });

        it(`rejects with Error object (fallback to message)`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            const error = new Error(`Simple error`);

            bulk.reject(item, error);

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(400);
            expect(status.message).to.equal(`Simple error`);
            expect(status.type).to.equal(`RESOURCE:INVALID_OPERATION`);
        });

        it(`rejects with custom object`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            const rejectObj = {
                statusCode: 418,
                message: `I'm a teapot`,
                code: `BREW:ERROR`
            };

            bulk.reject(item, rejectObj);

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(418);
            expect(status.message).to.equal(`I'm a teapot`);
            expect(status.type).to.equal(`BREW:ERROR`);
        });

        it(`rejects with string message`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            bulk.reject(item, `Direct message`);

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(400);
            expect(status.message).to.equal(`Direct message`);
            expect(status.type).to.equal(`RESOURCE:INVALID_OPERATION`);
        });


        it(`assigns the failure type from a real ES error`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test`, status: `active` });
            const bulk = new BulkArray(item);

            //Trigger ES mapping error by sending object to keyword field
            item.status = { some: `object` };

            await bulk.save();

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(400);
            expect(status.type).to.equal(`DATABASE:OPERATION_FAILED`);
        });

        it(`rejects with an object without any message`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            bulk.reject(item, { });

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(400);
            expect(status.message).to.equal(`The operation cannot be performed on this resource.`);
            expect(status.type).to.equal(`RESOURCE:INVALID_OPERATION`);
        });

        it(`rejects with an Error without any message`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            bulk.reject(item, new Error());

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(400);
            expect(status.message).to.equal(`Error`);
            expect(status.type).to.equal(`RESOURCE:INVALID_OPERATION`);
        });

        it(`rejects with a status code only`, () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const item = new MyClass({ name: `test` });
            const bulk = new BulkArray(item);

            bulk.reject(item, 404);

            const status = bulk.status[item.__uuid];
            expect(status.status).to.equal(404);
            expect(status.message).to.equal(`The operation cannot be performed on this resource.`);
            expect(status.type).to.equal(`RESOURCE:INVALID_OPERATION`);
        });

        it(`rejects all failed items`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);
            const okInstance = new MyClass({ status: `:)`, name: `ok` }, `ok`);
            const badInstance = new MyClass({ status: `:)`, unmapped: `strict mapping rejects this` }, `bad`);

            const bulk = new BulkArray(okInstance, badInstance);
            await bulk.save();

            bulk.rejectFailed();
            bulk.clear();

            //Only the failed item has been rejected and removed from the array
            expect(bulk.length).to.equal(1);
            expect(bulk[0]._id).to.equal(`ok`);

            const esStatus = bulk.esStatus();
            expect(esStatus.errors).to.be.true;
            expect(esStatus.count).to.equal(2);
            expect(esStatus.items.length).to.equal(1);
            expect(esStatus.items[0].id).to.equal(`bad`);
            expect(esStatus.items[0].type).to.equal(`DATABASE:OPERATION_FAILED`);
        });
    });

    describe(`functional tests`, () => {
        it(`Bulk status test`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

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

        it(`writes and reads objects bigger than a string limit`, async () => {
            const copies = 8;
            let hugeString = ``;
            for (let i = 0; i < (MAX_STRING_LENGTH / (10 * 4)); i++) {
                hugeString += `1234567890`;
            }

            const MyClass = createClass(`documents`).in(`odmtest`);
            const bulkArray = new BulkArray();
            for (let i = 0; i < copies; i++) {
                bulkArray.push(new MyClass({
                    text: hugeString
                }, `doc-${i}`));
            }
            await bulkArray.save();

            const allDocuments = await MyClass.findAll();
            expect(allDocuments.length).to.equal(copies);
            for (const myDocument of allDocuments) {
                expect(myDocument.text).to.equal(hugeString);
            }
        });
    });
});
