import { describe, expect, it } from 'vitest';
import {
  idFromUrl,
  looksChallenged,
  pageText,
  parseAppointments,
  parseCards,
  stripTags,
} from '../src/parse.js';

/** The referral widget every card page carries — the decoy from recon. */
const REFERRAL_ISLAND =
  '<div data-props="{&quot;requestUrl&quot;:&quot;https://clienthub.getjobber.com/client_hubs/UUID/work_requests/new&quot;,' +
  '&quot;shareMessage&quot;:&quot;Check out Queen Bee&#39;s&quot;,&quot;companyName&quot;:&quot;Queen Bee&#39;s Pest Solutions&quot;}"></div>';

const APPOINTMENTS_HTML = `<!doctype html><html><body>
<h2>Your appointments</h2>
${REFERRAL_ISLAND}
<div data-props="{&quot;title&quot;:&quot;Upcoming&quot;,&quot;appointments&quot;:[{&quot;location&quot;:&quot;123 Elm St&quot;,&quot;date&quot;:&quot;Jun 28, 2026&quot;,&quot;weekday&quot;:&quot;Sunday&quot;,&quot;time&quot;:&quot;9:00am&quot;,&quot;arrivalWindow&quot;:null,&quot;canViewTime&quot;:true,&quot;url&quot;:&quot;/client_hubs/UUID/appointments/2236612358&quot;,&quot;confirmed&quot;:null,&quot;duration&quot;:null}]}"></div>
<div data-props="{&quot;title&quot;:&quot;Past&quot;,&quot;appointments&quot;:[{&quot;location&quot;:&quot;123 Elm St&quot;,&quot;date&quot;:&quot;Mar 23, 2026&quot;,&quot;weekday&quot;:&quot;Monday&quot;,&quot;time&quot;:&quot;1:00pm&quot;,&quot;arrivalWindow&quot;:null,&quot;canViewTime&quot;:false,&quot;url&quot;:&quot;/client_hubs/UUID/appointments/1932864231&quot;,&quot;confirmed&quot;:true,&quot;duration&quot;:null}]}"></div>
</body></html>`;

const INVOICES_HTML = `<!doctype html><html><body>
${REFERRAL_ISLAND}
<h3>Paid</h3>
<div class="card card--paddingNone">
  <a class="card-content card-content--link u-block" href="/client_hubs/UUID/invoices/150208512">
    <div class="card-header">
      <h4 class="card-headerTitle">For Services Rendered</h4>
      <div class="card-headerActions u-marginNone">#15313</div>
    </div>
    <div class="row row--tightColumns align-middle">
      <div class="shrink columns"><sg-icon class="u-block"></sg-icon></div>
      <div class="columns">Sent Mar 23, 2026 | Due Apr 07, 2026</div>
    </div>
    <div class="row row--tightColumns align-middle">
      <div class="shrink columns"><sg-icon class="u-block"></sg-icon></div>
      <div class="columns">$135.00 &amp; paid in full</div>
    </div>
  </a>
</div>
<h3>Overdue</h3>
<div class="card card--paddingNone">
  <a class="card-content card-content--link u-block" href="/client_hubs/UUID/invoices/142728009">
    <div class="card-header">
      <h4 class="card-headerTitle">Quarterly Service</h4>
      <div class="card-headerActions u-marginNone">#14992</div>
    </div>
    <div class="row row--tightColumns align-middle">
      <div class="shrink columns"><sg-icon class="u-block"></sg-icon></div>
      <div class="columns">Sent Dec 17, 2025 | Due Jan 01, 2026</div>
    </div>
  </a>
</div>
</body></html>`;

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
      url: '/client_hubs/UUID/invoices/150208512',
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
