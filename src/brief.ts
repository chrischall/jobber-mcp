/**
 * `view: 'brief'` for the canonical reads: one line per item, at most
 * {@link BRIEF_MAX} characters, shaped `title — <ISO date | no date> — <status>`
 * (the mcp-host context-groups contract), so a host can count and speak items
 * without parsing a provider's page.
 */
import type { Appointment, CardRecord } from './parse.js';

export const BRIEF_MAX = 120;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The hub's `Jun 28, 2026` (or `June 28, 2026`) as `2026-06-28`; null when it is not that shape. */
export function isoDate(hubDate: string | null): string | null {
  const m = hubDate?.match(/\b([A-Za-z]{3})[A-Za-z]*\.? (\d{1,2}), (\d{4})\b/);
  if (!m) return null;
  const month = MONTHS.indexOf((m[1] as string).toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${(m[2] as string).padStart(2, '0')}`;
}

/** The due date an invoice card's metadata rows carry (`… | Due Apr 07, 2026`), as ISO. */
export function invoiceDue(record: CardRecord): string | null {
  for (const row of record.details) {
    const due = isoDate(row.match(/\bDue\s+(.+)$/i)?.[1] ?? null);
    if (due) return due;
  }
  return null;
}

/** Invoices still owed: every list section except `Paid`. */
export function isOpenInvoice(record: CardRecord): boolean {
  return !/^paid$/i.test(record.section?.trim() ?? '');
}

/**
 * Visits dated inside the inclusive `YYYY-MM-DD` range. A visit whose date
 * cannot be read is kept: nothing says it falls outside the range.
 */
export function inRange(appointments: Appointment[], start?: string, end?: string): Appointment[] {
  return appointments.filter((a) => {
    const day = isoDate(a.date);
    if (!day) return true;
    return (start === undefined || day >= start) && (end === undefined || day <= end);
  });
}

/** The shortest a title is cut to before the status gives way too. */
const TITLE_FLOOR = 24;

const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, Math.max(n - 1, 0))}…` : s);

/**
 * One brief line, cut to ≤ {@link BRIEF_MAX} chars as a WHOLE, title first:
 * the title shortens until the line fits, and only once it is at its floor
 * does the status give way too. A title starting with `-- ` (which would read
 * as a note) or `\` (which a host strips one of) is escaped with one leading
 * backslash — the fleet brief-view contract.
 */
function line(rawTitle: string, date: string | null, status: string): string {
  const title = rawTitle.startsWith('-- ') || rawTitle.startsWith('\\') ? `\\${rawTitle}` : rawTitle;
  const sep = ` — ${date ?? 'no date'} — `;
  const room = BRIEF_MAX - sep.length;
  if (title.length + status.length <= room) return `${title}${sep}${status}`;
  const shown = cut(title, Math.max(room - status.length, Math.min(title.length, TITLE_FLOOR)));
  return `${shown}${sep}${cut(status, room - shown.length)}`;
}

/** The note line an empty brief answers, so a host reads "nothing" rather than no answer. */
export const BRIEF_NONE = '-- none';

/** The brief lines, or the single `-- none` note when there is nothing to list. */
export function briefLines(lines: string[]): string[] {
  return lines.length === 0 ? [BRIEF_NONE] : lines;
}

/** `Visit 9:00am at 123 Elm St — 2026-06-28 — upcoming` (status: the hub's group, plus `confirmed`). */
export function appointmentLine(a: Appointment): string {
  const title = ['Visit', a.time, a.location ? `at ${a.location}` : null].filter(Boolean).join(' ');
  const status = [a.group?.toLowerCase() ?? 'scheduled', a.confirmed === true ? 'confirmed' : null]
    .filter(Boolean)
    .join(', ');
  return line(title, isoDate(a.date), status);
}

/** `#14992 Quarterly Service — 2026-01-01 — overdue` (status: the list section it sits under). */
export function invoiceLine(r: CardRecord): string {
  const title = [r.number, r.title].filter(Boolean).join(' ') || 'Invoice';
  return line(title, invoiceDue(r), r.section?.toLowerCase() ?? 'open');
}
