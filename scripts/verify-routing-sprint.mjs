/**
 * Local verification: DOCUMENTS IA → FULL PLATFORM INTEGRATION
 *
 * Tests routing matrix, API routes, duplicate guard, correction propagation.
 * No network calls — purely structural + logic verification.
 */

import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
let pass = 0;
let fail = 0;

function check(label, result) {
  if (result) {
    console.log(`  ✓ PASS  ${label}`);
    pass++;
  } else {
    console.error(`  ✗ FAIL  ${label}`);
    fail++;
  }
}

function fileContains(file, text) {
  try {
    return readFileSync(path.join(ROOT, file), 'utf8').includes(text);
  } catch {
    return false;
  }
}

function fileExists(file) {
  return existsSync(path.join(ROOT, file));
}

// ── 1. Migration ─────────────────────────────────────────────────────────────
console.log('\n[1] Migration: zafirix_routing_records');
check('File exists', fileExists('supabase/migrations/20260602030000_routing_registry.sql'));
check('zafirix_routing_records table', fileContains('supabase/migrations/20260602030000_routing_registry.sql', 'create table if not exists public.zafirix_routing_records'));
check('Unique dedup index', fileContains('supabase/migrations/20260602030000_routing_registry.sql', 'zafirix_routing_records_dedup_idx'));
check('zafirix_legal_documents table', fileContains('supabase/migrations/20260602030000_routing_registry.sql', 'create table if not exists public.zafirix_legal_documents'));
check('atlas_invoices source columns', fileContains('supabase/migrations/20260602030000_routing_registry.sql', 'add column if not exists source_document_id'));
check('RLS policies', fileContains('supabase/migrations/20260602030000_routing_registry.sql', 'enable row level security'));

// ── 2. Routing Matrix ─────────────────────────────────────────────────────────
console.log('\n[2] Routing Matrix: atlas-document-routing.ts');
check('File exists', fileExists('app/lib/atlas-document-routing.ts'));
check('purchase_invoice routing', fileContains('app/lib/atlas-document-routing.ts', 'purchase_invoice'));
check('sales_invoice routing', fileContains('app/lib/atlas-document-routing.ts', 'sales_invoice'));
check('bank_statement routing', fileContains('app/lib/atlas-document-routing.ts', 'bank_statement'));
check('payroll_slip routing', fileContains('app/lib/atlas-document-routing.ts', 'payroll_slip'));
check('legal_contract routing', fileContains('app/lib/atlas-document-routing.ts', 'legal_contract'));
check('company_statutes routing', fileContains('app/lib/atlas-document-routing.ts', 'company_statutes'));
check('cnss_document routing', fileContains('app/lib/atlas-document-routing.ts', 'cnss_document'));
check('vat_declaration routing', fileContains('app/lib/atlas-document-routing.ts', 'vat_declaration'));
check('isConfidentEnoughToRoute exported', fileContains('app/lib/atlas-document-routing.ts', 'isConfidentEnoughToRoute'));
check('STRICT_CONFIDENCE_MODULES exported', fileContains('app/lib/atlas-document-routing.ts', 'STRICT_CONFIDENCE_MODULES'));

// ── 3. Route-to API ───────────────────────────────────────────────────────────
console.log('\n[3] Route-to API: hardened with duplicate guard');
check('File exists', fileExists('app/api/documents/[id]/route-to/route.ts'));
check('checkDuplicate function', fileContains('app/api/documents/[id]/route-to/route.ts', 'checkDuplicate'));
check('registerRouting function', fileContains('app/api/documents/[id]/route-to/route.ts', 'registerRouting'));
check('Duplicate response { duplicate: true }', fileContains('app/api/documents/[id]/route-to/route.ts', 'duplicate: true'));
check('Sales invoice routing (factures group)', fileContains('app/api/documents/[id]/route-to/route.ts', 'routeSalesInvoice'));
check('Bank statement routing', fileContains('app/api/documents/[id]/route-to/route.ts', 'routeBankStatement'));
check('Payroll slip routing', fileContains('app/api/documents/[id]/route-to/route.ts', 'routePayrollSlip'));
check('Legal document routing', fileContains('app/api/documents/[id]/route-to/route.ts', 'routeLegalDocument'));
check('Audit log per module', fileContains('app/api/documents/[id]/route-to/route.ts', 'moduleEventMap'));
check('zafirix_routing_records insert', fileContains('app/api/documents/[id]/route-to/route.ts', 'zafirix_routing_records'));

// ── 4. Correction Propagation ─────────────────────────────────────────────────
console.log('\n[4] Correction Propagation API');
check('File exists', fileExists('app/api/documents/[id]/propagate-corrections/route.ts'));
check('PATCH method exported', fileContains('app/api/documents/[id]/propagate-corrections/route.ts', 'export async function PATCH'));
check('Propagates to supplier_invoices', fileContains('app/api/documents/[id]/propagate-corrections/route.ts', 'atlas_supplier_invoices'));
check('Propagates to accounting_entries', fileContains('app/api/documents/[id]/propagate-corrections/route.ts', 'atlas_accounting_entries'));
check('Propagates to tva_suggestions', fileContains('app/api/documents/[id]/propagate-corrections/route.ts', 'zafirix_tva_suggestions'));
check('Propagates to atlas_invoices', fileContains('app/api/documents/[id]/propagate-corrections/route.ts', 'atlas_invoices'));
check('Blocks validated records (never overwrites)', fileContains('app/api/documents/[id]/propagate-corrections/route.ts', 'already_validated'));
check('Returns blocked list', fileContains('app/api/documents/[id]/propagate-corrections/route.ts', 'blocked'));
check('Logs correction_propagated event', fileContains('app/api/documents/[id]/propagate-corrections/route.ts', 'correction_propagated'));

// ── 5. SourceDocumentBadge ────────────────────────────────────────────────────
console.log('\n[5] SourceDocumentBadge component');
check('File exists', fileExists('app/components/SourceDocumentBadge.tsx'));
check('Compact variant', fileContains('app/components/SourceDocumentBadge.tsx', "variant === 'compact'"));
check('Full variant with "Voir document source"', fileContains('app/components/SourceDocumentBadge.tsx', 'Voir document source'));
check('Links to /documents', fileContains('app/components/SourceDocumentBadge.tsx', '/documents?highlight='));
check('Returns null when no sourceDocumentId', fileContains('app/components/SourceDocumentBadge.tsx', 'if (!sourceDocumentId) return null'));

// ── 6. Factures integration ────────────────────────────────────────────────────
console.log('\n[6] Factures page: source document badge');
check('Imports SourceDocumentBadge', fileContains('app/factures/page.tsx', 'SourceDocumentBadge'));
check('sourceDocumentId in FactureRow type', fileContains('app/factures/page.tsx', 'sourceDocumentId'));
check('Badge rendered in invoice row', fileContains('app/factures/page.tsx', '<SourceDocumentBadge'));

// ── 7. ValidationCenter ───────────────────────────────────────────────────────
console.log('\n[7] ValidationCenter: routing UI');
check('Confidence gate warning', fileContains('app/documents/components/ValidationCenter.tsx', 'isConfidentEnoughToRoute'));
check('STRICT_CONFIDENCE_MODULES check', fileContains('app/documents/components/ValidationCenter.tsx', 'STRICT_CONFIDENCE_MODULES'));
check('Duplicate warning display', fileContains('app/documents/components/ValidationCenter.tsx', 'duplicateWarning'));
check('"Déjà envoyé" message', fileContains('app/documents/components/ValidationCenter.tsx', 'Déjà envoyé vers'));
check('handleRouteAll (Tout envoyer)', fileContains('app/documents/components/ValidationCenter.tsx', 'handleRouteAll'));
check('"Tout envoyer" button', fileContains('app/documents/components/ValidationCenter.tsx', 'Tout envoyer'));
check('routedModules state (checkmarks)', fileContains('app/documents/components/ValidationCenter.tsx', 'routedModules'));
check('Already-routed green checkmark row', fileContains('app/documents/components/ValidationCenter.tsx', 'alreadyRouted'));

// ── 8. AtlasInvoice type updated ──────────────────────────────────────────────
console.log('\n[8] AtlasInvoice type traceability');
check('sourceDocumentId field added', fileContains('app/types/atlas-invoice.ts', 'sourceDocumentId'));
check('generatedBy field added', fileContains('app/types/atlas-invoice.ts', 'generatedBy'));
check('validationStatus field added', fileContains('app/types/atlas-invoice.ts', 'validationStatus'));
check('metadata field added', fileContains('app/types/atlas-invoice.ts', 'metadata'));

// ── 9. Event types ────────────────────────────────────────────────────────────
console.log('\n[9] Document event types');
check('routed_to_comptabilite', fileContains('app/lib/atlas-document-events.ts', 'routed_to_comptabilite'));
check('routed_to_factures', fileContains('app/lib/atlas-document-events.ts', 'routed_to_factures'));
check('routed_to_rh', fileContains('app/lib/atlas-document-events.ts', 'routed_to_rh'));
check('routed_to_juridique', fileContains('app/lib/atlas-document-events.ts', 'routed_to_juridique'));
check('correction_propagated', fileContains('app/lib/atlas-document-events.ts', 'correction_propagated'));
check('downstream_record_created', fileContains('app/lib/atlas-document-events.ts', 'downstream_record_created'));

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`);
console.log(`  Results: ${pass} PASS  /  ${fail} FAIL`);
if (fail === 0) {
  console.log('  STATUS: ALL PASS ✓');
} else {
  console.log(`  STATUS: ${fail} FAILURES ✗`);
  process.exit(1);
}
