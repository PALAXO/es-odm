# es-odm

Node.js library mapping Elasticsearch documents to JS classes ("ODM" — Object Document Mapper). Published as the `es-odm` npm package. Pure ESM (`"type": "module"`), no build step, Node 22 or newer (`JSON.rawJSON`, `import.meta.dirname`). `@elastic/elasticsearch` 9.x client, Joi for instance validation, Lodash, bunyan logging, nconf configuration. `README.md` is the full public API reference — keep it in sync when changing public behaviour.

## Commands

```bash
npm run lint                                  # eslint over the repo
npm test                                      # full Mocha suite — DESTRUCTIVE, see below
npx mocha test/lib/BaseModel.test.js --exit   # single test file
npm run coverage                              # c8 + mocha
npm run types                                 # regenerate types/ out of the sources and their JSDoc, verify them and compile the public API type test
```

Tests run against a real Elasticsearch (`es:url` config, default `http://localhost:9200`) and are **destructive to the `odmtest*` namespace**: the global `before` hook in `test/bootstrapTests.js` deletes every index matching `bootstrapTest.TEST_NAMESPACE` (`odmtest*`) and each `beforeEach` wipes all documents in it. Indices outside that namespace are left alone, so a cluster holding another project's data survives a test run — but never point the suite at an Elasticsearch whose `odmtest*` indices matter.

## Architecture (CRITICAL)

`createClass(name, schema?, tenant?, Base?)` in `index.js` returns a subclass of `Base` (default `BaseModel`) carrying four static properties: `schema` (Joi), `_tenant` (default `*`), `_name` and `_immediateRefresh` (default `true`). Everything else derives from them — the `alias` getter is `` `${_tenant}_${_name}` ``. Classes are never mutated in place: `in(tenant)`, `immediateRefresh(value)` and `clone(changes)` each return a new subclass (`utils.cloneClass`), so a tenant-bound class never leaks state back into the class it was cloned from; `in` and `immediateRefresh` hand back the very same class when the value already matches.

Data lives under an **alias** `tenant_name` pointing at an underlying index `tenant_name-<uuid>` (`_generateIndex`); `createIndex()` creates the index and puts the alias on it. `_parseIndex` splits on the first `_` and strips the `-<uuid>` suffix — which is why a tenant must never contain `_` and a model name must never contain `-` (`createClass` and `in()` throw) and why the alias↔index format is load-bearing across the whole library.

| File | Purpose |
|:---|:---|
| `index.js` | Public entry: `createClass`, the raw-API `callEs` and bulk `sendBulk` helpers, plus re-exports of the model classes and the client/configuration/logging setters. |
| `lib/BaseModel.js` | The model class: the static document API (searching, iteration, CRUD and by-query operations), the indices API (index/alias management, mappings, settings, PIT), the task API (`getTask`, `waitForTask`) for the `waitForCompletion: false` mode of the by-query and reindex functions, the instance API (persistence and validation), class cloning and the subclass hooks. |
| `lib/BulkArray.js` | `Array` subclass returned by searches; bulk persistence via the ES Bulk API plus a per-item status ledger controlling which items are written and reporting per-item results. |
| `lib/JointModel.js` | Records queries from multiple ODM classes (`recordSearch`) and runs them as a single ES search across all their indices, returning a mixed `BulkArray`. |
| `lib/Action.js` | Wrapper every ES call goes through: per-call logging/telemetry, retry on 429 with exponential backoff (`es:retries`) — except a 429 of `updateByQuery`/`deleteByQuery`/`reindex` reported after the call already wrote something, which is thrown instead (`BATCH_WRITING_FUNCTIONS`), bulk splitting on 413 / `Invalid string length` (`sendBulk`), warning thresholds (`warning:*`). |
| `lib/elasticsearch.js` | `esClient` singleton around `@elastic/elasticsearch`; `setClient` replaces the client globally, even for already-created classes; `parseStream` parses large streamed responses via `stream-json` to bypass the V8 max string length; custom `Transport` workaround for ES URLs containing a path. |
| `lib/utils.js` | `cloneClass` and the shared search engine used by both `BaseModel` and `JointModel` (`from`/`size` resolution, implicit PIT paging, Long-sentinel `search_after` sanitization), plus the `bulkIterator`/`itemIterator` generators. |
| `lib/logger.js` | bunyan singleton; consumers reconfigure it via `setLoggerConfig` / `setLoggerUidFunction`. |
| `lib/config/` | nconf defaults (`config.json`), overridable by env/argv; runtime overrides go through `setClient` and, for the `warning:*` thresholds and the `es:retries` policy only, `setConfiguration`. Keeps its own `nconf.Provider` — never switch back to the default nconf export, a consumer resolving the same nconf copy would share its stores with the library. |

Project skills in `.claude/skills/` carry the procedures: `api-change` for adding or changing a public function (implementation with JSDoc, client wrapper, regenerated declarations, README, test), `testing` for writing tests and verifying behaviour against Elasticsearch.

## Key invariants

* Instance metadata (`_id`, `_version`, `_highlight`, `_primary_term`, `_seq_no`, `_score`, `_sort`, `__uuid`) is defined non-enumerable in the `BaseModel` constructor — invisible to `JSON.stringify`, Joi and `Object.keys`; document data are plain enumerable properties. Keep any new metadata non-enumerable and put a `/** @type {...} description */` comment above its `Object.defineProperty` call — `scripts/types.js` reads those tags to declare the members and aborts the generation when one is missing.
* Call `__checkIfFullySpecified` from anything addressing one concrete document or index — instance construction, the id-based reads and writes and the index/alias lifecycle all do; it throws on `*`/`?` in tenant or name, and on an empty one. `find` and `findAll` are id-based-looking but leave it out — they redirect to `search`. Leave it out of everything that legitimately spans whatever matches: the query-based operations (`search`, `count`, the `*byQuery` functions), the mapping and settings readers, `refresh`, and the PIT and task functions — a wildcard `search` opens its implicit PIT through `openPIT`, so that omission is load-bearing.
* `search` instantiates each hit with the constructor matching the hit's `_index` (`__getConstructor`), so wildcard/cross-tenant searches return instances bound to their home tenant.
* No explicit `from`/`size` on `search()` means "download everything": `utils.search` pages through the entire result set via an implicit PIT + `search_after` — unless an explicit `pitId` is given, which returns one page of `_getBulkSize()` hits (with an explicit `size`, that page is `size` capped at `es:maxResults`). `from + size > es:maxResults` (10000) also transparently switches to PIT; explicit `searchAfter`/`pitId` require `from` to resolve to 0. An implicitly opened PIT is always closed in the `finally` block.
* Write operations send `refresh: true` by default (`_immediateRefresh`); `immediateRefresh(value)` opts out per class clone for the instance writes, the id-based statics (`delete`, `update`), the `*byQuery` functions and `reindex`. The value is a boolean or an ES refresh string (`wait_for`), which `toBooleanRefresh` downgrades to a boolean for the by-query and reindex APIs, as those accept no string. A `BulkArray` carries its own `_immediateRefresh` (default `true`) because it may hold instances of several classes — bulk writes are switched per array, never through the class.
* Optimistic concurrency (`useVersion` on `save`/`delete`, `version` on static `delete`) is implemented via `if_primary_term`/`if_seq_no`; when they are missing, they are fetched first (`checkVersion` in `lib/BaseModel.js`, `fetchVersions` in `lib/BulkArray.js`) and a `_version` mismatch throws an `Error` carrying `statusCode` 409.
* `instance.save()` runs Joi validation first (`validate()`, config `joi:validatorConfig`); `BulkArray.save()` validates every item still in the processing set before anything is written, so one invalid item means nothing is written.
* `BulkArray` items have per-item states; only items in the default in-progress state are processed by `save`/`delete`/`reload`. `reject`/`finish` take an item out of the processing set; `clear()` removes such items from the array while their status records survive into `esStatus()`.
* Subclass extension hooks: `_alterSearch` (rewrite query — also applied by `count` and the `*byQuery` functions), `_packData`/`_unpackData` (storage format conversion) and `_afterSearch` (post-load enrichment of found instances) are no-op by default; `_getBulkSize` (pagination/scroll size) answers `es:paginationSize` and must return a positive number, `JointModel` takes the minimum across its recorded models. `JointModel.recordSearch` works by cloning the model with the `__recordSearch` static set, which turns `search()` into a query recorder and makes every other function reaching Elasticsearch throw (`checkNotRecording`), including a `BulkArray` holding the clone's instances. A joint search, its PIT and its page size span only the models which recorded a query (`__searchedAlias`, `__searchedModels`), not everything `recordSearch` registered; the PIT and the page size fall back to all the registered models only while none has recorded a query (a joint search then throws).
* Naming: single-underscore statics/methods are overridable internals — the hooks above plus the alias↔index parsing (`_parseIndex`, `_generateIndex`), which `JointModel` already calls defensively for a model refusing an index; double-underscore members (`__checkIfFullySpecified`, `__getConstructor`, `__constructorIdentifier`, ...) are internal machinery, but consumers are known to override them — treat their names, signatures and call contracts as part of the public surface when changing them.

## Coding standards

* **Imports:** always `import`/`export`, never `require`/`module.exports`. Local imports include the `.js` extension and use relative paths.
* **Formatting:** 4-space indentation, always semicolons, always strict equality (`===`/`!==`), `const` by default (`let` only when necessary, never `var`), arrow functions with parentheses.
* **Strings:** always backticks (`` ` ``) — the `@stylistic/quotes` eslint rule enforces it; the only exceptions are `import` statements and quoted object keys, which cannot be template literals. Template literals over concatenation (`prefer-template`).
* **`void 0`:** used throughout instead of the `undefined` literal — follow suit.
* **JSDoc:** every function/method documents parameters and return type (`@returns {Promise<Type>}`); eslint only warns about a missing `@returns`, the binding check is `npm run types`. A parameter puts its name before its type — `@param body {Object} Body object`, not `@param {Object} body`. TypeScript reads both orders identically and no eslint rule enforces either, so the order is kept consistent by hand.
* **Lodash:** prefer it for type checks and object/array manipulation (`_.isNil()`, `_.isString()`, `_.castArray()`, ...).
* **Type declarations:** the `.d.ts` files in `types/` are generated out of the sources and their JSDoc by `npm run types` (`tsconfig.json`) — never edit them by hand, fix the JSDoc and regenerate. The JSDoc is therefore the single source of the published types: annotate every parameter and return value with a type TypeScript can resolve, and never place a `.d.ts` next to a `.js` source, as TypeScript would read it instead of the source and the generation would stop being idempotent.
* **Dependencies:** versions in `package.json` are pinned exactly — never `^`/`~`. Do not add or upgrade a dependency as a side effect of another change. `@elastic/elasticsearch` is deliberately kept on the lowest ES minor the library must support (the client is only forward compatible within its major) — never bump it to the latest minor as part of a routine dependency update.
* **Versioning:** consumers pin exact `es-odm` versions, so any released change requires a `version` bump in `package.json`; the release itself is done by the user.

## Testing guidelines

* Put a test into the file mirroring the module under test (`test/lib/<Module>.test.js`; module-level exports into `test/index.test.js`) — a module with no public surface of its own, like `lib/utils.js`, is covered through the modules exposing it. Tests exercise the library against real Elasticsearch; only the failures the cluster cannot be asked to produce are stubbed (`testing.md` rule).
* Every test file imports `test/bootstrapTests.js`, which registers the global hooks and provides the globals `expect` and `testTimeout`; its default export carries a raw ES `client` for state assertions and fixtures.
* The bootstrap `before` hook creates the `odmtest_users` and `odmtest_documents` aliased indices with strict mappings and `refresh_interval: -1` — tests rely on the library's default `refresh: true` writes to see their own data.
* During development run only the test files your change touches; the full suite takes minutes (the per-test timeout is 30 minutes, from `test/test_config.json`).
* Invariants for test code (fixture awareness, own-index cleanup, global-state restore, strict mappings) auto-load from `.claude/rules/testing.md`; the `testing` skill carries the harness procedure and the reference tests to copy from.

## Working rules

* Do not modify files outside the direct scope of the request (the sole exception is the `.claude/` correction rule below), and do not restructure the ones inside it — splitting a module, moving functions or renaming existing symbols is a task of its own, never a side effect.
* After finishing code changes — once, at the end of the task — run `npx eslint --quiet` on the changed files and fix the reported errors before wrapping up.
* Chat with the user in their preferred language. Everything else — code, comments, commit messages, documentation, instructions to sub-agents — must be strictly in English unless explicitly requested otherwise.
* This library must stay consumer-agnostic: never hardcode any consumer's behaviour, index names or tenants into it; consumer-specific behaviour belongs in the consumers' subclasses via the extension hooks.
* Keep scripts, commands and anything path-related portable across Windows, Linux and macOS.
* Keep `.claude/` materials and `README.md` in sync by correction only: when a change renames, moves or deletes something they cite by name (a path, npm script, exported symbol, config key), grep them for the old name at the end of the task and correct the hits in place — the smallest possible edit, leaving the surrounding text alone. A purely additive change that follows the existing conventions requires no `.claude/` change at all.
* Never add to `.claude/` materials as a side effect of another task. Report — do not write — a convention or invariant that nothing documents yet, and code that contradicts a documented rule. Keep the report to a sentence or two, propose the exact wording and the target file, and ask the user to approve that wording first — a wrong invariant in the suite costs more than a missing one.
