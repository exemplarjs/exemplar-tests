import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { isText } from './xml-element.ts';

/** The element an XML fragment is wrapped in so that it parses as a document. */
const WRAPPER = 'qt3-fragment';

const factory = new XMLInputFactory({ coalescing: true });

/** A name as the comparison writes it: `{uri}local`, with the prefix too unless prefixes are ignored. */
function nameOf(uri: string, local: string, prefix: string, ignorePrefixes: boolean): string {
  return ignorePrefixes || prefix === '' ? `{${uri}}${local}` : `{${uri}}${prefix}:${local}`;
}

/**
 * An XML fragment in a form two equal fragments share: attributes sorted, namespace declarations
 * left out, adjacent text joined; undefined when it is not well-formed.
 */
function comparableXml(fragment: string, ignorePrefixes: boolean): string | undefined {
  const parts: string[] = [];
  try {
    const reader = factory.createStreamReader(`<${WRAPPER}>${fragment}</${WRAPPER}>`);
    for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
      if (type === EventType.START_ELEMENT) {
        const attributes: string[] = [];
        for (let i = 0; i < reader.attributeCount(); i++) {
          const name = nameOf(
            reader.attributeNamespace(i),
            reader.attributeLocalName(i),
            reader.attributePrefix(i),
            ignorePrefixes
          );
          attributes.push(`${name}=${JSON.stringify(reader.attributeValue(i))}`);
        }
        parts.push(
          `<${nameOf(reader.namespaceURI(), reader.localName(), reader.prefix(), ignorePrefixes)} ${attributes.toSorted().join(' ')}>`
        );
      } else if (type === EventType.END_ELEMENT) {
        parts.push('</>');
      } else if (isText(type)) {
        parts.push(`"${JSON.stringify(reader.text())}"`);
      } else if (type === EventType.COMMENT) {
        parts.push(`<!--${JSON.stringify(reader.text())}-->`);
      } else if (type === EventType.PROCESSING_INSTRUCTION) {
        parts.push(`<?${reader.piTarget()} ${JSON.stringify(reader.piData())}?>`);
      }
    }
  } catch {
    return undefined;
  }
  return parts.join('');
}

/** Whether two XML fragments are equal as `assert-xml` compares them. */
export function xmlEqual(actual: string, expected: string, ignorePrefixes: boolean): boolean {
  const comparable = comparableXml(actual, ignorePrefixes);
  return comparable !== undefined && comparable === comparableXml(expected, ignorePrefixes);
}
