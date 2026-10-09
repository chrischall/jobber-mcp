import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAppointments, parseCards } from '../src/parse.js';
import { APPOINTMENTS_HTML, INVOICES_HTML } from './fixtures/pages.js';

/**
 * The fpx skill ships its own dependency-free copy of the hub parser
 * (`skills/jobber-fpx/references/parse-clienthub.mjs`). The same page must
 * read the same way through the MCP and through the skill, so the script is
 * run as the skill runs it — HTML on stdin, JSON on stdout — and its output is
 * held to the TypeScript parser's.
 */

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'skills',
  'jobber-fpx',
  'references',
  'parse-clienthub.mjs',
);

function runSkill(kind: string, html: string): unknown {
  const out = execFileSync(process.execPath, [SCRIPT, kind], {
    input: html,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

/** Islands that exercise the fields where the two parsers used to disagree. */
const EDGE_APPOINTMENTS_HTML =
  '<html><body><div data-props="' +
  JSON.stringify({
    title: 'Upcoming',
    appointments: [
      // canViewTime absent: the provider did not hide the time.
      { date: 'Jul 1, 2026', time: '8:00am', url: '/client_hubs/UUID/appointments/1' },
      // Empty strings and a non-boolean `confirmed`.
      {
        date: '',
        weekday: '',
        time: '',
        location: '',
        confirmed: 'yes',
        canViewTime: true,
        url: 'https://clienthub.getjobber.com/client_hubs/UUID/appointments/2',
      },
      { canViewTime: false, time: '9:00am', confirmed: false },
    ],
  }).replace(/"/g, '&quot;') +
  '"></div></body></html>';

describe('skill parser parity with src/parse.ts', () => {
  it('reads the appointments fixture identically', () => {
    expect(runSkill('appointments', APPOINTMENTS_HTML)).toEqual(parseAppointments(APPOINTMENTS_HTML));
  });

  it('reads appointment edge cases identically', () => {
    expect(runSkill('appointments', EDGE_APPOINTMENTS_HTML)).toEqual(
      parseAppointments(EDGE_APPOINTMENTS_HTML),
    );
  });

  it('reads the card fixture identically', () => {
    for (const kind of ['invoices', 'quotes', 'work_requests']) {
      expect(runSkill(kind, INVOICES_HTML)).toEqual(parseCards(INVOICES_HTML));
    }
  });

  it('decodes provider-authored entities identically', () => {
    const html =
      '<h3>Awaiting&nbsp;response</h3><a class="card-content card-content--link" href="/client_hubs/UUID/quotes/9">' +
      '<h4 class="card-headerTitle">Don&#8217;t forget &mdash; spring&#x2019;s visit</h4>' +
      '<div class="columns">&#36;120.00 &amp;#36; &hellip; &bogus;</div></a>';
    const ts = parseCards(html);
    expect(ts[0]?.title).toBe('Don\u2019t forget \u2014 spring\u2019s visit');
    expect(runSkill('quotes', html)).toEqual(ts);
  });

  it('never prints the hub id in a record url', () => {
    // The hub UUID is a bearer credential; the TS parser rewrites links to
    // hub-relative paths, and the skill must too.
    const out = JSON.stringify([
      runSkill('appointments', APPOINTMENTS_HTML),
      runSkill('invoices', INVOICES_HTML),
    ]);
    expect(out).not.toContain('client_hubs');
  });
});
