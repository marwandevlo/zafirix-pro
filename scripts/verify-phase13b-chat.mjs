/**
 * Phase 13B — Accounting & Fiscal Copilot Chat verification (200+ structural checks)
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
const chatRoute = 'app/api/assistant/chat/route.ts';
const explainRoute = 'app/api/assistant/explain/route.ts';
const convRoute = 'app/api/assistant/conversations/route.ts';
const convIdRoute = 'app/api/assistant/conversations/[id]/route.ts';
const explainLib = 'app/lib/atlas-ai-explain.ts';
const confidenceLib = 'app/lib/atlas-ai-confidence.ts';
const copilotLib = 'app/lib/atlas-ai-copilot.ts';
const contextLib = 'app/lib/atlas-ai-context.ts';
const interactionsLib = 'app/lib/atlas-ai-interactions.ts';
const assistantPage = 'app/assistant/page.tsx';
const typesFile = 'app/types/atlas-ai-copilot.ts';

// ── 1. Migrations & schema ───────────────────────────────────────────────────
console.log('\n[1] Migrations & schema');
check('phase13 migration', exists(mig13));
['atlas_ai_conversations', 'atlas_ai_interactions', 'atlas_ai_context', 'atlas_ai_anomalies'].forEach(
  (t) => check(`table ${t}`, has(mig13, t)),
);
['chat', 'explain', 'audit', 'readiness', 'insight'].forEach(
  (t) => check(`interaction_type ${t}`, has(mig13, `'${t}'`)),
);
check('conversations status active archived', has(mig13, "'active', 'archived'"));
check('RLS conversations', has(mig13, 'atlas_ai_conversations_own'));
check('RLS interactions', has(mig13, 'atlas_ai_interactions_own'));
check('FK conversation_id', has(mig13, 'conversation_id uuid references'));

// ── 2. Types ───────────────────────────────────────────────────────────────────
console.log('\n[2] Types');
check('atlas-ai-copilot types', exists(typesFile));
['AiSourceRef', 'AtlasAiContextSnapshot', 'AtlasAiInteraction', 'AtlasAiConversation', 'AtlasAiChatResponse'].forEach(
  (t) => check(`type ${t}`, has(typesFile, t)),
);
['invoice', 'accounting_entry', 'payroll', 'bank', 'tva', 'liasse', 'audit_log', 'document', 'legal'].forEach(
  (t) => check(`source type ${t}`, has(typesFile, `'${t}'`)),
);

// ── 3. Confidence & safety ─────────────────────────────────────────────────────
console.log('\n[3] Confidence & safety');
check('atlas-ai-confidence.ts', exists(confidenceLib));
check('computeCopilotConfidence', has(confidenceLib, 'computeCopilotConfidence'));
check('ATLAS_AI_DATA_UNAVAILABLE', has(confidenceLib, 'ATLAS_AI_DATA_UNAVAILABLE'));
check('Information non disponible dans Atlas', has(confidenceLib, 'Information non disponible dans Atlas'));
check('copilot data unavailable prompt', has(copilotLib, 'Information non disponible dans Atlas'));
check('ATLAS_AI_SAFETY_NOTICE', has('app/lib/atlas-ai-safety.ts', 'ATLAS_AI_SAFETY_NOTICE'));
check('formatSourcesFooter', has(copilotLib, 'formatSourcesFooter'));

// ── 4. Copilot prompts ─────────────────────────────────────────────────────────
console.log('\n[4] Copilot prompts');
['COPILOT_SYSTEM', 'EXPLAINER_ACCOUNTING', 'EXPLAINER_TVA', 'EXPLAINER_IS', 'EXPLAINER_READINESS', 'EXPLAINER_DOCUMENT', 'AUDITOR_SYSTEM'].forEach(
  (p) => check(`prompt ${p}`, has(copilotLib, p)),
);
check('runAtlasAiCopilot', has(copilotLib, 'runAtlasAiCopilot'));
check('claude-sonnet model', has(copilotLib, 'claude-sonnet'));
check('SOURCES_DISPONIBLES', has(copilotLib, 'SOURCES_DISPONIBLES'));
check('history slice 16', has(copilotLib, 'slice(-16)'));
check('N\'invente JAMAIS', has(copilotLib, 'N\'invente JAMAIS'));

// ── 5. Context builder ─────────────────────────────────────────────────────────
console.log('\n[5] Context builder');
check('atlas-ai-context.ts', exists(contextLib));
['buildAtlasAiContext', 'refreshAtlasAiContext', 'contextToPromptBlock'].forEach(
  (f) => check(`export ${f}`, has(contextLib, f)),
);
['atlas_accounting_entries', 'atlas_invoices', 'zafirix_bank_transactions', 'atlas_bank_reconciliation', 'atlas_payslip_extractions'].forEach(
  (t) => check(`context query ${t}`, has(contextLib, t)),
);
check('runLiasseEngine in context', has(contextLib, 'runLiasseEngine'));
check('buildFiscalTvaContext', has(contextLib, 'buildFiscalTvaContext'));
check('collectLiasseAlerts', has(contextLib, 'collectLiasseAlerts'));
check('upsert atlas_ai_context', has(contextLib, 'atlas_ai_context'));

// ── 6. Explain library ─────────────────────────────────────────────────────────
console.log('\n[6] Explain library');
check('atlas-ai-explain.ts', exists(explainLib));
check('runAtlasAiExplain', has(explainLib, 'runAtlasAiExplain'));
['accounting_entry', 'account_code', 'tva', 'is', 'document', 'readiness', 'general'].forEach(
  (t) => check(`explain type ${t}`, has(explainLib, `'${t}'`)),
);
check('atlas_audit_logs in explain', has(explainLib, 'atlas_audit_logs'));
check('zafirix_routing_records in explain', has(explainLib, 'zafirix_routing_records'));
check('zafirix_tva_suggestions in explain', has(explainLib, 'zafirix_tva_suggestions'));
check('atlas_is_drafts in explain', has(explainLib, 'atlas_is_drafts'));
check('detectAtlasAiAnomalies tva', has(explainLib, 'detectAtlasAiAnomalies'));
check('explainReadiness delegate', has(explainLib, 'explainReadiness'));
check('structured accounting_meaning', has(explainLib, 'accounting_meaning'));
check('structured fiscal_impact', has(explainLib, 'fiscal_impact'));
check('structured tva_impact', has(explainLib, 'tva_impact'));
check('structured linked_documents', has(explainLib, 'linked_documents'));
check('structured routing_path', has(explainLib, 'routing_path'));
check('structured validation_status', has(explainLib, 'validation_status'));
check('defaultQuestion accounting', has(explainLib, 'Pourquoi cette écriture existe'));
check('defaultQuestion tva', has(explainLib, 'Quelle TVA vais-je payer'));
check('defaultQuestion is', has(explainLib, 'Comment est calculé mon IS'));

// ── 7. Interactions & conversations ────────────────────────────────────────────
console.log('\n[7] Interactions & conversations');
check('atlas-ai-interactions.ts', exists(interactionsLib));
['logAtlasAiInteraction', 'listConversationHistory', 'getOrCreateConversation', 'touchConversation', 'listConversations', 'searchConversations', 'updateConversationTitleFromMessage'].forEach(
  (f) => check(`export ${f}`, has(interactionsLib, f)),
);
check('insert atlas_ai_interactions', has(interactionsLib, 'atlas_ai_interactions'));
check('insert atlas_ai_conversations', has(interactionsLib, 'atlas_ai_conversations'));
check('conversation history limit 50', has(interactionsLib, 'limit(50)'));
check('search ilike title', has(interactionsLib, 'ilike'));
check('search prompt answer', has(interactionsLib, 'prompt.ilike'));

// ── 8. Chat API ────────────────────────────────────────────────────────────────
console.log('\n[8] Chat API');
check('chat route exists', exists(chatRoute));
check('POST chat', has(chatRoute, 'export async function POST'));
check('refreshAtlasAiContext', has(chatRoute, 'refreshAtlasAiContext'));
check('runAtlasAiCopilot', has(chatRoute, 'runAtlasAiCopilot'));
check('logAtlasAiInteraction chat', has(chatRoute, 'logAtlasAiInteraction'));
check('interactionType chat', has(chatRoute, "'chat'"));
check('getOrCreateConversation', has(chatRoute, 'getOrCreateConversation'));
check('listConversationHistory', has(chatRoute, 'listConversationHistory'));
check('computeCopilotConfidence', has(chatRoute, 'computeCopilotConfidence'));
check('returns confidence', has(chatRoute, 'confidence'));
check('returns sources', has(chatRoute, 'sources'));
check('returns conversationId', has(chatRoute, 'conversationId'));
check('checkAiRateLimit', has(chatRoute, 'checkAiRateLimit'));
check('auth_required', has(chatRoute, 'auth_required'));
check('message_required', has(chatRoute, 'message_required'));
check('force-dynamic chat', has(chatRoute, 'force-dynamic'));
check('nodejs chat', has(chatRoute, 'nodejs'));
check('updateConversationTitleFromMessage', has(chatRoute, 'updateConversationTitleFromMessage'));

// ── 9. Explain API ─────────────────────────────────────────────────────────────
console.log('\n[9] Explain API');
check('explain route exists', exists(explainRoute));
check('POST explain', has(explainRoute, 'export async function POST'));
check('runAtlasAiExplain', has(explainRoute, 'runAtlasAiExplain'));
check('returns confidence explain', has(explainRoute, 'confidence'));
check('returns structured', has(explainRoute, 'structured'));
check('returns interaction_id', has(explainRoute, 'interaction_id'));
check('VALID_TYPES set', has(explainRoute, 'VALID_TYPES'));
check('account_code type', has(explainRoute, 'account_code'));
check('logAtlasAiInteraction explain', has(explainRoute, 'logAtlasAiInteraction'));
check('force-dynamic explain', has(explainRoute, 'force-dynamic'));

// ── 10. Conversations API ──────────────────────────────────────────────────────
console.log('\n[10] Conversations API');
check('conversations route', exists(convRoute));
check('conversations GET', has(convRoute, 'export async function GET'));
check('listConversations', has(convRoute, 'listConversations'));
check('searchConversations', has(convRoute, 'searchConversations'));
check('search param', has(convRoute, 'search'));
check('conversation id route', exists(convIdRoute));
check('reopen history GET', has(convIdRoute, 'listConversationHistory'));
check('returns messages', has(convIdRoute, 'messages'));
check('not_found 404', has(convIdRoute, 'not_found'));

// ── 11. Other assistant APIs ─────────────────────────────────────────────────────
console.log('\n[11] Other assistant APIs');
['readiness', 'audit', 'insights', 'anomalies'].forEach((r) => {
  check(`${r} route`, exists(`app/api/assistant/${r}/route.ts`));
  check(`${r} force-dynamic`, has(`app/api/assistant/${r}/route.ts`, 'force-dynamic'));
});
check('explainReadiness in readiness', has('app/api/assistant/readiness/route.ts', 'explainReadiness'));
check('buildFiscalClosingChecklist', has('app/api/assistant/readiness/route.ts', 'buildFiscalClosingChecklist'));
check('runAtlasAiAudit', has('app/lib/atlas-ai-audit.ts', 'runAtlasAiAudit'));

// ── 12. Assistant page UI ────────────────────────────────────────────────────────
console.log('\n[12] Assistant page UI');
check('assistant page', exists(assistantPage));
check('fetch chat API', has(assistantPage, '/api/assistant/chat'));
check('AssistantConversationList', has(assistantPage, 'AssistantConversationList'));
check('AssistantSourcesPanel', has(assistantPage, 'AssistantSourcesPanel'));
check('AssistantSuggestedQuestions', has(assistantPage, 'AssistantSuggestedQuestions'));
check('openConversation', has(assistantPage, 'openConversation'));
check('startNewConversation', has(assistantPage, 'startNewConversation'));
check('conversations API load', has(assistantPage, '/api/assistant/conversations/'));
check('AppSidebar', has(assistantPage, 'AppSidebar'));
check('AiActionBar', has(assistantPage, 'AiActionBar'));
check('FiscalClosingAssistant sidebar', has(assistantPage, 'FiscalClosingAssistant'));
check('anomalies sidebar', has(assistantPage, '/api/assistant/anomalies'));
check('confidence display', has(assistantPage, 'Confiance'));
check('lastSources state', has(assistantPage, 'lastSources'));

// ── 13. Assistant components ───────────────────────────────────────────────────
console.log('\n[13] Assistant components');
check('AssistantConversationList.tsx', exists('app/components/assistant/AssistantConversationList.tsx'));
check('conversation list search', has('app/components/assistant/AssistantConversationList.tsx', 'search'));
check('conversation list new', has('app/components/assistant/AssistantConversationList.tsx', 'onNew'));
check('conversations fetch', has('app/components/assistant/AssistantConversationList.tsx', '/api/assistant/conversations'));

check('AssistantSourcesPanel.tsx', exists('app/components/assistant/AssistantSourcesPanel.tsx'));
check('sources panel confidence', has('app/components/assistant/AssistantSourcesPanel.tsx', 'confidence'));
['invoice', 'accounting_entry', 'payroll', 'bank', 'tva', 'liasse', 'audit_log'].forEach(
  (t) => check(`source href ${t}`, has('app/components/assistant/AssistantSourcesPanel.tsx', t)),
);
check('data unavailable notice UI', has('app/components/assistant/AssistantSourcesPanel.tsx', 'Information non disponible'));

check('AssistantSuggestedQuestions.tsx', exists('app/components/assistant/AssistantSuggestedQuestions.tsx'));
check('ASSISTANT_SUGGESTED_QUESTIONS', has('app/components/assistant/AssistantSourcesPanel.tsx', 'ASSISTANT_SUGGESTED_QUESTIONS'));

check('DocumentExplainerButton.tsx', exists('app/components/assistant/DocumentExplainerButton.tsx'));
check('Expliquer ce document', has('app/components/assistant/DocumentExplainerButton.tsx', 'Expliquer ce document'));
check('explain API document', has('app/components/assistant/DocumentExplainerButton.tsx', '/api/assistant/explain'));
check('type document', has('app/components/assistant/DocumentExplainerButton.tsx', "'document'"));

check('AIInsightsWidget', exists('app/components/assistant/AIInsightsWidget.tsx'));
check('AiActionBar component', exists('app/components/assistant/AiActionBar.tsx'));

// ── 14. Suggested questions coverage ───────────────────────────────────────────
console.log('\n[14] Suggested questions');
const suggestions = [
  'Pourquoi mon IS est élevé ?',
  'Comment est calculé mon IS ?',
  'Quels éléments augmentent mon IS ?',
  'Pourquoi cette écriture existe ?',
  'Explique le compte 6132',
  'impact de cette écriture',
  'Quelle TVA vais-je payer ?',
  'Quelles factures impactent ma TVA ?',
  'Pourquoi cette TVA est rejetée ?',
  'Quelles anomalies TVA existent ?',
  'Pourquoi ma readiness fiscale est basse ?',
  'Quels points manquent pour la clôture ?',
  'Montre-moi les factures non payées.',
  'Quelles anomalies existent actuellement ?',
  'Résume mon activité de ce mois.',
];
suggestions.forEach((q) => check(`suggestion: ${q.slice(0, 30)}`, has('app/components/assistant/AssistantSourcesPanel.tsx', q)));

// ── 15. Document explainer wiring ──────────────────────────────────────────────
console.log('\n[15] Document explainer wiring');
check('documents page import', has('app/documents/page.tsx', 'DocumentExplainerButton'));
check('documents selected doc explainer', has('app/documents/page.tsx', 'selectedDoc.id'));
check('ocr row explainer', has('app/documents/page.tsx', 'd.supabaseId'));

// ── 16. Navigation ─────────────────────────────────────────────────────────────
console.log('\n[16] Navigation');
check('assistant nav entry', has('app/lib/atlas-app-nav.ts', '/assistant'));
check('assistant nav id', has('app/lib/atlas-app-nav.ts', "'assistant'"));
check('Sparkles icon nav', has('app/lib/atlas-app-nav.ts', 'Sparkles'));

// ── 17. Readiness explainer ──────────────────────────────────────────────────────
console.log('\n[17] Readiness explainer');
check('explainReadiness export', has('app/lib/atlas-ai-audit.ts', 'explainReadiness'));
check('EXPLAINER_READINESS used', has('app/lib/atlas-ai-audit.ts', 'EXPLAINER_READINESS'));
check('readiness score breakdown', has('app/lib/atlas-ai-audit.ts', 'readinessBreakdown'));
check('blockingIssues', has('app/lib/atlas-ai-audit.ts', 'blockingIssues'));
check('closing checklist lib', exists('app/lib/atlas-ai-closing.ts'));
check('buildFiscalClosingChecklist export', has('app/lib/atlas-ai-closing.ts', 'buildFiscalClosingChecklist'));

// ── 18. Phase 13A integration ────────────────────────────────────────────────────
console.log('\n[18] Phase 13A integration');
check('anomalies lib', exists('app/lib/atlas-ai-anomalies.ts'));
check('insights lib', exists('app/lib/atlas-ai-insights.ts'));
check('insights widget dashboard', has('app/page.tsx', 'AIInsightsWidget'));
check('verify 13a script', exists('scripts/verify-phase13a-insights-anomalies.mjs'));

// ── 19. Auth & admin patterns ────────────────────────────────────────────────────
console.log('\n[19] Auth patterns');
[chatRoute, explainRoute, convRoute, convIdRoute].forEach((r) => {
  check(`${path.basename(path.dirname(r))} auth`, has(r, 'documentUploadSessionUserId'));
  check(`${path.basename(path.dirname(r))} service role`, has(r, 'getSupabaseServiceRoleClient'));
});

// ── 20. Feature question strings in explain defaults ─────────────────────────────
console.log('\n[20] Feature coverage strings');
[
  ['accounting', 'impact comptable'],
  ['TVA', 'EXPLAINER_TVA'],
  ['IS', 'EXPLAINER_IS'],
  ['readiness', 'READINESS CLÔTURE'],
  ['document', 'EXPLAINER_DOCUMENT'],
  ['PCGE', 'COMPTE PCGE'],
  ['audit', 'atlas_audit_logs'],
  ['routing', 'zafirix_routing_records'],
  ['rejected', 'validation_status'],
  ['liasse', 'runLiasseEngine'],
].forEach(([label, text]) => check(`coverage ${label}`, has(explainLib, text) || has(copilotLib, text) || has(contextLib, text)));

console.log(`\n${'═'.repeat(50)}`);
console.log(`PHASE 13B: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
console.log('═'.repeat(50));
if (pass < 200) console.error(`WARNING: only ${pass} checks (target 200+)`);
process.exit(fail > 0 ? 1 : 0);
