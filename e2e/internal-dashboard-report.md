# Zafirixpro — Internal dashboard & app sections health report

Snapshot from the Playwright deep-tour agent on 2026-08-25 (desktop 1280 + mobile 390). Re-generate with:

`npx playwright test e2e/internal-dashboard-tour.spec.ts`

Latest runtime output: `e2e-reports/internal-dashboard-latest.md`

- Generated: 2026-08-25T04:37:22.486Z
- Checks: 69 · Pass: 69 · Fail: 0 · Warn: 0
- Isolation: social/external hosts aborted; popups off-origin closed.

## Sections

| Area | Element | Status | Detail |
| --- | --- | --- | --- |
| Public | Landing FR | **Pass** | http://localhost:3000/landing/fr |
| Public | Nav Tarifs → /pricing | **Pass** | http://localhost:3000/pricing |
| Public | Pricing plans | **Pass** | plans section visible |
| Public | Trial CTA → signup | **Pass** | http://localhost:3000/signup |
| Forms | Signup mock fill | **Pass** | name + email filled, submit skipped |
| Layout | pricing/signup desktop | **Pass** | no overflow (1280px) |
| Modules | Dashboard | **Pass** | http://localhost:3000/ |
| Dashboard | Dismiss guided tour | **Pass** | Passer |
| Dashboard | Overview shell | **Pass** | data-tour=dashboard |
| Dashboard | Lang AR / RTL | **Pass** | dir=rtl |
| Dashboard | Lang FR | **Pass** | toggled back to FR |
| Dashboard | Smart Tax Audit widget | **Pass** | visible |
| Dashboard | Tax audit AR toggle | **Pass** | widget dir RTL |
| Forms | Tax audit payload mock | **Pass** | JSON filled, scan not required |
| Layout | dashboard desktop | **Pass** | no overflow (1280px) |
| Modules | Audit IA page | **Pass** | http://localhost:3000/audit |
| Audit | TaxAuditWidget on /audit | **Pass** | visible |
| Audit | Scanner button | **Pass** | clicked (API stays on-origin) |
| Modules | Factures | **Pass** | http://localhost:3000/factures |
| Forms | Nouvelle facture panel | **Pass** | opened |
| Modules | Configuration | **Pass** | http://localhost:3000/setup |
| Modules | Aide | **Pass** | http://localhost:3000/help |
| Modules | Mes sociétés | **Pass** | http://localhost:3000/companies |
| Modules | Portfolio cabinet | **Pass** | http://localhost:3000/cabinet |
| Modules | Clients | **Pass** | http://localhost:3000/clients |
| Modules | Consultant IA | **Pass** | http://localhost:3000/consultant |
| Modules | Briefing CEO | **Pass** | http://localhost:3000/briefing-ceo |
| Modules | Assistant IA | **Pass** | http://localhost:3000/assistant |
| Modules | Smart Generator | **Pass** | http://localhost:3000/smart-generator |
| Modules | Agents IA | **Pass** | http://localhost:3000/agents |
| Modules | Documents IA | **Pass** | http://localhost:3000/documents |
| Modules | Validation | **Pass** | http://localhost:3000/validation |
| Modules | Comptabilité | **Pass** | http://localhost:3000/comptabilite |
| Modules | Immobilisations | **Pass** | http://localhost:3000/immobilisations |
| Modules | Banque | **Pass** | http://localhost:3000/banque |
| Modules | Inventaire | **Pass** | http://localhost:3000/inventaire |
| Modules | Logistique | **Pass** | http://localhost:3000/logistique |
| Modules | Recouvrement | **Pass** | http://localhost:3000/recouvrement |
| Modules | Commissions | **Pass** | http://localhost:3000/commissions |
| Modules | Courrier | **Pass** | http://localhost:3000/courrier |
| Modules | Satisfaction client | **Pass** | http://localhost:3000/satisfaction-client |
| Modules | Caisse | **Pass** | http://localhost:3000/caisse |
| Modules | Auto-entrepreneur | **Pass** | http://localhost:3000/auto-entrepreneur |
| Modules | Personne physique | **Pass** | http://localhost:3000/personne-physique |
| Modules | Juridique | **Pass** | http://localhost:3000/juridique |
| Modules | Gouvernance | **Pass** | http://localhost:3000/gouvernance |
| Modules | Pass auditeur | **Pass** | http://localhost:3000/auditor |
| Modules | Contrats | **Pass** | http://localhost:3000/contrats |
| Modules | RH | **Pass** | http://localhost:3000/rh |
| Modules | Étude de projet | **Pass** | http://localhost:3000/etude-projet |
| Modules | Rapports | **Pass** | http://localhost:3000/rapports |
| Modules | TVA | **Pass** | http://localhost:3000/tva |
| Modules | Simulateur fiscal | **Pass** | http://localhost:3000/simulateur-fiscal |
| Modules | Calendrier fiscal | **Pass** | http://localhost:3000/calendrier-fiscal |
| Modules | IS Fiscal | **Pass** | http://localhost:3000/is |
| Modules | Liasse fiscale | **Pass** | http://localhost:3000/liasse |
| Modules | IR / Salaires | **Pass** | http://localhost:3000/ir |
| Modules | Billing | **Pass** | http://localhost:3000/billing |
| Modules | Abonnement | **Pass** | http://localhost:3000/subscription |
| Modules | Paramètres | **Pass** | http://localhost:3000/settings |
| Forms | Login mock fill | **Pass** | filled, submit skipped |
| Modules | Dashboard mobile | **Pass** | http://localhost:3000/ |
| Layout | dashboard mobile 390px | **Pass** | no overflow (390px) |
| Mobile | Bottom nav Factures | **Pass** | http://localhost:3000/ |
| Modules | Audit mobile | **Pass** | http://localhost:3000/audit |
| Mobile | Tax audit widget | **Pass** | 390px /audit |
| Layout | audit mobile 390px | **Pass** | no overflow (390px) |
| Mobile | Pricing | **Pass** | http://localhost:3000/pricing |
| Layout | pricing mobile 390px | **Pass** | no overflow (390px) |

## Unresponsive buttons / missing elements / layout

No failed internal sections. Warnings (if any) are auth-gate only.

## Recommendations

- Keep deep-tour runs on `ATLAS_E2E_LOCAL=true` (or a signed-in storageState) so `/` is the dashboard, not `/landing`.
