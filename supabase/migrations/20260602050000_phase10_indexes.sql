-- Phase 10: Performance indexes for audit logs, legal documents, and dashboard queries
-- Idempotent: skip indexes when optional tables are absent.

CREATE INDEX IF NOT EXISTS idx_atlas_audit_logs_performed_by_created
  ON public.atlas_audit_logs(performed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_audit_logs_entity
  ON public.atlas_audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_audit_logs_action_created
  ON public.atlas_audit_logs(action, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.zafirix_legal_documents') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_legal_documents_expiry
      ON public.zafirix_legal_documents(user_id, expiry_date)
      WHERE expiry_date IS NOT NULL';
  END IF;

  IF to_regclass('public.zafirix_ocr_documents') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ocr_documents_user_created
      ON public.zafirix_ocr_documents(user_id, created_at DESC)';
  END IF;

  IF to_regclass('public.zafirix_routing_records') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_routing_records_user_validation_status
      ON public.zafirix_routing_records(user_id, validation_status, updated_at DESC)';
  END IF;
END $$;
