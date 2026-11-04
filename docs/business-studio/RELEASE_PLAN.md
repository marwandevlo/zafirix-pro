# Business Studio — deployment, rollback and approvals

Nothing in this plan has been executed. Each step marked **Approval** needs a separate, explicit owner approval. The deployment freeze in force since 30 October 2026 (backup rescue, pending invoice payment) takes precedence over this plan.

## What changes

- **Code only.** Changes are under `app/etude-projet`, `app/lib/business-studio`, `app/api/business-studio`, `tests/business-studio`, `public/fonts/amiri`, `docs/business-studio` and this preflight script. Three shared files are also changed, and `scripts/business-studio-preflight.mjs` allows only these:
  - `app/lib/atlas-company-clear-server.ts`: "clear company data" now detaches the owner's studies and versions (company set to none) before deleting, and aborts if that fails.
  - `app/companies/page.tsx`: the confirmation text says studies are kept.
  - `app/components/shell/AppSidebar.tsx`: two text colours raised to WCAG AA contrast.

  No file is deleted.
- **No database migration, no RLS or policy change, no new table, no new environment variable, no new dependency.**
- **Where data goes.** Studies are rows in the existing `atlas_projects` table:
  - `metadata.kind = 'business_study_v2'` for studies;
  - `metadata.kind = 'business_study_version'` for version snapshots;
  - sharing and approval are fields in that metadata (`sharing`, `submittedBy`, `approval`).
- **Existing data is not touched.**
  - Legacy studies (`etude_faisabilite`) are never modified. Import makes a copy.
  - Actuals only read `atlas_accounting_entries` with `SELECT`.
- **Routes.**
  - `/etude-projet` now opens the Studio home.
  - `/etude-projet/compare` compares two studies.
  - The previous assistant moved to `/etude-projet/assistant`. Its saved studies and behaviour are unchanged, and it shows a banner saying its rates are fixed.
  - The sidebar link is unchanged (`/etude-projet`).
- **New API routes** under `/api/business-studio`. They require the existing session (cookie checked by the proxy, then the route) and use the existing server Supabase client. Company access goes through `resolveCompanyRole`.
- **Sharing.** A study is private by default. The owner may share it read-only with members of its company, or for editing with members holding the accountant role or above. Members with the auditor role or above may approve a study submitted by someone else. The owner's own approval is always labelled a self-approval.

## Preflight (local, read-only)

```bash
git checkout feature/business-studio
npm ci
node scripts/business-studio-preflight.mjs
```

Expected: every line `ok`, then `all checks passed`. The script runs these local checks:
- containment and baseline checks;
- typecheck;
- lint on the Studio paths;
- 72 unit/UI tests;
- 9 integration tests.

It does not contact Supabase or production.

The browser journey and document inspection are run separately (see `E2E_EVIDENCE.md`):

```bash
node tests/business-studio/e2e/serve-stack.mjs <dir>          # local Postgres + PostgREST + auth gateway
npx next build && npx next start -p 3107 -H 127.0.0.1        # with the local stack's public URL and keys
STUDIO_E2E_DIR=<dir> npx playwright test -c tests/business-studio/e2e/playwright.studio.config.ts
npx tsx tests/business-studio/e2e/inspect-documents.ts generate <outDir>
```

Also confirm on the day of release:
1. Production is still `4fe5012`. If RC2.1 or another release reached `main` first, rebase this branch onto the new `main` and rerun the preflight. RC2.1 (`3edc778`) and the P1 branches change none of the Studio paths or the three shared files. The recovery branch (`recovery/accounting-2026-10-23`) edits the import block of `app/lib/atlas-company-clear-server.ts` (it imports `IMMUTABLE_LEDGER_STATUSES` instead of declaring it). The conflict is textual: keep both imports and rerun the integration test "clearing company data keeps studies…".
2. A full `next build` with production environment variables succeeds (Vercel preview build).

## Deployment steps

| Step | Action | Gate |
|---|---|---|
| 0 | Freeze lifted by the owner; backup rescue unaffected | **Approval** |
| 1 | Hosted verification in an isolated Supabase project (no customer data): auth, RLS, sharing roles, clear-data detach, exports | **Approval** (may need a new project; see below) |
| 2 | Push `feature/business-studio` to the deployment repository and open a pull request to `main` (the branch is only on the private backup today) | **Approval** (code becomes visible in that repository) |
| 3 | Vercel preview build of the pull request; run the preview checks below with a test account | Preview checks pass |
| 4 | Merge to `main`; Vercel production build | **Approval** (production release) |
| 5 | `node scripts/business-studio-preflight.mjs --post-deploy https://<production-host>` (unauthenticated GETs only) | All `ok` |
| 6 | Manual check with an owner account (below) | Owner sign-off |

Preview / production manual check, with a test or owner account and no customer data:
1. `/etude-projet` lists the user's existing legacy studies as "legacy" and opens the Studio home.
2. Create a study linked to the user's own company. Edit a value; the revision increases and the dashboard updates.
3. Open the tax tab; rule statuses and sources are shown.
4. Preview, then download one PDF and one Excel report in French and in Arabic; open them.
5. Share the study read-only with a second test member; that member sees it without edit controls. Submit, then approve with an auditor account; the badge says independent validation.
6. Compare two test studies on `/etude-projet/compare`.
7. Open the actuals tab. Values appear only if the company has validated entries, and nothing can be edited.
8. `/etude-projet/assistant` opens the previous assistant with its saved studies.
9. Archive the test studies.

## Rollback

- **Application.** Use Vercel instant rollback: promote the previous production deployment of `4fe5012` (recorded earlier as `zafirix-ntfd6196j`; confirm in the Vercel dashboard). Then revert the merge on `main` so Git matches what is deployed.
- **Data.** No cleanup is required.
  - Studies and versions created in the meantime remain as `atlas_projects` rows.
  - The previous assistant ignores them, because it filters on `kind = 'etude_faisabilite'`.
  - Redeploying the Studio makes them visible again.
  - Nothing else reads these kinds.
  - After a rollback, "clear company data" returns to the old behaviour and would delete studies linked to the company again. Warn owners not to use it until the Studio is redeployed.
- **What rollback cannot undo.** Reports already downloaded by users stay on their devices.

## Known limitations to accept before release

- Tax rules come from the CGI 2026 consolidation (DGI) and ACAPS sheets. **No expert-comptable has reviewed them.** Screens and reports label each rule with its status: 18 verified against the official text, 2 against the regulator, 5 tool conventions, 3 user-entered, 2 not covered.
- Not modelled: the 5 % withholding of art. 19-IV-A and other withholdings (art. 117-V). IS for fiscal years before 2023 has no verified rate; the engine blocks until the user types one.
- Arabic has not been proofread by a native reviewer. Tax-rule labels and notes and some metric explanations remain French, which the Arabic report discloses.
- Project NPV uses unlevered FCFF without the interest tax shield, at the statutory rate (average rate under the IR regime).
- Sharing is enforced by the API with the service-role client. Database RLS stays owner-only, so a shared study is only reachable through the Studio API.
- The accessibility audit is automated (axe-core); no assisted screen-reader session took place.
- Verification ran on a local Postgres + PostgREST stack, which is not equivalent to hosted Supabase.

## Approvals required (each separate)

1. Lift the deployment freeze for this release.
2. Hosted verification: use an existing isolated Supabase project if one exists, or approve creating one (it may be billed).
3. Push the branch to the deployment repository and open the pull request.
4. Merge and release to production.

No database change is needed for this release, so there is no database approval to request.
