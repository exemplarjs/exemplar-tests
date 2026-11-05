import { pathToFileURL } from 'node:url';
import { type Adapter, type Input, type Workload, XPATH_WORKLOADS } from './adapter.ts';
import type { XPathAdapter, XPathContext } from './xpath-adapter.ts';
import { AXIS_QUERIES, queriesFor } from './xpath-queries.ts';

/** How many times the `compile` workload compiles each query in one pass. */
const COMPILE_REPEATS = 200;

/** The document the `compile` workload runs its queries over: one element, so running them costs next to nothing. */
const TINY_DOCUMENT = '<compile/>';

/** The variables and namespaces the queries use: none, as one object, so a processor can cache by it. */
const NONE: Readonly<Record<string, never>> = {};

/** A number that makes each compiled copy of a query unique, so that no library's cache of compiled expressions answers. */
let copies = 0;

/** The milliseconds each `axes` query took since `takeQueryTimes` last read them, by query, summed over documents. */
let queryTimes: number[] = [];

/** The times the `axes` workload's queries took since the last call, by query, which are then forgotten. */
export function takeQueryTimes(): number[] {
  const times = queryTimes;
  queryTimes = [];
  return times;
}

/** What one `axes` query counts for: its nodes, the number it gives, or 1 or 0 for the boolean it gives. */
function resultCount(
  processor: XPathAdapter,
  query: string,
  context: XPathContext,
  gives: 'value' | 'truth' | undefined
): number {
  if (gives === 'value') return Number(processor.evaluateString(query, context));
  if (gives === 'truth') return processor.evaluateBoolean(query, context) ? 1 : 0;
  return itemCount(processor.evaluate(query, context));
}

/** Runs the `axes` queries one by one, timing each; gives the sum of what each counts for, which every library must agree on. */
function walkAxes(processor: XPathAdapter, context: XPathContext): number {
  let total = 0;
  for (const [index, [, query, gives]] of AXIS_QUERIES.entries()) {
    const start = performance.now();
    total += resultCount(processor, query, context, gives);
    queryTimes[index] = (queryTimes[index] ?? 0) + performance.now() - start;
  }
  return total;
}

/** The items an `evaluate` result holds: an array's length, or one. */
function itemCount(result: unknown): number {
  return Array.isArray(result) ? result.length : 1;
}

/** Runs the `xpath`, `axes` or `compile` workload over a document parsed beforehand; counts items returned, or compilations. */
async function runQueries(
  processor: XPathAdapter,
  workload: Workload,
  input: Input,
  prepared: unknown
): Promise<number> {
  const context: XPathContext = { contextItem: await prepared, variables: NONE, namespaces: NONE };
  if (workload === 'axes') return walkAxes(processor, context);
  const queries = queriesFor(input.path);
  if (workload === 'compile') {
    for (let repeat = 0; repeat < COMPILE_REPEATS; repeat++) {
      for (const query of queries) processor.evaluate(`${query} (: ${copies++} :)`, context);
    }
    return COMPILE_REPEATS * queries.length;
  }
  let items = 0;
  for (const query of queries) items += itemCount(processor.evaluate(query, context));
  return items;
}

/** An adapter with the `xpath`, `axes` and `compile` workloads added, run through an XPath processor over untimed parses. */
export function withXPath(adapter: Adapter, processor: XPathAdapter): Adapter {
  return {
    ...adapter,
    workloads: [...adapter.workloads, ...XPATH_WORKLOADS],
    prepare(workload: Workload, input: Input) {
      if (!XPATH_WORKLOADS.has(workload)) return adapter.prepare?.(workload, input);
      const text = workload === 'compile' ? TINY_DOCUMENT : input.text;
      return processor.parseDocument(text, pathToFileURL(input.path).href);
    },
    run(workload: Workload, input: Input, prepared?: unknown) {
      return XPATH_WORKLOADS.has(workload)
        ? runQueries(processor, workload, input, prepared)
        : adapter.run(workload, input, prepared);
    },
  };
}
