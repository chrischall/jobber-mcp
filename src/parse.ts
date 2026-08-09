/**
 * Readers for the two page families the Jobber Client Hub serves.
 *
 * Captured live 2026-08-09 (see docs/JOBBER-CLIENTHUB-API.md). The hub is a
 * server-rendered Rails app with no client-facing JSON API, and it stores data
 * two different ways on two different pages:
 *
 *   appointments -> JSON in `div[data-props]` React islands
 *   invoices / quotes / work_requests -> server-rendered cards, no JSON
 *
 * Pointing the island reader at a card page is the failure this module is
 * shaped to prevent: every card page carries exactly one island — an unrelated
 * *referral widget* (`{requestUrl, shareMessage, companyName}`) — which parses
 * cleanly and contains no records. It reads as "you have none" rather than as a
 * bug, so `parseAppointments` keeps only islands that actually carry an
 * `appointments` array and the callers surface an explicit empty-result signal.
 *
 * Deliberately regex-based rather than DOM-based: the same logic ships inside
 * `skills/jobber-fpx/references/parse-clienthub.mjs`, which must run from a
 * bare `node` with no dependency install.
 */

/** One scheduled visit. */
export interface Appointment {
  /** The island this came from: `Today`, `Upcoming` or `Past`. */
  group: string | null;
  id: string | null;
  date: string | null;
  weekday: string | null;
  /** `null` when the provider hides times (`canViewTime: false`). */
  time: string | null;
  arrivalWindow: string | null;
  duration: string | null;
  location: string | null;
  confirmed: boolean | null;
  url: string | null;
}

/** One invoice, quote or work request. */
export interface CardRecord {
  /** The list heading this card sat under, e.g. `Paid`. */
  section: string | null;
  id: string | null;
  title: string | null;
  /** Provider-assigned number, e.g. `#15313`. */
  number: string | null;
  /**
   * The card's metadata rows, in document order, kept raw.
   *
   * Which rows a card shows depends on its state — an unpaid invoice carries a
   * balance row a paid one does not — so a fixed schema would invent fields for
   * some records and silently drop rows from others.
   */
  details: string[];
  url: string | null;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // last: a decoded entity must not be re-decoded
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trailing numeric id from a hub URL, e.g. `.../invoices/150208512`. */
export function idFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/\/(\d+)(?:[/?#]|$)/);
  return m?.[1] ?? null;
}

/** Every `data-props` payload on the page; unparseable ones are dropped. */
function islandProps(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/\sdata-props\s*=\s*"([^"]*)"/g)) {
    const raw = m[1];
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(decodeEntities(raw));
      if (parsed && typeof parsed === 'object') out.push(parsed as Record<string, unknown>);
    } catch {
      // Not our island. Skip rather than fail the whole page.
    }
  }
  return out;
}

export function parseAppointments(html: string): Appointment[] {
  const groups = islandProps(html).filter((p) => Array.isArray(p['appointments']));

  return groups.flatMap((g) => {
    const title = typeof g['title'] === 'string' ? g['title'] : null;
    const rows = g['appointments'] as Record<string, unknown>[];

    return rows.map((a): Appointment => {
      const url = str(a['url']);
      // The provider can hide times; `time` is then stale/absent and must not
      // be reported as though it were a real appointment time.
      const canViewTime = a['canViewTime'] !== false;
      return {
        group: title,
        id: idFromUrl(url),
        date: str(a['date']),
        weekday: str(a['weekday']),
        time: canViewTime ? str(a['time']) : null,
        arrivalWindow: str(a['arrivalWindow']),
        duration: str(a['duration']),
        location: str(a['location']),
        confirmed: typeof a['confirmed'] === 'boolean' ? a['confirmed'] : null,
        url,
      };
    });
  });
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Card lists. Walked in document order rather than queried, because a card's
 * state (`Paid`, `Overdue`, …) lives in the nearest preceding `<h3>` heading
 * and not on the card itself.
 */
export function parseCards(html: string): CardRecord[] {
  const tokens = html.matchAll(
    /<h3[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*class="[^"]*card-content--link[^"]*"[^>]*)>([\s\S]*?)<\/a>/g,
  );

  let section: string | null = null;
  const records: CardRecord[] = [];

  for (const t of tokens) {
    if (t[1] !== undefined) {
      section = stripTags(t[1]) || null;
      continue;
    }
    const attrs = t[2] ?? '';
    const body = t[3] ?? '';
    const href = attrs.match(/href\s*=\s*"([^"]*)"/)?.[1] ?? null;

    records.push({
      section,
      id: idFromUrl(href),
      title: pickClass(body, 'card-headerTitle'),
      number: pickClass(body, 'card-headerActions'),
      // Metadata rows: `.columns` cells that carry text. The icon-only
      // `.shrink.columns` siblings match the selector too and strip to '',
      // which is why empties are dropped rather than kept as blanks.
      details: [...body.matchAll(/<div[^>]*class="[^"]*\bcolumns\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
        .map((m) => stripTags(m[1] ?? ''))
        .filter(Boolean),
      url: href,
    });
  }

  return records;
}

function pickClass(html: string, cls: string): string | null {
  const re = new RegExp(
    `<([a-z0-9]+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`,
    'i',
  );
  return stripTags(html.match(re)?.[2] ?? '') || null;
}

/**
 * Definitive Cloudflare interstitial markers only.
 *
 * Deliberately NOT matching `cdn-cgi/challenge-platform` or gating on body
 * size: Cloudflare inlines those on *cleared* pages too, and a size gate
 * false-positives on small legitimate pages.
 */
export function looksChallenged(html: string): boolean {
  return /_cf_chl_opt/.test(html) || /<title>\s*Just a moment/i.test(html);
}

/** Readable text of a hub page, for detail pages that have no pinned schema. */
export function pageText(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  return decodeEntities(
    body
      .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n *(?:\n *)+/g, '\n\n')
    .trim();
}
