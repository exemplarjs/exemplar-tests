/** The parts of XPath that test sets cover, so that a processor can be measured on the parts it has. */

/** Test sets of features that come after the core language: maps, arrays, function items, lookups. */
const LATER_PRODUCTIONS = new Set([
  'prod-ArrayTest',
  'prod-ArrowPostfix',
  'prod-CurlyArrayConstructor',
  'prod-InlineFunctionExpr',
  'prod-Lookup',
  'prod-MapConstructor',
  'prod-MapTest',
  'prod-NamedFunctionRef',
  'prod-SquareArrayConstructor',
  'prod-UnaryLookup',
]);

/** Words in the names of test sets about dates, times and durations. */
const DATE_TIME = /date|time|duration|year|month|day|hours|minutes|seconds|timezone|gDay|gMonth|gYear/i;

/** Functions that come after the core: regular expressions, formatting, collations, higher-order functions, JSON and documents. */
const LATER_FUNCTIONS = new Set([
  'analyze-string',
  'apply',
  'available-environment-variables',
  'collation-key',
  'collection',
  'doc',
  'doc-available',
  'environment-variable',
  'filter',
  'fold-left',
  'fold-right',
  'for-each',
  'for-each-pair',
  'format-integer',
  'format-number',
  'function-arity',
  'function-lookup',
  'function-name',
  'json-doc',
  'json-to-xml',
  'load-xquery-module',
  'matches',
  'matches.re',
  'parse-json',
  'parse-xml',
  'parse-xml-fragment',
  'random-number-generator',
  'replace',
  'serialize',
  'sort',
  'tokenize',
  'transform',
  'unparsed-text',
  'unparsed-text-available',
  'unparsed-text-lines',
  'uri-collection',
  'xml-to-json',
]);

/** Whether a test set covers the core language and functions: expressions, operators and the functions on nodes, strings, numbers and sequences. */
function isCore(testSet: string): boolean {
  if (testSet.startsWith('prod-')) return !LATER_PRODUCTIONS.has(testSet);
  if (testSet.startsWith('op-')) return !DATE_TIME.test(testSet) && testSet !== 'op-same-key';
  if (testSet.startsWith('fn-')) return !DATE_TIME.test(testSet) && !LATER_FUNCTIONS.has(testSet.slice(3));
  if (testSet.startsWith('xs-')) return testSet !== 'xs-dateTimeStamp';
  return testSet.startsWith('math-');
}

/** The scopes a run can be limited to, by name. */
export const SCOPES: Readonly<Record<string, (testSet: string) => boolean>> = {
  core: isCore,
};
