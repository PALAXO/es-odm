/*
 * Type level test of the public API - it never runs, it only has to compile.
 *
 * Its job is to fail when the generated declarations stop carrying usable type information. Two failure modes it
 * has to catch: a declaration file with a syntax error makes TypeScript silently degrade the whole module to
 * "any" (every "@ts-expect-error" below asserts that TypeScript really does reject the marked line), and an
 * over-strict declaration rejects a legitimate call (every plain call below asserts that it still compiles).
 */
import {
    createClass, BaseModel, BulkArray, JointModel, esClient, esErrors,
    callEs, sendBulk, setConfiguration, setClient, setLoggerConfig, setLoggerUidFunction
} from 'es-odm';
import type {
    SearchResult, SearchMetadata, SearchAdditional, SearchBody, CountBody, UpdateByQueryBody, DeleteByQueryBody,
    CreateIndexBody, PutMappingBody, BulkItemStatus, BulkEsStatus, EsResponse
} from 'es-odm';
//The deep import escape hatch of the consumers, resolved through "typesVersions" of the package
import type DeepImportedBulkArray from 'es-odm/lib/BulkArray.js';

const MyClass = createClass(`users`).in(`odmtest`);

//The deep imported class is the very same one the entry point exports
const deepImported: typeof DeepImportedBulkArray = BulkArray;
void deepImported;

// @ts-expect-error - an unknown static must not be accepted
MyClass.thisStaticDoesNotExist();

// @ts-expect-error - the tenant is a string
createClass(`users`).in(42);

// @ts-expect-error - the index name is mandatory
createClass();

async function documentApi(): Promise<void> {
    const found = await MyClass.search({ query: { match_all: {} } }, 0, 10);
    // @ts-expect-error - "search" resolves to a BulkArray, not to a number
    const notANumber: number = found;
    void notANumber;

    const counted: number = await MyClass.count();
    void counted;

    //A single id answers with a boolean, an array of ids with an array of them
    const exists: boolean = await MyClass.exists(`someId`);
    const allExist: boolean[] = await MyClass.exists([`someId`, `otherId`]);
    // @ts-expect-error - a single id answers one boolean, not an array
    const notAnArray: boolean[] = await MyClass.exists(`someId`);
    void [exists, allExist, notAnArray];

    //The same split for the heads
    const head: string = (await MyClass.head(`someId`))._id;
    const heads: string[] = (await MyClass.head([`someId`, `otherId`])).map((item) => item._id);
    void [head, heads];

    // @ts-expect-error - "from" is a number
    await MyClass.search({}, `nonsense`, 10);
}

async function partialAdditional(): Promise<void> {
    //Every member of "additional" is optional - passing one alone has to compile
    await MyClass.search({}, 0, 10, { source: true });
    await MyClass.search({}, void 0, void 0, { trackTotalHits: false });
    await MyClass.search({}, 0, 10, { pitId: `somePit`, refresh: 30 });
    await MyClass.search({}, 0, 10, { cache: {}, autoPitSort: false, searchAfter: [1] });
    await MyClass.findAll(true);
    await MyClass.find([`someId`], [`name`]);

    for await (const bulk of MyClass.bulkIterator({}, { source: true })) {
        void bulk;
    }
    for await (const item of MyClass.itemIterator({}, { pitId: `somePit` })) {
        void item;
    }

    // @ts-expect-error - an unknown member of "additional" must not be accepted
    await MyClass.search({}, 0, 10, { nonsense: true });
}

async function subclassInstances(): Promise<void> {
    //The dominant consumer pattern - a subclass adding its own fields and methods, bound to a tenant afterwards
    class Rights extends createClass(`rights`) {
        declare level: number;

        isAdmin(): boolean {
            return this.level > 9;
        }
    }
    const TenantRights = Rights.in(`odmtest`);

    //Every static read hands back instances of the subclass, not of BaseModel
    const searched = await TenantRights.search({ query: { match_all: {} } });
    const searchedFlag: boolean = searched[0].isAdmin();
    const searchedLevel: number = searched[0].level;
    const total: number | undefined = searched._total;
    const foundFlag: boolean = (await TenantRights.find(`someId`))[0].isAdmin();
    const allFlag: boolean = (await TenantRights.findAll())[0].isAdmin();
    void [searchedFlag, searchedLevel, total, foundFlag, allFlag];

    //"get" answers one instance for an id and a BulkArray for an array of them
    const gotFlag: boolean = (await TenantRights.get(`someId`)).isAdmin();
    const gotArray: BulkArray<Rights> = await TenantRights.get([`someId`, `otherId`]);
    const resolvedAtRuntime: string | Array<string> = (Math.random() > 0.5) ? `someId` : [`someId`];
    const gotEither = await TenantRights.get(resolvedAtRuntime);
    const gotEitherFlag: boolean = (gotEither instanceof BulkArray) ? gotEither[0].isAdmin() : gotEither.isAdmin();
    void [gotFlag, gotArray, gotEitherFlag];
    // @ts-expect-error - a single id answers one instance, not a BulkArray
    const notAnArray: BulkArray<Rights> = await TenantRights.get(`someId`);
    void notAnArray;

    for await (const page of TenantRights.bulkIterator({ query: { match_all: {} } })) {
        const pageFlag: boolean = page[0].isAdmin();
        const pageTotal: number | undefined = page._total;
        void [pageFlag, pageTotal];
    }
    for await (const item of TenantRights.itemIterator()) {
        const itemFlag: boolean = item.isAdmin();
        void itemFlag;
    }

    //Asking for the source still answers plain objects, which are not instances of the subclass
    for await (const page of TenantRights.bulkIterator({}, { source: [`level`] })) {
        // @ts-expect-error - a plain ES object is not an instance
        const notAnInstance: Rights = page[0];
        void notAnInstance;
    }
    const plain = await TenantRights.search({}, 0, 10, { source: true });
    // @ts-expect-error - a plain ES object is not an instance
    const notAnInstance: Rights = plain[0];
    void notAnInstance;

    // @ts-expect-error - an instance of the subclass still rejects an unknown method
    searched[0].thisMethodDoesNotExist();
}

async function subclassWithOwnStatics(): Promise<void> {
    //A consumer model may override a static with a signature of its own - the class then is no longer assignable to
    //"typeof BaseModel", and the inherited statics still have to work on it and hand back its instances
    // @ts-expect-error - the static side deliberately differs from BaseModel
    class Documents extends createClass(`documents`) {
        static async search(query: string): Promise<string> {
            return query;
        }

        isSigned(): boolean {
            return true;
        }
    }

    const TenantDocuments = Documents.in(`odmtest`).immediateRefresh(false);
    const signed: boolean = (await TenantDocuments.find(`someId`))[0].isSigned();
    const single: boolean = (await TenantDocuments.get(`someId`)).isSigned();
    for await (const item of TenantDocuments.itemIterator()) {
        const itemSigned: boolean = item.isSigned();
        void itemSigned;
    }
    void [signed, single];
}

async function customBaseClass(): Promise<void> {
    //A shared, module-level base the models of a consumer extend instead of a class expression
    class SharedBase extends BaseModel {
        static sharedStatic(): string {
            return this.alias;
        }

        describe(): string {
            return `shared`;
        }
    }

    //The created class keeps the type of its base - its own statics and instance members included
    const Shared = createClass(`users`, void 0, `odmtest`, SharedBase);
    const fromStatic: string = Shared.sharedStatic();
    const fromCopy: string = Shared.in(`other`).sharedStatic();
    const described: string = (await Shared.search({ query: { match_all: {} } }))[0].describe();
    void [fromStatic, fromCopy, described];

    //A model class extending it on top still works the same way
    class Rights extends createClass(`rights`, void 0, `*`, SharedBase) {
        isAdmin(): boolean {
            return true;
        }
    }
    const rightsFlag: boolean = (await Rights.in(`odmtest`).find(`someId`))[0].isAdmin();
    const rightsDescribed: string = (await Rights.in(`odmtest`).get(`someId`)).describe();
    void [rightsFlag, rightsDescribed];

    //Without a base the result stays the plain model class
    const plainClass: typeof BaseModel = createClass(`users`);
    void plainClass;
    // @ts-expect-error - the plain model class has no statics of the base
    createClass(`users`).sharedStatic();

    //A base overriding a static with a signature of its own is accepted as well
    // @ts-expect-error - the static side deliberately differs from BaseModel
    class DivergingBase extends BaseModel {
        static async search(query: string): Promise<string> {
            return query;
        }
    }
    const diverging = createClass(`users`, void 0, `odmtest`, DivergingBase);
    const divergingResult: string = await diverging.search(`query`);
    void divergingResult;

    // @ts-expect-error - a base which is not a model class is refused
    createClass(`users`, void 0, `odmtest`, class NotAModel {});
}

async function typedRequestBodies(): Promise<void> {
    //The ES request bodies carry the real ES types - members the library manages itself are rejected
    await MyClass.search({ query: { term: { status: `:)` } }, sort: [{ name: `asc` }], aggs: { byStatus: { terms: { field: `status` } } } });
    await MyClass.count({ query: { match_all: {} } });
    await MyClass.updateByQuery({ query: { match_all: {} }, script: { source: `ctx._source.status = ':|'`, lang: `painless` } });
    await MyClass.deleteByQuery({ query: { term: { status: `:(` } } });
    await MyClass.createIndex({ settings: { index: { refresh_interval: `-1` } }, mappings: { dynamic: `strict`, properties: { name: { type: `keyword` } } } });
    await MyClass.putMapping({ properties: { fullname: { type: `keyword` } } });
    await MyClass.putSettings({ index: { refresh_interval: `1s` } });

    // @ts-expect-error - "_source" of the body is ignored by the library, "additional.source" is the way
    await MyClass.search({ query: { match_all: {} }, _source: false });
    // @ts-expect-error - an unknown member of the body must be rejected
    await MyClass.search({ nonsense: true });
    // @ts-expect-error - the refresh is governed by "immediateRefresh()", not by the body
    await MyClass.updateByQuery({ query: { match_all: {} }, refresh: true });
}

async function typedResponses(): Promise<void> {
    const updated = await MyClass.updateByQuery({ query: { match_all: {} }, script: { source: `` } });
    const updatedCount: number | undefined = updated.updated;
    void updatedCount;

    const mapping = await MyClass.getMapping();
    const firstIndex = Object.values(mapping)[0];
    const properties = firstIndex?.mappings.properties;
    void properties;

    const task = await MyClass.waitForTask(`someTask`);
    const completed: boolean = task.completed;
    void completed;

    const bulk = new BulkArray<BaseModel>();
    const saved = await bulk.save();
    const took: number = saved.took;
    const firstItemStatus: number | undefined = saved.items[0]?.index?.status;
    void [took, firstItemStatus];

    const status = bulk.esStatus();
    //An instance never saved to ES has no id yet, so the record may carry none
    const firstId: string | undefined = status.items[0].id;
    void firstId;
    // @ts-expect-error - the processing state is internal and stripped from the ES-like status
    void status.items[0].state;

    const headed = await MyClass.head(`someId`);
    if (!Array.isArray(headed)) {
        const found: boolean = headed.found;
        void found;
    }
}

async function searchResultMetadata(): Promise<void> {
    //The search engine attaches the paging metadata to the returned array
    const found = await MyClass.findAll();
    const total: number | undefined = found._total;
    const aggregations: Object | undefined = found.aggregations;
    const lastPosition: Array<any> | undefined = found._lastPosition;
    const pitId: string | undefined = found.pitId;
    void [total, aggregations, lastPosition, pitId];

    //"search" overloads on "additional.source" - without it the metadata is reachable straight away
    const searched = await MyClass.search({ query: { match_all: {} } });
    const searchedTotal: number | undefined = searched._total;
    const firstHit: BaseModel = searched[0];
    void [searchedTotal, firstHit];

    const searchedPlain = await MyClass.search({ query: { match_all: {} } }, 0, 10, { source: [`name`] });
    // @ts-expect-error - with "source" given the entries are plain objects, not instances
    const notAnInstanceEither: BaseModel = searchedPlain[0];
    void notAnInstanceEither;

    //A caller which only resolves "source" at runtime still compiles, but gets the union
    const dynamicSource: boolean | string[] | undefined = (Math.random() > 0.5) ? [`name`] : void 0;
    const dynamic = await MyClass.search({}, 0, 10, { source: dynamicSource });
    //Both arms of the union carry the paging metadata, so it is reachable without narrowing
    const dynamicTotal: number | undefined = dynamic._total;
    void dynamicTotal;
    void (await MyClass.findAll(dynamicSource));
    void (await MyClass.find(`someId`, dynamicSource));

    //The shape a consumer really builds - a dynamic source spread together with the paging members
    const scrollObject: { pitId?: string, refresh?: number, searchAfter?: Array<any> } = {};
    void (await MyClass.search({}, 0, 10, { source: dynamicSource, ...scrollObject }));

    //"findAll" and "find" overload on "source" instead, so the instance form stays free of the union
    const instances = await MyClass.findAll();
    const firstInstance: BaseModel = instances[0];
    void firstInstance;

    const plain = await MyClass.findAll([`name`]);
    // @ts-expect-error - with "source" given the entries are plain objects, not instances
    const notAnInstance: BaseModel = plain[0];
    void notAnInstance;

    const foundInstances = await MyClass.find(`someId`);
    const foundTotal: number | undefined = foundInstances._total;
    void foundTotal;

    //The search engine attaches the paging metadata to the plain hits as well
    const plainPage = await MyClass.find(`someId`, false);
    const plainTotal: number | undefined = plainPage._total;
    const plainCursor: Array<any> | undefined = plainPage._lastPosition;
    const plainPit: string | undefined = plainPage.pitId;
    void [plainTotal, plainCursor, plainPit];
}

async function staticProperties(): Promise<void> {
    //The four properties every created class carries - consumers read them constantly
    const tenant: string = MyClass._tenant;
    const name: string = MyClass._name;
    const immediateRefresh: boolean | string = MyClass._immediateRefresh;
    const alias: string = MyClass.alias;
    const schema = MyClass.schema;
    void [tenant, name, immediateRefresh, alias, schema];

    //The class copies keep the whole static surface
    const cloned: typeof BaseModel = MyClass.clone({ status: `:)` });
    void await cloned.findAll();
    void await MyClass.immediateRefresh(false).findAll();

    //A class copy keeps the members of a subclass - the dominant consumer pattern
    class Subclass extends createClass(`users`) {
        static customStatic(): string {
            return this.alias;
        }
    }
    void Subclass.in(`odmtest`).customStatic();
    void Subclass.immediateRefresh(false).customStatic();
    void Subclass.clone({ status: `:)` }).customStatic();
    void await Subclass.in(`odmtest`).findAll();

    // @ts-expect-error - a class copy still rejects an unknown static
    Subclass.in(`odmtest`).thisStaticDoesNotExist();

    // @ts-expect-error - the tenant is a string
    const notANumber: number = MyClass._tenant;
    void notANumber;
}

async function indicesApi(): Promise<void> {
    //"getIndex" and "swapAlias" answer with nothing when there is no index
    const index: string | void = await MyClass.getIndex();
    void index;

    await MyClass.createIndex();
    await MyClass.aliasIndex(`odmtest_users-abc123`);
    await MyClass.deleteAlias();
    const aliasExists: boolean = await MyClass.aliasExists();
    const indexExists: boolean = await MyClass.indexExists();
    void [aliasExists, indexExists];

    await MyClass.getSettings();
    await MyClass.refresh();
    await MyClass.reindex(`odmtest_documents`);
    await MyClass.cloneIndex();
    await MyClass.deleteIndex();

    const pitId: string = await MyClass.openPIT();
    await MyClass.closePIT(pitId);
}

function clientAndErrors(): void {
    //Both are part of the import line of the README and both are used by the consumers
    void esClient.client;
    void esClient.pitTimeoutSeconds;

    const responseError = new esErrors.ResponseError({ body: void 0, statusCode: 404, headers: {}, meta: void 0 } as any);
    const isResponseError: boolean = responseError instanceof esErrors.ResponseError;
    void isResponseError;
}

function publicTypeAliases(): void {
    //Every type of the public surface has to be nameable without deep-importing the modules
    const additional: SearchAdditional = { source: [`name`], trackTotalHits: false };
    void additional;

    const searchBody: SearchBody = { query: { match_all: {} } };
    const countBody: CountBody = { query: { match_all: {} } };
    const updateBody: UpdateByQueryBody = { query: { match_all: {} } };
    const deleteBody: DeleteByQueryBody = { query: { match_all: {} } };
    const createBody: CreateIndexBody = { mappings: { dynamic: `strict` } };
    const mappingBody: PutMappingBody = { properties: { name: { type: `keyword` } } };
    void [searchBody, countBody, updateBody, deleteBody, createBody, mappingBody];

    const itemStatus: BulkItemStatus = { id: `someId`, index: `odmtest_users`, status: 200, message: `OK`, state: Symbol(), payload: {} };
    const esStatus: BulkEsStatus = { errors: false, items: [], count: 0 };
    void [itemStatus, esStatus];

    const result: SearchResult<BaseModel> | undefined = void 0;
    const response: EsResponse | undefined = void 0;
    //The metadata of the plain object form of a search is nameable without deep importing
    const metadata: Array<Record<string, any>> & SearchMetadata = Object.assign([], { _total: 0 });
    void [result, response, metadata];
}

async function instanceApi(): Promise<void> {
    const instance = new MyClass({ status: `:)`, name: `someone` }, `someId`);

    //Every documented instance metadata property has to be reachable, and none of them is guaranteed to be set
    const id: string | undefined = instance._id;
    const version: number | undefined = instance._version;
    const primaryTerm: number | undefined = instance._primary_term;
    const seqNo: number | undefined = instance._seq_no;
    const score: number | undefined = instance._score;
    const highlight: Record<string, string[]> | undefined = instance._highlight;
    const sort: Array<any> | undefined = instance._sort;
    const uuid: string = instance.__uuid;
    void [id, version, primaryTerm, seqNo, score, highlight, sort, uuid];

    // @ts-expect-error - an instance which was never saved carries no id, so the metadata must not be typed as always present
    const alwaysSet: string = instance._id;
    void alwaysSet;

    await instance.save();
    await instance.delete();
    await instance.validate();

    // @ts-expect-error - an unknown instance method must not be accepted
    instance.thisMethodDoesNotExist();
}

async function bulkApi(): Promise<void> {
    const bulk = new BulkArray<BaseModel>();
    const status = bulk.esStatus();

    const errors: boolean = status.errors;
    void errors;

    bulk.rejectFailed();
    bulk.clear();
    bulk.importStatus(new BulkArray<BaseModel>());

    // @ts-expect-error - "reject" needs the item it rejects
    bulk.reject();
}

async function jointModelApi(): Promise<void> {
    const jointModel = new JointModel();
    const Recorded = jointModel.recordSearch(MyClass);

    await Recorded.search({ query: { match_all: {} } });
    await jointModel.search();
    await jointModel.search({}, 0, 10, { source: true });

    // @ts-expect-error - an unknown method must not be accepted
    jointModel.thisMethodDoesNotExist();
}

async function moduleApi(): Promise<void> {
    const response = await callEs(`cluster.health`);
    const statusCode: number = response.statusCode;
    void statusCode;

    await callEs(`indices.getMapping`, { index: `odmtest_users` }, { asStream: true });
    await sendBulk([{ index: { _index: `odmtest_users` } }, { name: `someone` }]);

    //Each configuration threshold is optional on its own
    setConfiguration({ warning: { downloadedMiB: 100 } });
    setConfiguration({ warning: { searchCalls: 3 } });
    setConfiguration({ warning: { downloadedMiB: 100, searchCalls: 3 } });
    setConfiguration({ retries: { base: 2, maxRetries: 10 } });
    setConfiguration({ retries: { maxRetries: `10` } });
    // @ts-expect-error - the retry policy has no such member
    setConfiguration({ retries: { maxAttempts: 10 } });

    setClient(`http://localhost:9200`);
    setClient(`http://localhost:9200`, { pitTimeoutSeconds: 30 });
    setLoggerConfig({ name: `es-odm` });
    setLoggerUidFunction(() => `someUid`);

    // @ts-expect-error - the API path is mandatory
    await callEs();

    // @ts-expect-error - the operations are an array
    await sendBulk(`nonsense`);
}

void documentApi;
void partialAdditional;
void typedRequestBodies;
void typedResponses;
void searchResultMetadata;
void staticProperties;
void indicesApi;
void clientAndErrors;
void publicTypeAliases;
void instanceApi;
void bulkApi;
void jointModelApi;
void moduleApi;
