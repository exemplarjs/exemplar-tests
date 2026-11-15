import { readdirSync } from 'node:fs';
import path from 'node:path';
import {
  type XPathAdapter,
  exemplarAsyncXPathAdapter,
  exemplarXPathAdapter,
  saxonJs2XPathAdapter,
  saxonJs3XPathAdapter,
} from '@exemplarjs/adapters';
import { ensureSuite } from '../fetch.ts';

/** The XPath processors the QT3 runner can run, by name. */
export const PROCESSORS: Readonly<Record<string, XPathAdapter>> = {
  'saxon-js-2': saxonJs2XPathAdapter,
  'saxon-js-3': saxonJs3XPathAdapter,
  exemplar: exemplarXPathAdapter,
  'exemplar-async': exemplarAsyncXPathAdapter,
};

/** A processor by name. */
export function processor(name: string): XPathAdapter {
  const adapter = PROCESSORS[name];
  if (adapter === undefined)
    throw new Error(`Unknown processor ${name}; choose from ${Object.keys(PROCESSORS).join(', ')}`);
  return adapter;
}

/** The folder holding `catalog.xml` in the unpacked suite, which the archive puts one level down; fetched on first use. */
export async function suiteRoot(): Promise<string> {
  const directory = await ensureSuite('qt3');
  const inner = readdirSync(directory).find((name) => name.startsWith('qt3tests-'));
  if (inner === undefined) throw new Error(`No qt3tests folder in ${directory}`);
  return path.join(directory, inner);
}
