import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  type CollectionResource,
  type XPathAdapter,
  type XPathContext,
  type XPathResources,
  READS_RESOURCES,
  decode,
  detectedEncoding,
} from '@exemplarjs/adapters';
import { cannotRun, notApplicable } from './applicability.ts';
import { type Outcome, type ResultChecks, judge, readAssertion } from './assertions.ts';
import type { TestCase } from './catalog.ts';

/** How one test went: judged, failed as `expected-failures.json` lists, or why it was not run. */
export type Status = 'pass' | 'fail' | 'wrong-error' | 'expected-failure' | 'not-applicable' | 'not-run';

/** One test's result for one processor. */
export interface Qt3Result {
  readonly name: string;
  readonly testSet: string;
  readonly status: Status;
  /** Why it did not apply or was not run, or the error a failing test raised. */
  readonly reason?: string;
}

/** Documents parsed for one processor, by file, so that each is parsed once. */
export class DocumentCache {
  readonly #adapter: XPathAdapter;
  readonly #documents = new Map<string, Promise<unknown>>();

  constructor(adapter: XPathAdapter) {
    this.#adapter = adapter;
  }

  /** A file's document, parsed with its URI on first use. */
  get(file: string, uri: string): Promise<unknown> {
    const cached = this.#documents.get(file);
    if (cached !== undefined) return cached;
    const bytes = readFileSync(file);
    // The text without its byte order mark, which a string must not start with.
    const text = decode(bytes, detectedEncoding(bytes)).replace(/^\uFEFF/, '');
    const document = this.#adapter.parseDocument(text, uri);
    this.#documents.set(file, document);
    return document;
  }
}

/** A URI an environment gives, made absolute against the test set's URI; the empty URI, of the default collection, as it is. */
function absolute(uri: string, test: TestCase): string {
  return uri === '' ? uri : new URL(uri, test.testSetURI).href;
}

/** What an environment supplies by URI: its documents, by their URIs and files' URLs, its text resources and its collections. */
function resourcesOf(test: TestCase): XPathResources {
  const environment = test.environment;
  const documents = new Map<string, string>();
  for (const source of environment.sources) {
    documents.set(pathToFileURL(source.file).href, source.file);
    if (source.uri !== undefined) documents.set(absolute(source.uri, test), source.file);
  }
  const texts = new Map(environment.resources.map((resource) => [absolute(resource.uri, test), resource]));
  const collections = new Map<string, CollectionResource>(
    environment.collections.map((collection) => [absolute(collection.uri, test), collection])
  );
  return { documents, texts, collections };
}

/** The adapter context for a test's environment: its documents, namespaces and static base URI, and what it reads by URI when the adapter can. */
async function contextFor(test: TestCase, documents: DocumentCache, adapter: XPathAdapter): Promise<XPathContext> {
  const environment = test.environment;
  const variables: Record<string, unknown> = {};
  let contextItem: unknown;
  // A source without a role is read by URI alone, and may be one a test expects not to parse.
  for (const source of environment.sources.filter((spec) => spec.role !== undefined)) {
    const document = await documents.get(source.file, source.uri ?? pathToFileURL(source.file).href);
    if (source.role === '.') contextItem = document;
    else if (source.role?.startsWith('$')) variables[source.role.slice(1)] = document;
  }
  const staticBaseURI = environment.staticBaseURI === undefined ? test.testSetURI : environment.staticBaseURI;
  return {
    variables,
    namespaces: environment.namespaces,
    ...(contextItem !== undefined && { contextItem }),
    ...(staticBaseURI !== null && { staticBaseURI }),
    ...(adapter.capabilities.has(READS_RESOURCES) && { resources: resourcesOf(test) }),
  };
}

/** An expression with the environment's parameters, and any further bindings, bound around it by `let`. */
function withBindings(test: TestCase, expression: string, ...further: string[]): string {
  const parameters = test.environment.params.map((param) => `$${param.name} := (${param.select ?? '()'})`);
  const bindings = [...parameters, ...further];
  return bindings.length === 0 ? expression : `let ${bindings.join(', ')} return (${expression})`;
}

/** Evaluates a test's expression, asynchronously when the processor can, catching the error it raises. */
async function evaluate(adapter: XPathAdapter, expression: string, context: XPathContext): Promise<Outcome> {
  try {
    const value =
      adapter.evaluateAsync === undefined
        ? adapter.evaluate(expression, context)
        : await adapter.evaluateAsync(expression, context);
    return { kind: 'value', value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'error', code: adapter.errorCode(error), message };
  }
}

/** Runs one test with a processor. */
export async function runTest(adapter: XPathAdapter, test: TestCase, documents: DocumentCache): Promise<Qt3Result> {
  const result = (status: Status, reason?: string): Qt3Result => ({
    name: test.name,
    testSet: test.testSet,
    status,
    ...(reason !== undefined && { reason }),
  });
  const inapplicable = notApplicable(test, adapter.capabilities);
  if (inapplicable !== undefined) return result('not-applicable', inapplicable);
  const unrunnable = cannotRun(test, adapter.capabilities);
  if (unrunnable !== undefined) return result('not-run', unrunnable);
  let context: XPathContext;
  try {
    context = await contextFor(test, documents, adapter);
  } catch (error) {
    return result('fail', `could not parse a source document: ${String(error).slice(0, 200)}`);
  }
  const assertion = readAssertion(test.result, path.dirname(fileURLToPath(test.testSetURI)));
  const outcome = await evaluate(adapter, withBindings(test, test.expression), context);
  // A result evaluated asynchronously is judged as it is, bound to `$result`, rather than evaluated again.
  const given = adapter.evaluateAsync !== undefined && outcome.kind === 'value';
  const checked = given ? { ...context, variables: { ...context.variables, result: outcome.value } } : context;
  const over = (expression: string) =>
    given ? withBindings(test, expression) : withBindings(test, expression, `$result := (${test.expression})`);
  const checks: ResultChecks = {
    check: (expression) => adapter.evaluateBoolean(over(expression), checked),
    stringValue: () =>
      adapter.evaluateString(over("string-join(for $item in $result return string($item), ' ')"), checked),
    serialized: () => adapter.serialize(outcome.kind === 'value' ? outcome.value : undefined),
  };
  const verdict = judge(assertion, outcome, checks);
  if (verdict === 'unsupported') return result('not-run', 'assertion the runner cannot judge');
  const raised =
    outcome.kind === 'error' ? `${outcome.code ?? 'no code'}: ${outcome.message.slice(0, 200)}` : undefined;
  return result(verdict, verdict === 'pass' ? undefined : raised);
}
