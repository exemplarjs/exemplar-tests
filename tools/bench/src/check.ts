/** Checks one library's output against exemplar's digests on a dataset, in a process of its own, and prints the result as JSON. */
import { readFileSync } from 'node:fs';
import { type ReferenceDigests, checkLibrary } from './correctness.ts';
import { ensureDataset } from './datasets.ts';
import { library } from './libraries.ts';

const [name = '', datasetName = ''] = process.argv.slice(2);
// exemplar's digests arrive on stdin, as a large dataset's would not fit on a command line.
const references = JSON.parse(readFileSync(0, 'utf8')) as ReferenceDigests;
const check = await checkLibrary(library(name), await ensureDataset(datasetName), references);
process.stdout.write(`${JSON.stringify(check)}\n`);
