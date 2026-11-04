import { describe, expect, it } from 'vitest';
import {
  appointmentLine,
  BRIEF_MAX,
  inRange,
  invoiceDue,
  invoiceLine,
  isOpenInvoice,
  isoDate,
} from '../src/brief.js';
import type { Appointment, CardRecord } from '../src/parse.js';

const visit = (over: Partial<Appointment> = {}): Appointment => ({
  group: null,
  id: null,
  date: null,
  weekday: null,
  time: null,
  arrivalWindow: null,
  duration: null,
  location: null,
  confirmed: null,
  url: null,
  ...over,
});

const card = (over: Partial<CardRecord> = {}): CardRecord => ({
  section: null,
  id: null,
  title: null,
  number: null,
  details: [],
  url: null,
  ...over,
});

describe('isoDate', () => {
  it('reads the hub’s short and long month forms', () => {
    expect(isoDate('Jun 28, 2026')).toBe('2026-06-28');
    expect(isoDate('Sent Mar 3, 2026')).toBe('2026-03-03');
    expect(isoDate('September 9, 2026')).toBe('2026-09-09');
  });

  it('answers null for no date, another shape, or a word that is not a month', () => {
    expect(isoDate(null)).toBeNull();
    expect(isoDate('2026-06-28')).toBeNull();
    expect(isoDate('Foo 28, 2026')).toBeNull();
  });
});

describe('invoices', () => {
  it('takes the due date from whichever metadata row carries it', () => {
    expect(invoiceDue(card({ details: ['$135.00', 'Sent Mar 23, 2026 | Due Apr 07, 2026'] }))).toBe('2026-04-07');
    expect(invoiceDue(card({ details: ['Sent Mar 23, 2026'] }))).toBeNull();
  });

  it('counts every section but Paid as open, and a card with no section as open', () => {
    expect(isOpenInvoice(card({ section: ' Paid ' }))).toBe(false);
    expect(isOpenInvoice(card({ section: 'Awaiting Payment' }))).toBe(true);
    expect(isOpenInvoice(card())).toBe(true);
  });

  it('reads as one line even with no number, title, section or due date', () => {
    expect(invoiceLine(card())).toBe('Invoice — no date — open');
    expect(invoiceLine(card({ title: 'Spring treatment' }))).toBe('Spring treatment — no date — open');
  });
});

describe('visits', () => {
  it('keeps undated visits and honours either end of the range alone', () => {
    const list = [visit({ date: 'Jun 28, 2026' }), visit({ date: 'Mar 23, 2026' }), visit()];
    expect(inRange(list, '2026-04-01').map((a) => a.date)).toEqual(['Jun 28, 2026', null]);
    expect(inRange(list, undefined, '2026-04-01').map((a) => a.date)).toEqual(['Mar 23, 2026', null]);
    expect(inRange(list)).toHaveLength(3);
  });

  it('reads as one line with no time, place or group, and only says confirmed when it is', () => {
    expect(appointmentLine(visit())).toBe('Visit — no date — scheduled');
    expect(appointmentLine(visit({ group: 'Today', confirmed: false }))).toBe('Visit — no date — today');
  });

  it('cuts a long title so the line stays within the cap, keeping date and status whole', () => {
    const line = appointmentLine(visit({ location: 'x'.repeat(300), date: 'Jun 28, 2026', group: 'Upcoming' }));
    expect(line.length).toBe(BRIEF_MAX);
    expect(line).toMatch(/… — 2026-06-28 — upcoming$/);
  });
});
