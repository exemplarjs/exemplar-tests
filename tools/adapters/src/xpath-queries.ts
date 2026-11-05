import path from 'node:path';

/** Queries over any document: names, attributes, text and structure, with wildcard namespaces so that any vocabulary fits. */
const GENERAL_QUERIES: readonly string[] = [
  'count(//*)',
  '//*[@id]/@id',
  '//*:title/string()',
  "//*:para[contains(., 'the')]",
  'distinct-values(//*/local-name())',
  'sum(//text()/string-length(.))',
  '//*[count(*) > 5]',
  '(//*:section)[last()]',
  '//*:section/*[1]',
  '//*[ancestor::*[3]]',
  'for $element in //*[@*] return count($element/@*)',
];

/** The XMark benchmark's queries that XPath 3.1 can state, without element constructors; the joins are cut to 200 people. */
const XMARK_QUERIES: readonly string[] = [
  "/site/people/person[@id = 'person0']/name/text()",
  'for $auction in /site/open_auctions/open_auction return $auction/bidder[1]/increase/text()',
  '/site/open_auctions/open_auction[bidder[1]/increase * 2 <= bidder[last()]/increase]/(bidder[1]/increase, bidder[last()]/increase)',
  'count(/site/closed_auctions/closed_auction[price >= 40]/price)',
  'for $region in /site/regions/* return count($region//item)',
  'count(/site//description) + count(/site//annotation) + count(/site//emailaddress)',
  'let $closed := /site/closed_auctions/closed_auction return for $person in /site/people/person[position() <= 200] return count($closed[buyer/@person = $person/@id])',
  "/site//item[contains(string(description), 'gold')]/name/text()",
  '/site/closed_auctions/closed_auction/annotation/description/parlist/listitem/parlist/listitem/text/emph/keyword/text()',
  '/site/closed_auctions/closed_auction[annotation/description/parlist/listitem/parlist/listitem/text/emph/keyword/text()]/seller/@person',
  '/site/people/person[empty(homepage/text())]/name/text()',
  '/site/open_auctions/open_auction/reserve/text() ! (2.20371 * .)',
  'sort(/site/regions//item, (), function($item) { zero-or-one($item/location) }) ! name/text()',
  'let $incomes := /site/people/person/profile/@income return (count($incomes[. >= 100000]), count($incomes[. < 100000 and . >= 30000]), count($incomes[. < 30000]), count(/site/people/person[empty(profile/@income)]))',
];

/**
 * The tree walks the `axes` workload times one by one on XMark, each with what it walks: every axis,
 * positions after `//` and on steps, predicates, unions and string values, then the operations that
 * read only part of a path (existence, first items, counts, quantifiers). A walk gives its nodes,
 * which the workload counts itself, so that no processor can count them without visiting them; one
 * marked `value` gives a number, and one marked `truth` a boolean, counted as 1 or 0.
 */
export const AXIS_QUERIES: readonly (readonly [axis: string, query: string, gives?: 'value' | 'truth'])[] = [
  ['child', '/site/people/person'],
  ['child', '/site/*/*/*'],
  ['child', '//person/*'],
  ['descendant', '//bidder'],
  ['descendant', '//*'],
  ['descendant', '//text()'],
  ['descendant', '//node()'],
  ['descendant', '/site/descendant::keyword'],
  ['descendant', '//open_auction//bidder'],
  ['descendant-or-self', '//item/descendant-or-self::*'],
  ['position after //', '//bidder[1]'],
  ['position after //', '//bidder[last()]'],
  ['position after //', '//bidder[position() > 2]'],
  ['position after //', '//bidder[2]'],
  ['position after //', '//bidder[position() = last() - 1]'],
  ['position after //', '//*[1]'],
  ['position on a step', '//open_auction/bidder[1]'],
  ['position on a step', '//open_auction/bidder[last()]'],
  ['position of a path', '(//bidder)[1] | (//bidder)[last()]'],
  ['attribute', '//@*'],
  ['attribute', '//person/@id'],
  ['attribute', '//*[@id]'],
  ['attribute', '//bidder/personref/@person'],
  ['parent', '//bidder/..'],
  ['parent', '//keyword/parent::*'],
  ['ancestor', '//keyword/ancestor::*'],
  ['ancestor', '//keyword/ancestor::item'],
  ['ancestor-or-self', '//keyword/ancestor-or-self::*'],
  ['ancestor in a predicate', '//*[ancestor::*[3]]'],
  ['following-sibling', '//bidder/following-sibling::bidder'],
  ['following-sibling', '//bidder/following-sibling::*[1]'],
  ['preceding-sibling', '//bidder/preceding-sibling::*'],
  ['preceding-sibling', '//bidder/preceding-sibling::bidder[1]'],
  ['following', '/site/regions/following::*'],
  ['following', '(//person)[1]/following::*'],
  ['preceding', '(//closed_auction)[last()]/preceding::*'],
  ['preceding', '//closed_auction[1]/preceding::keyword'],
  ['self', '//*/self::bidder'],
  ['namespace', '//person/namespace::*'],
  ['predicate', '//person[profile/@income > 50000]'],
  ['predicate', '//*[count(*) > 5]'],
  ['predicate', "//item[location = 'United States']"],
  ['union', '//bidder | //person'],
  ['union', '(//bidder, //person)/..'],
  ['string value', 'sum(//closed_auction/price)', 'value'],
  ['string value', "string-length(string-join(//person/name, ' '))", 'value'],
  ['existence', 'exists(//keyword)', 'truth'],
  ['existence', 'empty(//person[profile/@income > 1000000])', 'truth'],
  ['existence', "boolean(//item[location = 'United States'])", 'truth'],
  ['existence', 'not(//closed_auction[price > 1000000])', 'truth'],
  ['first items', 'head(//bidder)'],
  ['first items', '(//item[quantity > 1])[1]'],
  ['first items', '(//keyword)[3]'],
  ['first items', 'exactly-one(/site/regions)'],
  ['count of a path', 'count(//open_auction/bidder)', 'value'],
  ['count of a path', 'count(//keyword/ancestor::*)', 'value'],
  ['count of a path', 'count(//person//@*)', 'value'],
  ['quantifier', "some $person in //person satisfies $person/@id = 'person0'", 'truth'],
  ['quantifier', 'every $bidder in //bidder satisfies $bidder/increase', 'truth'],
  ['position after //', '//keyword[2]'],
  ['position after //', '//*:keyword[1]'],
  ['predicate', '//person[homepage]'],
  ['attribute', "//@id[starts-with(., 'person1')]"],
  [
    'long path',
    '/site/closed_auctions/closed_auction/annotation/description/parlist/listitem/parlist/listitem/text/emph/keyword',
  ],
];

/** The queries the `xpath` workload runs over a document, chosen by the dataset folder it sits in. */
export function queriesFor(file: string): readonly string[] {
  return file.split(path.sep).includes('xmark') ? XMARK_QUERIES : GENERAL_QUERIES;
}
