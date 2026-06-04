-- Phase 13C: extend AI interaction types for closing & executive summaries

alter table public.atlas_ai_interactions
  drop constraint if exists atlas_ai_interactions_interaction_type_check;

alter table public.atlas_ai_interactions
  add constraint atlas_ai_interactions_interaction_type_check
  check (interaction_type in (
    'chat', 'explain', 'audit', 'readiness', 'insight', 'voice_summary',
    'closing', 'executive_summary'
  ));
