/** The part of Saxon-JS 2.7's API the adapters use; Saxon-JS ships no type declarations. */
declare module 'saxon-js' {
  /** Options for `XPath.evaluate`, as the adapters use them. */
  interface XPathOptions {
    readonly params?: Readonly<Record<string, unknown>>;
    readonly namespaceContext?: Readonly<Record<string, string>>;
    readonly staticBaseURI?: string;
    /** `xdm` returns the result as Saxon's own items, which can be passed back as parameters. */
    readonly resultForm?: 'default' | 'array' | 'xdm';
  }
  const SaxonJS: {
    /** Parses a document; with `type: 'xml'` the promise gives a W3C DOM document. */
    getResource(options: { readonly text: string; readonly type: 'xml'; readonly baseURI?: string }): Promise<unknown>;
    /** Serializes a value with serialization parameters such as `method`. */
    serialize(value: unknown, options?: Readonly<Record<string, unknown>>): string;
    readonly XPath: {
      evaluate(expression: string, contextItem: unknown, options?: XPathOptions): unknown;
    };
  };
  export default SaxonJS;
}

/** Saxon-JS 3, whose API the adapters use the same way. */
declare module 'saxonjs-he' {
  const SaxonJS: typeof import('saxon-js').default;
  export default SaxonJS;
}
