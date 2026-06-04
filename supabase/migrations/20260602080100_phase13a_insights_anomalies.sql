-- Phase 13A addendum: index for anomaly code lookups in details JSON

create index if not exists idx_ai_anomalies_company_open
  on public.atlas_ai_anomalies (user_id, company_id, detected_at desc)
  where status = 'open';
