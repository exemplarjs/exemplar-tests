import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Adapter, type Source, exemplarAdapter } from '@exemplarjs/adapters';
import { sha256 } from '@exemplarjs/conformance';
import type { Dataset } from './datasets.ts';
import { countEvents, runScript } from './harness.ts';

/** How one library's output compared with the reference on a dataset's documents that the reference accepts. */
export interface Difference {
  readonly library: string;
  /** The documents the reference accepts, and so the ones every library is judged on. */
  readonly documents: number;
  /** Of those, the documents the library accepts with other output. */
  readonly wrong: number;
  readonly first?: { readonly document: string; readonly detail: string };
}

/** Which documents the reference accepts, and which each library reads correctly, by index in the dataset. */
export interface Correctness {
  readonly accepted: readonly boolean[];
  readonly correct: ReadonlyMap<string, readonly boolean[]>;
}

/** Summarizes where two outputs part. */
function detail(actual: string, expected: string): string {
  let at = 0;
  while (at < actual.length && actual[at] === expected[at]) at++;
  return `at ${at}: got ${JSON.stringify(actual.slice(at, at + 40))}, expected ${JSON.stringify(expected.slice(at, at + 40))}`;
}

/** A library's canonical output for a document, read as its dataset is, or undefined when it rejects the document. */
async function output(adapter: Adapter, source: Source, dataset: Dataset): Promise<string | undefined> {
  try {
    const outcome = await adapter.canonical(source, dataset.configuration, 'first', { root: dataset.directory });
    return outcome.accepted ? (outcome.canonical ?? '') : undefined;
  } catch {
    return undefined;
  }
}

/** One library's output against exemplar's digests: which documents it reads correctly, by index, and how many it misreads. */
export interface LibraryCheck {
  readonly correct: readonly boolean[];
  /** Documents the library accepts with other output than the reference's. */
  readonly wrong: number;
  /** The first document it rejects or misreads, by index, with its output when it accepted it. */
  readonly first?: { readonly index: number; readonly actual?: string };
}

/** A digest of exemplar's output for each document, by index, or null where exemplar rejects it. */
export type ReferenceDigests = readonly (string | null)[];

/** A dataset document as a source to read. */
function sourceOf(file: string): Source {
  return { bytes: readFileSync(file), systemId: pathToFileURL(file).href };
}

/** Compares one library's canonical output with exemplar's digests; `check.ts` runs it in the library's own process, without exemplar. */
export async function checkLibrary(
  adapter: Adapter,
  dataset: Dataset,
  references: ReferenceDigests
): Promise<LibraryCheck> {
  const correct: boolean[] = [];
  let wrong = 0;
  let first: LibraryCheck['first'];
  for (const [index, file] of dataset.documents.entries()) {
    const reference = references[index] ?? null;
    // A document the reference rejects judges no library.
    if (reference === null) {
      correct[index] = false;
      continue;
    }
    const actual = await output(adapter, sourceOf(file), dataset);
    correct[index] = actual !== undefined && sha256(actual) === reference;
    if (correct[index]) continue;
    if (actual !== undefined) wrong++;
    first ??= { index, ...(actual !== undefined && { actual }) };
  }
  return { correct, wrong, ...(first && { first }) };
}

/** Where a library first parts from the reference, described against exemplar's output, made again here. */
async function firstDifference(
  dataset: Dataset,
  first: NonNullable<LibraryCheck['first']>
): Promise<Difference['first']> {
  const file = dataset.documents[first.index] as string;
  const document = path.relative(dataset.directory, file);
  if (first.actual === undefined) return { document, detail: 'rejected' };
  const expected = (await output(exemplarAdapter, sourceOf(file), dataset)) ?? '';
  return { document, detail: detail(first.actual, expected) };
}

/** Checks each library's output against exemplar's before anything is timed, each other library in a process of its own. */
export async function compare(
  libraries: readonly string[],
  dataset: Dataset
): Promise<{ differences: Difference[]; correctness: Correctness; events: number }> {
  const references: (string | null)[] = [];
  let events = 0;
  for (const file of dataset.documents) {
    const source = sourceOf(file);
    events += countEvents(source.bytes);
    const reference = await output(exemplarAdapter, source, dataset);
    references.push(reference === undefined ? null : sha256(reference));
  }
  const accepted = references.map((reference) => reference !== null);
  const documents = accepted.filter(Boolean).length;
  const differences: Difference[] = [];
  const correct = new Map<string, readonly boolean[]>();
  for (const name of libraries) {
    // exemplar is the reference, so it reads correctly whatever it accepts.
    const check: LibraryCheck =
      name === exemplarAdapter.name
        ? { correct: accepted, wrong: 0 }
        : await runScript<LibraryCheck>('check.ts', [name, dataset.name], JSON.stringify(references));
    const first = check.first && (await firstDifference(dataset, check.first));
    differences.push({ library: name, documents, wrong: check.wrong, ...(first && { first }) });
    correct.set(name, check.correct);
  }
  return { differences, correctness: { accepted, correct }, events };
}
