/** Parses every XPath 3.1 test expression in QT3 with exemplar's parser, and reports where it disagrees with the expected result. */
import { parseArgs } from 'node:util';
import { XPathException } from '@exemplarjs/xpath';
import { parseXPath } from '@exemplarjs/xpath/internal';
import { notApplicable } from './applicability.ts';
import { type TestCase, readQt3 } from './catalog.ts';
import { suiteRoot } from './processors.ts';
import type { XmlElement } from './xml-element.ts';

/** The features the parser's grammar covers; the others, such as static typing, change what a test expects. */
const GRAMMAR_CAPABILITIES: ReadonlySet<string> = new Set(['feature:higherOrderFunctions', 'feature:namespace-axis']);

/** What a test may give: a value, or an error with one of these codes (`*` for any). */
interface Expected {
  readonly value: boolean;
  readonly errors: ReadonlySet<string>;
}

/** The outcomes a test's assertion accepts: each branch of an `any-of`, an `error` its code, anything else a value. */
function expectedOutcomes(assertion: XmlElement): Expected {
  const branches = assertion.name === 'any-of' ? assertion.children : [assertion];
  const errorBranches = branches.filter((branch) => branch.name === 'error');
  return {
    value: errorBranches.length < branches.length,
    errors: new Set(errorBranches.map((branch) => branch.attributes.get('code') ?? '*')),
  };
}

/** Whether a test accepts nothing but a syntax error. */
function syntaxErrorOnly(expected: Expected): boolean {
  return !expected.value && expected.errors.size === 1 && expected.errors.has('XPST0003');
}

/** Whether a test is for XPath 3.1, judged by its spec and grammar features alone. */
function forXPath31(test: TestCase): boolean {
  const grammarDependencies = test.dependencies.filter(
    (dependency) => dependency.type === 'spec' || dependency.type === 'feature'
  );
  const environment = { ...test.environment, sources: [] };
  return notApplicable({ ...test, dependencies: grammarDependencies, environment }, GRAMMAR_CAPABILITIES) === undefined;
}

/** The error parsing raises, or undefined when the expression parses. */
function parseError(expression: string): XPathException | undefined {
  try {
    parseXPath(expression);
    return undefined;
  } catch (error) {
    if (error instanceof XPathException) return error;
    throw error;
  }
}

/** Why parsing disagrees with what a test expects, or undefined when it agrees. */
function disagreement(test: TestCase): string | undefined {
  const expected = expectedOutcomes(test.result);
  const raised = parseError(test.expression);
  if (raised === undefined) {
    return syntaxErrorOnly(expected) ? 'parsed, but XPST0003 was expected' : undefined;
  }
  if (expected.errors.has(raised.code) || expected.errors.has('*')) return undefined;
  const accepted = [...(expected.value ? ['a value'] : []), ...expected.errors].join(' or ');
  return `${raised.message}; expected ${accepted}`;
}

const { values } = parseArgs({ options: { 'test-sets': { type: 'string' }, all: { type: 'boolean' } } });
const testSets = values['test-sets'] === undefined ? undefined : new Set(values['test-sets'].split(','));
const tests = readQt3(await suiteRoot(), testSets).filter((test) => forXPath31(test));
const failures = tests.flatMap((test) => {
  const reason = disagreement(test);
  return reason === undefined ? [] : [{ test, reason }];
});
const shown = values.all === true ? failures : failures.slice(0, 50);
for (const { test, reason } of shown) {
  console.log(`${test.testSet} ${test.name}\n  ${test.expression.replaceAll(/\s+/g, ' ').slice(0, 160)}\n  ${reason}`);
}
const syntaxErrors = tests.filter((test) => syntaxErrorOnly(expectedOutcomes(test.result))).length;
console.log(
  `${tests.length - failures.length} of ${tests.length} XPath 3.1 test expressions parse as QT3 expects, ${syntaxErrors} of them syntax errors; ${failures.length} disagree`
);
// Any disagreement fails the run, so CI catches it.
if (failures.length > 0) process.exitCode = 1;
