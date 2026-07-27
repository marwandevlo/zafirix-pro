/**
 * Growth-incident kill switch (originally 2026-05-03).
 *
 * When true: blocks manual payment APIs (`temporarily_unavailable`), referral UI,
 * WhatsApp sends, and related tracking.
 *
 * Restored to `false` so commercial checkout (`/payment?plan=…`) works again.
 * Set back to `true` and redeploy only for a deliberate production incident freeze.
 */
export const ATLAS_INCIDENT_HOTFIX_GROWTH = false;
