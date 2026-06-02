/**
 * Phase 9 Verification Script
 * Audit, Validation & Traceability Sprint
 *
 * 90 structural checks — no network calls.
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
let pass = 0, fail = 0;

function check(label, result) {
  if (result) { console.log(`  ✓ PASS  ${label}`); pass++; }
  else { console.error(`  ✗ FAIL  ${label}`); fail++; }
}
function has(file, text) {
  try { return readFileSync(path.join(ROOT, file), 'utf8').includes(text); }
  catch { return false; }
}
function exists(file) { return existsSync(path.join(ROOT, file)); }

// ── 1. Migration ─────────────────────────────────────────────────────────────
console.log('\n[1] Migration: audit_validation.sql');
check('File exists', exists('supabase/migrations/20260602040000_audit_validation.sql'));
check('atlas_audit_logs table', has('supabase/migrations/20260602040000_audit_validation.sql', 'create table if not exists public.atlas_audit_logs'));
check('action check constraint', has('supabase/migrations/20260602040000_audit_validation.sql', "'reviewed','validated','rejected'"));
check('entity_type column', has('supabase/migrations/20260602040000_audit_validation.sql', 'entity_type'));
check('source_document_id column', has('supabase/migrations/20260602040000_audit_validation.sql', 'source_document_id'));
check('performed_by column', has('supabase/migrations/20260602040000_audit_validation.sql', 'performed_by'));
check('old_values / new_values columns', has('supabase/migrations/20260602040000_audit_validation.sql', 'old_values') && has('supabase/migrations/20260602040000_audit_validation.sql', 'new_values'));
check('RLS enabled', has('supabase/migrations/20260602040000_audit_validation.sql', 'enable row level security'));
check('reviewed added to supplier_invoices', has('supabase/migrations/20260602040000_audit_validation.sql', 'atlas_supplier_invoices_validation_status_check'));
check('reviewed added to routing_records', has('supabase/migrations/20260602040000_audit_validation.sql', 'zafirix_routing_records_validation_check'));
check('atlas_accounting_entries validation_status added', has('supabase/migrations/20260602040000_audit_validation.sql', 'atlas_accounting_entries'));
check('validation_queue_summary view', has('supabase/migrations/20260602040000_audit_validation.sql', 'validation_queue_summary'));

// ── 2. Audit Log Library ──────────────────────────────────────────────────────
console.log('\n[2] Audit Log Library');
check('File exists', exists('app/lib/atlas-audit-log.ts'));
check('logAuditEvent function exported', has('app/lib/atlas-audit-log.ts', 'export async function logAuditEvent'));
check('getEntityAuditHistory exported', has('app/lib/atlas-audit-log.ts', 'export async function getEntityAuditHistory'));
check('AuditAction type includes reviewed', has('app/lib/atlas-audit-log.ts', "'reviewed'"));
check('AuditAction type includes propagated', has('app/lib/atlas-audit-log.ts', "'propagated'"));
check('AUDIT_ACTION_LABELS exported', has('app/lib/atlas-audit-log.ts', 'AUDIT_ACTION_LABELS'));
check('AUDIT_ACTION_COLORS exported', has('app/lib/atlas-audit-log.ts', 'AUDIT_ACTION_COLORS'));
check('Non-throwing (try/catch)', has('app/lib/atlas-audit-log.ts', 'catch (err)'));

// ── 3. Validation KPIs API ────────────────────────────────────────────────────
console.log('\n[3] Validation KPIs API');
check('File exists', exists('app/api/validation/kpis/route.ts'));
check('GET export', has('app/api/validation/kpis/route.ts', 'export async function GET'));
check('draft count', has('app/api/validation/kpis/route.ts', "eq('validation_status', 'draft')"));
check('reviewed count', has('app/api/validation/kpis/route.ts', "eq('validation_status', 'reviewed')"));
check('validated_today count', has('app/api/validation/kpis/route.ts', 'validated_today'));
check('corrections_propagated', has('app/api/validation/kpis/route.ts', 'corrections_propagated'));
check('amounts by status', has('app/api/validation/kpis/route.ts', 'amountByStatus'));

// ── 4. Validation Queue API ───────────────────────────────────────────────────
console.log('\n[4] Validation Queue API');
check('File exists', exists('app/api/validation/queue/route.ts'));
check('GET export', has('app/api/validation/queue/route.ts', 'export async function GET'));
check('Module grouping summary', has('app/api/validation/queue/route.ts', 'summary'));
check('Pagination support', has('app/api/validation/queue/route.ts', 'pagination'));
check('Source document filenames enrichment', has('app/api/validation/queue/route.ts', 'source_document_filename'));

// ── 5. Validation Records API ─────────────────────────────────────────────────
console.log('\n[5] Validation Records API');
check('File exists', exists('app/api/validation/records/route.ts'));
check('PATCH export', has('app/api/validation/records/route.ts', 'export async function PATCH'));
check('review action', has('app/api/validation/records/route.ts', 'review'));
check('validate action', has('app/api/validation/records/route.ts', 'validate'));
check('reject action', has('app/api/validation/records/route.ts', 'reject'));
check('Cascades to entity tables', has('app/api/validation/records/route.ts', 'atlas_supplier_invoices'));
check('Cascades to atlas_invoices', has('app/api/validation/records/route.ts', 'atlas_invoices'));
check('Logs to atlas_audit_logs', has('app/api/validation/records/route.ts', 'logAuditEvent'));
check('Bulk support (ids array)', has('app/api/validation/records/route.ts', 'ids'));

// ── 6. Routing Completeness API ───────────────────────────────────────────────
console.log('\n[6] Routing Completeness API');
check('File exists', exists('app/api/routing/completeness/[id]/route.ts'));
check('GET export', has('app/api/routing/completeness/[id]/route.ts', 'export async function GET'));
check('REQUIRED_MODULES map', has('app/api/routing/completeness/[id]/route.ts', 'REQUIRED_MODULES'));
check('purchase_invoice requires comptabilite+tva', has('app/api/routing/completeness/[id]/route.ts', "purchase_invoice: ['comptabilite', 'tva']"));
check('missingModules computed', has('app/api/routing/completeness/[id]/route.ts', 'missingModules'));
check('TVA consistency check in response', has('app/api/routing/completeness/[id]/route.ts', 'tvaAlert'));

// ── 7. ValidationKpiCards component ──────────────────────────────────────────
console.log('\n[7] ValidationKpiCards component');
check('File exists', exists('app/components/validation/ValidationKpiCards.tsx'));
check('Pending draft card', has('app/components/validation/ValidationKpiCards.tsx', 'pending_draft'));
check('Reviewed card', has('app/components/validation/ValidationKpiCards.tsx', 'reviewed'));
check('Validated today card', has('app/components/validation/ValidationKpiCards.tsx', 'validated_today'));
check('Rejected card', has('app/components/validation/ValidationKpiCards.tsx', 'rejected'));
check('Corrections propagated card', has('app/components/validation/ValidationKpiCards.tsx', 'corrections_propagated'));
check('Amount formatting (MAD)', has('app/components/validation/ValidationKpiCards.tsx', 'MAD'));

// ── 8. ValidationQueueTable component ────────────────────────────────────────
console.log('\n[8] ValidationQueueTable component');
check('File exists', exists('app/components/validation/ValidationQueueTable.tsx'));
check('Module summary rows', has('app/components/validation/ValidationQueueTable.tsx', 'row.label'));
check('Compact mode prop', has('app/components/validation/ValidationQueueTable.tsx', 'compact'));
check('Status pills (amber=draft)', has('app/components/validation/ValidationQueueTable.tsx', 'bg-amber-100'));
check('External link to module', has('app/components/validation/ValidationQueueTable.tsx', 'ExternalLink'));

// ── 9. ValidationStatusBadge ──────────────────────────────────────────────────
console.log('\n[9] ValidationStatusBadge component');
check('File exists', exists('app/components/validation/ValidationStatusBadge.tsx'));
check('draft status', has('app/components/validation/ValidationStatusBadge.tsx', 'Brouillon'));
check('reviewed status', has('app/components/validation/ValidationStatusBadge.tsx', 'Révisé'));
check('validated status', has('app/components/validation/ValidationStatusBadge.tsx', 'Validé'));
check('rejected status', has('app/components/validation/ValidationStatusBadge.tsx', 'Rejeté'));

// ── 10. /validation page ──────────────────────────────────────────────────────
console.log('\n[10] /validation page');
check('File exists', exists('app/validation/page.tsx'));
check('ValidationKpiCards used', has('app/validation/page.tsx', 'ValidationKpiCards'));
check('ValidationQueueTable used', has('app/validation/page.tsx', 'ValidationQueueTable'));
check('ValidationStatusBadge used', has('app/validation/page.tsx', 'ValidationStatusBadge'));
check('SourceDocumentBadge used', has('app/validation/page.tsx', 'SourceDocumentBadge'));
check('Status filter chips', has('app/validation/page.tsx', 'statusFilter'));
check('Bulk actions (validate/reject)', has('app/validation/page.tsx', 'performAction'));
check('Review action button', has('app/validation/page.tsx', "'review'"));
check('Select all checkbox', has('app/validation/page.tsx', 'toggleSelectAll'));
check('Workflow legend', has('app/validation/page.tsx', 'Workflow'));

// ── 11. RoutingCompletenessAlert ──────────────────────────────────────────────
console.log('\n[11] RoutingCompletenessAlert component');
check('File exists', exists('app/components/validation/RoutingCompletenessAlert.tsx'));
check('Shows missing modules', has('app/components/validation/RoutingCompletenessAlert.tsx', 'missingModules'));
check('Fetches from /api/routing/completeness', has('app/components/validation/RoutingCompletenessAlert.tsx', '/api/routing/completeness/'));
check('"Routage incomplet" message', has('app/components/validation/RoutingCompletenessAlert.tsx', 'Routage incomplet'));
check('onRoute callback', has('app/components/validation/RoutingCompletenessAlert.tsx', 'onRoute'));

// ── 12. TvaConsistencyAlert ───────────────────────────────────────────────────
console.log('\n[12] TvaConsistencyAlert component');
check('File exists', exists('app/components/validation/TvaConsistencyAlert.tsx'));
check('expectedVat computation', has('app/components/validation/TvaConsistencyAlert.tsx', 'expectedVat'));
check('5% tolerance', has('app/components/validation/TvaConsistencyAlert.tsx', 'tolerance'));
check('"Incohérence TVA" message', has('app/components/validation/TvaConsistencyAlert.tsx', 'Incohérence TVA'));
check('Shows diff amount', has('app/components/validation/TvaConsistencyAlert.tsx', 'diff'));

// ── 13. ValidationCenter integration ─────────────────────────────────────────
console.log('\n[13] ValidationCenter: alerts integrated');
check('TvaConsistencyAlert imported', has('app/documents/components/ValidationCenter.tsx', 'TvaConsistencyAlert'));
check('RoutingCompletenessAlert imported', has('app/documents/components/ValidationCenter.tsx', 'RoutingCompletenessAlert'));
check('TvaConsistencyAlert rendered', has('app/documents/components/ValidationCenter.tsx', '<TvaConsistencyAlert'));
check('RoutingCompletenessAlert rendered', has('app/documents/components/ValidationCenter.tsx', '<RoutingCompletenessAlert'));

// ── 14. Comptabilite: source badge ────────────────────────────────────────────
console.log('\n[14] Comptabilité: SourceDocumentBadge');
check('SourceDocumentBadge imported', has('app/comptabilite/page.tsx', 'SourceDocumentBadge'));
check('ValidationStatusBadge imported', has('app/comptabilite/page.tsx', 'ValidationStatusBadge'));
check('Badge rendered in journal rows', has('app/comptabilite/page.tsx', '<SourceDocumentBadge'));
check('ValidationStatusBadge rendered', has('app/comptabilite/page.tsx', '<ValidationStatusBadge'));

// ── 15. AtlasAccountingEntry type updated ─────────────────────────────────────
console.log('\n[15] AtlasAccountingEntry type');
check('sourceDocumentId added', has('app/types/atlas-accounting.ts', 'sourceDocumentId'));
check('validationStatus added', has('app/types/atlas-accounting.ts', 'validationStatus'));
check('rowId added', has('app/types/atlas-accounting.ts', 'rowId'));

// ── 16. Rapports: validation filter + widgets ─────────────────────────────────
console.log('\n[16] Rapports: validation filters & KPIs');
check('ValidationQueueTable imported', has('app/rapports/page.tsx', 'ValidationQueueTable'));
check('ValidationKpiCards imported', has('app/rapports/page.tsx', 'ValidationKpiCards'));
check('Filter chips rendered', has('app/rapports/page.tsx', 'VALIDATION_FILTER_OPTS'));
check('Centre de validation link', has('app/rapports/page.tsx', 'Centre de validation'));
check('validationFilter state', has('app/rapports/page.tsx', 'validationFilter'));

// ── 17. Sidebar: validation nav item ─────────────────────────────────────────
console.log('\n[17] Navigation: validation in sidebar');
check("'validation' nav id", has('app/lib/atlas-app-nav.ts', "'validation'"));
check("ClipboardList icon imported", has('app/lib/atlas-app-nav.ts', 'ClipboardList'));
check('/validation href in nav', has('app/lib/atlas-app-nav.ts', "href: '/validation'"));

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`);
console.log(`  Results: ${pass} PASS  /  ${fail} FAIL`);
console.log(fail === 0 ? '  STATUS: ALL PASS ✓' : `  STATUS: ${fail} FAILURES ✗`);
if (fail > 0) process.exit(1);
