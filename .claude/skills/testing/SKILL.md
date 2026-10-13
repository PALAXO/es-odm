---
name: testing
description: >-
  Writes and runs Mocha tests for es-odm against the real local Elasticsearch and verifies library behaviour live. Use it whenever a change needs a regression test, when reproducing or confirming a bug against ES, when a test fails unexpectedly (counts off, hook timeouts, leaked indices) or when the user says "test", "write a test", "reproduce", "verify against ES", "run the tests", or references files under test/. Critically: ask the user before running anything against Elasticsearch, as the suite wipes the whole odmtest* namespace of the configured cluster, never run it while another test run is in progress, and never assert cluster-wide counts without first reading the enclosing describe's beforeEach fixture.
---

# Testing es-odm

The suite is integration-only: every test talks to the Elasticsearch at `es:url` (`lib/config/config.json`, default `http://localhost:9200`; override it through the environment or argv, as nconf gives the first attached store priority and `test/test_config.json` is attached after the library defaults), and only the failures the cluster cannot be asked to produce are stubbed (see the `testing.md` rule). `test/bootstrapTests.js` deletes every `odmtest*` index in its root `before` hook, recreates the `odmtest_users` and `odmtest_documents` aliased indices, and deletes every document of that namespace before each test; the rest of the cluster is left untouched. The invariants for test code live in the `testing.md` rule; this skill is the procedure.

## Running tests

```bash
npx mocha test/lib/BaseModel.test.js --exit --grep "swapAlias"   # one file, optionally filtered by title
npm test                                                          # whole suite, once at the end of a task
```

- **Ask the user before running anything against Elasticsearch.** The suite wipes the whole `odmtest*` namespace of whatever cluster `es:url` points at, which is typically a developer machine holding other data; never start the suite, a single test file or a `temp/` script on your own initiative.
- Run only the file (or `--grep` subset) your change touches while iterating; run `npm test` once before wrapping up.
- The hook and test timeout is `testTimeout` from `test/test_config.json`; the full suite takes minutes, so keep iterating on a single file.
- A `Timeout of 2000ms exceeded` means the file-level `describe` is missing `this.timeout(testTimeout)` — hooks inherit it from their suite, so add it there rather than to the hook or the CLI.
- Leftover `odmtest*` indices from an aborted run are harmless (the bootstrap deletes that namespace on start); leftover indices from a temp script are not — delete them.

## Adding a regression test

1. Pick the file mirroring the module (`test/lib/<Module>.test.js`; module-level exports go to `test/index.test.js`) and the `describe` of the method; read that describe's `beforeEach` to know which fixtures exist.
2. Copy the closest reference test rather than starting blank:

| Scenario | Copy from |
|:---|:---|
| Own index with dynamic mapping, small `_getBulkSize`, cleanup in `finally` | `paginates over documents missing the sort field` in `test/lib/BaseModel.test.js` |
| Own indices with explicit conflicting mappings via the raw client | `throws with a status code when some shards fail` in `test/lib/BaseModel.test.js` |
| Swapping the global client and restoring it | `works with response compression enabled` in `test/lib/BaseModel.test.js` |
| Version conflict provoked by a concurrent raw write | `keeps concurrency metadata of items which failed to save` in `test/lib/BulkArray.test.js` |
| Asynchronous ES task | `waits for an asynchronously started updateByQuery` in `test/lib/BaseModel.test.js` |
| Index/alias management flow, with the describe cleaning up in a shared `afterEach` | `swaps alias between indices` in `test/lib/BaseModel.test.js` |
| Per-item bulk failure via an unmapped field | `reports per-item failures without throwing` in `test/index.test.js` |
| Subclass hook behaviour (`_afterSearch`, `_getBulkSize`) | `calls _afterSearch only with the instances of the current page` in `test/lib/JointModel.test.js` |
| A hook narrowing what an operation touches (`_alterSearch`) | `updates only what '_alterSearch' allows` in `test/lib/BaseModel.test.js` |
| A new function which must refuse a recording clone | `refuses every function but 'search'` in `test/lib/BaseModel.test.js` |
| Pure ledger semantics without ES writes | `handles large bulks with per-item processing` in `test/lib/BulkArray.test.js` |
| Failure the real cluster cannot be asked for (429, 413, broken response stream) | `repeats the call when ES responds with 429` in `test/lib/Action.test.js` |
| Logger output of a single ODM call | `warns about too many search calls` in `test/lib/Action.test.js` |

3. Assert the observable contract (returned instances, `esStatus()`, ES state read back through `bootstrapTest.client`), not internals; use `expect(...).to.be.eventually.rejectedWith(message)` for expected failures and a `try/catch` capturing the error when `statusCode` or `body` must be inspected.
4. Run the single file, then the full suite.

## Reproducing or verifying behaviour outside the suite

- Write a throwaway script in the gitignored `temp/` directory, import from `../index.js`, and use an `odmtest`-prefixed tenant with the raw `@elastic/elasticsearch` client to create and finally delete only your own indices — one self-contained scenario per function, each cleaning up after itself in a `finally` block, so a failed run leaves nothing behind.
- Prove the reproducer catches the bug before fixing it: run it against the unfixed code first, then after the fix.
- Run it only when no test run is active; a concurrent suite wipes its documents mid-flight and produces false results.
- `npm run lint` scans `temp/` as well — keep the script lint-clean or delete it when done.

## Boundaries

- Invariants for test code (fixtures, cleanup, global-state restore, mappings) → `testing.md` rule; this skill only tells how.
- Implementing the change under test, its declarations and README → `api-change` skill.
- The type level test of the public API (`test/types/publicApi.ts`) → `api-change` skill; `npm test` does not run it, `npm run types` compiles it.
- Editing anything under `.claude/` → `claude-docs.md` rule.
