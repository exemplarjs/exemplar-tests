/** Runs QT3 as an XPath 3.1 suite against the named processors and writes the reports. */
import { parseArgs } from 'node:util';
import { suites } from '../fetch.ts';
import { expectedFailures } from '../ratchet.ts';
import { readQt3, testSetNames } from './catalog.ts';
import { applyExpectedFailures } from './expected.ts';
import { runIsolated } from './isolated.ts';
import { PROCESSORS, processor, suiteRoot } from './processors.ts';
import { type Qt3Report, passRate, summarize, writeQt3Reports } from './report.ts';
import { SCOPES } from './scopes.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { 'test-sets': { type: 'string' }, scope: { type: 'string' } },
});
const names = positionals.length > 0 ? positionals : Object.keys(PROCESSORS);
const root = await suiteRoot();
const scope = values.scope;
const inScope = scope === undefined ? undefined : SCOPES[scope];
if (scope !== undefined && inScope === undefined)
  throw new Error(`Unknown scope ${scope}; choose from ${Object.keys(SCOPES).join(', ')}`);
const testSets =
  values['test-sets']?.split(',') ??
  (inScope === undefined ? undefined : testSetNames(root).filter((name) => inScope(name)));
const pinned = suites()['qt3'];
const suite = `w3c/qt3tests at ${pinned?.kind === 'archive' ? pinned.url.split('/').at(-1)?.slice(0, 7) : 'an unpinned commit'}`;
// Read once, then handed to each processor's workers.
const tests = readQt3(root, testSets === undefined ? undefined : new Set(testSets));
const reports: Qt3Report[] = [];
for (const name of names) {
  const adapter = processor(name);
  const started = performance.now();
  // exemplar's failures the list expects are counted apart; a listed test that does not fail breaks the run.
  const ran = await runIsolated(name, tests);
  const listed = name.startsWith('exemplar') ? expectedFailures() : {};
  const { results, broken } = applyExpectedFailures(ran, listed, testSets === undefined);
  for (const problem of broken) console.log(`  ${problem} in expected-failures.json`);
  if (broken.length > 0) process.exitCode = 1;
  const report = summarize(adapter, results);
  reports.push(report);
  const { totals } = report;
  const seconds = ((performance.now() - started) / 1000).toFixed(0);
  console.log(
    `${adapter.name} ${adapter.version}: pass rate ${passRate(totals)}; ${totals.pass} pass, ${totals.fail} fail, ${totals['wrong-error']} wrong error, ${totals['expected-failure']} expected failures, ${totals['not-run']} not run, ${totals['not-applicable']} not applicable, in ${seconds} s`
  );
}
writeQt3Reports(reports, suite, scope);
