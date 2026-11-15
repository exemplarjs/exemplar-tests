import { readFileSync } from 'node:fs';
import path from 'node:path';
import { collapseWhitespace } from '@exemplarjs/xml/internal';
import { xmlEqual } from './xml-compare.ts';
import type { XmlElement } from './xml-element.ts';

/** What a test's result must be, as its `result` element says. */
export type Assertion =
  | { readonly kind: 'all-of' | 'any-of'; readonly parts: readonly Assertion[] }
  | { readonly kind: 'not'; readonly part: Assertion }
  /** An error, with its code, or `*` for any code. */
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'xml'; readonly expected: string; readonly ignorePrefixes: boolean }
  | { readonly kind: 'string-value'; readonly expected: string; readonly normalizeSpace: boolean }
  /** An XPath expression over `$result` whose effective boolean value must be true. */
  | { readonly kind: 'check'; readonly expression: string }
  /** An assertion the runner cannot judge through the adapters, such as one about serialization. */
  | { readonly kind: 'unsupported'; readonly name: string };

/** How a test's outcome compares with its assertion; `wrong-error` is an error with another code than expected. */
export type Verdict = 'pass' | 'fail' | 'wrong-error' | 'unsupported';

/** What evaluating a test's expression gave: a value, or an error and its code. */
export type Outcome =
  | { readonly kind: 'value'; readonly value: unknown }
  | { readonly kind: 'error'; readonly code: string | undefined; readonly message: string };

/** What the judge asks of the processor about a value outcome. */
export interface ResultChecks {
  /** The effective boolean value of an expression with `$result` bound to the test's result. */
  check(expression: string): boolean;
  /** The result's items as strings, joined by spaces. */
  stringValue(): string;
  /** The result written as XML. */
  serialized(): string;
}

/** The check expressions for the assertions that compare values, keyed by element name, given the element's text. */
const CHECKS: Readonly<Record<string, (text: string) => string>> = {
  assert: (text) => `(${text})`,
  // `eq` atomizes the result, so a node compares by its typed value, as the catalog defines assert-eq.
  'assert-eq': (text) =>
    `count($result) eq 1 and (let $expected := (${text}) return ($result eq $expected or ($result ne $result and $expected ne $expected)))`,
  'assert-deep-eq': (text) => `deep-equal($result, (${text}))`,
  'assert-permutation': (text) =>
    `let $expected := (${text}) return count($result) eq count($expected) and (every $item in ($result, $expected) satisfies count($result[deep-equal(., $item)]) eq count($expected[deep-equal(., $item)]))`,
  'assert-count': (text) => `count($result) eq ${text.trim()}`,
  'assert-type': (text) => `$result instance of ${text}`,
  'assert-empty': () => 'empty($result)',
  'assert-true': () => '$result instance of xs:boolean and $result',
  'assert-false': () => '$result instance of xs:boolean and not($result)',
};

/** Reads a `result` element's assertion; files it names resolve against the test set's directory. */
export function readAssertion(element: XmlElement, directory: string): Assertion {
  const { name, attributes, text } = element;
  if (name === 'all-of' || name === 'any-of') {
    return { kind: name, parts: element.children.map((child) => readAssertion(child, directory)) };
  }
  if (name === 'not') return { kind: 'not', part: readAssertion(element.children[0] as XmlElement, directory) };
  if (name === 'error') return { kind: 'error', code: (attributes.get('code') ?? '*').replace(/^err:/, '') };
  if (name === 'assert-xml') {
    const file = attributes.get('file');
    // The whitespace around the expected XML lays out the catalog; it is not part of the result.
    const expected = (file === undefined ? text : readFileSync(path.resolve(directory, file), 'utf8')).trim();
    return { kind: 'xml', expected, ignorePrefixes: attributes.get('ignore-prefixes') === 'true' };
  }
  if (name === 'assert-string-value') {
    return { kind: 'string-value', expected: text, normalizeSpace: attributes.get('normalize-space') === 'true' };
  }
  const check = CHECKS[name];
  return check === undefined ? { kind: 'unsupported', name } : { kind: 'check', expression: check(text) };
}

/** Judges an assertion against an error outcome: only an error assertion can pass. */
function judgeError(assertion: Assertion, code: string | undefined): Verdict {
  if (assertion.kind !== 'error') return assertion.kind === 'unsupported' ? 'unsupported' : 'fail';
  return assertion.code === '*' || assertion.code === code ? 'pass' : 'wrong-error';
}

/** Judges an assertion against a value outcome; a check that itself fails to evaluate fails. */
function judgeValue(assertion: Assertion, checks: ResultChecks): Verdict {
  try {
    switch (assertion.kind) {
      case 'error': {
        return 'fail';
      }
      case 'unsupported': {
        return 'unsupported';
      }
      case 'xml': {
        return xmlEqual(checks.serialized(), assertion.expected, assertion.ignorePrefixes) ? 'pass' : 'fail';
      }
      case 'string-value': {
        const actual = checks.stringValue();
        const same = assertion.normalizeSpace
          ? collapseWhitespace(actual) === collapseWhitespace(assertion.expected)
          : actual === assertion.expected;
        return same ? 'pass' : 'fail';
      }
      default: {
        return assertion.kind === 'check' && checks.check(assertion.expression) ? 'pass' : 'fail';
      }
    }
  } catch {
    return 'fail';
  }
}

/** How `any-of` ranks verdicts, best first; `all-of` takes the worst, so ranks them the other way. */
const ANY_OF_RANK: readonly Verdict[] = ['pass', 'wrong-error', 'unsupported', 'fail'];

/** Combines the parts' verdicts, judging them in turn and stopping once the best (`any-of`) or worst (`all-of`) is found. */
function combine(parts: readonly Assertion[], any: boolean, judgePart: (part: Assertion) => Verdict): Verdict {
  const rank = (verdict: Verdict): number => (any ? 1 : -1) * ANY_OF_RANK.indexOf(verdict);
  let combined: Verdict | undefined;
  for (const part of parts) {
    const verdict = judgePart(part);
    if (combined === undefined || rank(verdict) < rank(combined)) combined = verdict;
    if (verdict === (any ? 'pass' : 'fail')) break;
  }
  return combined ?? (any ? 'fail' : 'pass');
}

/** Judges a test's outcome against its assertion. */
export function judge(assertion: Assertion, outcome: Outcome, checks: ResultChecks): Verdict {
  if (assertion.kind === 'all-of' || assertion.kind === 'any-of') {
    return combine(assertion.parts, assertion.kind === 'any-of', (part) => judge(part, outcome, checks));
  }
  if (assertion.kind === 'not') {
    const verdict = judge(assertion.part, outcome, checks);
    if (verdict === 'unsupported') return verdict;
    return verdict === 'pass' ? 'fail' : 'pass';
  }
  return outcome.kind === 'error' ? judgeError(assertion, outcome.code) : judgeValue(assertion, checks);
}
