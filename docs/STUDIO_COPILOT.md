# Business Studio copilot

The consultant lives inside `/etude-projet/[studyId]`. It interviews in French, Arabic, or Moroccan Darija, proposes assumptions, and explains only the figures produced by the existing Studio engine.

## What it does not do

- It does not write the study until the user confirms a selected change.
- It does not generate revenue, profit, tax, VAT, BFR, DSCR, NPV, or IRR. Those sentences are formatted from `computeStudy` and `computeMetrics`.
- It does not change tax rates, VAT accounting, the database schema, or an existing customer study by itself.
- It does not treat a subscription inside a real-estate study as lot sales. That pattern is a warning and an optional suggestion.

## Storage and isolation

Transcripts are separate `atlas_projects` rows with `metadata.kind = business_study_copilot`. Study lists only read `business_study_v2` and legacy studies. Each transcript is filtered by the signed-in `user_id` and by the study id. Opening the study still goes through `getStudy`, so a user who cannot read the study cannot read or write its transcript.

Confirmed changes call `saveStudy` with the revision the user loaded. A stale revision returns 409. Undo restores the model snapshot taken at that apply, and only while the study revision is still the one produced by the apply.

## Provider and cost

No new vendor and no new paid commitment. When a key is already configured, the wording pass uses the same chain as the Atlas assistant:

1. Anthropic `claude-sonnet-4-5`, from `ANTHROPIC_API_KEY`
2. OpenAI `gpt-4o-mini`, from `OPENAI_API_KEY`, only if Anthropic is unavailable
3. The deterministic consultant, if no key is configured, the daily budget is exhausted, or the wording contains a number that is not in the engine brief or the user message

Caps, per signed-in user and server instance:

| Limit | Value |
| --- | --- |
| Message length | 4,000 characters |
| History sent to a model | 12 turns, 1,500 characters each |
| Output tokens | 900 |
| Requests | 15 per 10 minutes |
| Estimated daily tokens | 60,000 |
| Stored transcript | 40 messages |
| Retries | one retry on HTTP 429 or 5xx |
| Cancellation | the request abort signal |

The deterministic interview, extraction, contradiction checks, and engine explanation do not call a provider. Tests do not call Anthropic or OpenAI.

Published token prices change. Confirm the current list price with the provider before raising `COPILOT_LIMITS` in `app/lib/business-studio/copilot.ts`. The in-memory budget resets when the server process restarts and is not shared across instances.

## Deployment

This branch is local until the owner approves a push. A release would be a pull request into `main`, then the existing Vercel production deploy. There is no migration. The rollback target remains the current production deployment. Do not point a preview deployment at the production database.

## Report design

PDF, Word, and Excel covers show four engine KPIs. Tables use navy headers, teal and violet rules, gold totals, and alternating rows. Each executive summary labels customer targets, simulated values, verified data, and unconfirmed tax or market assumptions. The reference PDF named in the design request was not present in the workspace, so the pages were checked against that written benchmark and against rendered output, not against copied figures from another study.
