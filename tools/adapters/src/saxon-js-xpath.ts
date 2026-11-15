import { installedVersion } from './decode.ts';
import { type SaxonJsPackage, loadSaxonJs } from './saxon-js-loader.ts';
import { type XPathAdapter, type XPathContext, errorCode } from './xpath-adapter.ts';

/** Saxon-JS's evaluation options for a context. */
function optionsFor(context: XPathContext): {
  params: Readonly<Record<string, unknown>>;
  namespaceContext: Readonly<Record<string, string>>;
  staticBaseURI?: string;
} {
  return {
    params: context.variables,
    namespaceContext: context.namespaces,
    ...(context.staticBaseURI !== undefined && { staticBaseURI: context.staticBaseURI }),
  };
}

/** A Saxon-JS version through `SaxonJS.XPath.evaluate`, with its own XML parser. */
function saxonJsXPathAdapterFor(name: string, packageName: SaxonJsPackage): XPathAdapter {
  const saxon = () => loadSaxonJs(packageName);
  return {
    name,
    version: installedVersion(packageName),
    // What we take Saxon-JS to support: no schema awareness, no XPath 1.0 mode, and a parser that reads no DTD.
    capabilities: new Set([
      'feature:higherOrderFunctions',
      'feature:serialization',
      'feature:namespace-axis',
      'feature:arbitraryPrecisionDecimal',
      'xsd-version:1.1',
      'xml-version:1.0',
      'xml-version:1.1',
      'language:en',
      'default-language:en',
      'unicode-normalization-form:NFD',
      'unicode-normalization-form:NFKD',
      'unicode-normalization-form:NFKC',
    ]),
    parseDocument: (text, uri) => saxon().getResource({ text, type: 'xml', baseURI: uri }),
    evaluate: (expression, context) =>
      saxon().XPath.evaluate(expression, context.contextItem ?? null, { ...optionsFor(context), resultForm: 'xdm' }),
    evaluateBoolean: (expression, context) =>
      saxon().XPath.evaluate(`boolean((${expression}))`, context.contextItem ?? null, optionsFor(context)) === true,
    evaluateString: (expression, context) =>
      String(saxon().XPath.evaluate(`string((${expression}))`, context.contextItem ?? null, optionsFor(context))),
    serialize: (result) => saxon().serialize(result, { method: 'xml', 'omit-xml-declaration': true }),
    errorCode,
  };
}

/** Saxon-JS 2, the `saxon-js` package. */
export const saxonJs2XPathAdapter = saxonJsXPathAdapterFor('saxon-js-2', 'saxon-js');
/** Saxon-JS 3, the `saxonjs-he` package. */
export const saxonJs3XPathAdapter = saxonJsXPathAdapterFor('saxon-js-3', 'saxonjs-he');
