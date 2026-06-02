/**
 * Phase 12 Verification — Liasse Fiscale (Phase 11 bank/payroll integration)
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

console.log('\n[1] Migration liasse_fiscale');
check('migration exists', exists('supabase/migrations/20260602070000_liasse_fiscale.sql'));
check('zafirix_liasse_fiscale table', has('supabase/migrations/20260602070000_liasse_fiscale.sql', 'zafirix_liasse_fiscale'));
check('readiness_score column', has('supabase/migrations/20260602070000_liasse_fiscale.sql', 'readiness_score'));
check('blocking_issues jsonb', has('supabase/migrations/20260602070000_liasse_fiscale.sql', 'blocking_issues'));
check('admin_override_reason', has('supabase/migrations/20260602070000_liasse_fiscale.sql', 'admin_override_reason'));
check('status draft validated filed', has('supabase/migrations/20260602070000_liasse_fiscale.sql', "'draft','validated','filed'"));

console.log('\n[2] Types');
check('atlas-liasse.ts', exists('app/types/atlas-liasse.ts'));
check('LiasseFiscalePayload', has('app/types/atlas-liasse.ts', 'LiasseFiscalePayload'));
check('LiasseAuditPackage', has('app/types/atlas-liasse.ts', 'LiasseAuditPackage'));
check('LiasseReadinessFactors', has('app/types/atlas-liasse.ts', 'LiasseReadinessFactors'));

console.log('\n[3] Engine');
check('atlas-liasse-engine.ts', exists('app/lib/atlas-liasse-engine.ts'));
check('buildLiassePayload', has('app/lib/atlas-liasse-engine.ts', 'buildLiassePayload'));
check('zafirix_bank_transactions', has('app/lib/atlas-liasse-engine.ts', 'zafirix_bank_transactions'));
check('atlas_payslip_extractions', has('app/lib/atlas-liasse-engine.ts', 'atlas_payslip_extractions'));
check('atlas_bank_reconciliation', has('app/lib/atlas-liasse-engine.ts', 'atlas_bank_reconciliation'));
check('canValidateOrFile', has('app/lib/atlas-liasse-engine.ts', 'canValidateOrFile'));
check('buildAuditPackage', has('app/lib/atlas-liasse-engine.ts', 'buildAuditPackage'));
check('readiness_score weights', has('app/lib/atlas-liasse-engine.ts', 'readiness_score'));
check('bilan-imbalance check', has('app/lib/atlas-liasse-engine.ts', 'bilan-imbalance'));
check('bank-unreconciled', has('app/lib/atlas-liasse-engine.ts', 'bank-unreconciled'));
check('cnss-missing', has('app/lib/atlas-liasse-engine.ts', 'cnss-missing'));
check('tva-inconsistency', has('app/lib/atlas-liasse-engine.ts', 'tva-inconsistency'));
check('invoice-paid-no-bank', has('app/lib/atlas-liasse-engine.ts', 'invoice-paid-no-bank'));

console.log('\n[4] Server + APIs');
check('atlas-liasse-server.ts', exists('app/lib/atlas-liasse-server.ts'));
check('generateLiasse', has('app/lib/atlas-liasse-server.ts', 'generateLiasse'));
check('missingRequiredSections', has('app/lib/atlas-liasse-server.ts', 'missingRequiredSections'));
check('api/liasse route', exists('app/api/liasse/route.ts'));
check('api/liasse/readiness', exists('app/api/liasse/readiness/route.ts'));
check('api/liasse/audit-package', exists('app/api/liasse/audit-package/route.ts'));
check('PATCH validate/filed', has('app/api/liasse/route.ts', "status?: 'validated' | 'filed'"));
check('adminOverrideReason', has('app/api/liasse/route.ts', 'adminOverrideReason'));

console.log('\n[5] UI');
check('liasse page', exists('app/liasse/page.tsx'));
check('readiness display', has('app/liasse/page.tsx', 'Prêt pour clôture fiscale'));
check('LiasseReadinessWidget', exists('app/components/dashboard/LiasseReadinessWidget.tsx'));
check('nav liasse', has('app/lib/atlas-app-nav.ts', "href: '/liasse'"));
check('dashboard widget import', has('app/page.tsx', 'LiasseReadinessWidget'));

console.log('\n[6] Dashboard alerts');
check('liasse-bank-unreconciled', has('app/api/dashboard/alerts/route.ts', 'liasse-bank-unreconciled'));
check('liasse-payroll-draft', has('app/api/dashboard/alerts/route.ts', 'liasse-payroll-draft'));
check('liasse-cnss-missing', has('app/api/dashboard/alerts/route.ts', 'liasse-cnss-missing'));
check('liasse-tva-inconsistency', has('app/api/dashboard/alerts/route.ts', 'liasse-tva-inconsistency'));
check('liasse-not-generated', has('app/api/dashboard/alerts/route.ts', 'liasse-not-generated'));

console.log('\n[7] Audit log entity');
check('liasse_fiscale entity type', has('app/lib/atlas-audit-log.ts', 'liasse_fiscale'));

console.log(`\n── Phase 12: ${pass} PASS / ${fail} FAIL ──\n`);
process.exit(fail > 0 ? 1 : 0);
