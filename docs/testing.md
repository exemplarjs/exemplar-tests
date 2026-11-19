# exemplar conformance testing

These tests have three jobs:

- prove exemplar's conformance to the W3C recommendations automatically, on every change;
- keep its results identical at every chunk size, through every API and on every runtime;
- check it against libxml2 and the JDK's Xerces.

They run on exemplar's build, never its sources: the build of an `exemplar` checkout beside this one, or else the latest published release ([README](../README.md#which-exemplar)). [exemplar's own repository](https://github.com/io-timeout/exemplar) holds its unit and property tests, and the documents that describe its design and API. [benchmarking.md](benchmarking.md) describes the benchmarks.

The runner lives in `tools/conformance` and the adapters it drives in `tools/adapters`; the [README](../README.md#the-repository) lists every package.

## Terms

| Term             | Meaning                                                                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suite            | A W3C conformance test suite: test documents plus a catalogue saying what each one must do.                                                                                                                                                  |
| Catalogue        | The suite's index file. For the XML suite, each `TEST` element gives the document's `URI`, its `TYPE`, the `ENTITIES` it needs, the `VERSION`, `EDITION`, `RECOMMENDATION` and `NAMESPACE` it applies to, and an optional expected `OUTPUT`. |
| Verdict          | Whether a parser accepted a document or rejected it with a fatal error.                                                                                                                                                                      |
| Canonical form   | The text form the suites use for expected output, so that output can be compared byte for byte. The XML suite uses James Clark's form, the first canonical form. Its second form adds notation declarations.                                 |
| Configuration    | One set of parser options a suite runs under, such as non-validating with external entities read.                                                                                                                                            |
| Expected failure | A test listed, with a reason, as one exemplar is expected to fail.                                                                                                                                                                           |

## Where it runs

This repository's own pull requests check its format and its root lint only. Everything else runs from [exemplar's workflows](https://github.com/io-timeout/exemplar/tree/main/.github/workflows), which check out this repository on the branch named like the exemplar pull request, or on `main` when there is none, and run it on that change's build:

- **every exemplar pull request:** this repository's lint and type check, `pnpm conformance` on Node, and the XML suite on Bun;
- **exemplar's release:** the differentials, the long fuzz runs, the XML suite in Chromium, Firefox and WebKit, QT3, and the full benchmark matrix on the fixed machine.

| Layer             | Tool                                                   | Runs                                                            | Proves                                                                         |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Conformance       | vitest, in `tools/conformance`                         | Every exemplar change                                           | The W3C suites, under every configuration                                      |
| XPath conformance | `pnpm qt3`, in `tools/conformance`                     | On release                                                      | QT3, the XPath and XQuery suite, against the XPath processors                  |
| Consistency       | Part of the conformance run                            | Every exemplar change                                           | The same results at every chunk size, through every API, for bytes and strings |
| Fuzz              | vitest with fast-check; a command line against libxml2 | Briefly on every exemplar change, at length on release          | No crash or hang on any mutated suite document; agreement with libxml2         |
| Differential      | Script                                                 | On release                                                      | Agreement with libxml2 and Xerces                                              |
| Runtimes          | vitest browser mode; a command-line runner for Bun     | Node and Bun on every exemplar change; browsers on release      | The same results everywhere                                                    |
| Performance       | `tools/bench` ([benchmarking.md](benchmarking.md))     | Each change against `main`, locally; the full matrix on release | No regressions; comparisons with other libraries                               |

The commands run from the repository root:

| Command                    | Runs                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm conformance`         | The conformance, consistency and short fuzz tests; cached until an input changes    |
| `pnpm conformance:browser` | The XML suite in Chromium, Firefox and WebKit                                       |
| `pnpm qt3`                 | The W3C XPath and XQuery suite, as an XPath 3.1 suite, against the XPath processors |
| `pnpm qt3:parse`           | Every XPath 3.1 expression in QT3, through exemplar's parser                        |
| `pnpm differential`        | The differential tests against libxml2, Xerces and `javax.xml.catalog`              |
| `pnpm fuzz`                | Mutated suite documents against libxml2                                             |
| `pnpm typecheck`           | The type check of every package                                                     |
| `pnpm bench`               | The benchmarks; never cached                                                        |

## W3C conformance

### Suites

| Suite                      | Source                                                              | Size                                                                                                                                                       | Covers                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| XML Conformance Test Suite | `https://www.w3.org/XML/Test/xmlts20130923.tar.gz`                  | 2,585 catalogue entries: 812 valid, 242 invalid, 1,498 not well-formed and 33 optional errors; 432 with expected output. 2,272 apply to the fifth edition. | XML 1.0 and 1.1, Namespaces 1.0 and 1.1                                                                                                                                                                            |
| XInclude Test Suite        | `https://www.w3.org/XML/Test/XInclude/XIncl20060927.tar.gz`         | 174 tests: 111 with an expected result and 63 that must fail. 21 do not apply.                                                                             | XInclude 1.0, XPointer `element()` and shorthand pointers                                                                                                                                                          |
| `xml:id` Test Suite        | `https://www.w3.org/XML/2005/01/xml-id/`                            | 13 tests                                                                                                                                                   | `xml:id` 1.0. Each test must find the document's IDs, in order, and each error test must also report an `xml:id` error. The two tests that need a schema-aware processor do not apply.                             |
| DOM Conformance Test Suite | The ECMAScript tests under `https://www.w3.org/2004/04/ecmascript/` | 1,532 test pages: 527 Level 1, 283 Level 2 and 722 Level 3 Core, with their documents, 1,659 files in all                                                  | The DOM. The tests are XML descriptions that the W3C turned into ECMAScript, which the runner adapts, as jsdom did for Levels 1 and 2. The Level 3 files are published there but not linked from the suite's page. |

The Canonical XML recommendations' examples run as unit tests in exemplar's own repository. XML Catalogs has no official suite. Its unit tests follow the recommendation's examples, and the [differential tests](#differential-tests) compare it with the JDK's `javax.xml.catalog`.

### The suites in this repository

Each suite has a folder in `data/conformance/`, and `tools/conformance/suites.json` pins what it holds:

- the XML and XInclude suites are archives, each pinned by the SHA-256 of the archive;
- the `xml:id` suite and the DOM tests are published as separate files, so `suites.json` pins a SHA-256 for each file.

The XInclude, `xml:id` and DOM suites are committed, unpacked, and `.gitattributes` keeps them byte for byte, since line ends and encodings are part of what they test. The XML suite is not committed: its collections may be redistributed only as their authors publish them, so it is downloaded on first use, one archive of 627 KB, checked against its pin and unpacked. A suite whose folder is missing is fetched the same way. The test run's global setup fetches every missing suite once, before the test files start, and an archive is unpacked beside its folder and moved into place, so no reader sees one half written. CI caches the XML suite between runs, keyed on `suites.json`. The W3C's server limits how fast one client may fetch, so files are fetched four at a time, and a download the server answers with 429 or 503 waits as long as it asks and tries again.

### Configurations

Every applicable test runs under three configurations:

| Configuration | Options                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `standalone`  | The defaults: non-validating, external entities not read                                             |
| `external`    | Non-validating; external entities and DTDs read through a resolver confined to the suite's directory |
| `validating`  | Validating; external entities and DTDs read the same way                                             |

`namespaceAware` is on, except for tests marked `NAMESPACE="no"`.

**Which tests apply.** A test applies unless:

- its `EDITION` list leaves out the fifth edition;
- it needs a feature exemplar does not have, such as a schema-aware `xml:id` test or an XPath-selected C14N case.

Every test that does not apply is counted as not applicable, never as passed.

### Verdicts

What each test must do, by catalogue type and configuration:

| `TYPE`    | `standalone`                                                                                                    | `external` | `validating`                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| `valid`   | Accept                                                                                                          | Accept     | Accept, with no validity error                                 |
| `invalid` | Accept                                                                                                          | Accept     | Accept, and report a validity error from the sections it tests |
| `not-wf`  | Reject. If `ENTITIES` is not `none`, the fault may sit in an entity that is not read, so accepting also passes. | Reject     | Reject                                                         |
| `error`   | Either; the verdict is recorded                                                                                 | Either     | Either                                                         |

**Invalid documents.** A validity error counts when its constraint applies in a section or production the test's `SECTIONS` names, by a fixed map in `tools/conformance/src/verdict.ts`: VC: Fixed Attribute Default, for example, applies in 3.3.2 and production [60]. A document with no DOCTYPE must instead report an error from 2.8, as without one it cannot be valid. Any validity error counts when `SECTIONS` names no part with a validity constraint, such as an erratum, when the test is from the Namespaces recommendation, whose sections are its own, or when the processor reports no codes. Two index entries name a section their document does not break; the runner checks those against the section of the constraint the document does break, as [`exceptions.md`](../tools/conformance/exceptions.md#catalogue-corrections) explains.

**Output.** Where a test has an `OUTPUT`, the output must match it in the second canonical form. That applies under `standalone` when `ENTITIES` is `none`, and under `external` and `validating`. Outputs for XML 1.1 documents use the 1.1 variant: an XML declaration, and character references for C0 and C1 controls.

**Rejections.** Every rejection must be an `XMLError` with a code, a line and column of at least 1, and the system id of the document or entity where the fault is. This checks the rule that every error carries a location.

### Expected failures

Tests exemplar is expected to fail are listed in `tools/conformance/expected-failures.json`. Each entry is keyed by suite, test id and configuration, and gives a reason:

```json
{
  "xmlts/ibm-1-1-not-wf-P77-ibm77n13.xml/standalone": "The fault is in an external entity, which standalone does not read"
}
```

A listed test runs as `test.fails`, and an unlisted test as a normal test. So:

- a listed test that starts passing fails the run, and its entry must be deleted;
- an unlisted test that fails fails the run.

The list can only shrink, unless an entry is added deliberately with a reason.

[`tools/conformance/exceptions.md`](../tools/conformance/exceptions.md) explains every expected failure and every test that does not apply, in plain terms, with an example and a reference to each test, so that each can be checked independently. `test/exceptions.test.ts` fails when the report and the lists drift apart.

### The XInclude suite

Its catalogue, `testdescr.xml`, gives each test's input and either its expected result or an error. The runner reads the input with XInclude on, through a file resolver confined to the suite's directory:

- a test with an expected result must give it. Results are compared in Exclusive XML Canonicalization with comments, because the suite's expected files differ from a correct result in namespace declarations that no name uses;
- an error test must fail with an `XMLError`.

21 tests do not apply:

- 15 use the `xpointer()` scheme, which needs XPath;
- 2 expect an entity reference to stay unexpanded in the result, which no canonical form can hold, so they cannot be compared;
- 4 negotiate content with a live server, and the runner reads only the suite's files.

Expected failures are keyed `xinclude/<test>`. Two are listed, which [`exceptions.md`](../tools/conformance/exceptions.md) explains.

### The DOM suite

Each test page runs in a VM context of its own, with jsUnit, its level's `DOMTestCase.js`, and a test builder in place of the browser's. The builder parses the suite's files with `DocumentBuilder`, set as the test asks:

- `validating` gives the factory the DTD validator; `expandEntityReferences`, `coalescing`, `namespaceAware`, `ignoringComments` and `ignoringElementContentWhitespace` set the factory and builder options of the same meaning;
- what a test does not set takes the suite's own default. Levels 1 and 2 use the JAXP configuration the suite's Java runner uses: not namespace-aware, entity references kept, not coalescing, not validating. Level 3 runs through an LSParser in the suite's Java runner, so it is namespace-aware;
- `signed` and `hasNullString` are fixed, as for every ECMAScript implementation.

A test that needs what exemplar lacks, such as `schemaValidating` for XML Schema, is skipped with that reason and counted as not applicable: 87 Level 3 tests are.

Expected failures are keyed `dom/<level>/core/<test>`. They are of three kinds:

- **Defects of the ECMAScript build:** it drops the bitwise masks of `compareDocumentPosition` tests, the value `setUserData` returns, and the object of a monitor's `handle` method; it calls a local variable as a function; and three pages are not valid JavaScript.
- **Tests that contradict the DOM or each other:** for example, `domconfigurationcansetparameter03` expects `getNamedItemNS(null, name)` to find an entity, which Level 2's `getNamedItemNS03` says it must not.
- **XML 1.0 names:** seven tests expect XML 1.0 to reject a name character that the Fifth Edition allows. exemplar's DOM checks names as its parser does, by the Fifth Edition.

### Reports

The conformance command line, `tools/conformance/src/cli.ts`, scores each library in a process of its own, `src/score.ts`, and writes `tools/conformance/reports/conformance.md` and `conformance.json`. A single library, as in the Bun runs, is scored in the command line's own process. They give pass, fail, expected-failure and not-applicable counts for each suite, configuration and test type. These are the numbers exemplar publishes.

**Other libraries.** The runner also scores every other library that has an adapter, under the configurations each one supports. That gives the conformance columns of the [benchmark report](benchmarking.md#published-numbers). The expected-failure list applies to exemplar only.

### The evaluation profile

An evaluation of sax, saxen and stax-xml gave these scores:

| Parser   | Rejects malformed | Outside the DTD | Correct data |
| -------- | ----------------- | --------------- | ------------ |
| stax-xml | 62.8%             | 98.4%           | 82.2%        |
| sax      | 38.8%             | 45.3%           | 86.0%        |
| saxen    | 18.3%             | 19.8%           | 84.1%        |

The runner reproduces those scores with an evaluation profile that copies its rules exactly:

- **Tests:** 1,899 of the XML suite's entries. A test is kept when its `RECOMMENDATION` is XML 1.0 or Namespaces 1.0, errata included; it is not XML 1.1; its `EDITION` is absent or includes 5; its `TYPE` is not `error`; it is not marked `NAMESPACE="no"`; and it is not a `not-wf` test whose `ENTITIES` is not `none`. That leaves 721 valid, 227 invalid and 951 not-wf tests.
- **Verdicts:** valid and invalid tests must be accepted, and not-wf tests rejected. Any thrown error or error event counts as a rejection. A test that fails is retried once with the encoding its BOM or declaration names, and passes if the retry does.
- **Output:** the first canonical form, compared byte for byte with the `OUTPUT` file. Namespace declarations appear as attributes only where the library reports them so. The 13 tests whose expected output holds a DOCTYPE are not compared.
- **Scores:**
  - rejects malformed: the rejected share of the 951 not-wf tests;
  - outside the DTD: the rejected share of the 247 not-wf tests whose file has no internal subset;
  - data: the matching share of the 107 tests that have an `OUTPUT`, need no external entities, have an expected output with no DOCTYPE, and have no `<!ATTLIST` or `<!ENTITY` in the file.

The libraries run as the evaluation ran them: sax in strict mode with its defaults, saxen with entities decoded through its callback, and stax-xml in `documentMode: 'document'`. The conformance tests check that the profile reproduces the evaluation's scores exactly.

### How the runner is built

The runner's core is plain TypeScript with no vitest dependency, in `tools/conformance/src/`. It does four things:

- parses the catalogues;
- decides which tests apply;
- runs a test through a processor adapter;
- writes canonical forms and compares them.

It finds the catalogue files `xmlconf.xml` includes as external entities and reads each one with stax-xml. Each test's file resolves against the catalogue file it sits in, as XML Base requires.

On top of the core:

- **vitest** creates one test for each catalogue entry and configuration, in `tools/conformance/test/`;
- **a command-line entry**, `tools/conformance/src/cli.ts`, runs the same core under Bun, and for other libraries, and writes the reports.

Processors plug in through the adapters in `tools/adapters`, so the runner is proved independently of exemplar, against libxml2. libxml2's own suite program, `runxmlconf`, built from the same libxml2 release, runs the suite through the libxml2 API. Its outcome for each test, with the parser options it used, is recorded in `tools/conformance/test/fixtures/runxmlconf-2.9.13.json`. The runner is right when its `xmllint` adapter's outcome agrees with `runxmlconf`'s on every test both run, under the configuration that matches those options.

**Tooling notes:**

- vitest 5 takes `passWithNoTests` only at the root, so the conformance runner passes it on the command line.
- Vite's module runner does not support `import.meta.resolve`, which the adapters use, so the browser configuration loads them outside Vite.

## XPath conformance (QT3)

QT3 is the W3C test suite for XPath and XQuery: about 32,000 test cases in 428 test sets, each an expression, the environment it runs in and assertions about its result. `pnpm qt3` runs it as an XPath 3.1 suite against the XPath processors, `saxon-js-2`, `saxon-js-3` and `exemplar` by default, or those it names. `--test-sets fn-abs,op-to` limits it to some test sets, and `--scope core` to the core language and functions: the expression productions, and the functions and operators on numbers, strings, booleans, sequences, nodes and QNames, leaving out dates and durations, regular expressions, formatting, collations, higher-order functions, maps, arrays, JSON and the documents functions. exemplar's processor claims only what it supports so far, so tests that need function items are not applicable to it.

**Fetching.** `suites.json` pins GitHub's archive of `w3c/qt3tests` at one commit, by SHA-256. It is downloaded and unpacked into `data/conformance/qt3/` when the runner first needs it, which is git-ignored; the conformance tests' global setup leaves it alone, as it is marked `onDemand`.

**Which tests apply.** A test applies unless one of its dependencies, or its test set's, rules it out:

- `spec`: it must name XPath 3.1, as `XP31`, or an earlier version with `+`; XQuery-only tests do not apply;
- every other dependency, such as `feature higherOrderFunctions`, `language en` or `xsd-version 1.1`, is checked against the capabilities the processor's adapter declares; `satisfied="false"` reverses the check, and every `unicode-version` is met;
- a test whose documents must be schema-validated does not apply, as no processor here is schema-aware.

**Environments.** A test's environment gives its context item and documents bound to variables, parsed by the processor, its statically known namespaces and its static base URI, which is otherwise the test set file's. Parameters become `let` bindings around the expression. Tests whose environment declares decimal formats, collations, collections, resources or schemas are not run, and neither are tests that read a source document by its URI, since the adapters cannot be given these.

**Judging.** The processor evaluates the expression; the runner then judges its assertions as the QT3 drivers do, by evaluating further expressions in the same processor, with `$result` bound by evaluating the test again: `assert-eq` compares one item with `eq`, which atomizes a node to its typed value, NaN equal to NaN; `assert-deep-eq` uses `deep-equal`; `assert-permutation`, `assert-count`, `assert-type`, `assert-empty`, `assert-true`, `assert-false` and `assert` likewise. `assert-string-value` compares the items' strings, joined by spaces, in the runner; `assert-xml` compares the serialized result with the expected XML as trees: names by namespace and local name, and prefix unless `ignore-prefixes`, attributes in any order, namespace declarations left out. `any-of`, `all-of` and `not` combine these. An expected error passes when its code matches, or the test accepts any; an error with another code counts as a wrong error. The serialization assertions are not judged.

**Expected failures.** exemplar's QT3 tests listed in `expected-failures.json`, as `qt3/<test>`, count as expected failures, explained in `exceptions.md`; the run fails if one of them passes, does not run or apply, or, in a run of the whole suite, is not in it. Tests of what exemplar has not built yet are ordinary failures until it has.

**Isolation.** Tests run in a worker thread with a 2 GB heap. A test that runs out of memory, or runs longer than 20 seconds, fails, and a fresh worker goes on from the next test.

exemplar's release workflow runs it, with the suite cached between runs, and keeps the reports as an artifact.

**Reports.** `reports/qt3.md` has each processor's pass rate over the tests judged, its counts, why tests were left out, and its counts per test set; `reports/qt3.json` also lists every failure with the error it raised. A run limited by `--scope` writes `reports/qt3-<scope>.md` and `.json` instead.

**Parsing.** `pnpm qt3:parse` parses every XPath 3.1 test expression with exemplar's parser alone, and lists each one where it disagrees with the test: an expression it rejects although the test accepts a value or another error, or one it accepts although the test expects only `XPST0003`. Tests that need a feature changing what is expected, such as static typing, are left out; `--test-sets` limits it as for `pnpm qt3`, and `--all` lists every disagreement instead of the first 50.

## Consistency

The conformance run also checks that exemplar gives one answer however a document is read. For every suite document, under the `standalone` configuration:

- **Chunk sizes:** 1, 2, 3, 7, 64 and 4,096 bytes and the whole input, through the sync and the async reader, and the whole input as a string. All must give the same verdict, the same canonical output, and for rejections the same error code and location.
- **APIs:** the cursor, the event reader, SAX and the DOM, sync and async, must give the same canonical output. The APIs are compared again under the `external` configuration, which reads DTDs and external entities. The DOM has no place for processing instructions in the DTD, which SAX and the cursor report, so it is compared with SAX told to leave them out.
- **Round trip:** reading, writing with the writer and reading again must give the same canonical output.

The suites hold about 2,500 small documents, so this adds seconds, not minutes.

## Fuzz tests

fast-check mutates suite documents: up to three flipped, replaced, inserted, deleted or duplicated bytes, or a truncation, under every configuration. Each must either parse or throw an `XMLError` with a location, within 5 seconds. It must never throw anything else, and an asynchronous reader fed the bytes in chunks of a random size must give the same verdict, output, code and location. The mutations are in `tools/conformance/src/mutate.ts`.

A short run is part of `pnpm conformance`, and exemplar's release workflow runs a long one: `EXEMPLAR_FUZZ_SCALE` multiplies the number of runs. A failure prints its seed and path; `EXEMPLAR_FUZZ_SEED` and `EXEMPLAR_FUZZ_PATH` replay it. exemplar's own repository fuzzes generated documents, entity bombs and deep nesting.

**Fuzzing against libxml2.** `pnpm fuzz --runs N --seed S` mutates suite documents the same way and compares exemplar's verdict under `standalone` with libxml2's. Documents the two already disagree on are left out, since the differential reports those. A disagreement of a kind known to be libxml2's is set aside with its reason, such as libxml2 accepting `<!DOCTYPE` with no space after it or rejecting a namespace name that is not a URI; the rest are left for triage in `tools/conformance/reports/fuzz.md` and `fuzz.json`, each with the mutations that reproduce it. It runs nightly with 200,000 documents.

## Differential tests

`pnpm differential` runs `tools/conformance/src/differential.ts`, which parses each XML suite document with exemplar, libxml2 (`xmllint`) and the JDK's Xerces. Xerces runs through a small Java harness in `tools/adapters/java/`, one JDK process for the whole run, started with the JDK's single-file source launcher from `$JAVA_HOME`, or else `/usr/bin/java`. It compares their verdicts, and with Xerces their canonical outputs too, since `xmllint` gives none. Under `validating` it compares Xerces's verdict on whether each valid and invalid test is valid. It also compares:

- canonicalization, with `xmllint --c14n`, `--c14n11` and `--exc-c14n`;
- catalog resolution, with `javax.xml.catalog`, through a second harness in `tools/adapters/java/`. The 84 lookups in `tools/conformance/test/fixtures/catalogs/cases.json` cover every entry type and matching rule over the catalog files beside it. `pnpm conformance` runs them too, when a JDK is present, and fails on a difference that is not listed or a listed one that agrees again.

The reference parsers have bugs of their own, so a disagreement is reported for triage, not failed automatically. Before triage, the report sets aside the disagreements that need no work:

- the test is one of exemplar's expected failures;
- the reference's verdict is a known bug, listed in `known-differences.json`;
- the suite's verdict rules require exemplar's verdict, so the reference is wrong;
- the rules allow either verdict, as for `error` tests, and for `not-wf` tests whose fault may sit in an entity `standalone` does not read.

The reports are `tools/conformance/reports/differential.md` and `differential.json`. Each disagreement left for triage ends one of two ways:

- **exemplar is wrong:** it gets a fix and a unit test;
- **the reference is wrong:** it is recorded in `tools/conformance/known-differences.json` with the reason.

## Runtimes

- **Browsers:** vitest's browser mode runs the XML suite in Chromium, Firefox and WebKit through Playwright, in exemplar's release workflow: `pnpm conformance:browser`. A global setup reads the suite's catalogue in Node and hands it to the browsers, and a Vite middleware serves the suite's files from `data/conformance/` byte for byte. Each browser runs every applicable test under all three configurations, with external files read from memory, and must fail exactly the listed tests. The other suites and the consistency check run on Node only.
- **Bun:** this runs the conformance command line, `tools/conformance/src/cli.ts exemplar`, on every exemplar change, with the same expected-failure list. The command line fails when a test fails that is not listed, or a listed one passes.
- **Node:** runs everything.

## Performance

[benchmarking.md](benchmarking.md) describes the benchmarks. Changes are timed against `main` locally, and the full comparison with other libraries runs in exemplar's release workflow on a fixed machine.
