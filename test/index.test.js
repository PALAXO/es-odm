import bootstrapTest from './bootstrapTests.js';
import { createClass, callEs, sendBulk, esErrors, BaseModel } from '../index.js';

describe(`Module functions`, function() {
    this.timeout(testTimeout);

    describe(`createClass() with a base class`, () => {
        //A shared, module-level subclass of BaseModel - consumers extend it to give all their models common members
        class SharedBase extends BaseModel {
            static sharedStatic() {
                return `shared ${this.alias}`;
            }

            static async _getBulkSize() {
                return 7;
            }

            describe() {
                return `${this.constructor._name}: ${this.name}`;
            }
        }

        it(`extends the given base class`, async () => {
            const Created = createClass(`users`, void 0, `odmtest`, SharedBase);

            //The base's own statics and its hook overrides are inherited
            expect(Created.sharedStatic()).to.equal(`shared odmtest_users`);
            expect(await Created._getBulkSize()).to.equal(7);

            //The properties of createClass are set on the new class, the base itself stays untouched
            expect(Created._name).to.equal(`users`);
            expect(Created._tenant).to.equal(`odmtest`);
            expect(Created._immediateRefresh).to.be.true;
            expect(Created).not.to.equal(SharedBase);
            expect(SharedBase._name).to.be.undefined;

            const instance = new Created({ status: `:)`, name: `shared` });
            expect(instance).to.be.an.instanceOf(Created);
            expect(instance).to.be.an.instanceOf(SharedBase);
            expect(instance).to.be.an.instanceOf(BaseModel);
            expect(instance.describe()).to.equal(`users: shared`);
        });

        it(`keeps the base class through the class copies and the searches`, async () => {
            const Created = createClass(`users`, void 0, `*`, SharedBase);
            const Bound = Created.in(`odmtest`).immediateRefresh(true);
            expect(Bound.sharedStatic()).to.equal(`shared odmtest_users`);

            await new Bound({ status: `:)`, name: `searched` }, `sharedBase1`).save();

            //Found documents are built by the class bound to their index, which still extends the base
            const found = await Created.in(`odmtest*`).find(`sharedBase1`);
            expect(found.length).to.equal(1);
            expect(found[0]).to.be.an.instanceOf(SharedBase);
            expect(found[0].describe()).to.equal(`users: searched`);
        });

        it(`refuses a base class which is not BaseModel or its subclass`, () => {
            const message = `Base class must be BaseModel or its subclass.`;

            expect(() => createClass(`users`, void 0, `odmtest`, class NotAModel {})).to.throw(message);
            expect(() => createClass(`users`, void 0, `odmtest`, {})).to.throw(message);
            expect(() => createClass(`users`, void 0, `odmtest`, null)).to.throw(message);
            expect(() => createClass(`users`, void 0, `odmtest`, `BaseModel`)).to.throw(message);

            //Omitting the base, or handing over BaseModel itself, keeps the default
            expect(Object.getPrototypeOf(createClass(`users`, void 0, `odmtest`, void 0))).to.equal(BaseModel);
            expect(Object.getPrototypeOf(createClass(`users`, void 0, `odmtest`, BaseModel))).to.equal(BaseModel);
        });
    });

    describe(`callEs()`, () => {
        it(`can't call without or with unknown API`, async () => {
            await expect(callEs()).to.be.eventually.rejectedWith(`You have to specify an ES API.`);
            await expect(callEs(``)).to.be.eventually.rejectedWith(`You have to specify an ES API.`);
            await expect(callEs(`nonsense`)).to.be.eventually.rejectedWith(`Unknown ES API 'nonsense'.`);
            await expect(callEs(`nonsense.api`)).to.be.eventually.rejectedWith(`Unknown ES API 'nonsense.api'.`);
        });

        it(`calls top-level and nested APIs`, async () => {
            const health = await callEs(`cluster.health`);
            expect(health.statusCode).to.equal(200);
            expect(health.body.status).to.be.oneOf([`green`, `yellow`, `red`]);

            const stats = await callEs(`indices.stats`, { index: `odmtest_users` });
            expect(stats.body._all).to.be.an(`object`);

            const search = await callEs(`search`, { index: `odmtest_users`, query: { match_all: {} } });
            expect(search.body.hits.hits).to.be.an(`array`);
        });

        it(`parses streamed responses`, async () => {
            const mapping = await callEs(`indices.getMapping`, { index: `odmtest_users` }, { asStream: true });
            expect(mapping.statusCode).to.equal(200);
            const index = Object.keys(mapping.body)[0];
            expect(index).to.include(`odmtest_users`);
            expect(mapping.body[index].mappings.properties.name.type).to.equal(`keyword`);
        });

        it(`throws with a status code`, async () => {
            let thrownError;
            try {
                await callEs(`indices.getMapping`, { index: `surely_nonexistent_index` }, { asStream: true });
            } catch (error) {
                thrownError = error;
            }
            expect(thrownError).not.to.be.undefined;
            expect(thrownError.statusCode).to.equal(404);
        });
    });

    describe(`sendBulk()`, () => {
        it(`requires an array`, async () => {
            await expect(sendBulk(`nonsense`)).to.be.eventually.rejectedWith(`Operations must be an array!`);
        });

        it(`returns empty response for empty operations`, async () => {
            const response = await sendBulk([]);
            expect(response.errors).to.be.false;
            expect(response.items).to.deep.equal([]);
        });

        it(`sends bulk operations`, async () => {
            const operations = [];
            for (let i = 0; i < 3; i++) {
                operations.push({
                    index: {
                        _index: `odmtest_users`,
                        _id: `bulk${i}`
                    }
                });
                operations.push({
                    status: `:)`,
                    name: `bulk${i}`
                });
            }

            const response = await sendBulk(operations);
            expect(response.errors).to.be.false;
            expect(response.items.length).to.equal(3);

            const found = await createClass(`users`).in(`odmtest`).find([`bulk0`, `bulk1`, `bulk2`]);
            expect(found.length).to.equal(3);
        });

        it(`doesn't refresh the index when the refresh is disabled`, async () => {
            const operations = [
                { index: { _index: `odmtest_users`, _id: `silentBulk` } },
                { status: `:)`, name: `silent` }
            ];

            const response = await sendBulk(operations, false);
            expect(response.errors).to.be.false;

            //"refresh_interval" of the fixture index is -1, so an unrefreshed write stays invisible to a search
            const notVisible = await bootstrapTest.client.search({
                index: `odmtest_users`,
                query: { term: { name: `silent` } }
            });
            expect(notVisible.hits.hits.length).to.equal(0);

            await bootstrapTest.client.indices.refresh({ index: `odmtest_users` });
            const visible = await bootstrapTest.client.search({
                index: `odmtest_users`,
                query: { term: { name: `silent` } }
            });
            expect(visible.hits.hits.length).to.equal(1);
        });

        it(`reports per-item failures without throwing`, async () => {
            const operations = [
                { index: { _index: `odmtest_users`, _id: `bulkOk` } },
                { status: `:)`, name: `ok` },
                { index: { _index: `odmtest_users`, _id: `bulkBad` } },
                { status: `:)`, unknownField: `strict mapping rejects this` }
            ];

            const response = await sendBulk(operations);
            expect(response.errors).to.be.true;
            expect(response.items[0].index.status).to.be.below(300);
            expect(response.items[1].index.status).to.equal(400);
        });
    });

    describe(`esErrors`, () => {
        it(`is the error type the library throws`, async () => {
            const MyClass = createClass(`users`).in(`odmtest`);

            let thrownError;
            try {
                await MyClass.get(`unknown`);
            } catch (e) {
                thrownError = e;
            }

            //Consumers branch on this type, so it has to be the very one the ES package exports
            expect(thrownError).to.be.an.instanceOf(esErrors.ResponseError);
            expect(thrownError).to.be.an.instanceOf(esErrors.ElasticsearchClientError);
            expect(thrownError.statusCode).to.equal(404);
        });

        it(`exposes the error classes of the ES package`, () => {
            expect(esErrors.ResponseError).to.be.a(`function`);
            expect(esErrors.ConfigurationError).to.be.a(`function`);
            expect(esErrors.ConnectionError).to.be.a(`function`);
            expect(esErrors.TimeoutError).to.be.a(`function`);
        });
    });
});
