import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  applyProposal, appendTurn, assertNoNewNumbers, canApplyCopilot, checkCopilotRate, completeness, consult, detectLang,
  emptyThread, evaluateApply, explainEngine, inspectModel, parseMoney, parseThread, previewImpact, COPILOT_LIMITS,
} from '../../app/lib/business-studio/copilot';
import { formatCentsMad } from '../../app/lib/business-studio/i18n';
import { computeStudy } from '../../app/lib/business-studio/engine';
import { computeMetrics, firstFullYear } from '../../app/lib/business-studio/metrics';
import JSZip from 'jszip';
import { emptyModel, newExpense, newProduct, type StudyModel } from '../../app/lib/business-studio/model';
import { buildReport } from '../../app/lib/business-studio/report-model';
import { renderReportPdf } from '../../app/lib/business-studio/report-pdf';
import { renderReportDocx } from '../../app/lib/business-studio/report-docx';
import { renderReportXlsx } from '../../app/lib/business-studio/report-xlsx';
import { richModel } from './fixtures';

const fontDir = join(process.cwd(), 'public', 'fonts', 'amiri');
const fonts = {
  regular: readFileSync(join(fontDir, 'Amiri-Regular.ttf')).toString('base64'),
  bold: readFileSync(join(fontDir, 'Amiri-Bold.ttf')).toString('base64'),
};

function propertyPattern(): StudyModel {
  const model = emptyModel({ startMonth: '2026-11', years: 3, sector: 'real_estate', projectType: 'existing' });
  model.horizon.fiscalYearStartMonth = 12;
  model.profile.project.objectives = 'Financement recherché : pret bancaire classique';
  model.products = [newProduct({
    id: 'p1', name: 'Offre', kind: 'subscription', unitPrice: 2_000_000, priceGrowthPct: 15, unitCost: 2_000_000,
    volumeMonth1: 1, volumeGrowthPct: [20], churnPctMonthly: 15, capacityPerMonth: 2_000_000,
  })];
  model.expenses = [newExpense({
    id: 'rent', name: 'Loyer', category: 'rent', behavior: 'variable_revenue_pct', amountMonthly: 76987, pctOfRevenue: 0, growthPct: 15,
  })];
  model.financing.overdraftRatePct = 15;
  model.financing.equity = [{ id: 'eq', name: 'Apport', amount: 500_000, month: 0 }];
  return model;
}

test('money parsing keeps grouped thousands and decimal commas apart', () => {
  assert.equal(parseMoney('2 000 000'), 2_000_000);
  assert.equal(parseMoney('2.000.000'), 2_000_000);
  assert.equal(parseMoney('2,5'), 2.5);
});

test('language detection covers French, Arabic and Moroccan Darija', () => {
  assert.equal(detectLang('Quel est le prix ?', 'fr'), 'fr');
  assert.equal(detectLang('ما هو سعر البيع؟'), 'ar');
  assert.equal(detectLang('bghit nbi3 des lots f Marrakech'), 'darija');
  assert.equal(detectLang('بغيت نبيع البقع'), 'darija');
});

test('a property subscription is flagged and left untouched until an explicit apply', () => {
  const model = propertyPattern();
  const before = structuredClone(model);
  const turn = consult({ model, userText: 'Explique les résultats de cette étude.', lang: 'fr' });
  assert.deepEqual(model, before);
  assert.ok(turn.contradictions.some((c) => c.id === 'real-estate-subscription'));
  assert.ok(turn.contradictions.some((c) => c.id === 'loan-text-only'));
  assert.ok(turn.contradictions.some((c) => c.id === 'expense-ignored-rent'));
  const suggestion = turn.proposal?.changes.find((c) => c.op.op === 'productKind' && c.op.kind === 'one_time');
  assert.ok(suggestion);
  assert.equal(suggestion.provenance, 'suggestion');
  assert.equal(model.products[0].kind, 'subscription');
  const applied = applyProposal(model, turn.proposal!, [suggestion.id]);
  assert.equal(applied.products[0].kind, 'one_time');
  assert.equal(model.products[0].kind, 'subscription');
  assert.deepEqual(applied.tax, model.tax);
  const impact = previewImpact(model, applied);
  assert.ok(impact);
  assert.ok(impact.revenue[1] < impact.revenue[0]);
  const engine = firstFullYear(computeMetrics(model, computeStudy(model)));
  assert.match(turn.message, /DSCR non calculé/);
  assert.match(turn.message, /pas vérifié/);
  assert.ok(engine);
  const shown = formatCentsMad(engine.revenue, 'fr').replace(/[\s\u202f\u00a0]/g, '');
  assert.match(turn.message.replace(/[\s\u202f\u00a0]/g, ''), new RegExp(shown));
});

test('retail subscription revenue is not treated as the property-sales failure', () => {
  const model = richModel(2);
  const found = inspectModel(model);
  assert.equal(found.contradictions.some((c) => c.id === 'real-estate-subscription'), false);
});

test('confirmed prices stay estimates when the user hedges, and tax rates are not proposed', () => {
  const model = emptyModel({ sector: 'services', years: 2, startMonth: '2026-01' });
  const turn = consult({
    model,
    userText: 'Projet de services à Casablanca, SARL. Prix environ 800000 et volume 4.',
    lang: 'fr',
  });
  const price = turn.proposal?.changes.find((c) => c.op.op === 'addProduct');
  assert.ok(price);
  assert.equal(price.provenance, 'estimate');
  assert.equal(turn.proposal?.changes.some((c) => JSON.stringify(c.op).includes('isRate') || JSON.stringify(c.op).includes('vat')), false);
  const applied = applyProposal(model, turn.proposal!, [price.id]);
  assert.equal(applied.products[0].unitPrice, 800000);
  assert.equal(applied.products[0].kind, 'one_time');
  assert.deepEqual(applied.tax, model.tax);
});

test('an empty property study can receive the zero-amount template only when it has no lines', () => {
  const model = emptyModel({ sector: 'services', years: 3, startMonth: '2026-01' });
  const turn = consult({ model, userText: 'Secteur immobilier, promotion de lots.', lang: 'fr' });
  const template = turn.proposal?.changes.find((c) => c.op.op === 'applyEmptySectorTemplate');
  assert.ok(template);
  const applied = applyProposal(model, turn.proposal!, [template.id]);
  assert.equal(applied.sector, 'real_estate');
  assert.ok(applied.products.length > 0);
  assert.ok(applied.products.every((p) => p.unitPrice === 0 && p.kind === 'one_time'));
  const occupied = propertyPattern();
  const again = consult({ model: occupied, userText: 'Secteur immobilier', lang: 'fr' });
  const wipe = again.proposal?.changes.find((c) => c.op.op === 'applyEmptySectorTemplate');
  assert.equal(wipe, undefined);
});

test('apply requires confirmation, a known change and the current revision', () => {
  const proposal = consult({ model: emptyModel(), userText: 'Ville Casablanca', lang: 'fr' }).proposal;
  assert.ok(proposal);
  const denied = (confirm: boolean, revision: number, ids: string[], access: 'owner' | 'edit' | 'read') => {
    const result = evaluateApply({ confirm, revision, currentRevision: 2, changeIds: ids, proposal, access });
    assert.equal(result.ok, false);
    return result.ok ? '' : result.code;
  };
  assert.equal(denied(false, 2, [proposal.changes[0].id], 'owner'), 'confirm_required');
  assert.equal(denied(true, 1, [proposal.changes[0].id], 'edit'), 'revision_conflict');
  assert.equal(denied(true, 2, ['missing'], 'owner'), 'unknown_change');
  assert.equal(denied(true, 2, [proposal.changes[0].id], 'read'), 'read_only');
  assert.equal(canApplyCopilot('edit'), true);
  const ok = evaluateApply({ confirm: true, revision: 2, currentRevision: 2, changeIds: [proposal.changes[0].id], proposal, access: 'owner' });
  assert.equal(ok.ok, true);
});

test('a paraphrase that invents a total is rejected and a transcript resumes without duplicating a turn', () => {
  const brief = 'Chiffre d’affaires 120 000 MAD';
  assert.equal(assertNoNewNumbers(brief, 'Le moteur indique 120000 MAD.'), true);
  assert.equal(assertNoNewNumbers(brief, 'Le marché vaudra 999999 MAD.'), false);
  const thread = emptyThread();
  const turn = consult({ model: emptyModel(), userText: 'Continuer l’entretien', lang: 'ar' });
  const first = appendTurn(thread, { clientId: 'c1', content: 'كمل', at: '2026-11-05T00:00:00Z' }, turn, 'deterministic');
  const second = appendTurn(first.thread, { clientId: 'c1', content: 'كمل', at: '2026-11-05T00:00:00Z' }, turn, 'deterministic');
  assert.equal(second.duplicate, true);
  assert.equal(second.thread.threadRevision, first.thread.threadRevision);
  const restored = parseThread({ kind: 'business_study_copilot', studyId: 's1', ...first.thread });
  assert.equal(restored.messages.length, 2);
  assert.equal(restored.messages[1].provider, 'deterministic');
});

test('usage and interview limits stay finite', () => {
  const user = `limits-${Date.now()}`;
  for (let i = 0; i < COPILOT_LIMITS.rateMax; i += 1) assert.equal(checkCopilotRate(user, 1_000).ok, true);
  assert.equal(checkCopilotRate(user, 1_000).ok, false);
  const items = completeness(emptyModel());
  assert.ok(items.some((i) => i.id === 'tax' && i.status === 'unverified'));
  assert.match(explainEngine(emptyModel(), 'darija'), /Mazal/);
});

test('reports show engine highlights and provenance without another study’s figures', async () => {
  for (const years of [1, 7]) {
    const model = richModel(years);
    const result = computeStudy(model);
    const metrics = computeMetrics(model, result);
    for (const lang of ['fr', 'ar'] as const) {
      const report = buildReport({ type: 'full', lang, model, result, metrics, studyName: years === 1 ? 'Court' : 'Long' });
      assert.equal(report.highlights.length, 4);
      const summary = report.sections.find((s) => s.id === 'summary');
      const nature = summary?.blocks.find((b) => b.kind === 'table' && b.title && /Nature|طبيعة/.test(b.title));
      assert.ok(nature && nature.kind === 'table');
      const packed = JSON.stringify(report);
      assert.equal(packed.includes('107131049'), false);
      assert.equal(packed.includes('760731838'), false);
      const pdf = renderReportPdf(report, lang === 'ar' ? fonts : undefined);
      assert.ok(pdf.byteLength > 2000);
    }
  }
  const model = richModel(3);
  const report = buildReport({ type: 'investor', lang: 'fr', model, result: computeStudy(model), metrics: computeMetrics(model, computeStudy(model)), studyName: 'Aperçu' });
  const docx = Buffer.from(await renderReportDocx(report));
  const xml = await JSZip.loadAsync(docx).then((zip) => zip.file('word/document.xml')?.async('string'));
  assert.match(xml ?? '', /6D4CFF/);
  assert.match(xml ?? '', /142B55/);
  const wb = await renderReportXlsx(report);
  assert.ok(wb.byteLength > 1000);
});
