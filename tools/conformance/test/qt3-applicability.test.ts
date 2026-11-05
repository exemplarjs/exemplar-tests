import { describe, expect, it } from 'vitest';
import { READS_RESOURCES } from '@exemplarjs/adapters';
import { cannotRun } from '../src/qt3/applicability.ts';
import { EMPTY_ENVIRONMENT, type EnvironmentSpec, type TestCase } from '../src/qt3/catalog.ts';

/** A test with an environment and an expression, the rest left empty. */
function testWith(environment: Partial<EnvironmentSpec>, expression = '1'): TestCase {
  return {
    name: 't',
    testSet: 's',
    dependencies: [],
    environment: { ...EMPTY_ENVIRONMENT, ...environment },
    expression,
    result: { name: 'assert-true', attributes: new Map(), children: [], text: '' },
    testSetURI: 'file:///suite/fn/s.xml',
  };
}

describe('cannotRun', () => {
  const plain = new Set<string>();
  const reading = new Set([READS_RESOURCES]);

  it('runs a test that reads resources and collections only with an adapter that reads them', () => {
    const declares = testWith({ otherDeclarations: ['resource', 'collection'] });
    expect(cannotRun(declares, plain)).toBe('environment declares resource, collection');
    expect(cannotRun(declares, reading)).toBeUndefined();
  });

  it('runs a test that reads a document by URI only with an adapter that reads them', () => {
    const byURI = testWith({ sources: [{ file: '/suite/a.xml', uri: 'a.xml', role: '.' }] }, 'doc("a.xml")');
    expect(cannotRun(byURI, plain)).toBe('reads a document by URI');
    expect(cannotRun(byURI, reading)).toBeUndefined();
  });

  it('runs no test whose environment declares what no adapter sets up, such as a decimal format', () => {
    const formats = testWith({ otherDeclarations: ['decimal-format', 'resource'] });
    expect(cannotRun(formats, reading)).toBe('environment declares decimal-format');
  });
});
