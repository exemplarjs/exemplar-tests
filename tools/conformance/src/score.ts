/** Scores one library on the XML suite, in the command line's process or, forked, in one of its own. */
import path from 'node:path';
import {
  type Adapter,
  exemplarAdapter,
  fastXmlParserAdapter,
  htmlparser2Adapter,
  libxmljs2Adapter,
  saxAdapter,
  saxenAdapter,
  saxesAdapter,
  saxonJs2Adapter,
  saxonJs3Adapter,
  staxXmlAdapter,
  txmlAdapter,
  xercesAdapter,
  xmldomAdapter,
  xmllintAdapter,
} from '@exemplarjs/adapters';
import { readXmlts } from './catalogue/xmlts.ts';
import { EVALUATED, type EvaluationScores, evaluate, percent, scores } from './evaluation.ts';
import { ensureSuite } from './fetch.ts';
import { expectedFailures, failureKey } from './ratchet.ts';
import { type LibraryReport, summarize } from './report.ts';
import { type Result, runXmlts } from './run.ts';

/** The libraries the command line can score, by name. */
export const LIBRARIES: Readonly<Record<string, () => Adapter>> = {
  exemplar: () => exemplarAdapter,
  'fast-xml-parser': () => fastXmlParserAdapter,
  htmlparser2: () => htmlparser2Adapter,
  libxmljs2: () => libxmljs2Adapter,
  sax: () => saxAdapter,
  saxen: () => saxenAdapter,
  saxes: () => saxesAdapter,
  'saxon-js-2': () => saxonJs2Adapter,
  'saxon-js-3': () => saxonJs3Adapter,
  'stax-xml': () => staxXmlAdapter,
  txml: () => txmlAdapter,
  '@xmldom/xmldom': () => xmldomAdapter,
  libxml2: () => xmllintAdapter(),
  xerces: () => xercesAdapter(),
};

/** Whether exemplar's results break the expected-failure list: an unexpected failure, or a listed test that passes. */
function ratchetBroken(results: readonly Result[], report: LibraryReport): boolean {
  const failures = expectedFailures();
  const listedPasses = results.filter(
    (result) => result.pass && failureKey(result.suite, result.id, result.configuration) in failures
  );
  for (const result of listedPasses) console.log(`  ${result.id} under ${result.configuration} passes but is listed`);
  return listedPasses.length > 0 || report.rows.some((row) => row.fail > 0);
}

/** Prints a library's score, and for exemplar its expected and unexpected failures. */
function print(adapter: Adapter, report: LibraryReport, own: boolean, evaluation: EvaluationScores | undefined): void {
  const count = (field: 'pass' | 'fail' | 'expectedFailure'): number =>
    report.rows.reduce((sum, row) => sum + row[field], 0);
  const applicable = count('pass') + count('fail') + count('expectedFailure');
  const expected = own ? `, ${count('expectedFailure')} expected failures, ${count('fail')} unexpected` : '';
  console.log(`${adapter.name} ${adapter.version}: ${count('pass')} of ${applicable} applicable tests pass${expected}`);
  if (evaluation) {
    console.log(
      `  evaluation: rejects malformed ${percent(evaluation.rejectsMalformed)}, outside the DTD ${percent(evaluation.outsideDtd)}, data ${percent(evaluation.data)}`
    );
  }
}

/** A library's report, and whether exemplar's results break its expected-failure list. */
export interface LibraryScore {
  readonly report: LibraryReport;
  readonly broken: boolean;
}

/** Scores one library on the XML suite and prints its score. */
export async function scoreLibrary(name: string): Promise<LibraryScore> {
  const create = LIBRARIES[name];
  if (!create) throw new Error(`Unknown library ${name}; choose from ${Object.keys(LIBRARIES).join(', ')}`);
  const adapter = create();
  const root = path.join(await ensureSuite('xmlts'), 'xmlconf');
  const tests = readXmlts(root);
  // exemplar's rejections must carry full locations, and its expected failures are listed.
  const own = name === 'exemplar';
  const results = await runXmlts(adapter, tests, { requireLocation: own, root });
  const options = EVALUATED[name];
  const evaluation = options === undefined ? undefined : scores(await evaluate(adapter, tests, options));
  const report = summarize(adapter, results, own ? expectedFailures() : {}, evaluation);
  print(adapter, report, own, evaluation);
  return { report, broken: own && ratchetBroken(results, report) };
}

// Forked by the command line: scores the library named and sends the score back.
if (import.meta.main && process.send !== undefined) {
  const [name = ''] = process.argv.slice(2);
  const score = await scoreLibrary(name);
  process.send(score, () => process.disconnect());
}
