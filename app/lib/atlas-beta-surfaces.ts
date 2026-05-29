/**
 * Sprint 0 — canonical list of experimental / Bêta product surfaces (for docs + UI copy).
 * UI imports `BetaSurfaceBadge`; routes may reference these ids in analytics later.
 */
export const ATLAS_BETA_SURFACE_IDS = [
  'ai_consultant',
  'ai_juridique',
  'ai_assistant_overlay',
  'ai_agents_hub',
  'ocr_documents',
  'stt_whisper',
  'tts',
] as const;

export type AtlasBetaSurfaceId = (typeof ATLAS_BETA_SURFACE_IDS)[number];
