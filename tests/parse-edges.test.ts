import { describe, expect, it } from 'vitest';
import { decodeEntities, parseAppointments, parseCards, pageText } from '../src/parse.js';


/**
 * The malformed-page paths. A Client Hub page is reverse-engineered HTML with
 * no contract behind it, so every one of these is a shape the page really can
 * take — and the parser's job is to degrade to "nothing here" rather than
 * throw a stack trace into the transcript.
 */

const props = (json: string) => `<div data-props="${json.replace(/"/g, '&quot;')}"></div>`;

describe('islandProps — payloads that are not ours', () => {
  it('skips an island with an empty data-props', () => {
    expect(parseAppointments('<div data-props=""></div>')).toEqual([]);
  });

  it('skips a payload that parses to null', () => {
    expect(parseAppointments(props('null'))).toEqual([]);
  });

  it('skips a payload that parses to a bare scalar', () => {
    // Valid JSON, not an object: `JSON.parse` succeeds, so only the typeof
    // guard stops it being treated as an island.
    expect(parseAppointments(props('42'))).toEqual([]);
  });

  it('skips a payload that is not JSON at all', () => {
    expect(parseAppointments('<div data-props="{not json"></div>')).toEqual([]);
  });
});

describe('parseAppointments — partial groups', () => {
  it('reports a null title when the group has none', () => {
    const html = props('{"appointments":[{"date":"Jun 28, 2026","url":"/client_hubs/U/appointments/1"}]}');
    expect(parseAppointments(html)).toEqual([
      expect.objectContaining({ group: null, date: 'Jun 28, 2026' }),
    ]);
  });

  it('reports a null title when the title is present but not a string', () => {
    const html = props('{"title":7,"appointments":[{"date":"Jun 28, 2026"}]}');
    expect(parseAppointments(html)[0]).toMatchObject({ group: null });
  });
});

describe('parseCards — cards the page renders incompletely', () => {
  it('treats a heading that strips to nothing as no section at all', () => {
    // An icon-only <h3> is a real shape; carrying '' as the section would then
    // label every card below it with an empty string.
    const html =
      '<h3><svg><path d="M0"/></svg></h3>' +
      '<a class="card-content--link" href="/client_hubs/U/invoices/1">' +
      '<h4 class="card-headerTitle">Roof</h4></a>';
    expect(parseCards(html)[0]).toMatchObject({ section: null, id: '1' });
  });

  it('keeps a card that has no href, with a null id', () => {
    const html = '<a class="card-content--link"><h4 class="card-headerTitle">Draft</h4></a>';
    expect(parseCards(html)[0]).toMatchObject({ id: null, url: null });
  });

  it('keeps an empty card rather than dropping it', () => {
    const html = '<a class="card-content--link" href="/client_hubs/U/quotes/9"></a>';
    expect(parseCards(html)[0]).toMatchObject({
      id: '9',
      title: null,
      number: null,
      details: [],
    });
  });

  it('drops icon-only .columns cells instead of emitting blanks', () => {
    const html =
      '<a class="card-content--link" href="/client_hubs/U/invoices/5">' +
      '<div class="shrink columns"><svg></svg></div>' +
      '<div class="columns">Due Apr 07, 2026</div></a>';
    expect(parseCards(html)[0]?.details).toEqual(['Due Apr 07, 2026']);
  });

  it('reports a null title when the title element strips to empty', () => {
    const html =
      '<a class="card-content--link" href="/client_hubs/U/invoices/6">' +
      '<h4 class="card-headerTitle"><svg></svg></h4></a>';
    expect(parseCards(html)[0]).toMatchObject({ title: null });
  });
});

describe('pageText', () => {
  it('falls back to the whole document when there is no body tag', () => {
    // Fragments come back from partial/XHR renders, which have no <body>.
    expect(pageText('<h1>Invoice 15313</h1><p>Due soon</p>')).toContain('Invoice 15313');
  });
});

describe('decodeEntities — provider text beyond the basic five', () => {
  it('decodes decimal and hex numeric references', () => {
    expect(decodeEntities('Don&#8217;t pay &#36;120.00 &#x2014; or &#X41;')).toBe(
      'Don\u2019t pay $120.00 \u2014 or A',
    );
  });

  it('decodes the common typographic named entities', () => {
    expect(
      decodeEntities('&mdash;&ndash;&hellip;&rsquo;&lsquo;&rdquo;&ldquo;&apos;&copy;&reg;&trade;&bull;&middot;&deg;'),
    ).toBe('\u2014\u2013\u2026\u2019\u2018\u201d\u201c\'\u00a9\u00ae\u2122\u2022\u00b7\u00b0');
  });

  it('decodes once: an escaped entity stays an entity', () => {
    expect(decodeEntities('&amp;#36; &amp;mdash; &amp;amp;')).toBe('&#36; &mdash; &amp;');
  });

  it('leaves unknown names and out-of-range code points alone', () => {
    expect(decodeEntities('&bogus; &constructor; &toString; &#0; &#x110000; &#99999999999;')).toBe(
      '&bogus; &constructor; &toString; &#0; &#x110000; &#99999999999;',
    );
  });
});
