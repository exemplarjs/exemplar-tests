import { READS_RESOURCES } from '@exemplarjs/adapters';
import { type Dependency, type EnvironmentSpec, RESOURCE_DECLARATIONS, type TestCase } from './catalog.ts';

/** The XPath version the runner tests, as QT3 spec dependencies number it. */
const XPATH_VERSION = 31;

/** Whether one token of a spec dependency, such as `XP30+` or `XQ31`, includes XPath 3.1. */
function includesXPath31(token: string): boolean {
  const match = /^XP(\d\d)(\+?)$/.exec(token);
  if (match === null) return false;
  const version = Number(match[1]);
  return match[2] === '+' ? version <= XPATH_VERSION : version === XPATH_VERSION;
}

/** Whether a processor with these capabilities meets one dependency, before `satisfied` is applied. */
function meets(dependency: Dependency, capabilities: ReadonlySet<string>): boolean {
  const tokens = dependency.value.split(/\s+/);
  if (dependency.type === 'spec') return tokens.some((token) => includesXPath31(token));
  // Every runtime the libraries run on has a later Unicode than any version QT3 names.
  if (dependency.type === 'unicode-version') return true;
  return tokens.some((token) => capabilities.has(`${dependency.type}:${token}`));
}

/**
 * Why a test does not apply to an XPath 3.1 processor with these capabilities, or undefined
 * when it applies: an XQuery-only test, or a feature, language or version the processor lacks.
 */
export function notApplicable(test: TestCase, capabilities: ReadonlySet<string>): string | undefined {
  for (const dependency of test.dependencies) {
    if (meets(dependency, capabilities) === dependency.satisfied) continue;
    if (dependency.type === 'spec')
      return dependency.satisfied ? 'XQuery or another XPath version only' : 'not for XPath 3.1';
    return `${dependency.satisfied ? 'needs' : 'excludes'} ${dependency.type} ${dependency.value}`;
  }
  return schemaValidated(test.environment) ? 'needs schema validation' : undefined;
}

/** Whether an environment's documents must be schema-validated, which needs a schema-aware processor. */
function schemaValidated(environment: EnvironmentSpec): boolean {
  return environment.sources.some((source) => source.validation === 'strict' || source.validation === 'lax');
}

/**
 * Why the runner cannot set up a test's environment through an XPath adapter, or undefined when it
 * can: declarations such as decimal formats, or, for an adapter that does not read resources,
 * resources, collections and documents the test reads by URI.
 */
export function cannotRun(test: TestCase, capabilities: ReadonlySet<string>): string | undefined {
  const environment = test.environment;
  const readsResources = capabilities.has(READS_RESOURCES);
  const declared = environment.otherDeclarations.filter((name) => !readsResources || !RESOURCE_DECLARATIONS.has(name));
  if (declared.length > 0) return `environment declares ${declared.join(', ')}`;
  if (readsResources) return undefined;
  // The test's own text and its parameters' expressions are where a URI it reads would be written.
  const texts = [test.expression, ...environment.params.map((param) => param.select ?? '')];
  const byURI = environment.sources.some(
    (source) =>
      source.role === undefined ||
      (source.uri !== undefined && texts.some((text) => text.includes(source.uri as string)))
  );
  return byURI ? 'reads a document by URI' : undefined;
}
