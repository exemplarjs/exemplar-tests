import { describe, expect, it } from 'vitest';
import { type ResultChecks, judge, readAssertion } from '../src/qt3/assertions.ts';

/** Checks that give a serialized result and nothing else. */
function serializedAs(xml: string): ResultChecks {
  return { check: () => false, stringValue: () => '', serialized: () => xml };
}

/** An `assert-xml` element holding XML as the catalog writes it. */
function assertXml(text: string) {
  return readAssertion({ name: 'assert-xml', attributes: new Map(), children: [], text }, '.');
}

describe('assert-xml', () => {
  it('ignores the whitespace that lays out the expected XML in the catalog', () => {
    const assertion = assertXml('<string \n   xmlns="urn:x">oh dear</string>\n         ');
    expect(
      judge(assertion, { kind: 'value', value: undefined }, serializedAs('<string xmlns="urn:x">oh dear</string>'))
    ).toBe('pass');
  });

  it('still fails a result with whitespace the expected XML does not have', () => {
    const assertion = assertXml('<a>b</a>');
    expect(judge(assertion, { kind: 'value', value: undefined }, serializedAs('<a>b</a> '))).toBe('fail');
    expect(judge(assertion, { kind: 'value', value: undefined }, serializedAs('<a> b</a>'))).toBe('fail');
  });
});
