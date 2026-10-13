---
name: api-change
description: >-
  Adds or changes a public es-odm function end to end — the JS implementation with JSDoc, the ES client wrapper, the regenerated .d.ts declarations, the README section and the regression test. Use it whenever a task adds a static or instance method, a BulkArray or JointModel member, a module-level export in index.js, an ES client wrapper in lib/elasticsearch.js, or changes the signature, return value or error behaviour of any of them; triggers include "add a function", "new method", "extend the API", "change the signature", "wrapper for an ES endpoint", "expose". Critically: a public change is not done when the JS works — the declarations are generated out of the JSDoc and the README is a hand-maintained mirror, and both have to be brought up to date in the same task; every new function is copied from a named reference implementation, never written from a blank page.
---

# Adding or changing a public function

## 1. Place it

| Kind of function | Where | Copy from |
|:---|:---|:---|
| Operation on the model's own index or alias (index management) | static on `BaseModel` (`lib/BaseModel.js`) | `swapAlias` |
| Cluster-scoped operation tied to something a model started (tasks) | static on `BaseModel` | `getTask`, `waitForTask` |
| Document read/write variant | static on `BaseModel`, instance method for a single loaded document | `exists` (static), `save` (instance) |
| Bulk semantics or the status ledger | `lib/BulkArray.js` | `reload`, `rejectFailed` |
| Cross-model search | `lib/JointModel.js` | `search` |
| Generic helper not bound to a model (raw API access, bulk transport) | module-level function in `index.js` | `callEs`, `sendBulk` |
| Thin call of one ES client endpoint | method of the `Elasticsearch` class in `lib/elasticsearch.js` | `updateAliases`, `getTask`, `call` |
| A new member of `additional`, or anything about paging, PIT or `search_after` | the shared search engine in `lib/utils.js`, plus the `SearchAdditional` typedef | `autoPitSort`, `trackTotalHits` |

Anything that encodes a consumer's behaviour, index names or tenants does not belong in the library (CLAUDE.md working rules) — expose a hook or a generic primitive instead.

## 2. Implement

- Open every function reaching Elasticsearch with `checkNotRecording(this)` (`checkNotRecording(this.constructor)` in an instance method, the module's own `checkNotRecording(this)` in `lib/BulkArray.js`), then extend the matching enumeration in `test/lib/BaseModel.test.js` — `refuses every function but 'search'` for a static, `refuses the instance functions reaching Elasticsearch` for an instance method, `refuses a BulkArray holding its instances` for a `BulkArray` method — without it a `JointModel` recording clone reaches ES for real.
- Validate arguments next and throw a plain `Error` in the established message style (`You have to specify an index.`, `Task ID must be specified!`); call `this.__checkIfFullySpecified(name)` for anything addressing one concrete document or index, passing the role rather than the function name when a function has two (`reindex-source`, `reindex-destination`). Leave it out of anything that legitimately spans a wildcard — the mapping and settings readers, `refresh`, and the PIT and task functions do.
- Route every ES call through `Action`: create `new Action(name, this.alias)`, log the interesting parameters with `myAction.logParams({...})`, call ES via `myAction.callEs(esClientMethod, ...args)` and close with `myAction.finish()` on every path, the empty-input early returns included — this gives the 429 retry, logging and warning thresholds for free. Return `result.body` unless the function owes the caller something else (`exists` maps it, `swapAlias` answers the previous index, the module-level `callEs` hands back the whole envelope).
- Add the matching `Elasticsearch` class method in `lib/elasticsearch.js` with `{ meta: true }`; use `asStream: true` plus `parseStream` only for responses that can exceed the string limit (see `search`, `mget`, `bulk`).
- Pass `this._immediateRefresh` to a new write, wrapped in `toBooleanRefresh` for the by-query and reindex APIs, which reject its `wait_for` string; run the body of a new query-based function through `this._alterSearch(body)`, as `search`, `count` and the `*byQuery` functions do.
- Keep the alias↔index format untouched (`_parseIndex`, `_generateIndex`) and any new instance metadata non-enumerable — both are load-bearing invariants in CLAUDE.md. New metadata also needs a `/** @type {...} description */` comment above its `Object.defineProperty` call, otherwise `npm run types` aborts the whole generation.
- Write JSDoc for parameters and return type — it is the source of the generated declarations, so every type has to be one TypeScript can resolve; eslint only warns about a missing `@returns`.

## 3. Regenerate the declaration

- Run `npm run types` and leave the regenerated `types/` in the working tree next to the source — never edit a declaration by hand. It refuses to write a declaration which does not type check, then compiles `test/types/publicApi.ts`; add an assertion there for a new public member, following the `@ts-expect-error` pattern of the file.
- Annotate the JSDoc with types TypeScript can resolve: a type of another module needs an `@import` tag; reach for an aliased `@typedef {import('./X.js').default} X` only when that module imports this one back, as the cycle confuses the declaration emit (`lib/utils.js` does it for `JointModel` and says so). A static may not return `{this}` — a static returning the class or its instances takes `@template {abstract new (...args: any) => BaseModel} T` with `@this T` and returns `{T}` or `InstanceType<T>` (see `in`, `search`); in an `@overload` block TypeScript 7 needs the `@template` in front of `@overload` and `this` declared as `@param this {T}`, otherwise it emits a broken declaration.
- When the return type depends on an argument, write JSDoc `@overload` blocks instead of a union - `search`, `findAll` and `find` do, so that the instance form keeps its type without narrowing. Close the set with a final overload carrying the union, otherwise a caller resolving that argument at runtime stops compiling. TypeScript emits no documentation for an overloaded signature, so keep the prose in a `@typedef` the overloads reference - `SearchAdditional` in `lib/BaseModel.js` documents the whole `additional` object that way, and a new member of it belongs there.
- An ES request body or response is typed with `import('@elastic/elasticsearch').estypes.<Name>` — a request body as a `typedef` in `lib/BaseModel.js` omitting the members the library sets itself (see `SearchBody`). Never reference `@elastic/elasticsearch/lib/api/types`, the package does not export that path and the declaration would not resolve for consumers.

## 4. Document in README

Add a bullet under the `API reference` heading matching the placement — `Module exports`, `BaseModel — properties`, `BaseModel — documents`, `BaseModel — indices`, `BaseModel — tasks`, `BaseModel — class copies`, `BaseModel — instances`, `BaseModel — hooks and internals`, `BulkArray`, `JointModel` — in the existing style: signature with `?optional = default`, one line per behaviour, return value stated. Leave the exact parameter types to the generated declarations and describe what the function does instead; a behaviour a caller cannot guess from the signature belongs in the matching `Concepts` section rather than in the bullet.

## 5. Test and wrap up

- Add the regression test following the `testing` skill (single file first, full suite at the end — ask the user before running either, the suite is destructive) and run `npx eslint --quiet` on the changed files.
- Bump the `version` in `package.json` for any change which will be released — consumers pin exactly (CLAUDE.md coding standards → Versioning). A change altering behaviour visible to consumers (ordering, thrown errors, return shapes, accepted inputs) is semver-major; report it to the user for the release notes, the repository keeps no changelog file.
- Correct `.claude/` materials only when the change renames, moves or removes something they cite (CLAUDE.md sync rule); a purely additive function needs no `.claude/` change.

## Boundaries

- Writing and running the tests → `testing` skill; test-code invariants → `testing.md` rule.
- Authoring or correcting `.claude/` materials → `claude-docs.md` rule.
- Dependency or ES client version changes are a separate task governed by CLAUDE.md coding standards, never a side effect of an API change.
