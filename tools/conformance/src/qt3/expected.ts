import { type ExpectedFailures, unknownEntries } from '../ratchet.ts';
import type { Qt3Result } from './run.ts';

/** Marks the failures `expected-failures.json` lists as `qt3/<test>`, and finds the listed tests that break the list. */
export function applyExpectedFailures(
  results: readonly Qt3Result[],
  failures: ExpectedFailures,
  wholeSuite: boolean
): { readonly results: Qt3Result[]; readonly broken: string[] } {
  const broken: string[] = [];
  const marked = results.map((result) => {
    if (!(`qt3/${result.name}` in failures)) return result;
    if (result.status === 'fail' || result.status === 'wrong-error')
      return { ...result, status: 'expected-failure' as const };
    const how = result.status === 'pass' ? 'passes' : 'is ' + result.status;
    broken.push(`${result.name} is listed but ${how}`);
    return result;
  });
  // In a run of the whole suite, a listed test it does not have breaks the list too.
  if (wholeSuite) {
    const keys = new Set(results.map((result) => `qt3/${result.name}`));
    for (const key of unknownEntries(failures, keys, 'qt3/')) broken.push(`${key} is listed but is not in the suite`);
  }
  return { results: marked, broken };
}
