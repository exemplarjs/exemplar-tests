/** A worker thread that runs QT3 tests in order for one processor, reporting each test as it starts and ends. */
import { parentPort, workerData } from 'node:worker_threads';
import type { TestCase } from './catalog.ts';
import { processor } from './processors.ts';
import { DocumentCache, type Qt3Result, runTest } from './run.ts';

/** What the worker is told to run: a processor, and the tests from the one it starts at, numbered from `from`. */
export interface WorkerTask {
  readonly processor: string;
  readonly tests: readonly TestCase[];
  readonly from: number;
}

/** What the worker reports: a test starting, a test's result, or the end of the tests. */
export type WorkerMessage =
  | { readonly kind: 'started'; readonly index: number }
  | { readonly kind: 'result'; readonly index: number; readonly result: Qt3Result }
  | { readonly kind: 'done' };

const task = workerData as WorkerTask;
const port = parentPort;
if (port === null) throw new Error('worker.ts runs only as a worker thread');
const adapter = processor(task.processor);
const documents = new DocumentCache(adapter);
for (const [offset, test] of task.tests.entries()) {
  const index = task.from + offset;
  port.postMessage({ kind: 'started', index } satisfies WorkerMessage);
  const result = await runTest(adapter, test, documents);
  port.postMessage({ kind: 'result', index, result } satisfies WorkerMessage);
}
port.postMessage({ kind: 'done' } satisfies WorkerMessage);
