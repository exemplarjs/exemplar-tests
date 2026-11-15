import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CollectionResource, TextResource } from '@exemplarjs/adapters';
import { type XmlElement, attribute, childNamed, childrenNamed, readXmlElement } from './xml-element.ts';

/** A requirement a test or test set places on the processor, as a `dependency` element states it. */
export interface Dependency {
  readonly type: string;
  readonly value: string;
  /** False when the test applies only to processors that do not meet the requirement. */
  readonly satisfied: boolean;
}

/** A document an environment supplies: as the context item (`.`), as a variable (`$name`), or by URI. */
export interface SourceSpec {
  readonly role?: string;
  readonly file: string;
  readonly uri?: string;
  /** `strict` or `lax` when the document must be schema-validated. */
  readonly validation?: string;
}

/** A text resource an environment supplies by URI, for `unparsed-text` and `json-doc`, with the encoding it declares. */
export interface ResourceSpec extends TextResource {
  readonly uri: string;
}

/** A collection an environment supplies by URI, `''` for the default: its documents' files, or the query giving its items. */
export interface CollectionSpec extends CollectionResource {
  readonly uri: string;
}

/** A variable an environment declares, with the expression that gives its value. */
export interface ParamSpec {
  readonly name: string;
  readonly select?: string;
}

/** The static and dynamic context a test runs in. */
export interface EnvironmentSpec {
  readonly sources: readonly SourceSpec[];
  readonly params: readonly ParamSpec[];
  readonly resources: readonly ResourceSpec[];
  readonly collections: readonly CollectionSpec[];
  readonly namespaces: Readonly<Record<string, string>>;
  /** The static base URI it sets; null when it makes the base URI absent. */
  readonly staticBaseURI?: string | null;
  /** What it declares beyond sources, parameters, namespaces and a base URI, by element name, such as `decimal-format`. */
  readonly otherDeclarations: readonly string[];
}

/** One test case of a test set. */
export interface TestCase {
  readonly name: string;
  readonly testSet: string;
  /** The test set's dependencies, then the test case's own. */
  readonly dependencies: readonly Dependency[];
  readonly environment: EnvironmentSpec;
  readonly expression: string;
  /** The `result` element's assertion. */
  readonly result: XmlElement;
  /** The test set file's URI, the default static base URI. */
  readonly testSetURI: string;
}

/** The environment of a test that names none: no context item, nothing declared. */
export const EMPTY_ENVIRONMENT: EnvironmentSpec = {
  sources: [],
  params: [],
  resources: [],
  collections: [],
  namespaces: {},
  otherDeclarations: [],
};

/** The declarations the runner sets up only for processors that read resources: resources and collections. */
export const RESOURCE_DECLARATIONS: ReadonlySet<string> = new Set(['resource', 'collection']);

/** The child elements an environment may have that the runner handles itself. */
const HANDLED = new Set(['source', 'param', 'namespace', 'static-base-uri', 'description', 'created', 'modified']);

/** The attributes of an element that it has, of those named. */
function present<Name extends string>(element: XmlElement, ...names: Name[]): Partial<Record<Name, string>> {
  const found: Partial<Record<Name, string>> = {};
  for (const name of names) if (element.attributes.has(name)) found[name] = element.attributes.get(name);
  return found;
}

/** Reads an environment element; its files resolve against the directory of the file it sits in. */
function readEnvironment(element: XmlElement, directory: string): EnvironmentSpec {
  const fileOf = (child: XmlElement) => path.resolve(directory, attribute(child, 'file'));
  const sources = childrenNamed(element, 'source').map((source): SourceSpec => ({
    file: fileOf(source),
    ...present(source, 'role', 'uri', 'validation'),
  }));
  const params = childrenNamed(element, 'param').map((param): ParamSpec => ({
    name: attribute(param, 'name'),
    ...present(param, 'select'),
  }));
  const resources = childrenNamed(element, 'resource').map((resource): ResourceSpec => ({
    file: fileOf(resource),
    uri: attribute(resource, 'uri'),
    ...present(resource, 'encoding'),
  }));
  const collections = childrenNamed(element, 'collection').map((collection): CollectionSpec => {
    const query = childNamed(collection, 'query')?.text;
    return {
      uri: attribute(collection, 'uri'),
      files: childrenNamed(collection, 'source').map((source) => fileOf(source)),
      ...(query !== undefined && { query }),
    };
  });
  const namespaces = Object.fromEntries(
    childrenNamed(element, 'namespace').map((namespace) => [
      attribute(namespace, 'prefix'),
      attribute(namespace, 'uri'),
    ])
  );
  const baseURI = childNamed(element, 'static-base-uri')?.attributes.get('uri');
  return {
    sources,
    params,
    resources,
    collections,
    namespaces,
    ...(baseURI !== undefined && { staticBaseURI: baseURI === '#UNDEFINED' ? null : baseURI }),
    otherDeclarations: [...new Set(element.children.map((child) => child.name).filter((child) => !HANDLED.has(child)))],
  };
}

/** The dependencies an element states. */
function readDependencies(element: XmlElement): Dependency[] {
  return childrenNamed(element, 'dependency').map((dependency) => ({
    type: attribute(dependency, 'type'),
    value: attribute(dependency, 'value'),
    satisfied: dependency.attributes.get('satisfied') !== 'false',
  }));
}

/** Environments by name. */
type Environments = ReadonlyMap<string, EnvironmentSpec>;

/** Reads every named environment an element declares. */
function namedEnvironments(element: XmlElement, directory: string): Map<string, EnvironmentSpec> {
  const environments = new Map<string, EnvironmentSpec>();
  for (const environment of childrenNamed(element, 'environment')) {
    const name = environment.attributes.get('name');
    if (name !== undefined) environments.set(name, readEnvironment(environment, directory));
  }
  return environments;
}

/** A test case's environment: one it refers to by name, in its test set or the catalog, or one it declares inline. */
function caseEnvironment(
  testCase: XmlElement,
  directory: string,
  local: Environments,
  global: Environments
): EnvironmentSpec {
  const element = childNamed(testCase, 'environment');
  if (element === undefined) return EMPTY_ENVIRONMENT;
  const reference = element.attributes.get('ref');
  if (reference === undefined) return readEnvironment(element, directory);
  const found = local.get(reference) ?? global.get(reference);
  if (found === undefined) throw new Error(`Environment ${reference} is not declared`);
  return found;
}

/** A test case's expression: the `test` element's text, or the file it names. */
function expressionOf(testCase: XmlElement, directory: string): string {
  const test = childNamed(testCase, 'test');
  const file = test?.attributes.get('file');
  return file === undefined ? (test?.text ?? '') : readFileSync(path.resolve(directory, file), 'utf8');
}

/** Reads one test set file's test cases. */
function readTestSet(file: string, global: Environments): TestCase[] {
  const directory = path.dirname(file);
  const set = readXmlElement(file);
  const testSet = set.attributes.get('name') ?? path.basename(file, '.xml');
  const setDependencies = readDependencies(set);
  const local = namedEnvironments(set, directory);
  const testSetURI = pathToFileURL(file).href;
  return childrenNamed(set, 'test-case').map((testCase) => ({
    name: attribute(testCase, 'name'),
    testSet,
    dependencies: [...setDependencies, ...readDependencies(testCase)],
    environment: caseEnvironment(testCase, directory, local, global),
    expression: expressionOf(testCase, directory),
    result: childNamed(testCase, 'result')?.children[0] ?? {
      name: 'missing',
      attributes: new Map(),
      children: [],
      text: '',
    },
    testSetURI,
  }));
}

/** Reads every test case of the suite unpacked at `root`, the folder holding `catalog.xml`, in catalog order. */
export function readQt3(root: string, testSets?: ReadonlySet<string>): TestCase[] {
  const catalog = readXmlElement(path.join(root, 'catalog.xml'));
  const global = namedEnvironments(catalog, root);
  return childrenNamed(catalog, 'test-set')
    .filter((set) => testSets === undefined || testSets.has(attribute(set, 'name')))
    .flatMap((set) => readTestSet(path.join(root, attribute(set, 'file')), global));
}

/** The names of the suite's test sets, in catalog order. */
export function testSetNames(root: string): string[] {
  const catalog = readXmlElement(path.join(root, 'catalog.xml'));
  return childrenNamed(catalog, 'test-set').map((set) => attribute(set, 'name'));
}
