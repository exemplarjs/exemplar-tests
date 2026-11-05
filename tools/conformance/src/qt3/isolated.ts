import { Worker } from 'node:worker_threads';
import type { TestCase } from './catalog.ts';
import type { Qt3Result } from './run.ts';
import type { WorkerMessage, WorkerTask } from './worker.ts';

/** How long one test may run before it counts as failed and its worker is stopped. */
const TEST_TIME_LIMIT_MS = 20_000;

/** The heap a worker may use, so that a test building a vast sequence fails alone instead of ending the run. */
const WORKER_HEAP_MB = 2048;

/** Runs tests in one worker from `from`; resolves with the index to go on from, past any test that stopped the worker. */
function runWorker(processor: string, tests: readonly TestCase[], from: number, results: Qt3Result[]): Promise<number> {
  return new Promise((resolve) => {
    const task: WorkerTask = { processor, tests: tests.slice(from), from };
    const worker = new Worker(new URL('worker.ts', import.meta.url), {
      workerData: task,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    let current = from;
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    /** Records the current test as failed, unless it already has a result, and goes on after it. */
    const fail = (reason: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const test = tests[current] as TestCase;
      results[current] ??= { name: test.name, testSet: test.testSet, status: 'fail', reason };
      resolve(current + 1);
      void worker.terminate();
    };
    worker.on('message', (message: WorkerMessage) => {
      if (message.kind === 'started') {
        current = message.index;
        timer = setTimeout(() => fail(`took longer than ${TEST_TIME_LIMIT_MS / 1000} s`), TEST_TIME_LIMIT_MS);
      } else if (message.kind === 'result') {
        clearTimeout(timer);
        results[message.index] = message.result;
      } else {
        settled = true;
        resolve(tests.length);
      }
    });
    worker.on('error', (error) => fail(`stopped its worker: ${error.message.slice(0, 200)}`));
    worker.on('exit', (code) => fail(`stopped its worker, which exited with ${code}`));
  });
}

/** Runs the tests with a processor, each worker restarted after a test that runs out of memory or time. */
export async function runIsolated(processor: string, tests: readonly TestCase[]): Promise<Qt3Result[]> {
  const results: Qt3Result[] = [];
  for (let from = 0; from < tests.length;) from = await runWorker(processor, tests, from, results);
  return results;
}
