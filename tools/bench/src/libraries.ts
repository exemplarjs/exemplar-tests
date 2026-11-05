import {
  type Adapter,
  exemplarAdapter,
  exemplarBuildAdapter,
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
  xmldomAdapter,
} from '@exemplarjs/adapters';

/** A built checkout of `main`, whose exemplar is timed beside the change as `exemplar@main`. */
const BASELINE = process.env['EXEMPLAR_BASELINE'];
const baseline =
  BASELINE === undefined ? {} : { 'exemplar@main': await exemplarBuildAdapter(BASELINE, 'exemplar@main', 'main') };

/** The libraries the benchmarks can time, by name. */
export const LIBRARIES: Readonly<Record<string, Adapter>> = {
  exemplar: exemplarAdapter,
  ...baseline,
  'fast-xml-parser': fastXmlParserAdapter,
  htmlparser2: htmlparser2Adapter,
  libxmljs2: libxmljs2Adapter,
  sax: saxAdapter,
  saxen: saxenAdapter,
  saxes: saxesAdapter,
  'saxon-js-2': saxonJs2Adapter,
  'saxon-js-3': saxonJs3Adapter,
  'stax-xml': staxXmlAdapter,
  txml: txmlAdapter,
  '@xmldom/xmldom': xmldomAdapter,
};

/** Returns a library's adapter by name. */
export function library(name: string): Adapter {
  const adapter = LIBRARIES[name];
  if (!adapter) throw new Error(`Unknown library ${name}; choose from ${Object.keys(LIBRARIES).join(', ')}`);
  return adapter;
}
