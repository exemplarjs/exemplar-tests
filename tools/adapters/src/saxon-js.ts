import {
  type Adapter,
  type CanonicalForm,
  type Input,
  type Outcome,
  type Source,
  type Workload,
  rejection,
  unsupported,
} from './adapter.ts';
import { CanonicalWriter } from './canonical.ts';
import { decode, declaredVersion } from './decode.ts';
import { type DomNode, writeDomTree } from './dom-tree.ts';
import { type SaxonJsPackage, loadSaxonJs } from './saxon-js-loader.ts';
import { saxonJs2XPathAdapter, saxonJs3XPathAdapter } from './saxon-js-xpath.ts';
import type { XPathAdapter } from './xpath-adapter.ts';
import { withXPath } from './xpath-workload.ts';

/** Parses a document with Saxon-JS's own parser, which reads no DTD. */
async function canonical(packageName: SaxonJsPackage, source: Source, form: CanonicalForm): Promise<Outcome> {
  const writer = new CanonicalWriter(form);
  try {
    const document = (await loadSaxonJs(packageName).getResource({
      text: decode(source.bytes, source.encoding),
      type: 'xml',
    })) as DomNode;
    writeDomTree(
      Object.assign(Object.create(document) as DomNode, { xmlVersion: declaredVersion(source.bytes, source.encoding) }),
      writer
    );
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** A Saxon-JS version, Saxonica's XSLT and XPath processor, building its tree with its own parser. */
function saxonJsAdapterFor(packageName: SaxonJsPackage, xpath: XPathAdapter): Adapter {
  const parse = (text: string) => loadSaxonJs(packageName).getResource({ text, type: 'xml' });
  const adapter: Adapter = {
    name: xpath.name,
    version: xpath.version,
    configurations: ['standalone'],
    // Its tree is the XDM tree its XPath and XSLT run on, so it builds the same for both.
    workloads: ['tree', 'xdm'],
    canonical: (source, _configuration, form) => canonical(packageName, source, form),
    build: (input: Input) => parse(input.text),
    async run(workload: Workload, input: Input) {
      if (workload !== 'tree' && workload !== 'xdm') throw unsupported(xpath.name, workload);
      return (await parse(input.text)) === null ? 0 : 1;
    },
  };
  return withXPath(adapter, xpath);
}

/** Saxon-JS 2, the `saxon-js` package. */
export const saxonJs2Adapter = saxonJsAdapterFor('saxon-js', saxonJs2XPathAdapter);
/** Saxon-JS 3, the `saxonjs-he` package. */
export const saxonJs3Adapter = saxonJsAdapterFor('saxonjs-he', saxonJs3XPathAdapter);
