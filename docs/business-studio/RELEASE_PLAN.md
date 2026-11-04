# Business Studio — deployment, rollback and approvals

Nothing in this plan has been executed. Each step marked **Approval** needs a separate, explicit owner approval. The deployment freeze in force since 30 October 2026 (backup rescue, pending invoice payment) takes precedence over this plan.

## What changes

- **Code only.** Changes are under `app/etude-projet`, `app/lib/business-studio`, `app/api/business-studio`, `tests/business-studio`, `public/fonts/amiri`, `docs/business-studio` and this preflight script. No other file is changed and none is deleted. `scripts/business-studio-preflight.mjs` checks this.
- **No database migration, no RLS or policy change, no new table, no new environment variable, no new dependency.**
- **Where data goes.** Studies are rows in the existing `atlas_projects` table:
  - `metadata.kind = 'business_study_v2'` for studies;
  - `metadata.kind = 'business_study_version'` for version snapshots.
- **Existing data is not touched.**
  - Legacy studies (`etude_faisabilite`) are never modified. Import makes a copy.
  - Actuals only read `atlas_accounting_entries` with `SELECT`.
- **Routes.**
  - `/etude-projet` now opens the Studio home.
  - The previous assistant moved to `/etude-projet/assistant`. Its saved studies and behaviour are unchanged, and it shows a banner saying its rates are fixed.
  - The sidebar link is unchanged (`/etude-projet`).
- **New API routes** under `/api/business-studio`. They require a Bearer session and use the existing server Supabase client and the existing `canAccessCompany` check.

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
- 63 unit/UI tests;
- 7 integration tests.

It does not contact Supabase or production.

Also confirm on the day of release:
1. Production is still `4fe5012`. If RC2.1 or another release reached `main` first, rebase this branch onto the new `main` and rerun the preflight. Neither RC2.1 (`3edc778`) nor the recovery/P1 branch changes any Studio path, so no conflict is expected.
2. A full `next build` with production environment variables succeeds (Vercel preview build).

## Deployment steps

| Step | Action | Gate |
|---|---|---|
| 0 | Freeze lifted by the owner; backup rescue unaffected | **Approval** |
| 1 | Push `feature/business-studio` to the deployment repository and open a pull request to `main` (the branch is only on the private backup today) | **Approval** (code becomes visible in that repository) |
| 2 | Vercel preview build of the pull request; run the preview checks below with a test account | Preview checks pass |
| 3 | Merge to `main`; Vercel production build | **Approval** (production release) |
| 4 | `node scripts/business-studio-preflight.mjs --post-deploy https://<production-host>` (unauthenticated GETs only) | All `ok` |
| 5 | Manual check with an owner account (below) | Owner sign-off |

Preview / production manual check, with a test or owner account and no customer data:
1. `/etude-projet` lists the user's existing legacy studies as "legacy" and opens the Studio home.
2. Create a study linked to the user's own company. Edit a value; the revision increases and the dashboard updates.
3. Open the tax tab; rule statuses and sources are shown.
4. Download one PDF and one Excel report in French and in Arabic.
5. Open the actuals tab. Values appear only if the company has validated entries, and nothing can be edited.
6. `/etude-projet/assistant` opens the previous assistant with its saved studies.
7. Archive the test study.

## Rollback

- **Application.** Use Vercel instant rollback: promote the previous production deployment of `4fe5012` (recorded earlier as `zafirix-ntfd6196j`; confirm in the Vercel dashboard). Then revert the merge on `main` so Git matches what is deployed.
- **Data.** No cleanup is required.
  - Studies and versions created in the meantime remain as `atlas_projects` rows.
  - The previous assistant ignores them, because it filters on `kind = 'etude_faisabilite'`.
  - Redeploying the Studio makes them visible again.
  - Nothing else reads these kinds.
- **What rollback cannot undo.** Reports already downloaded by users stay on their devices.

## Known limitations to accept before release

- Tax rules come from the CGI 2026 consolidation (DGI) and ACAPS sheets. **No expert-comptable has reviewed them.** Screens and reports label each rule with its status.
- Access is owner-only. Other members of the same company cannot see a user's study. Sharing would need a schema change.
- No role separation: the author can approve their own study.
- Clearing a company's data (existing feature) also deletes studies linked to that company, because it clears `atlas_projects` by `company_id`.
- Arabic has not been proofread. Findings, rule labels and default scenario names stay French.
- The VAT credit refund (art. 103 bis), withholding taxes other than on dividends, and IS before 2023 are not modelled.
- Project NPV uses unlevered FCFF without the interest tax shield, at the statutory rate (average rate under the IR regime).
- Verification ran on a local Postgres + PostgREST stack, which is not equivalent to hosted Supabase.

## Approvals required (each separate)

1. Lift the deployment freeze for this release.
2. Push the branch to the deployment repository and open the pull request.
3. Merge and release to production.
4. Optional, later: a schema change for study sharing between company members (not prepared).

No database change is needed for this release, so there is no database approval to request.
