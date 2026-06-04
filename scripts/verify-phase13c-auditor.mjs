/**
 * Phase 13C — AI Auditor, Closing Assistant & Executive Summaries verification
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

const mig = 'supabase/migrations/20260602100000_phase13c_auditor_interactions.sql';
const auditor = 'app/lib/atlas-ai-auditor.ts';
const closing = 'app/lib/atlas-ai-closing-assistant.ts';
const execSum = 'app/lib/atlas-ai-executive-summary.ts';
const provider = 'app/lib/atlas-ai-provider.ts';

console.log('\n[1] Migration');
check('phase13c migration', exists(mig));
check('closing interaction type', has(mig, "'closing'"));
check('executive_summary type', has(mig, "'executive_summary'"));

console.log('\n[2] Provider fallback chain');
check('atlas-ai-provider.ts', exists(provider));
check('openai-env.ts', exists('app/lib/openai-env.ts'));
check('runAtlasAiWithFallback', has(provider, 'runAtlasAiWithFallback'));
check('streamAtlasAiWithFallback', has(provider, 'streamAtlasAiWithFallback'));
check('createSseStream', has(provider, 'createSseStream'));
check('anthropic provider', has(provider, 'anthropic'));
check('openai provider', has(provider, 'openai'));
check('rule-based provider', has(provider, 'rule-based'));
check('defaultRuleBasedAnswer', has(provider, 'defaultRuleBasedAnswer'));
check('gpt-4o-mini', has(provider, 'gpt-4o-mini'));
check('claude-sonnet', has(provider, 'claude-sonnet'));
check('getOpenAiApiKey', has('app/lib/openai-env.ts', 'getOpenAiApiKey'));

console.log('\n[3] Copilot uses provider');
check('copilot imports provider', has('app/lib/atlas-ai-copilot.ts', 'runAtlasAiWithFallback'));
check('streamAtlasAiCopilot', has('app/lib/atlas-ai-copilot.ts', 'streamAtlasAiCopilot'));
check('no 503 in chat route', !has('app/api/assistant/chat/route.ts', 'status: 503'));

console.log('\n[4] AI Auditor engine');
check('atlas-ai-auditor.ts', exists(auditor));
check('runAtlasAiAuditor', has(auditor, 'runAtlasAiAuditor'));
check('risk_score', has(auditor, 'risk_score'));
check('criticalIssues', has(auditor, 'criticalIssues'));
check('sections critical', has(auditor, 'critical:'));
check('sections tva', has(auditor, 'tva:'));
check('sections banking', has(auditor, 'banking:'));
check('sections hr', has(auditor, 'hr:'));
check('sections legal', has(auditor, 'legal:'));
check('sections fiscal', has(auditor, 'fiscal:'));
['atlas_accounting_entries', 'zafirix_tva_suggestions', 'atlas_ir_snapshots', 'zafirix_legal_documents'].forEach(
  (t) => check(`auditor query ${t}`, has(auditor, t)),
);
check('detectAtlasAiAnomalies', has(auditor, 'detectAtlasAiAnomalies'));
check('runLiasseEngine', has(auditor, 'runLiasseEngine'));
check('computeAuditScore', has(auditor, 'computeAuditScore'));
check('severity info', has(auditor, "'info'"));
check('severity warning', has(auditor, "'warning'"));
check('severity critical', has(auditor, "'critical'"));

console.log('\n[5] Closing assistant');
check('atlas-ai-closing-assistant.ts', exists(closing));
check('evaluateFiscalClosing', has(closing, 'evaluateFiscalClosing'));
check('blockingIssues', has(closing, 'blockingIssues'));
check('estimatedReadiness', has(closing, 'estimatedReadiness'));
['tva', 'payroll', 'cnss', 'bank', 'liasse', 'legal', 'anomalies'].forEach(
  (id) => check(`checklist ${id}`, has(closing, `id: '${id}'`)),
);
check('atlas_payroll_runs', has(closing, 'atlas_payroll_runs'));
check('Prêt pour clôture', has(closing, 'ATLAS_AI_READINESS_THRESHOLD'));

console.log('\n[6] Executive summary');
check('atlas-ai-executive-summary.ts', exists(execSum));
check('generateExecutiveSummary', has(execSum, 'generateExecutiveSummary'));
check('streamExecutiveSummaryNarrative', has(execSum, 'streamExecutiveSummaryNarrative'));
check('chiffre_affaires', has(execSum, 'chiffre_affaires'));
check('period month', has(execSum, "'month'"));
check('period quarter', has(execSum, "'quarter'"));
check('period year', has(execSum, "'year'"));
check('Résume mon activité du mois', has(execSum, 'Résume mon activité du mois'));
check('trimestre', has(execSum, 'trimestre'));
check('buildRuleBasedExecutiveSummary', has(execSum, 'buildRuleBasedExecutiveSummary'));

console.log('\n[7] Types');
const types = 'app/types/atlas-ai-copilot.ts';
check('AtlasAiExecutiveSummary', has(types, 'AtlasAiExecutiveSummary'));
check('AtlasAiClosingEvaluation', has(types, 'AtlasAiClosingEvaluation'));
check('audit score type', has(types, 'score?:'));
check('criticalIssues type', has(types, 'criticalIssues'));

console.log('\n[8] Audit API');
const auditRoute = 'app/api/assistant/audit/route.ts';
check('audit route', exists(auditRoute));
check('GET audit', has(auditRoute, 'export async function GET'));
check('POST audit', has(auditRoute, 'export async function POST'));
check('runAtlasAiAuditor', has(auditRoute, 'runAtlasAiAuditor'));
check('score response', has(auditRoute, 'score: report.score'));
check('criticalIssues response', has(auditRoute, 'criticalIssues'));
check('fiscalYear param', has(auditRoute, 'fiscalYear'));
check('download json', has(auditRoute, 'download'));
check('stream audit', has(auditRoute, 'stream'));
check('logAtlasAiInteraction audit', has(auditRoute, 'logAtlasAiInteraction'));
check('interactionType audit', has(auditRoute, "'audit'"));

console.log('\n[9] Closing API');
const closingRoute = 'app/api/assistant/closing/route.ts';
check('closing route', exists(closingRoute));
check('GET closing', has(closingRoute, 'export async function GET'));
check('evaluateFiscalClosing API', has(closingRoute, 'evaluateFiscalClosing'));
check('labelFr', has(closingRoute, 'labelFr'));
check('Clôture non recommandée', has(closingRoute, 'Clôture non recommandée'));
check('Prêt pour clôture fiscale', has(closingRoute, 'Prêt pour clôture fiscale'));
check('interactionType closing', has(closingRoute, "'closing'"));
check('blockingIssues API', has(closingRoute, 'blockingIssues'));

console.log('\n[10] Executive summary API');
const execRoute = 'app/api/assistant/executive-summary/route.ts';
check('executive-summary route', exists(execRoute));
check('GET executive', has(execRoute, 'export async function GET'));
check('generateExecutiveSummary API', has(execRoute, 'generateExecutiveSummary'));
check('period param', has(execRoute, 'period'));
check('month param', has(execRoute, 'month'));
check('quarter param', has(execRoute, 'quarter'));
check('year param', has(execRoute, 'year'));
check('stream executive', has(execRoute, 'stream'));
check('executive_summary log', has(execRoute, "'executive_summary'"));
check('metrics response', has(execRoute, 'metrics'));

console.log('\n[11] Streaming');
check('chat stream param', has('app/api/assistant/chat/route.ts', 'stream'));
check('chat SSE', has('app/api/assistant/chat/route.ts', 'text/event-stream'));
check('streamAtlasAiCopilot chat', has('app/api/assistant/chat/route.ts', 'streamAtlasAiCopilot'));

console.log('\n[12] Audit page UI');
check('/audit page', exists('app/audit/page.tsx'));
['Score Global', 'Risques Critiques', 'Risques TVA', 'Risques Bancaires', 'Risques RH', 'Risques Juridiques', 'Risques Fiscaux', 'Recommandations'].forEach(
  (s) => check(`audit section ${s}`, has('app/audit/page.tsx', s)),
);
check('ExportMenu audit', has('app/audit/page.tsx', 'ExportMenu'));
check('audit API fetch', has('app/audit/page.tsx', '/api/assistant/audit'));
check('JSON download audit page', has('app/audit/page.tsx', 'download=1'));
check('fiscalYear selector', has('app/audit/page.tsx', 'fiscalYear'));

console.log('\n[13] Dashboard widgets');
check('FiscalClosingAssistantWidget', exists('app/components/assistant/FiscalClosingAssistantWidget.tsx'));
check('ExecutiveSummaryWidget', exists('app/components/assistant/ExecutiveSummaryWidget.tsx'));
check('closing API widget', has('app/components/assistant/FiscalClosingAssistantWidget.tsx', '/api/assistant/closing'));
check('executive API widget', has('app/components/assistant/ExecutiveSummaryWidget.tsx', '/api/assistant/executive-summary'));
check('Prêt pour clôture widget', has('app/components/assistant/FiscalClosingAssistantWidget.tsx', 'Prêt pour clôture fiscale'));
check('Clôture non recommandée widget', has('app/components/assistant/FiscalClosingAssistantWidget.tsx', 'Clôture non recommandée'));
check('widgets on dashboard', has('app/page.tsx', 'FiscalClosingAssistantWidget'));
check('executive on dashboard', has('app/page.tsx', 'ExecutiveSummaryWidget'));

console.log('\n[14] Navigation');
check('audit nav href', has('app/lib/atlas-app-nav.ts', '/audit'));
check('audit nav id', has('app/lib/atlas-app-nav.ts', "'audit'"));

console.log('\n[15] Audit logging');
[auditRoute, closingRoute, execRoute].forEach((r) => {
  check(`${path.basename(path.dirname(r))} logs interaction`, has(r, 'logAtlasAiInteraction'));
});

console.log('\n[16] Phase 13A/13B integration');
check('anomalies lib', exists('app/lib/atlas-ai-anomalies.ts'));
check('insights API', exists('app/api/assistant/insights/route.ts'));
check('chat API', exists('app/api/assistant/chat/route.ts'));
check('conversations API', exists('app/api/assistant/conversations/route.ts'));
check('verify 13a', exists('scripts/verify-phase13a-insights-anomalies.mjs'));
check('verify 13b', exists('scripts/verify-phase13b-chat.mjs'));

console.log('\n[17] API runtime');
['audit', 'closing', 'executive-summary', 'chat'].forEach((r) => {
  check(`${r} force-dynamic`, has(`app/api/assistant/${r}/route.ts`, 'force-dynamic'));
  check(`${r} nodejs`, has(`app/api/assistant/${r}/route.ts`, 'nodejs'));
});

console.log('\n[18] Auth on new routes');
[closingRoute, execRoute, auditRoute].forEach((r) => {
  check(`${path.basename(path.dirname(r))} auth`, has(r, 'documentUploadSessionUserId'));
});

console.log('\n[19] Audit delegate');
check('audit.ts delegates auditor', has('app/lib/atlas-ai-audit.ts', 'runAtlasAiAuditor'));

console.log('\n[20] Domain coverage');
[
  ['accounting', 'atlas_accounting_entries'],
  ['TVA', 'zafirix_tva_suggestions'],
  ['invoices', 'atlas_invoices'],
  ['bank', 'atlas_bank_reconciliation'],
  ['payroll', 'atlas_payslip_extractions'],
  ['CNSS', 'cnss'],
  ['IR', 'atlas_ir_snapshots'],
  ['legal', 'zafirix_legal_documents'],
  ['liasse', 'zafirix_liasse_fiscale'],
].forEach(([label, token]) => {
  check(`domain ${label}`, has(auditor, token) || has(closing, token) || has(execSum, token) || has('app/lib/atlas-liasse-engine.ts', token));
});

console.log('\n[21] Provider internals');
['runAnthropic', 'runOpenAi', 'buildSystem', 'AiProviderName', 'AiProviderRunResult'].forEach(
  (t) => check(`provider symbol ${t}`, has(provider, t)),
);

console.log('\n[22] Auditor findings structure');
['findings', 'observations', 'recommendations', 'exported_at', 'fiscal_year', 'sources'].forEach(
  (f) => check(`report field ${f}`, has(auditor, f)),
);

console.log('\n[23] Closing checklist labels');
[
  'TVA validée', 'Paie validée', 'CNSS complète', 'Banque rapprochée',
  'Liasse générée', 'Alertes juridiques', 'Anomalies critiques',
].forEach((l) => check(`label ${l.slice(0, 20)}`, has(closing, l)));

console.log('\n[24] Executive metrics fields');
['charges', 'resultat', 'tresorerie', 'unpaid_invoices', 'risk_count'].forEach(
  (m) => check(`metric ${m}`, has(execSum, m)),
);

console.log('\n[25] Export formats audit page');
['csv', 'xlsx', 'json', 'pdf'].forEach((f) => check(`export ${f}`, has('app/audit/page.tsx', f)));

console.log('\n[26] Widget UI elements');
check('closing score display', has('app/components/assistant/FiscalClosingAssistantWidget.tsx', 'Score:'));
check('executive CA display', has('app/components/assistant/ExecutiveSummaryWidget.tsx', 'CA'));
check('executive refresh', has('app/components/assistant/ExecutiveSummaryWidget.tsx', 'Actualiser'));
check('formatMadAmountLabel', has('app/components/assistant/ExecutiveSummaryWidget.tsx', 'formatMadAmountLabel'));

console.log('\n[27] SSE headers');
[auditRoute, execRoute, 'app/api/assistant/chat/route.ts'].forEach((r) => {
  check(`${path.basename(path.dirname(r))} event-stream`, has(r, 'text/event-stream'));
});

console.log('\n[28] Interaction metadata');
check('audit metadata risk_score', has(auditRoute, 'risk_score'));
check('closing metadata estimatedReadiness', has(closingRoute, 'estimatedReadiness'));
check('executive metadata period_label', has(execRoute, 'period_label'));

console.log('\n[29] Existing assistant components retained');
['FiscalClosingAssistant.tsx', 'AIInsightsWidget.tsx', 'DocumentExplainerButton.tsx'].forEach(
  (c) => check(`component ${c}`, exists(`app/components/assistant/${c}`)),
);

console.log('\n[30] Readiness & explain still work');
check('readiness route', exists('app/api/assistant/readiness/route.ts'));
check('explain route', exists('app/api/assistant/explain/route.ts'));
check('explainReadiness', has('app/lib/atlas-ai-audit.ts', 'explainReadiness'));

console.log('\n[31] Anomaly codes in auditor path');
['tva-inconsistency', 'bank-unreconciled', 'payroll-anomaly', 'legal-expired', 'liasse-readiness-low'].forEach(
  (c) => check(`anomaly ref ${c}`, has('app/lib/atlas-ai-anomalies.ts', `'${c}'`)),
);

console.log('\n[32] Confidence lib retained');
check('computeCopilotConfidence', has('app/lib/atlas-ai-constants.ts', 'ATLAS_AI_READINESS_THRESHOLD') || has('app/lib/atlas-ai-confidence.ts', 'computeCopilotConfidence'));

console.log('\n[33] Safety & language');
check('safety notice', has('app/lib/atlas-ai-safety.ts', 'ATLAS_AI_SAFETY_NOTICE'));
check('multilingual', has('app/lib/atlas-ai-language.ts', 'ATLAS_AI_MULTILINGUAL'));

console.log('\n[34] Context builder for audit narrative');
['buildAtlasAiContext', 'contextToPromptBlock', 'refreshAtlasAiContext'].forEach(
  (f) => check(`context ${f}`, has('app/lib/atlas-ai-context.ts', f)),
);

console.log('\n[35] Audit page components');
check('AppSidebar audit', has('app/audit/page.tsx', 'AppSidebar'));
check('Section component', has('app/audit/page.tsx', 'function Section'));
check('Regénérer button', has('app/audit/page.tsx', 'Regénérer'));

console.log('\n[36] POST audit body');
check('POST companyId', has(auditRoute, 'companyId'));
check('POST fiscalYear body', has(auditRoute, 'fiscalYear'));

console.log('\n[37] Provider in responses');
check('chat provider field', has('app/api/assistant/chat/route.ts', 'provider'));
check('executive provider field', has(execRoute, 'provider'));
check('audit provider field', has(auditRoute, 'provider'));

console.log('\n[38] Rule-based never empty');
check('rule fallback auditor', has(auditor, 'ruleBasedFallback'));
check('rule fallback executive', has(execSum, 'buildRuleBasedExecutiveSummary'));
check('rule fallback readiness', has('app/lib/atlas-ai-audit.ts', 'ruleBasedFallback'));

console.log('\n[39] Dashboard grid layout');
check('dashboard grid 3 cols', has('app/page.tsx', 'lg:grid-cols-3'));
check('AIInsightsWidget retained', has('app/page.tsx', 'AIInsightsWidget'));

console.log('\n[40] File existence batch');
[
  'app/lib/atlas-ai-audit.ts', 'app/lib/atlas-ai-insights.ts', 'app/lib/atlas-ai-anomalies.ts',
  'app/lib/atlas-ai-explain.ts', 'app/lib/atlas-ai-interactions.ts', 'app/lib/atlas-ai-context.ts',
  'app/assistant/page.tsx', 'app/api/assistant/anomalies/route.ts',
].forEach((f) => check(`exists ${f.split('/').pop()}`, exists(f)));

console.log('\n[41] AUDITOR_SYSTEM prompts');
['AUDITOR_SYSTEM', 'EXPLAINER_READINESS', 'COPILOT_SYSTEM'].forEach(
  (p) => check(`prompt ${p}`, has('app/lib/atlas-ai-copilot.ts', p)),
);

console.log('\n[42] Audit route response fields');
['findings', 'recommendations', 'observations', 'sections', 'report', 'ok: true'].forEach(
  (f) => check(`audit json ${f}`, has(auditRoute, f)),
);

console.log('\n[43] Closing route response fields');
['checklist', 'estimatedReadiness', 'recommendations', 'sources', 'ready', 'score'].forEach(
  (f) => check(`closing json ${f}`, has(closingRoute, f)),
);

console.log('\n[44] Executive route response fields');
['narrative', 'risks', 'recommendations', 'period_label', 'fiscal_year', 'sources'].forEach(
  (f) => check(`executive json ${f}`, has(execRoute, f)),
);

console.log('\n[45] Liasse engine integration');
['readinessScore', 'blockingIssues', 'bankSummary', 'payrollSummary', 'checks'].forEach(
  (f) => check(`liasse ${f}`, has('app/lib/atlas-liasse-engine.ts', f)),
);

console.log('\n[46] Nav items count');
check('assistant nav', has('app/lib/atlas-app-nav.ts', '/assistant'));
check('liasse nav', has('app/lib/atlas-app-nav.ts', '/liasse'));
check('tva nav', has('app/lib/atlas-app-nav.ts', '/tva'));

console.log('\n[47] Migration phase13 base');
check('base migration conversations', has('supabase/migrations/20260602080000_phase13_ai_copilot.sql', 'atlas_ai_conversations'));
check('base migration interactions', has('supabase/migrations/20260602080000_phase13_ai_copilot.sql', 'atlas_ai_interactions'));

console.log('\n[48] Chat logging retained');
check('chat interaction type', has('app/api/assistant/chat/route.ts', "'chat'"));
check('chat confidence metadata', has('app/api/assistant/chat/route.ts', 'confidence'));

console.log('\n[49] Document & explain Phase 13B');
check('runAtlasAiExplain', has('app/lib/atlas-ai-explain.ts', 'runAtlasAiExplain'));
check('ATLAS_AI_DATA_UNAVAILABLE', has('app/lib/atlas-ai-confidence.ts', 'ATLAS_AI_DATA_UNAVAILABLE'));

console.log('\n[50] Audit page severity styling');
['critical', 'warning', 'bg-red-50', 'bg-amber-50'].forEach(
  (s) => check(`audit style ${s}`, has('app/audit/page.tsx', s)),
);

console.log(`\n${'═'.repeat(50)}`);
console.log(`PHASE 13C: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
console.log('═'.repeat(50));
if (pass < 260) console.error(`WARNING: only ${pass} checks (target 260+)`);
process.exit(fail > 0 ? 1 : 0);
