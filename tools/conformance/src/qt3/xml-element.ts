import { readFileSync } from 'node:fs';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';

/** An element of a QT3 catalog file, read whole: its local name, attributes, child elements and text. */
export interface XmlElement {
  readonly name: string;
  /** Attributes by qualified name, as the catalog writes them. */
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  /** The element's own text, without its children's. */
  readonly text: string;
}

/** An element being read, whose children and text are still arriving. */
interface OpenElement {
  readonly name: string;
  readonly attributes: Map<string, string>;
  readonly children: XmlElement[];
  text: string;
}

const factory = new XMLInputFactory();

/** The reader's current start tag, as an element without children yet. */
function startedElement(reader: ReturnType<XMLInputFactory['createStreamReader']>): OpenElement {
  const attributes = new Map<string, string>();
  for (let i = 0; i < reader.attributeCount(); i++) attributes.set(reader.attributeName(i), reader.attributeValue(i));
  return { name: reader.localName(), attributes, children: [], text: '' };
}

/** Whether an event carries text. */
export function isText(type: EventType): boolean {
  return type === EventType.CHARACTERS || type === EventType.CDATA || type === EventType.SPACE;
}

/** Reads an XML file into a tree of elements; comments and processing instructions are left out. */
export function readXmlElement(file: string): XmlElement {
  const reader = factory.createStreamReader(readFileSync(file));
  const open: OpenElement[] = [];
  let root: XmlElement | undefined;
  for (let type = reader.next(); type !== EventType.END_DOCUMENT; type = reader.next()) {
    if (type === EventType.START_ELEMENT) {
      open.push(startedElement(reader));
    } else if (type === EventType.END_ELEMENT) {
      const element = open.pop() as OpenElement;
      const parent = open.at(-1);
      if (parent === undefined) root = element;
      else parent.children.push(element);
    } else if (isText(type) && open.length > 0) {
      (open.at(-1) as OpenElement).text += reader.text();
    }
  }
  if (root === undefined) throw new Error(`${file} has no document element`);
  return root;
}

/** An attribute's value, `''` when the element lacks it. */
export function attribute(element: XmlElement, name: string): string {
  return element.attributes.get(name) ?? '';
}

/** The first child element of a name, if any. */
export function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => child.name === name);
}

/** Every child element of a name. */
export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}
