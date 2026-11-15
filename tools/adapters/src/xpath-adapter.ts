/** The capability of an adapter that reads documents, text and collections by URI, as `XPathContext.resources` supplies them. */
export const READS_RESOURCES = 'runner:resources';

/** A text resource by URI: the file holding it, and the encoding it declares, as an HTTP charset would. */
export interface TextResource {
  readonly file: string;
  readonly encoding?: string;
}

/** A collection: its documents' files, or the expression whose items it holds. */
export interface CollectionResource {
  readonly files: readonly string[];
  readonly query?: string;
}

/** What a test reads by absolute URI, for an adapter with the `runner:resources` capability. */
export interface XPathResources {
  /** Documents, by URI, to the file holding each. */
  readonly documents: ReadonlyMap<string, string>;
  readonly texts: ReadonlyMap<string, TextResource>;
  /** Collections by URI, the default by `''`. */
  readonly collections: ReadonlyMap<string, CollectionResource>;
}

/** What an XPath expression is evaluated with, as a test or benchmark sets it up. */
export interface XPathContext {
  /** The context item: a document the adapter parsed, or absent. */
  readonly contextItem?: unknown;
  /** Documents bound to variables, by variable name without the `$`. */
  readonly variables: Readonly<Record<string, unknown>>;
  /** Statically known namespaces, by prefix. */
  readonly namespaces: Readonly<Record<string, string>>;
  readonly staticBaseURI?: string;
  readonly resources?: XPathResources;
}

/**
 * One XPath 3.1 processor, as the QT3 runner and the `xpath` benchmark use it.
 * Results are opaque: the runner checks them with further expressions in the same processor.
 */
export interface XPathAdapter {
  readonly name: string;
  readonly version: string;
  /**
   * What the processor supports, as QT3 dependencies name it: `type:value`, such as
   * `feature:higherOrderFunctions`, `language:en` or `xsd-version:1.1`.
   */
  readonly capabilities: ReadonlySet<string>;
  /** Parses a document, which a context can then hold as its context item or a variable. */
  parseDocument(text: string, uri: string): Promise<unknown>;
  /** Evaluates an expression; throws the processor's error when evaluation fails. */
  evaluate(expression: string, context: XPathContext): unknown;
  /** Evaluates an expression asynchronously, when the processor can; the runner then judges that result, bound to `$result`. */
  evaluateAsync?(expression: string, context: XPathContext): Promise<unknown>;
  /** Evaluates an expression to its effective boolean value. */
  evaluateBoolean(expression: string, context: XPathContext): boolean;
  /** Evaluates an expression whose result is one string. */
  evaluateString(expression: string, context: XPathContext): string;
  /** Writes a result from `evaluate` as XML: nodes serialized, atomic values as text separated by spaces. */
  serialize(result: unknown): string;
  /** The XPath error code an error thrown by the processor carries, such as `XPTY0004`, if any. */
  errorCode(error: unknown): string | undefined;
}

/** The namespace of the standard XPath error codes. */
const ERROR_NAMESPACE = 'http://www.w3.org/2005/xqt-errors';

/** The code a processor's error carries as `code`, as QT3 writes it: `XPTY0004`, without `err:` or its namespace. */
export function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code.replace(/^err:/, '').replace(`Q{${ERROR_NAMESPACE}}`, '') : undefined;
}
