/** Adapters that put exemplar and other XML libraries behind one interface. */
export type {
  Acceptance,
  Adapter,
  CanonicalForm,
  Configuration,
  ExemplarApi,
  Input,
  Outcome,
  ParseOptions,
  Rejection,
  Source,
  Workload,
} from './adapter.ts';
export { TREE_WORKLOADS, rejection, unsupported } from './adapter.ts';
export { CanonicalWriter, escape } from './canonical.ts';
export { decode, declaredVersion, detectedEncoding } from './decode.ts';
export { type DomNode, writeDomTree } from './dom-tree.ts';
export { exemplarAdapter } from './exemplar.ts';
export { exemplarBuildAdapter } from './exemplar-build.ts';
export { fastXmlParserAdapter } from './fast-xml-parser.ts';
export { exemplarAsyncXPathAdapter, exemplarXPathAdapter } from './exemplar-xpath.ts';
export { htmlparser2Adapter } from './htmlparser2.ts';
export { type CatalogQuery, type JdkCatalog, jdkCatalog } from './jdk-catalog.ts';
export { libxmljs2Adapter } from './libxmljs2.ts';
export { saxAdapter } from './sax.ts';
export { saxonJs2Adapter, saxonJs3Adapter } from './saxon-js.ts';
export { saxonJs2XPathAdapter, saxonJs3XPathAdapter } from './saxon-js-xpath.ts';
export { saxenAdapter } from './saxen.ts';
export { saxesAdapter } from './saxes.ts';
export { staxXmlAdapter } from './stax-xml.ts';
export { txmlAdapter } from './txml.ts';
export { javaExecutable, xercesAdapter } from './xerces.ts';
export { xmldomAdapter } from './xmldom.ts';
export { xmllintAdapter, xmllintCanonical } from './xmllint.ts';
export { READS_RESOURCES } from './xpath-adapter.ts';
export { AXIS_QUERIES } from './xpath-queries.ts';
export { takeQueryTimes } from './xpath-workload.ts';
export type { CollectionResource, TextResource, XPathAdapter, XPathContext, XPathResources } from './xpath-adapter.ts';
