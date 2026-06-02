-- Phase 10: Performance indexes for audit logs, legal documents, and dashboard queries

-- atlas_audit_logs performance indexes
CREATE INDEX IF NOT EXISTS idx_atlas_audit_logs_performed_by_created
  ON atlas_audit_logs(performed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_audit_logs_entity
  ON atlas_audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_audit_logs_action_created
  ON atlas_audit_logs(action, created_at DESC);

-- zafirix_legal_documents expiry index for alert queries
CREATE INDEX IF NOT EXISTS idx_legal_documents_expiry
  ON zafirix_legal_documents(user_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

-- zafirix_ocr_documents today's upload count
CREATE INDEX IF NOT EXISTS idx_ocr_documents_user_created
  ON zafirix_ocr_documents(user_id, created_at DESC);

-- zafirix_routing_records validation status (used in dashboard kpis + validation queue)
CREATE INDEX IF NOT EXISTS idx_routing_records_user_validation_status
  ON zafirix_routing_records(user_id, validation_status, updated_at DESC);
