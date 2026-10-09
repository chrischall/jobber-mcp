import { describe, expect, it } from 'vitest';
import {
  hubRelativePath,
  idFromUrl,
  looksChallenged,
  pageText,
  parseAppointments,
  parseCards,
  stripTags,
} from '../src/parse.js';
import { APPOINTMENTS_HTML, INVOICES_HTML, REFERRAL_ISLAND } from './fixtures/pages.js';

describe('parseAppointments', () => {
  it('reads every island that carries appointments', () => {
    const out = parseAppointments(APPOINTMENTS_HTML);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      group: 'Upcoming',
      id: '2236612358',
      date: 'Jun 28, 2026',
      weekday: 'Sunday',
      time: '9:00am',
      location: '123 Elm St',
      url: 'appointments/2236612358',
    });
  });

  it('ignores the referral island rather than reporting it as a record', () => {
    // The decoy alone must yield nothing — this is the false-green from recon.
    expect(parseAppointments(`<html><body>${REFERRAL_ISLAND}</body></html>`)).toEqual([]);
  });

  it('suppresses the time when the provider hides it', () => {
    // canViewTime:false — the payload still carries a `time`, but showing it
    // would state an appointment time the provider deliberately withheld.
    const past = parseAppointments(APPOINTMENTS_HTML).find((a) => a.group === 'Past');
    expect(past?.time).toBeNull();
    expect(past?.date).toBe('Mar 23, 2026');
    expect(past?.confirmed).toBe(true);
  });

  it('returns nothing for a card page instead of parsing its decoy', () => {
    expect(parseAppointments(INVOICES_HTML)).toEqual([]);
  });
});

describe('hubRelativePath', () => {
  // The hub UUID in an href is a bearer credential, so record urls are
  // rewritten to the hub-relative path jobber_read_page takes.
  it.each([
    ['/client_hubs/UUID/invoices/150208512', 'invoices/150208512'],
    ['https://clienthub.getjobber.com/client_hubs/UUID/appointments/1?x=1', 'appointments/1?x=1'],
    ['/a/1', '/a/1'],
  ])('rewrites %s to %s', (href, want) => {
    expect(hubRelativePath(href)).toBe(want);
  });

  it('passes null through', () => {
    expect(hubRelativePath(null)).toBeNull();
  });
});

describe('parseCards', () => {
  it('attributes each card to the heading above it', () => {
    const out = parseCards(INVOICES_HTML);
    expect(out).toHaveLength(2);
    expect(out[0]?.section).toBe('Paid');
    expect(out[1]?.section).toBe('Overdue');
  });

  it('pulls title, number, id and url off a card', () => {
    expect(parseCards(INVOICES_HTML)[0]).toMatchObject({
      id: '150208512',
      title: 'For Services Rendered',
      number: '#15313',
      // Hub-relative: the hub UUID in the href is a bearer credential.
      url: 'invoices/150208512',
    });
  });

  it('keeps only detail rows that carry text, and decodes entities', () => {
    // `.shrink.columns` icon cells match the selector but strip to ''.
    expect(parseCards(INVOICES_HTML)[0]?.details).toEqual([
      'Sent Mar 23, 2026 | Due Apr 07, 2026',
      '$135.00 & paid in full',
    ]);
  });

  it('does not invent detail rows a card does not have', () => {
    expect(parseCards(INVOICES_HTML)[1]?.details).toHaveLength(1);
  });

  it('returns nothing for an appointments page', () => {
    expect(parseCards(APPOINTMENTS_HTML)).toEqual([]);
  });
});

describe('looksChallenged', () => {
  it('detects the definitive Cloudflare markers', () => {
    expect(looksChallenged('<title>Just a moment...</title>')).toBe(true);
    expect(looksChallenged('window._cf_chl_opt = {}')).toBe(true);
  });

  it('does not fire on a cleared page that merely mentions the challenge platform', () => {
    // Cloudflare inlines these on pages it has already let through; matching
    // them made every detail fetch in a sibling repo report a false bot-wall.
    expect(
      looksChallenged('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'),
    ).toBe(false);
    expect(looksChallenged(INVOICES_HTML)).toBe(false);
  });
});

describe('idFromUrl', () => {
  it('takes the trailing numeric segment', () => {
    expect(idFromUrl('/client_hubs/UUID/invoices/150208512')).toBe('150208512');
    expect(idFromUrl('/client_hubs/UUID/appointments/123?x=1')).toBe('123');
  });

  it('is null when there is no id', () => {
    expect(idFromUrl(null)).toBeNull();
    expect(idFromUrl('/client_hubs/UUID/invoices')).toBeNull();
  });
});

describe('stripTags / pageText', () => {
  it('collapses markup and whitespace', () => {
    expect(stripTags('<b>a</b>   <i>b</i>')).toBe('a b');
  });

  it('drops scripts and keeps block structure as newlines', () => {
    const text = pageText(
      '<html><body><script>var secret=1</script><h1>Invoice</h1><p>Due today</p></body></html>',
    );
    expect(text).not.toContain('secret');
    expect(text).toContain('Invoice');
    expect(text).toContain('Due today');
  });
});
