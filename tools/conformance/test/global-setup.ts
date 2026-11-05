import { ensureSuite, suites } from '../src/fetch.ts';

/** Fetches every missing suite once, before the test files start, so that no two of them fetch one at the same time; suites fetched on demand are left to their tools. */
export default async function setup(): Promise<void> {
  for (const [name, spec] of Object.entries(suites())) {
    if (!(spec.kind === 'archive' && spec.onDemand === true)) await ensureSuite(name);
  }
}
