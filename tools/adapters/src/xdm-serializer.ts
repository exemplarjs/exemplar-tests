import { NodeKind, type XdmItem, type XdmNode, castAs, XS, isAtomicValue, isNode } from '@exemplarjs/xdm';
import { escape } from './canonical.ts';

/** No namespaces, as the top of the output has. */
const NONE: ReadonlyMap<string, string> = new Map();

/** An element's namespaces in scope, by prefix. */
function namespacesOf(element: XdmNode): Map<string, string> {
  return new Map(
    element.namespaceNodes().map((namespace) => [namespace.binding?.prefix ?? '', namespace.binding?.uri ?? ''])
  );
}

/** The namespace declarations an element needs beyond those it inherits. */
function declarations(own: ReadonlyMap<string, string>, inherited: ReadonlyMap<string, string>): string {
  let text = '';
  for (const [prefix, uri] of own) {
    if (prefix === 'xml' || inherited.get(prefix) === uri) continue;
    text += prefix === '' ? ` xmlns="${escape(uri)}"` : ` xmlns:${prefix}="${escape(uri)}"`;
  }
  // A default namespace inherited but not in scope here must be undeclared.
  if (inherited.has('') && !own.has('')) text += ' xmlns=""';
  return text;
}

/** A node as XML, given the namespaces its output inherits. */
function serializeNode(node: XdmNode, inherited: ReadonlyMap<string, string>): string {
  switch (node.kind) {
    case NodeKind.DOCUMENT: {
      return node
        .children()
        .map((child) => serializeNode(child, NONE))
        .join('');
    }
    case NodeKind.ELEMENT: {
      const name = node.nodeName?.toString() ?? '';
      const own = namespacesOf(node);
      const attributes = node
        .attributes()
        .map((attribute) => ` ${attribute.nodeName?.toString() ?? ''}="${escape(attribute.stringValue)}"`);
      const children = node
        .children()
        .map((child) => serializeNode(child, own))
        .join('');
      return `<${name}${declarations(own, inherited)}${attributes.join('')}>${children}</${name}>`;
    }
    case NodeKind.COMMENT: {
      return `<!--${node.stringValue}-->`;
    }
    case NodeKind.PROCESSING_INSTRUCTION: {
      return `<?${node.localName} ${node.stringValue}?>`;
    }
    default: {
      // Text, and attributes and namespace nodes, which cannot be serialized on their own: their values.
      return escape(node.stringValue);
    }
  }
}

/** A sequence as XML, as the QT3 drivers serialize results: nodes as markup, atomic values as text separated by spaces. */
export function serializeXdm(items: readonly XdmItem[]): string {
  let text = '';
  let previousAtomic = false;
  for (const item of items) {
    const atomic = isAtomicValue(item);
    if (!atomic && !isNode(item)) throw new TypeError('Function items, maps and arrays cannot be serialized as XML');
    const separator = atomic && previousAtomic ? ' ' : '';
    text += separator + (atomic ? escape(String(castAs(item, XS.string).value)) : serializeNode(item, NONE));
    previousAtomic = atomic;
  }
  return text;
}
