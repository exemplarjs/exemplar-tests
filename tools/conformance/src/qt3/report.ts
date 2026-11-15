import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { XPathAdapter } from '@exemplarjs/adapters';
import { PACKAGE } from '../paths.ts';
import type { Qt3Result, Status } from './run.ts';

/** Every status, in the order the report shows them. */
const STATUSES: readonly Status[] = ['pass', 'fail', 'wrong-error', 'expected-failure', 'not-run', 'not-applicable'];

/** How many tests had each status. */
export type Counts = Record<Status, number>;

/** One processor's QT3 results, counted. */
export interface Qt3Report {
  readonly library: string;
  readonly version: string;
  readonly totals: Counts;
  /** Counts by test set, in catalog order. */
  readonly testSets: readonly { readonly name: string; readonly counts: Counts }[];
  /** How many tests did not apply, or were not run, for each reason. */
  readonly reasons: Readonly<Record<string, number>>;
  /** Every test that failed or raised the wrong error, with what it raised. */
  readonly failures: readonly Qt3Result[];
}

/** Counts at zero. */
function zero(): Counts {
  return { pass: 0, fail: 0, 'wrong-error': 0, 'expected-failure': 0, 'not-run': 0, 'not-applicable': 0 };
}

/** Counts a processor's results by status, test set and reason. */
export function summarize(adapter: XPathAdapter, results: readonly Qt3Result[]): Qt3Report {
  const totals = zero();
  const testSets = new Map<string, Counts>();
  const reasons: Record<string, number> = {};
  for (const result of results) {
    totals[result.status]++;
    let counts = testSets.get(result.testSet);
    if (counts === undefined) {
      counts = zero();
      testSets.set(result.testSet, counts);
    }
    counts[result.status]++;
    if (result.status === 'not-run' || result.status === 'not-applicable') {
      const reason = `${result.status}: ${result.reason ?? 'unknown'}`;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
  }
  return {
    library: adapter.name,
    version: adapter.version,
    totals,
    testSets: [...testSets].map(([name, counts]) => ({ name, counts })),
    reasons,
    failures: results.filter((result) => result.status === 'fail' || result.status === 'wrong-error'),
  };
}

/** The share of the judged tests that pass, expected failures among those judged, as a percentage with one decimal. */
export function passRate(counts: Counts): string {
  const judged = counts.pass + counts.fail + counts['wrong-error'] + counts['expected-failure'];
  return judged === 0 ? 'n/a' : `${((100 * counts.pass) / judged).toFixed(1)}%`;
}

/** A Markdown table row. */
function row(cells: readonly (string | number)[]): string {
  return `| ${cells.join(' | ')} |`;
}

/** Renders the reports as Markdown: totals per processor, the reasons tests were left out, and counts per test set. */
function markdown(reports: readonly Qt3Report[], suite: string): string {
  const lines = [
    '# QT3 results',
    '',
    `The W3C XQuery and XPath test suite, ${suite}, run as an XPath 3.1 processor. "Pass rate" counts the tests judged: those that pass, fail, or raise an error with another code than the one expected, and those exemplar fails as [\`exceptions.md\`](../exceptions.md) explains.`,
    '',
    row(['Library', 'Version', 'Pass rate', ...STATUSES]),
    row(['---', '---', '---:', ...STATUSES.map(() => '---:')]),
    ...reports.map((report) =>
      row([report.library, report.version, passRate(report.totals), ...STATUSES.map((status) => report.totals[status])])
    ),
    '',
  ];
  for (const report of reports) {
    lines.push(`## ${report.library} ${report.version}`, '', row(['Left out because', 'Tests']), row(['---', '---:']));
    const reasons = Object.entries(report.reasons).toSorted((a, b) => b[1] - a[1]);
    for (const [reason, count] of reasons) lines.push(row([reason, count]));
    lines.push(
      '',
      '<details><summary>By test set</summary>',
      '',
      row(['Test set', 'Pass rate', ...STATUSES]),
      row(['---', '---:', ...STATUSES.map(() => '---:')])
    );
    for (const { name, counts } of report.testSets) {
      lines.push(row([name, passRate(counts), ...STATUSES.map((status) => counts[status])]));
    }
    lines.push('', '</details>', '');
  }
  return lines.join('\n');
}

/** Writes `reports/qt3.md` and `reports/qt3.json`, or `qt3-<scope>.*` for a run limited to a scope. */
export function writeQt3Reports(
  reports: readonly Qt3Report[],
  suite: string,
  scope?: string,
  directory = path.join(PACKAGE, 'reports')
): void {
  const name = scope === undefined ? 'qt3' : `qt3-${scope}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${name}.json`), `${JSON.stringify({ suite, reports }, undefined, 1)}\n`);
  writeFileSync(path.join(directory, `${name}.md`), markdown(reports, suite));
}
