import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XdmDocumentBuilder, type XdmItem } from '@exemplarjs/xdm';
import { type ResolvedSource, type URIResolver, XMLInputFactory } from '@exemplarjs/xml';
import { fileResolver } from '@exemplarjs/xml/resolvers/file';
import {
  type CollectionResolver,
  type EvaluationOptions,
  XPathCompiler,
  type XPathExecutable,
} from '@exemplarjs/xpath';
import { directoryCollections } from '@exemplarjs/xpath/resolvers/directory';
import { installedVersion } from './decode.ts';
import { serializeXdm } from './xdm-serializer.ts';
import {
  READS_RESOURCES,
  type XPathAdapter,
  type XPathContext,
  type XPathResources,
  errorCode,
} from './xpath-adapter.ts';

/** What the adapter needs of one build of exemplar: its XPath compiler and an XDM tree builder. */
export interface ExemplarXPath {
  readonly Compiler: typeof XPathCompiler;
  readonly builder: Pick<XdmDocumentBuilder, 'parse'>;
  readonly version: string;
}

/** The context item, as exemplar takes it. */
function contextItemOf(context: XPathContext): XdmItem | null {
  return (context.contextItem as XdmItem | undefined) ?? null;
}

/** A file's bytes as a resolver supplies them, under the URI asked for; undefined for one that cannot be read, such as a directory. */
function fileSource(file: string, uri: string, encoding?: string): ResolvedSource | undefined {
  try {
    return { bytes: readFileSync(file), systemId: uri, ...(encoding !== undefined && { encoding }) };
  } catch {
    return undefined;
  }
}

/** How resolvers answer: at once, or, for the asynchronous adapter, with a promise. */
type Answer = <Value>(value: Value) => Value | Promise<Awaited<Value>>;
const AT_ONCE: Answer = (value) => value;
const PROMISED: Answer = (value) => Promise.resolve(value);

/** A URI resolver over a test's documents and text resources, and any other `file:` URI, as the suite's files. */
function uriResolverOf(resources: XPathResources, answer: Answer): URIResolver {
  return {
    resolve(href) {
      const text = resources.texts.get(href);
      if (text !== undefined) return answer(fileSource(text.file, href, text.encoding));
      const document = resources.documents.get(href) ?? (href.startsWith('file:') ? fileURLToPath(href) : undefined);
      return answer(document === undefined ? undefined : fileSource(document, href));
    },
  };
}

/** Lists the files of a directory a `file:` collection URI names, for the suite's `directory-as-collection-uri` test. */
const directories = directoryCollections({ root: '/' });

/** A collection resolver over a test's collections, each its documents' file URLs or its query's items; else a directory's files. */
function collectionResolverOf(
  resources: XPathResources,
  Compiler: typeof XPathCompiler,
  answer: Answer
): CollectionResolver {
  const members = (uri: string | undefined) => {
    const collection = resources.collections.get(uri ?? '');
    if (collection === undefined) return uri === undefined ? undefined : directories.resolveCollection(uri);
    if (collection.query !== undefined) return new Compiler().compile(collection.query).evaluate();
    return collection.files.map((file) => pathToFileURL(file).href);
  };
  return { resolveCollection: (uri) => answer(members(uri)) };
}

/** Builds the documents an expression reads, its external entities and DTDs read from the suite's files, as `parse-xml` tests ask. */
const resourceBuilder = new XdmDocumentBuilder(
  new XMLInputFactory({
    entityResolver: fileResolver({ root: '/' }),
    accessExternalEntities: ['file'],
    accessExternalDTD: ['file'],
  })
);

/** Makes a context's evaluation options once: its resources' resolvers, answering at once or with promises, or none. */
function optionsMaker(Compiler: typeof XPathCompiler, answer: Answer): (context: XPathContext) => EvaluationOptions {
  const made = new WeakMap<XPathContext, EvaluationOptions>();
  return (context) => {
    let options = made.get(context);
    if (options === undefined) {
      const resources = context.resources;
      options =
        resources === undefined
          ? {}
          : {
              resources: {
                uriResolver: uriResolverOf(resources, answer),
                collectionResolver: collectionResolverOf(resources, Compiler, answer),
                builder: resourceBuilder,
              },
            };
      made.set(context, options);
    }
    return options;
  };
}

/** exemplar's own XPath 3.1 processor, over its XDM trees, from one build; with `async`, evaluating with `evaluateAsync`. */
export function exemplarXPathAdapterFor(
  build: ExemplarXPath,
  evaluation: 'at-once' | 'async' = 'at-once'
): XPathAdapter {
  const { Compiler, builder } = build;
  const optionsOf = optionsMaker(Compiler, AT_ONCE);
  // Compilers by namespaces and base URI, so that contexts sharing an environment share one.
  const compilers = new Map<string, XPathCompiler>();
  const compilerFor = (context: XPathContext): XPathCompiler => {
    const key = JSON.stringify([context.namespaces, context.staticBaseURI]);
    let compiler = compilers.get(key);
    if (compiler === undefined) {
      // QT3 gives the default element namespace as the namespace of the prefix ''.
      const { '': defaultElementNamespace, ...namespaces } = context.namespaces;
      // No cache, so that each call compiles, as the other processors' adapters do.
      compiler = new Compiler({
        cache: false,
        namespaces,
        ...(defaultElementNamespace !== undefined && { defaultElementNamespace }),
        ...(context.staticBaseURI !== undefined && { baseURI: context.staticBaseURI }),
      });
      compilers.set(key, compiler);
    }
    return compiler;
  };
  const compiled = (expression: string, context: XPathContext): XPathExecutable<Record<string, unknown>> =>
    compilerFor(context).compile(expression, { variables: Object.keys(context.variables) });
  // What every evaluation is given: the context item, the variables and the context's options.
  const argumentsOf = (context: XPathContext, options = optionsOf) =>
    [contextItemOf(context), { variables: context.variables, ...options(context) }] as const;
  const adapter: XPathAdapter = {
    name: 'exemplar',
    version: build.version,
    // What exemplar supports so far: XPath 3.1 with higher-order functions and serialization, over XML 1.0, reading resources.
    capabilities: new Set([
      READS_RESOURCES,
      'feature:serialization',
      'feature:directory-as-collection-uri',
      'feature:higherOrderFunctions',
      'feature:namespace-axis',
      'feature:arbitraryPrecisionDecimal',
      'xsd-version:1.1',
      'xml-version:1.0',
      'language:en',
      'default-language:en',
      'unicode-normalization-form:NFD',
      'unicode-normalization-form:NFKD',
      'unicode-normalization-form:NFKC',
    ]),
    parseDocument: (text, uri) => Promise.resolve(builder.parse({ text, systemId: uri })),
    evaluate: (expression, context) => compiled(expression, context).evaluate(...argumentsOf(context)),
    evaluateBoolean: (expression, context) => compiled(expression, context).evaluateBoolean(...argumentsOf(context)),
    evaluateString: (expression, context) => compiled(expression, context).evaluateString(...argumentsOf(context)),
    serialize: (result) => serializeXdm((result as readonly XdmItem[] | undefined) ?? []),
    errorCode,
  };
  if (evaluation === 'at-once') return adapter;
  const promisedOptionsOf = optionsMaker(Compiler, PROMISED);
  return {
    ...adapter,
    name: 'exemplar-async',
    evaluateAsync: (expression, context) =>
      compiled(expression, context).evaluateAsync(...argumentsOf(context, promisedOptionsOf)),
  };
}

/** The build of exemplar this workspace links. */
const LINKED: ExemplarXPath = {
  Compiler: XPathCompiler,
  builder: new XdmDocumentBuilder(new XMLInputFactory()),
  version: installedVersion('@exemplarjs/xpath'),
};

/** exemplar's XPath processor as this workspace links it. */
export const exemplarXPathAdapter: XPathAdapter = exemplarXPathAdapterFor(LINKED);

/** The same, evaluating with `evaluateAsync` and resolvers that answer with promises. */
export const exemplarAsyncXPathAdapter: XPathAdapter = exemplarXPathAdapterFor(LINKED, 'async');
