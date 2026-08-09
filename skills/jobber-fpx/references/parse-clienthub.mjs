#!/usr/bin/env node
// Extract structured records from a Jobber Client Hub page.
//
//   fpx get -p jobber "$JOBBER_HUB/appointments" | node parse-clienthub.mjs appointments
//
// Reads HTML on stdin, writes JSON on stdout. Dependency-free on purpose: this
// ships inside a skill, so it must run from a bare `node` with no install step.
//
// Two shapes live on this one site and they need different readers:
//   appointments -> JSON embedded in `div[data-props]` React islands
//   everything else -> server-rendered cards, no JSON anywhere
// Passing the wrong kind is the failure this file exists to prevent: the
// invoice page carries exactly one island, an unrelated referral widget, which
// parses cleanly and yields no invoices.

const KINDS = ['appointments', 'invoices', 'quotes', 'work_requests'];

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // last: an escaped entity must not be re-decoded
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every `data-props` payload on the page, JSON-parsed, unparseable ones dropped. */
function islandProps(html) {
  const out = [];
  for (const m of html.matchAll(/\sdata-props\s*=\s*"([^"]*)"/g)) {
    try {
      out.push(JSON.parse(decodeEntities(m[1])));
    } catch {
      // A non-JSON data-props is not ours; skip rather than fail the run.
    }
  }
  return out;
}

function parseAppointments(html) {
  const groups = islandProps(html).filter((p) => Array.isArray(p.appointments));
  return groups.flatMap((g) =>
    g.appointments.map((a) => ({
      group: g.title ?? null, // "Today" | "Upcoming" | "Past"
      id: idFromUrl(a.url),
      date: a.date ?? null,
      weekday: a.weekday ?? null,
      time: a.canViewTime ? (a.time ?? null) : null,
      arrivalWindow: a.arrivalWindow ?? null,
      duration: a.duration ?? null,
      location: a.location ?? null,
      confirmed: a.confirmed ?? null,
      url: a.url ?? null,
    })),
  );
}

function idFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/(\d+)(?:[/?#]|$)/);
  return m ? m[1] : null;
}

/**
 * Server-rendered card lists (invoices, quotes, work requests).
 *
 * Cards are `<a class="... card-content--link ...">` blocks. Section state
 * ("Paid", "Upcoming", ...) comes from the nearest preceding <h3>, so the
 * document is walked in order rather than by querying cards alone.
 */
function parseCards(html) {
  const tokens = [
    ...html.matchAll(
      /<h3[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*class="[^"]*card-content--link[^"]*"[^>]*)>([\s\S]*?)<\/a>/g,
    ),
  ];

  let section = null;
  const records = [];

  for (const t of tokens) {
    if (t[1] !== undefined) {
      section = stripTags(t[1]) || null;
      continue;
    }
    const attrs = t[2] ?? '';
    const body = t[3] ?? '';

    const href = (attrs.match(/href\s*=\s*"([^"]*)"/) || [])[1] ?? null;
    const title = pickClass(body, 'card-headerTitle');
    const number = pickClass(body, 'card-headerActions');

    // Metadata rows: every `.columns` cell that actually carries text.
    const details = [...body.matchAll(/<div[^>]*class="[^"]*\bcolumns\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);

    records.push({
      section,
      id: idFromUrl(href),
      title,
      number,
      details,
      url: href,
    });
  }

  return records;
}

function pickClass(html, cls) {
  const re = new RegExp(`<([a-z0-9]+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, 'i');
  const m = html.match(re);
  return m ? stripTags(m[2]) || null : null;
}

function looksChallenged(html) {
  // Definitive Cloudflare markers only — see the fleet note on false positives.
  return /_cf_chl_opt/.test(html) || /<title>\s*Just a moment/i.test(html);
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const kind = process.argv[2];
if (!kind || !KINDS.includes(kind)) {
  process.stderr.write(`usage: parse-clienthub.mjs <${KINDS.join('|')}> < page.html\n`);
  process.exit(64);
}

const html = await readStdin();

if (!html.trim()) {
  process.stderr.write('empty input — did the fpx call fail? check its exit code\n');
  process.exit(65);
}
if (looksChallenged(html)) {
  process.stderr.write(
    'Cloudflare interstitial, not a hub page. The request did not go through the ' +
      'signed-in tab — check `fpx health -p jobber` and that a getjobber.com tab is open.\n',
  );
  process.exit(3);
}

const records = kind === 'appointments' ? parseAppointments(html) : parseCards(html);

if (records.length === 0) {
  process.stderr.write(
    `no ${kind} found. If the page rendered, the markup moved — re-verify the ` +
      'selectors against the live DOM before trusting an empty result.\n',
  );
}

process.stdout.write(JSON.stringify(records, null, 2) + '\n');
