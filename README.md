# es-odm

An Object Document Mapper for Elasticsearch — it maps ES documents onto JavaScript classes, so a document becomes an instance you can validate, save, reload and delete, and an index becomes a class you can search through.

- Pure ESM (`"type": "module"`), no build step
- Requires **Node.js 22 or newer** and an **Elasticsearch 9** cluster
- Ships TypeScript declarations, so editors autocomplete the whole API without a separate `@types` package

```bash
npm install es-odm
```

## Quick start

```js
import Joi from 'joi';
import { createClass, setClient } from 'es-odm';

setClient(`http://localhost:9200`);

const Users = createClass(`users`, Joi.object({
    name: Joi.string().required(),
    active: Joi.boolean()
}));

//Bound to a tenant - this one works with the "acme_users" alias
const AcmeUsers = Users.in(`acme`);

//Create the index and its alias once
await AcmeUsers.createIndex();

//Create a document
const user = new AcmeUsers({ name: `Alice`, active: true }, `alice`);
await user.save();

//Read
const alice = await AcmeUsers.get(`alice`);
const active = await AcmeUsers.search({ query: { term: { active: true } } });

//Update
alice.name = `Alice B.`;
await alice.save();

//Delete a whole result set at once
await active.delete();
```

---

# Concepts

## Tenant, name, alias and the underlying index

Every model class carries a **tenant** and a **name**. Together they form the **alias** the library talks to:

```
alias  = `${tenant}_${name}`        // acme_users
index  = `${tenant}_${name}-${uuid}` // acme_users-1f0b8c2e...
```

- The tenant defaults to `*`, i.e. "every tenant", and is narrowed with `in(tenant)`.
- Data is addressed through the **alias**; the underlying index name is an implementation detail the library generates and resolves for you. This is what makes reindexing and cloning possible: build a new index, move the data, swap the alias, drop the old one — consumers never notice.
- Because the format is parsed back apart (`_parseIndex`), **a tenant must never contain `_` and a name must never contain `-`**; `createClass` and `in()` throw when they do.

A class whose alias still contains a wildcard can search, count and run the `*byQuery` operations — those legitimately span every matching index. Anything addressing one concrete document or index (creating an instance, id-based reads and writes, the index and alias lifecycle) requires a fully specified alias and throws otherwise. `find` and `findAll` run through `search`, so they work on a wildcard class as well and return the matching documents of every index its alias matches.

## Creating and copying classes

`createClass(name, ?schema, ?tenant, ?Base)` returns a subclass of `BaseModel` carrying four static properties — `schema`, `_tenant`, `_name` and `_immediateRefresh`. Everything else is derived from them.

Classes are **never mutated in place**. `in()`, `immediateRefresh()` and `clone()` each return a new subclass, so narrowing a class to a tenant can never leak back into the class you narrowed:

```js
const Users = createClass(`users`);          // *_users
const AcmeUsers = Users.in(`acme`);          // acme_users
const SilentUsers = AcmeUsers.immediateRefresh(false);

Users.alias;         // still "*_users"
AcmeUsers.alias;     // still "acme_users"
```

You subclass a model like any other class, which is how you add your own behaviour:

```js
class Counters extends createClass(`counters`, Joi.object()) {
    async increment() {
        this.value = (this.value ?? 0) + 1;
        await this.save();
    }

    static async search(...args) {
        //Overriding search affects find, findAll and both iterators as well
        return super.search(...args);
    }
}
```

Members all your models should share go into a base class of your own, handed to `createClass` as its fourth argument. The created class extends it, and in TypeScript it keeps its type, so the shared statics and instance members stay visible through `in()`, `search()` and the other class copies and reads:

```js
class AcmeModel extends BaseModel {
    static async _getBulkSize() {
        return 500;
    }

    describe() {
        return `${this.constructor._name}: ${this._id}`;
    }
}

class Orders extends createClass(`orders`, Joi.object(), `*`, AcmeModel) {}
```

## Instances and their metadata

An instance holds **only the document data** as ordinary enumerable properties. Everything Elasticsearch knows about the document lives in **non-enumerable** metadata, so it stays out of `JSON.stringify`, `Object.keys` and Joi validation:

`_id`, `_version`, `_highlight`, `_primary_term`, `_seq_no`, `_score`, `_sort`, and the library-internal `__uuid`. Everything but `__uuid` is `undefined` until Elasticsearch fills it in, unless you pass it to the constructor yourself — as the `_id` below.

```js
const user = new AcmeUsers({ name: `Alice` }, `alice`);
Object.keys(user);        // ["name"] - the metadata is invisible
JSON.stringify(user);     // {"name":"Alice"}
user._id;                 // "alice"
```

## Immediate refresh

Write operations send `refresh: true` by default, so a write is immediately visible to the next search. Opt out per class copy:

```js
const Silent = AcmeUsers.immediateRefresh(false);   // or `wait_for`
```

It governs the instance writes, the id-based statics (`delete`, `update`), the `*byQuery` functions and `reindex`. A `BulkArray` is the exception — it carries **its own** `_immediateRefresh`, because one array may hold instances of several classes and there would be no single class to inherit it from:

```js
const bulk = await AcmeUsers.findAll();
bulk._immediateRefresh = false;
await bulk.save();
```

## Searching, paging and Point in Time

`search()` takes `from` and `size` from its arguments, falling back to the ones in the body, and the result is not always a plain page:

- **No `from`/`size` at all** means *download everything*. The library opens an implicit Point in Time and pages through the entire result set with `search_after`, so the result is complete regardless of size. With an explicit `pitId` it is a single page of `_getBulkSize()` hits instead — the paging is then yours.
- **`from + size` above `es:maxResults` (10000)** also switches to an implicit PIT, because Elasticsearch itself refuses such a window — unless an explicit `pitId` is given, which caps `size` at `es:maxResults` instead.
- **Otherwise** it is one ordinary search.

An implicitly opened PIT is always closed, including when a request fails. A PIT you opened yourself through `openPIT()` is never closed for you.

The returned array carries non-enumerable paging metadata: `_total` (unless `trackTotalHits: false`), `aggregations`, `_lastPosition` (the cursor for the next page) and `pitId` when you paged through an explicit PIT.

```js
//Manual paging through an explicit PIT
const pitId = await AcmeUsers.openPIT();
let lastPitId = pitId;
try {
    let page = await AcmeUsers.search({}, 0, 100, { pitId: pitId });
    lastPitId = page.pitId ?? lastPitId;
    while (page.length > 0) {
        //... process the page ...
        page = await AcmeUsers.search({}, void 0, 100, {
            pitId: lastPitId,
            searchAfter: page._lastPosition
        });
        lastPitId = page.pitId ?? lastPitId;
    }
} finally {
    //Elasticsearch may hand out a new id when it switches a shard copy - close the freshest one
    await AcmeUsers.closePIT(lastPitId);
}
```

> `_lastPosition` holds the sort values exactly as parsed from the Elasticsearch response — a plain array, safe to serialize and clone. A missing sort value is reported by Elasticsearch as a Long sentinel a JavaScript number cannot hold precisely; the library restores its exact value whenever the cursor is passed back through `searchAfter` or `body.search_after`, so hand it back to the library rather than to a raw Elasticsearch call, and do no arithmetic on its entries.

### Instances or plain objects

Whenever `additional.source` is given, the search returns **plain ES hits instead of instances** — there is nowhere to put a `_source` subset. The declarations model this with overloads, so you keep full autocompletion in both cases:

```js
const instances = await AcmeUsers.search({});                       // BulkArray of instances
const plain = await AcmeUsers.search({}, 0, 10, { source: [`name`] }); // raw ES hits
```

## BulkArray and the status ledger

A search without `additional.source` answers with a `BulkArray` — an `Array` subclass that can persist all of its items through the ES Bulk API in one round trip, and that keeps a **status ledger** describing what happened to each item.

Each item is in one of two groups: the *processing set* (the default) and everything taken out of it by `reject()` or `finish()`. Only items in the processing set are touched by `save()`, `delete()` and `reload()`:

```js
const users = await AcmeUsers.findAll();

for (const user of users) {
    if (!user.active) {
        users.reject(user, 400, `Inactive user`, `USER:INACTIVE`);
    }
}

await users.save();               // writes only the items still in the processing set
const status = users.esStatus();  // the failures, in an ES-like shape
users.clear();                    // drops the rejected and finished items from the array
```

`clear()` removes those items from the array but **keeps their status records**, so a later `esStatus()` still reports them. `esStatus(true)` returns every record rather than only the failures.

The records are listed in the order they were created. The first ledger operation — any of the functions below, but `notFound` — records every item of the array in the array order, and each later one appends the items added to the array since, again in the array order. A cleared item therefore keeps its position, an item pushed later follows the earlier ones whatever is rejected or finished first, a `notFound` record sits where it was written (ahead of the found items in a `find` result) and an imported record joins the end unless it replaces one already held.

> A `BulkArray` produced by `filter()`, `map()` or `slice()` is a **new** array with an empty ledger and `_immediateRefresh` back at its default — JavaScript builds it through the species constructor, which gets no reference to the original. Keep working with the original array, or move the items into one you construct yourself.

## Searching several models at once — JointModel

`JointModel` records queries from several unrelated model classes and runs them as a **single** ES search across the indices of the models which recorded a query, returning one mixed `BulkArray` in which each instance is built by its own class:

```js
import { JointModel } from 'es-odm';

const joint = new JointModel();
const RecordedUsers = joint.recordSearch(AcmeUsers);
const RecordedOrders = joint.recordSearch(createClass(`orders`).in(`acme`));

await RecordedUsers.search({ query: { term: { active: true } } });
await RecordedOrders.search({ query: { range: { total: { gte: 100 } } } });

const results = await joint.search({}, 0, 20);   // users and orders together
```

Each recorded query is confined to the index of the model that recorded it, so one model's query can never match another model's documents. A model you record but never search contributes nothing, so the search, its Point in Time and its page size ignore it — registering a model whose index does not exist yet is therefore harmless as long as you do not search it.

> `recordSearch` hands back a **recording clone** of the class. Only `search()` may be called on it — it records the query and resolves to `undefined`. Every other function reaching Elasticsearch throws, including through a `BulkArray` holding its instances. Keep using the original class for everything else.

## Extension hooks

All of these are no-ops by default; override them in your subclass:

| Hook | Called | Use it for |
|:---|:---|:---|
| `static _alterSearch(body)` | `search`, `count`, `updateByQuery`, `deleteByQuery` | narrowing every query of the model |
| `static _unpackData(source)` | after every read | converting the stored format into the working one |
| `async _packData(?cache)` | before an instance or bulk write | converting the working format into the stored one |
| `static async _afterSearch(instances, ?cache)` | after instances are built | enriching what was loaded |
| `static async _getBulkSize()` | paging and iteration | the page size of this model; it has to be a positive number, `es:paginationSize` by default |

---

# API reference

## Module exports

```js
import {
    createClass, BaseModel, BulkArray, JointModel,
    esClient, setClient, esErrors,
    setConfiguration, setLoggerConfig, setLoggerUidFunction,
    callEs, sendBulk
} from 'es-odm';
```

- **`createClass(name, ?schema = Joi.object(), ?tenant = '*', ?Base = BaseModel)`** — creates a new model class extending `Base`, which has to be `BaseModel` or a subclass of it. Throws when the name contains `-`, the tenant contains `_`, either is not a non-empty string, or `Base` is no such class.
- **`BaseModel`** — the base class every model inherits from. Use it for `instanceof` checks; do not instantiate it or change its properties.
- **`BulkArray`** — the array returned by searches, see below.
- **`JointModel`** — cross-model search, see below.
- **`esClient`** — the ES client singleton wrapper. `esClient.client` is the underlying `@elastic/elasticsearch` client.
- **`setClient(options, ?additional)`** — replaces the client globally, including for already created classes. `options` is a node URL, an array of them, or a full client options object. `additional` accepts `requestTimeoutSeconds`, `pingTimeoutSeconds` and `maxRetries`, each used only when the equivalent client option is not set explicitly, and `pitTimeoutSeconds`, the Point in Time keep-alive, which has no client equivalent — leaving it out resets it to `es:pitTimeoutSeconds`.
- **`esErrors`** — the error classes of the underlying ES package; a request rejected by Elasticsearch throws an `esErrors.ResponseError`, a connection failure or timeout its `ConnectionError` / `TimeoutError`. The library raises a `ResponseError` itself for a missing id of `get`/`head`, a failed task of `waitForTask` and a shard failure (status 500). Other failures it detects itself — a version mismatch found while fetching the missing sequence numbers, a document a `BulkArray` finds missing while fetching them (404), a failed single-id `delete`/`update`, a bulk that cannot be split any further, a `waitForTask` timeout, invalid arguments — throw a plain `Error`, with the status in `statusCode` where one applies; a version conflict Elasticsearch reports to an instance `save`/`delete` is a `ResponseError` with 409.
- **`setConfiguration(configuration)`** — sets `warning.downloadedMiB` (in MiB) and `warning.searchCalls`, the thresholds at or above which a single ODM call logs a warning (zero disables a threshold), and `retries.base` / `retries.maxRetries`, the backoff of the 429 retry. Numbers and numeric strings are accepted, anything else is ignored, as are a `retries.base` which is not positive and a negative `retries.maxRetries`. `retries.maxRetries` is the library's own 429 handling, not the client-level `maxRetries` of `setClient`.
- **`setLoggerConfig(?config)`** — replaces the bunyan logger configuration; called without an argument it restores the default.
- **`setLoggerUidFunction(fn)`** — supplies a function returning a correlation id (a string, or an object merged into the record) for the logs of the current context; it is applied to the `console` streams only, the `file` and `rotating-file` streams never get it.
- **`async callEs(functionPath, ?params, ?additional)`** — calls an arbitrary ES client API by its dot-separated path (`indices.stats`, `snapshot.create`), with the library's retry, logging and streamed-response handling. Returns the **full response envelope** (`body`, `statusCode`, `headers`, `meta`). `additional.asStream` parses the response as a stream, bypassing the maximum string length. Intended for cluster and ops APIs the models do not cover.
- **`async sendBulk(operations, ?refresh = true)`** — sends raw Bulk API operations, splitting the payload automatically when it is too large. All operations must be of the same type and a payload line must directly follow its operation line. Returns the merged ES bulk response body.

### Exported types

`SearchResult<T>`, `SearchMetadata`, `SearchAdditional`, `SearchBody`, `CountBody`, `UpdateByQueryBody`, `DeleteByQueryBody`, `CreateIndexBody`, `PutMappingBody`, `BulkItemStatus`, `BulkEsStatus`, `EsResponse`.

## BaseModel — properties

- **`static schema`** — the Joi schema `validate()` and `save()` check against.
- **`static _tenant`**, **`static _name`** — the two halves of the alias.
- **`static _immediateRefresh`** — `true`, `false` or an ES refresh string such as `wait_for`.
- **`static get alias`** — the full alias (`tenant_name`), usable directly in ES queries.
- **`static get __constructorIdentifier`** — identity of the class used when grouping instances of several models; override it when your models share a constructor.

## BaseModel — documents

- **`static async search(?body, ?from, ?size, ?additional)`** — runs an ES search. Returns a `BulkArray` of instances, or plain ES hits when `additional.source` is given. `find`, `findAll` and both iterators build on it, so overriding it affects them too — `get`, `head` and `exists` go to ES directly and are not covered. A top-level `_source` in the body is ignored — use `additional.source`. `additional` accepts:
  - `cache` — object handed to `_afterSearch`
  - `source` — ES `_source`; switches the return value to plain objects
  - `searchAfter` — cursor of the previous page; requires `from` to resolve to 0
  - `pitId` — an explicit Point in Time, which is then not closed for you; requires `from` to resolve to 0. Each call returns one page: `size` capped at `es:maxResults`, or `_getBulkSize()` hits without an explicit `size`
  - `refresh` — Point in Time keep-alive in seconds
  - `trackTotalHits` — whether `_total` is populated, default `true`
  - `autoPitSort` — whether an explicit PIT without a `sort` gets an ascending `_shard_doc` sort, default `true`
- **`static async *bulkIterator(?body, ?additional)`** — async generator yielding whole pages; the page size comes from `_getBulkSize()`. It pages through a PIT itself, so it reads only `cache`, `source`, `refresh`, `trackTotalHits` and `pitId` out of `additional` — `searchAfter` and `autoPitSort` are its own business.
- **`static async *itemIterator(?body, ?additional)`** — async generator yielding single documents. Same subset of `additional` as `bulkIterator`, with `trackTotalHits` forced to `false`.
- **`static async findAll(?source)`** — every document of the alias.
- **`static async find(ids, ?source)`** — documents by id, through `search`. Ids that do not exist are recorded in the result's status ledger as `404` / `RESOURCE:NOT_FOUND`, so the array can be shorter than the id list; with `source` the result is a plain array without a ledger, so a missing id just leaves no hit.
- **`static async get(ids)`** — documents by id through ES `mget`. **Throws a 404 when any of the ids does not exist** — use `find` when a missing id should be tolerated. A single id answers with one instance, an array of ids with a `BulkArray`.
- **`static async head(ids)`** — the metadata of the documents without their `_source`. **Throws a 404 when any of the ids does not exist.** A single id answers with one object, an array with an array.
- **`static async exists(ids)`** — a boolean per id; a single id answers with one boolean.
- **`static async delete(ids, ?version)`** — deletes through the Bulk API and returns the merged bulk response. A **single id throws** when its bulk item fails, with the ES status in `statusCode`; an array of ids reports the failure in the response instead. With `version` only one id is allowed, and a version mismatch throws with `statusCode` 409.
- **`static async update(ids, body)`** — partial update through the Bulk API; returns the merged bulk response. A **single id throws** when its bulk item fails, with the ES status in `statusCode`; an array of ids reports the failure in the response instead.
- **`static async count(?body)`** — the number of matching documents.
- **`static async updateByQuery(body, ?scrollSize = _getBulkSize(), ?waitForCompletion = true)`** — ES `update_by_query`. With `waitForCompletion: false` Elasticsearch answers immediately with `{ task: '<id>' }` instead of the result; hand that `task` to `waitForTask`.
- **`static async deleteByQuery(body, ?scrollSize = _getBulkSize(), ?waitForCompletion = true)`** — ES `delete_by_query`, same asynchronous mode.

## BaseModel — indices

- **`static async createIndex(?body, ?setAlias = true)`** — creates the underlying index and, unless told otherwise, puts the alias on it. `body` carries ES settings and mappings. Returns the new index.
- **`static async getIndex()`** — the index the alias points at, or `undefined` when neither exists. Throws when the alias spans several indices.
- **`static async aliasIndex(index)`** — puts this model's alias onto the given index. Throws when the alias is already in use.
- **`static async swapAlias(index, ?removeOriginalIndex = false)`** — atomically moves the alias onto the given index, optionally deleting the previously aliased one in the same action. Returns the previously aliased index, if there was one.
- **`static async deleteAlias()`** — removes the alias, leaving the index untouched. Throws when the alias does not exist.
- **`static async aliasExists()`**, **`static async indexExists()`** — existence checks.
- **`static async deleteIndex()`** — deletes the alias and the index behind it.
- **`static async getMapping()`**, **`static async putMapping(mapping)`** — index mappings; both return the ES response.
- **`static async getSettings(?includeDefaults = false)`**, **`static async putSettings(settings)`** — index settings; both return the ES response.
- **`static async reindex(destinationModel, ?script, ?scrollSize, ?waitForCompletion = true)`** — reindexes into another model or into an alias given as a string, optionally through a painless script.
- **`static async cloneIndex(?settings, ?targetIndex)`** — clones the index, preserving the replica count. The source index has to be blocked for writes first. Returns the new index.
- **`static async refresh()`** — refreshes the matching indices and returns the ES response.
- **`static async openPIT()`** — opens a Point in Time and returns its id.
- **`static async closePIT(id)`** — closes it and answers whether it was open.

## BaseModel — tasks

For the operations started with `waitForCompletion: false`, which answer with `{ task: '<id>' }`:

- **`static async getTask(taskId)`** — the current state of the task.
- **`static async waitForTask(taskId, ?pollIntervalSeconds = 2, ?maxWaitSeconds)`** — polls until the task completes, then returns it; its `response` carries the operation result. Throws when the task itself failed, and, when `maxWaitSeconds` is given, when the task does not complete within that time.

## BaseModel — class copies

- **`static clone(?changes)`** — a new subclass with the given static properties set.
- **`static in(newTenant)`** — a copy bound to another tenant.
- **`static immediateRefresh(newImmediateRefresh)`** — a copy with another refresh mode; accepts a boolean or an ES refresh string.

`in()` and `immediateRefresh()` hand back the very same class when the value already matches. All three keep whatever a subclass added, in TypeScript as well — `class Users extends createClass('users') { ... }` followed by `Users.in(tenant)` still offers the members of `Users`, and its `search`, `find`, `findAll`, `get`, `bulkIterator` and `itemIterator` are typed with instances of `Users`.

## BaseModel — instances

- **`new MyClass(?data, ?_id, ?_version, ?_highlight, ?_primary_term, ?_seq_no, ?_score, ?_sort)`** — the data object becomes the instance properties; everything else becomes non-enumerable metadata.
- **`async save(?useVersion = false)`** — validates against the schema, then indexes the document, generating an `_id` when there is none. `useVersion` refuses the write when the stored version differs, throwing with `statusCode` 409; the sequence numbers are fetched automatically when missing. Returns the instance.
- **`async reload()`** — refreshes the instance from ES, dropping properties the stored document no longer has.
- **`async delete(?useVersion = false)`** — deletes the document; `useVersion` behaves as in `save`.
- **`clone(?preserveAttributes = true)`** — a deep copy built from the same class. With `preserveAttributes` the metadata is carried over, `__uuid` excepted — a clone is always a new item of a `BulkArray`.
- **`async validate()`** — validates against the Joi schema and throws on a violation.

## BaseModel — hooks and internals

The hooks from the concepts above (`_alterSearch`, `_unpackData`, `_packData`, `_afterSearch`, `_getBulkSize`), plus the machinery a subclass may legitimately need to override:

- **`static _parseIndex(index)`** — splits an index or alias into `{ tenant, name, alias }`.
- **`static _generateIndex()`** — the name of a new underlying index.
- **`static __checkIfFullySpecified(functionName)`** — throws when the alias still contains a wildcard.
- **`static __getConstructor(searchResult, constructorCache)`** — picks the class a search hit is instantiated with.
- **`static __searchedAlias`** — the indices a search really touches; the whole alias for a model, only the queried models for a `JointModel`.

## BulkArray

Beyond everything an `Array` does:

- **`async save(?useVersion = false)`** — validates **every** item still in the processing set first, so one invalid item means nothing is written, then writes them all through the Bulk API. Generated ids are pushed back into the instances. `useVersion` fetches the missing sequence numbers and refuses stale writes.
- **`async delete(?useVersion = false)`** — deletes all processed items.
- **`async reload()`** — reloads all processed items from their own indices and then clears the array.
- **`get status`** — the raw ledger, keyed by the internal `__uuid` of each item.
- **`esStatus(?includeAll = false)`** — the ledger in an ES-like shape: `{ items, errors, count }`. By default only the failing records are listed; `includeAll` returns every one of them. Either way in the order of the records, see above.
- **`reject(item, ?statusCodeOrError, ?message, ?type)`** — takes the item out of the processing set and marks it failed. The second argument may be a status code, a message, an `Error` or an object carrying `status`/`statusCode`, `message` and `type`/`code`.
- **`rejectFailed()`** — rejects every item whose current status is 400 or worse.
- **`finish(item, ?statusCode = 200, ?message)`** — takes the item out of the processing set and marks it done. The second argument may be a status code or a message.
- **`notFound(id, ?alias)`** — records an id that was asked for but does not exist; this is what `find` uses.
- **`payload(item)`** — a free-form object stored alongside the item's status record, created on first access. It, `reject` and `finish` identify the item by its internal `__uuid` and throw for anything which is not an ODM instance.
- **`clear()`** — removes the rejected and finished items from the array, keeping their status records.
- **`importStatus(...bulkArrays)`** — merges the ledgers of other arrays into this one; records this array does not have are added, records it shares are overwritten.
- **`_immediateRefresh`** — per-array refresh switch, see the concepts above.

A search result additionally carries `_total`, `aggregations`, `_lastPosition` and `pitId`.

## JointModel

- **`new JointModel()`**
- **`recordSearch(OdmModel)`** — returns a recording clone of the model; every `search()` on it records the query instead of running it.
- **`async search(?body, ?from, ?size, ?additional)`** — runs all recorded queries as one ES search across the indices of the models which recorded one; each instance is built by its own model class. The arguments and the return value match `BaseModel.search` with one exception: **`body.query` is replaced by the recorded queries**, so pass sorting, aggregations and paging in the body and put the filtering into the recorded searches. Throws when nothing has been recorded.
- **`async *bulkIterator(?body, ?additional)`**, **`async *itemIterator(?body, ?additional)`** — the same iteration as on a model, across the models which recorded a query; the page size is the smallest `_getBulkSize()` among them.
- **`clearSearch()`** — forgets the recorded queries; the models stay recorded, and their recording clones keep recording into the same model.
- **`async openPIT()`**, **`async closePIT(id)`** — a Point in Time over the indices of the models which recorded a query, or of all the registered models while none has.
- **`get alias`** — the aliases of all the recorded models.
- **`models`** — the recorded models with their queries.

---

# Configuration

Defaults live in `lib/config/config.json` and can be overridden through the environment or argv (nconf). The library keeps them in an nconf instance of its own, so the process-wide nconf of the consumer neither sees nor overrides them — at runtime use `setClient` and `setConfiguration` instead. The keys the library reads:

| Key | Default | Meaning |
|:---|:---|:---|
| `es:url` | `http://localhost:9200` | node URL used until `setClient` replaces it |
| `es:requestTimeoutSeconds` | 120 | client request timeout |
| `es:pingTimeoutSeconds` | 5 | client ping timeout |
| `es:maxRetries` | 3 | client-level retries |
| `es:maxResults` | 10000 | the result window above which searching switches to a Point in Time |
| `es:paginationSize` | 1000 | default page size of `_getBulkSize()` |
| `es:pitTimeoutSeconds` | 60 | Point in Time keep-alive |
| `es:retryOnConflict` | 10 | `retry_on_conflict` of the bulk update operations |
| `es:retries:base`, `es:retries:maxRetries` | 2, 6 | exponential backoff of the 429 retry; `setConfiguration` sets the same pair |
| `warning:downloadedB`, `warning:searchCalls` | 0 | warning thresholds; `setConfiguration` sets the same pair, but takes the first one in MiB |
| `joi:validatorConfig` | see the file | options handed to Joi |
| `logger` | see the file | bunyan configuration |

Failures the library retries itself: an ES **429** is repeated with exponential backoff, and a bulk request refused as too large (**413**, or a payload exceeding the maximum string length) is split in half and sent again. The one exception is a synchronous `updateByQuery`, `deleteByQuery` or `reindex` answered with 429 after it already wrote something: Elasticsearch keeps what it wrote, so repeating the call would apply it twice. Such a call throws instead, and the body of the error reports the `updated`, `created` and `deleted` counts and the `failures`.

---

# License

[MIT](LICENSE) — Copyright (c) 2019-2026 Circularo International LTD.
