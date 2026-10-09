/**
 * Hub page fixtures shared by the TypeScript parser tests and the skill-parser
 * parity test, so both parsers are held to the same pages.
 */

/** The referral widget every card page carries — the decoy from recon. */
export const REFERRAL_ISLAND =
  '<div data-props="{&quot;requestUrl&quot;:&quot;https://clienthub.getjobber.com/client_hubs/UUID/work_requests/new&quot;,' +
  '&quot;shareMessage&quot;:&quot;Check out Queen Bee&#39;s&quot;,&quot;companyName&quot;:&quot;Queen Bee&#39;s Pest Solutions&quot;}"></div>';

export const APPOINTMENTS_HTML = `<!doctype html><html><body>
<h2>Your appointments</h2>
${REFERRAL_ISLAND}
<div data-props="{&quot;title&quot;:&quot;Upcoming&quot;,&quot;appointments&quot;:[{&quot;location&quot;:&quot;123 Elm St&quot;,&quot;date&quot;:&quot;Jun 28, 2026&quot;,&quot;weekday&quot;:&quot;Sunday&quot;,&quot;time&quot;:&quot;9:00am&quot;,&quot;arrivalWindow&quot;:null,&quot;canViewTime&quot;:true,&quot;url&quot;:&quot;/client_hubs/UUID/appointments/2236612358&quot;,&quot;confirmed&quot;:null,&quot;duration&quot;:null}]}"></div>
<div data-props="{&quot;title&quot;:&quot;Past&quot;,&quot;appointments&quot;:[{&quot;location&quot;:&quot;123 Elm St&quot;,&quot;date&quot;:&quot;Mar 23, 2026&quot;,&quot;weekday&quot;:&quot;Monday&quot;,&quot;time&quot;:&quot;1:00pm&quot;,&quot;arrivalWindow&quot;:null,&quot;canViewTime&quot;:false,&quot;url&quot;:&quot;/client_hubs/UUID/appointments/1932864231&quot;,&quot;confirmed&quot;:true,&quot;duration&quot;:null}]}"></div>
</body></html>`;

export const INVOICES_HTML = `<!doctype html><html><body>
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
