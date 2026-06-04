/**
 * Phase 13A — AI Insights + Anomaly Engine verification
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

const mig13 = 'supabase/migrations/20260602080000_phase13_ai_copilot.sql';
const mig13a = 'supabase/migrations/20260602080100_phase13a_insights_anomalies.sql';

console.log('\n[1] Migrations');
check('phase13 copilot migration', exists(mig13));
check('atlas_ai_interactions table', has(mig13, 'atlas_ai_interactions'));
check('atlas_ai_anomalies table', has(mig13, 'atlas_ai_anomalies'));
check('interaction_type insight', has(mig13, "'insight'"));
check('severity info warning critical', has(mig13, "'info', 'warning', 'critical'"));
check('phase13a index migration', exists(mig13a));

console.log('\n[2] Constants & types');
check('atlas-ai-constants.ts', exists('app/lib/atlas-ai-constants.ts'));
check('READINESS_THRESHOLD 80', has('app/lib/atlas-ai-constants.ts', 'ATLAS_AI_READINESS_THRESHOLD = 80'));
check('atlas-ai-copilot types', exists('app/types/atlas-ai-copilot.ts'));
check('AtlasAiInsight type', has('app/types/atlas-ai-copilot.ts', 'AtlasAiInsight'));

console.log('\n[3] Anomaly engine');
const anom = 'app/lib/atlas-ai-anomalies.ts';
check('anomaly lib', exists(anom));
['tva-inconsistency', 'bank-unreconciled', 'payroll-anomaly', 'liasse-readiness-low', 'validation-rejected', 'legal-expired'].forEach(
  (c) => check(`code ${c}`, has(anom, `'${c}'`)),
);
check('zafirix_legal_documents expired', has(anom, 'zafirix_legal_documents'));
check('detectAtlasAiAnomalies', has(anom, 'detectAtlasAiAnomalies'));
check('persistAtlasAiAnomalies', has(anom, 'persistAtlasAiAnomalies'));
check('zafirix_tva_suggestions', has(anom, 'zafirix_tva_suggestions'));
check('atlas_bank_reconciliation', has(anom, 'atlas_bank_reconciliation'));
check('validation_status rejected', has(anom, "eq('validation_status', 'rejected')"));
check('runLiasseEngine', has(anom, 'runLiasseEngine'));

console.log('\n[4] Insights lib');
const ins = 'app/lib/atlas-ai-insights.ts';
check('insights lib', exists(ins));
check('generateAtlasAiInsights', has(ins, 'generateAtlasAiInsights'));
check('logAtlasAiInteraction', has(ins, 'logAtlasAiInteraction'));
check('interactionType insight', has(ins, "'insight'"));
check('persist before insights', has(ins, 'persistAtlasAiAnomalies'));

console.log('\n[5] APIs');
check('insights route', exists('app/api/assistant/insights/route.ts'));
check('insights interaction_id', has('app/api/assistant/insights/route.ts', 'interaction_id'));
check('anomalies route', exists('app/api/assistant/anomalies/route.ts'));
check('anomalies refresh param', has('app/api/assistant/anomalies/route.ts', 'refresh'));
check('anomalies POST', has('app/api/assistant/anomalies/route.ts', 'export async function POST'));
check('interactions logging anomalies', has('app/api/assistant/anomalies/route.ts', 'logAtlasAiInteraction'));

console.log('\n[6] Interactions lib');
check('atlas-ai-interactions.ts', exists('app/lib/atlas-ai-interactions.ts'));
check('logAtlasAiInteraction export', has('app/lib/atlas-ai-interactions.ts', 'export async function logAtlasAiInteraction'));

console.log('\n[7] Dashboard widget');
const w = 'app/components/assistant/AIInsightsWidget.tsx';
check('AIInsightsWidget', exists(w));
check('fetch insights API', has(w, '/api/assistant/insights'));
check('readiness display', has(w, 'Prêt pour clôture fiscale'));
check('widget on dashboard', has('app/page.tsx', 'AIInsightsWidget'));
check('no AiActionBar on dashboard', !has('app/page.tsx', 'AiActionBar'));

console.log('\n[8] API runtime');
['insights', 'anomalies'].forEach((r) => {
  check(`${r} force-dynamic`, has(`app/api/assistant/${r}/route.ts`, 'force-dynamic'));
  check(`${r} nodejs`, has(`app/api/assistant/${r}/route.ts`, 'nodejs'));
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`PHASE 13A: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
console.log('═'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
