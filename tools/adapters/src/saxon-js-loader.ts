import { createRequire } from 'node:module';
import type SaxonJS from 'saxon-js';

/** The npm packages of the Saxon-JS versions the adapters run: 2 as `saxon-js`, 3 as `saxonjs-he`. */
export type SaxonJsPackage = 'saxon-js' | 'saxonjs-he';

const processors = new Map<SaxonJsPackage, typeof SaxonJS>();

/** A Saxon-JS version, loaded on first use; it raises `Error.stackTraceLimit` as it loads, which is put back for the other libraries. */
export function loadSaxonJs(packageName: SaxonJsPackage): typeof SaxonJS {
  let processor = processors.get(packageName);
  if (processor === undefined) {
    const limit = Error.stackTraceLimit;
    try {
      processor = createRequire(import.meta.url)(packageName) as typeof SaxonJS;
    } finally {
      Error.stackTraceLimit = limit;
    }
    processors.set(packageName, processor);
  }
  return processor;
}
