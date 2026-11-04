# Business Studio — end-to-end evidence

Run on 4 November 2026 on branch `feature/business-studio`, then rerun in full after the second review pass below (same day, evening).

**Environment.** A local production build (`next build` then `next start`) wired to a local Postgres, PostgREST and auth gateway (`tests/business-studio/e2e/serve-stack.mjs`). The stack is seeded with fictional users, one company and one legacy study. **This is not hosted Supabase, and no production or customer data was used.**

Tools: Node 24, Playwright 1.62 with Chromium. The desktop viewport is 1440 × 900; the mobile one is Pixel 7 emulation (412 px wide).

## Customer journey (Playwright, `studio-journey.spec.ts`)

| Test | Result | What it checks |
|---|---|---|
| Desktop FR: create, fill, save, reopen, analyse, generate, download | Pass | See the steps below |
| Desktop FR: every horizon | Pass | See the steps below |
| Desktop FR: compare two studies | Pass | 19 indicator rows; the "different horizons" note is shown; 4 per-year charts |
| Desktop: accessibility audit, French and Arabic | Pass | axe-core with the WCAG 2.0/2.1 A and AA rules on the home page, 11 workspace tabs and the compare page, in both languages: 0 serious or critical violations |
| Mobile AR: RTL layout and downloads | Pass | Every workspace tab in Arabic at 412 px with 0 px horizontal overflow; full report as Arabic PDF, Arabic Excel and French PDF downloaded |
| API: another tenant | Pass | See the steps below |

**Desktop journey.**
- Create the study "Boulangerie Atlas" from the wizard: retail sector, 7 years.
- Type the profile, then the assumptions:
  - 2 products and 2 expenses;
  - 2 positions (5 people);
  - 2 investments (700,000 MAD excluding VAT);
  - 350,000 MAD equity and a 500,000 MAD loan.
- Wait for "Enregistré", then reload: the investments, the loan and the profile are kept.
- The dashboard shows 22 charts and the coherence checks pass. Statements, tax, simulator, scenarios and risks open without errors.
- Download 5 files:
  - full report as French PDF, French Excel, Arabic PDF and Arabic Excel;
  - bank file as French PDF.
- Preview the PDF in the app. Submit, then approve as the owner: the badge reads "auto-validation, non indépendante".

**Horizon test.**
- Switch the same study to 3, 5, 7, 10, 15, 20 and 30 years.
- Each time the save completes, the coherence checks pass, and the statements show the expected fiscal years (2026 to 2056 at 30 years, with partial years marked "*").
- At 30 years, download the full report as French PDF, French Excel and Arabic PDF.

**Isolation test.** The second tenant authenticates with its own session cookie and bearer token; its own list returns 200.
- On the first tenant's study it gets 404 for read, share (PATCH), versions and duplicate.
- The study is not in its list.
- A request without a session gets 401.

Figures on the 7-year study come from the typed inputs, not from market data. They can be checked by hand: sales of about 170,500 MAD a month give 14,322,000 MAD cumulative revenue.

## Downloaded files, reopened

Every file downloaded in the browser was reopened with `tests/business-studio/e2e/inspect-documents.ts inspect`:
- PDF: rendered page by page with pdf.js, then checked for empty pages, broken RTL punctuation, Arabic glyphs, company name, status and every expected fiscal year.
- Excel: opened with exceljs, then checked for sheet count, numbers, the allowed formula set and the status.

| File | Pages / sheets | Result |
|---|---|---|
| Full report FR PDF, 7 years | 29 pages | ok |
| Full report AR PDF, 7 years | 29 pages | ok |
| Full report FR Excel, 7 years | 25 sheets, 1,868 numbers, 180 formulas | ok |
| Full report AR Excel, 7 years | 25 sheets, 1,868 numbers, 180 formulas | ok |
| Bank file FR PDF, 7 years | 19 pages | ok |
| Full report FR PDF, 30 years | 50 pages | ok |
| Full report AR PDF, 30 years | 51 pages | ok (after the footnote fix below) |
| Full report FR Excel, 30 years | 25 sheets, 6,560 numbers, 640 formulas | ok |
| Mobile: full report AR PDF, FR PDF and AR Excel (second study) | 28 pages, 28 pages, 25 sheets | ok |

The expectations were company "Boulangerie Atlas SARL", status "Brouillon" (French) or "مسودة" (Arabic), and fiscal years 2026, 2027, 2030 and 2033 (7 years) or 2026 to 2056 (30 years).

**Generated set.** `inspect-documents.ts generate` produced every report type in both languages for six studies: bakery at 3, 7 and 30 years; workshop at 10, 15 and 20 years. That is 84 PDF and 84 workbooks, with 0 failing.

## Defects found by this run and fixed

| Defect | Fix |
|---|---|
| 30-year Arabic PDF: the partial-year footnote landed alone on an otherwise empty page | A table keeps room under its last rows for a short footnote that follows it (`report-pdf.ts`) |
| Low contrast: grey help text, hints, units and empty states in the Studio; sidebar subtitle and group headings | Studio text raised from `gray-400` to `gray-500`; sidebar colours raised to 70 % and 80 % opacity |
| Scrollable tables and the audit list not reachable by keyboard | Focusable, with a visible focus ring |
| SWOT/PESTEL add buttons had no accessible name | Named "Ajouter — <list>" |
| Audit trail showed raw codes (`approved → draft`) | Statuses, sharing modes and approval type are translated |
| Arabic workspace: the default scenario name stayed French in the scenario selector, and a French study title was clipped at its start | Default names translated; the title field takes the direction of its text |

## Second review pass: what a paying customer sees

Automated checks prove that files open and numbers reconcile; they do not prove that a page reads well. This pass looked at every screen and page as a customer or banker would.

**Method.**
- `studio-review.spec.ts` captures every workspace tab and sub-tab of the journey's bakery study at full height, in three views: French desktop, Arabic desktop and Arabic mobile. The spec fails on any page error or failed request.
  - The local stack has no Auth admin API, so the app-wide welcome-email bootstrap (`/api/email/welcome`, outside the Studio) answers 400 there. Only that URL is excluded.
- The downloaded PDFs were rendered page by page with pdf.js and `@napi-rs/canvas`, and the pages read: full report FR and AR at 7 years, bank file FR, and generated FR and AR at 30 years.
- Figures were recomputed by hand on the bakery study:
  - revenue of 170,500 MAD a month and a 63 % gross margin;
  - EBITDA of 766,885 MAD for 2027;
  - the SIG pyramid down to a net income of 532,882 MAD (IS 20 % of 666,102 = 133,220);
  - the minimum contribution for 2030 of 5,115 MAD (0.25 % of 2,046,000), below the IS due, so IS is what is paid;
  - VAT for December 2026, the only month of the first fiscal year: 34,100 MAD collected, 155,700 MAD deductible (mostly equipment), hence a VAT credit.

**Defects found and fixed.**

| Defect | Seen as | Fix |
|---|---|---|
| Executive summary growth compared partial years | "170 500 MAD en 2026, 1 875 500 MAD en 2033 (croissance annuelle moyenne 40,9 %)" for a business with flat revenue (1-month and 11-month stubs) | Revenue and growth use the first and last complete fiscal years: "2 046 000 MAD en 2027, 2 046 000 MAD en 2032 (croissance annuelle moyenne 0,0 % entre exercices complets)". Same in Arabic |
| Amounts split over two lines in PDF period tables | The last digit of amounts such as 2 046 000 wrapped to a second line in the SIG, debt and statement tables (8 period columns) | The label column narrows (down to 26 % of the width), then the font (down to 6 pt), until the widest amount fits on one line |
| Break-even card read on a one-month stub | "Point mort (1er exercice)" showed 78,392 MAD, computed on December 2026 alone | Read on the first complete fiscal year ("1er exercice complet", 989,531 MAD, reached 2027-06), in the dashboard and the report summary |
| Shareholder IRR always "n.d." without dividends | Profitable study, IRR not computable | The IRR with end-of-horizon book equity as exit value (already computed, shown only in the investor report) is added to the dashboard, simulator, comparison and report summary, labelled "sortie comptable" |
| Unit costs rounded to whole MAD in reports | Bread at 1.50 MAD printed "2" | Unit prices and costs keep their centimes (new `mad_unit` cell); statements stay in whole MAD |
| Empty template lines printed in reports | Assumption tables listed lines at 0 MAD | Lines without an amount are left out, with a notice giving their number |
| Deposits shown as depreciated | A deposit listed with a depreciation life and method (the engine does not depreciate it) | Reports say "Non amortissable"; the editor hides life and method for land, goodwill and deposits |
| Raw regime code in the tax table | The raw code "is" | "IS", "IR professionnel" or "Auto-entrepreneur", translated |
| Month labels overlapping on dashboard line charts | Labels running into each other | Wider label spacing on category axes |
| Waterfall and resources/uses charts hid labels | Only every other step labelled | Waterfall drawn horizontally; horizontal charts label every category; their tooltips show amounts again |

Regression tests: `tests/business-studio/customer-review.test.ts` (6 tests). The one-line check fails on the previous PDF renderer and passes on the fixed one.

## Not covered by this evidence

- **Hosted Supabase: UNTESTED (not passed).** No isolated hosted project exists. A free organisation (`zafirix-studio-verify`, no project, $0) was created, but Supabase refuses any new project on the account while "marwandevlo's Org" has overdue invoices, and the owner has no other account. Auth, RLS, PostgREST and network behaviour on hosted Supabase are therefore unverified.
- A real mobile device. Mobile was Chromium emulation; downloads were captured by Playwright.
- Proofreading of the Arabic text by a native reviewer.
- A screen-reader session.
- Review of the tax rules by an expert-comptable.
