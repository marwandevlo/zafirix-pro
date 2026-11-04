/**
 * Report content for the seven Business Studio report types, built only from the study model and the engine
 * result. The PDF and Excel renderers both consume this structure, so the two formats always carry the same values.
 * Amount cells hold integer centimes taken directly from the engine.
 */

import { variance, type ActualsByMonth } from './actuals';
import { compareScenarios, findings, runStressTests, sensitivityMatrix, tornado } from './analysis';
import type { StudyResult } from './engine';
import {
  formatCentsMad, formatNumber, formatPercent, monthLabel, PROJECT_TYPE_LABEL, SECTOR_LABEL, STR, tr, type Bi, type Lang,
} from './i18n';
import type { Indicator, StudyMetrics } from './metrics';
import type { StudyModel } from './model';
import { sectorKpis } from './sectors';
import { statementTable, type StatementId } from './statements';
import { LAST_INTEGRATED_FINANCE_LAW, RULES, RULE_STATUS_LABEL, TAX_RULES_VERSION } from './tax-rules';

export type ReportType = 'full' | 'bank' | 'investor' | 'financials' | 'tax' | 'scenarios' | 'actuals';
export const REPORT_TYPES: readonly ReportType[] = ['full', 'bank', 'investor', 'financials', 'tax', 'scenarios', 'actuals'];

export type CellUnit = 'mad' | 'pct' | 'ratio' | 'count' | 'months' | 'years';
export type RCell = { v: number | null; u: CellUnit; reason?: string } | { s: string };
export type RowStyle = 'section' | 'line' | 'detail' | 'subtotal' | 'total';
export type RRow = { label: string; style?: RowStyle; cells: RCell[] };
export type ChartSeries = { name: string; values: number[] };
export type Block =
  | { kind: 'paragraph'; text: string; userText?: boolean }
  | { kind: 'notice'; text: string; tone: 'info' | 'warning' | 'critical' }
  | { kind: 'kv'; rows: Array<{ label: string; cell: RCell; note?: string }> }
  | { kind: 'table'; title?: string; head: string[]; rows: RRow[]; source?: string }
  | { kind: 'chart'; title: string; type: 'bar' | 'line'; labels: string[]; series: ChartSeries[]; unit: 'mad' | 'count' }
  | { kind: 'list'; title?: string; items: string[] };
export type Section = { id: string; title: string; blocks: Block[] };

export type Report = {
  type: ReportType; lang: Lang; title: string; studyName: string; companyName: string; sector: string; projectType: string;
  generatedAt: string; revision: number | null; status: string; scenarioName: string; engineVersion: string; rulesVersion: string;
  checksOk: boolean; logoDataUrl: string; disclaimers: string[]; sections: Section[];
};

export type ReportInput = {
  type: ReportType; lang: Lang; model: StudyModel; result: StudyResult; metrics: StudyMetrics; studyName: string;
  revision?: number | null; status?: string; generatedAt?: string; actuals?: ActualsByMonth | null; actualsIncludeUnvalidated?: boolean;
};

type Ctx = { model: StudyModel; r: StudyResult; x: StudyMetrics; lang: Lang; t: (b: Bi) => string };

const mad = (v: number | null, reason?: string): RCell => ({ v, u: 'mad', ...(reason ? { reason } : {}) });
const txt = (s: string): RCell => ({ s });
const B = (fr: string, ar: string): Bi => ({ fr, ar });

export function formatCell(c: RCell, lang: Lang): string {
  if ('s' in c) return c.s;
  if (c.v == null || !Number.isFinite(c.v)) return lang === 'fr' && c.reason ? `${STR.notAvailable.fr} (${c.reason})` : STR.notAvailable[lang];
  switch (c.u) {
    case 'mad': return formatCentsMad(c.v, lang);
    case 'pct': return formatPercent(c.v, lang);
    case 'ratio': return formatNumber(c.v, lang, 2);
    case 'count': return formatNumber(c.v, lang, Number.isInteger(c.v) ? 0 : 1);
    case 'months': return `${formatNumber(c.v, lang)} ${lang === 'ar' ? 'شهر' : 'mois'}`;
    case 'years': return `${formatNumber(c.v, lang, 1)} ${lang === 'ar' ? 'سنة' : 'ans'}`;
  }
}

function indCell(i: Indicator, ctx: Ctx): RCell {
  if (i.unit === 'month_label') return i.value == null ? { v: null, u: 'count', reason: i.reason } : txt(monthLabel(ctx.r.calendar.labels[i.value] ?? '', ctx.lang));
  return { v: i.value, u: i.unit as CellUnit, reason: i.reason };
}

const yearHead = (ctx: Ctx, first: Bi) => [ctx.t(first), ...ctx.r.calendar.fiscalYears.map((f) => (f.partial ? `${f.label}*` : f.label))];

function statementBlock(ctx: Ctx, id: StatementId, g: 'year' | 'month' | 'quarter' = 'year', months?: [number, number]): Block {
  const st = statementTable(ctx.r, id, g, ctx.lang);
  let periods = st.periods;
  let rows = st.rows;
  if (months) {
    const keep = periods.map((p, i) => (p.months[0] >= months[0] && p.months[p.months.length - 1] <= months[1] ? i : -1)).filter((i) => i >= 0);
    periods = keep.map((i) => periods[i]);
    rows = rows.map((r) => ({ ...r, values: keep.map((i) => r.values[i]) }));
  }
  return {
    kind: 'table',
    title: st.title[ctx.lang],
    head: [ctx.t(B('Poste', 'البند')), ...periods.map((p) => `${monthLabel(p.label, ctx.lang)}${p.partial ? '*' : ''}`)],
    rows: rows.map((row) => ({
      label: row.def.label[ctx.lang],
      style: row.def.style,
      cells: row.def.terms.length === 0 ? periods.map(() => txt('')) : row.values.map((v) => (row.isCount ? { v, u: 'count' as const } : mad(v))),
    })),
  };
}

function statementSection(ctx: Ctx, id: StatementId, g: 'year' | 'month' = 'year', months?: [number, number], title?: Bi): Section {
  const block = statementBlock(ctx, id, g, months);
  const sectionTitle = title ? ctx.t(title) : (block.kind === 'table' ? block.title ?? id : id);
  const blocks: Block[] = [block.kind === 'table' && block.title === sectionTitle ? { ...block, title: undefined } : block];
  if (ctx.r.calendar.fiscalYears.some((f) => f.partial) && g === 'year') {
    blocks.push({ kind: 'notice', tone: 'info', text: ctx.t(B('* Exercice partiel (moins de 12 mois sur l’horizon).', '* سنة مالية جزئية (أقل من 12 شهراً ضمن الأفق).')) });
  }
  return { id: `st-${id}${g === 'month' ? '-m' : ''}`, title: sectionTitle, blocks };
}

// ─── Sections ────────────────────────────────────────────────────────────────────────────────────

function projectSection(ctx: Ctx, short = false): Section {
  const { model, t } = ctx;
  const c = model.profile.company;
  const p = model.profile.project;
  const kv: Array<{ label: string; cell: RCell }> = [
    { label: t(B('Raison sociale', 'الاسم التجاري')), cell: txt(c.name || '—') },
    { label: t(B('Forme juridique', 'الشكل القانوني')), cell: txt(c.legalForm ? c.legalForm.toUpperCase().replace('_', ' ') : (c.incorporated ? '—' : t(B('Non immatriculée (projet)', 'غير مسجلة (مشروع)')))) },
    { label: t(B('Activité', 'النشاط')), cell: txt(c.activity || '—') },
    { label: t(STR.sector), cell: txt(SECTOR_LABEL[model.sector]?.[ctx.lang] ?? model.sector) },
    { label: t(STR.projectType), cell: txt(PROJECT_TYPE_LABEL[model.projectType]?.[ctx.lang] ?? model.projectType) },
    { label: t(B('Ville / adresse', 'المدينة / العنوان')), cell: txt([c.city, c.address].filter(Boolean).join(' — ') || '—') },
    { label: t(STR.horizon), cell: txt(`${monthLabel(model.horizon.startMonth, ctx.lang)} · ${model.horizon.years} ${t(STR.years)}`) },
  ];
  if (c.incorporated) {
    for (const [k, v] of [['ICE', c.ice], ['RC', c.rc], ['IF', c.if], ['CNSS', c.cnss]] as const) if (v) kv.push({ label: k, cell: txt(v) });
  }
  const blocks: Block[] = [{ kind: 'kv', rows: kv }];
  const texts: Array<[Bi, string]> = [
    [B('Description du projet', 'وصف المشروع'), p.description], [B('Objectifs', 'الأهداف'), p.objectives],
    [B('Modèle économique', 'النموذج الاقتصادي'), p.businessModel], [B('Marché', 'السوق'), p.market],
    [B('Clientèle cible', 'الزبناء المستهدفون'), p.targetCustomers], [B('Concurrence', 'المنافسة'), p.competition],
    [B('Localisation', 'الموقع'), p.location],
  ];
  for (const [label, value] of texts) if (value.trim()) blocks.push({ kind: 'paragraph', text: `${t(label)} : ${value.trim()}`, userText: true });
  if (!short) {
    if (model.profile.directors.length) {
      blocks.push({
        kind: 'table', title: t(B('Dirigeants', 'المسيرون')),
        head: [t(STR.name), t(B('Fonction', 'المنصب')), t(B('Expérience (ans)', 'الخبرة (سنوات)')), t(B('Qualifications', 'المؤهلات'))],
        rows: model.profile.directors.map((d) => ({ label: d.name || '—', cells: [txt(d.position), { v: d.experienceYears, u: 'count' }, txt(d.qualifications)] })),
      });
    }
    if (model.profile.shareholders.length) {
      blocks.push({
        kind: 'table', title: t(B('Actionnariat', 'المساهمون')),
        head: [t(STR.name), t(B('Part (%)', 'الحصة (%)')), t(B('Apport (MAD)', 'المساهمة (درهم)')), t(B('Engagement', 'الالتزام'))],
        rows: model.profile.shareholders.map((s) => ({ label: s.name || '—', cells: [{ v: s.ownershipPct, u: 'pct' }, mad(Math.round(s.contribution * 100)), txt(s.commitment)] })),
      });
    }
    const n = model.narrative;
    for (const [label, value] of [[B('Synthèse', 'ملخص'), n.executiveSummary], [B('Analyse de marché', 'تحليل السوق'), n.marketAnalysis], [B('Conclusion', 'خلاصة'), n.conclusion]] as const) {
      if (value.trim()) blocks.push({ kind: 'paragraph', text: `${t(label)} : ${value.trim()}`, userText: true });
    }
  }
  blocks.push({ kind: 'notice', tone: 'info', text: t(B('Les textes descriptifs sont saisis par le porteur de projet ; ils ne sont ni vérifiés ni générés par l’outil.', 'النصوص الوصفية يدخلها حامل المشروع؛ ولا يتحقق منها أو ينشئها البرنامج.')) });
  return { id: 'project', title: t(B('Présentation du projet', 'تقديم المشروع')), blocks };
}

function assumptionsSection(ctx: Ctx): Section {
  const { model, t, lang } = ctx;
  const ml = (m: number) => monthLabel(ctx.r.calendar.labels[m] ?? `+${m}`, lang);
  const blocks: Block[] = [];
  blocks.push({
    kind: 'kv', rows: [
      { label: t(B('Inflation annuelle', 'التضخم السنوي')), cell: { v: model.general.inflationPct, u: 'pct' } },
      { label: t(B('Taux d’actualisation', 'معدل التحيين')), cell: { v: model.general.discountRatePct, u: 'pct' } },
      { label: t(B('Croissance terminale', 'النمو النهائي')), cell: model.general.terminalGrowthPct == null ? txt('—') : { v: model.general.terminalGrowthPct, u: 'pct' } },
      { label: t(B('Ventes au comptant', 'المبيعات نقداً')), cell: { v: model.workingCapital.cashSalesPct, u: 'pct' } },
      { label: t(B('Délai clients (jours)', 'أجل الزبناء (أيام)')), cell: { v: model.workingCapital.dsoDays, u: 'count' } },
      { label: t(B('Délai fournisseurs (jours)', 'أجل الموردين (أيام)')), cell: { v: model.workingCapital.dpoDays, u: 'count' } },
      { label: t(B('Stock (jours d’achats)', 'المخزون (أيام المشتريات)')), cell: { v: model.workingCapital.inventoryDays, u: 'count' } },
      { label: t(B('Créances irrécouvrables', 'الديون غير القابلة للاسترداد')), cell: { v: model.workingCapital.badDebtPct, u: 'pct' } },
    ],
  });
  if (model.products.length) blocks.push({
    kind: 'table', title: t(B('Produits et services', 'المنتجات والخدمات')),
    head: [t(STR.name), t(B('Type', 'النوع')), t(B('Prix HT', 'الثمن دون رسوم')), t(B('Volume mois 1', 'الحجم الشهر 1')), t(B('Croissance an 2', 'نمو السنة 2')), t(B('Coût unitaire', 'التكلفة الوحدوية')), t(B('TVA', 'الضريبة على القيمة المضافة')), t(B('Lancement', 'الإطلاق'))],
    rows: model.products.map((p) => ({
      label: p.name, cells: [
        txt(p.kind === 'subscription' ? t(B('Abonnement', 'اشتراك')) : t(B('Vente', 'بيع'))), mad(Math.round(p.unitPrice * 100)), { v: p.volumeMonth1, u: 'count' },
        { v: p.volumeGrowthPct[0] ?? 0, u: 'pct' }, mad(Math.round(p.unitCost * 100)), { v: p.vatRatePct, u: 'pct' }, txt(ml(p.launchMonth)),
      ],
    })),
  });
  if (model.expenses.length) blocks.push({
    kind: 'table', title: t(B('Charges d’exploitation', 'تكاليف الاستغلال')),
    head: [t(STR.name), t(B('Nature', 'الطبيعة')), t(B('Montant mensuel HT / % CA', 'المبلغ الشهري / % من رقم المعاملات')), t(B('Croissance', 'النمو')), t(B('TVA', 'الضريبة على القيمة المضافة')), t(B('Début', 'البداية'))],
    rows: model.expenses.map((e) => ({
      label: e.name, cells: [
        txt(e.behavior === 'fixed' ? t(B('Fixe', 'ثابتة')) : t(B('Variable', 'متغيرة'))),
        e.behavior === 'fixed' ? mad(Math.round(e.amountMonthly * 100)) : { v: e.pctOfRevenue, u: 'pct' },
        { v: e.growthPct, u: 'pct' }, { v: e.vatRatePct, u: 'pct' }, txt(ml(e.startMonth)),
      ],
    })),
  });
  if (model.staff.length) blocks.push({
    kind: 'table', title: t(B('Personnel', 'المستخدمون')),
    head: [t(B('Poste', 'المنصب')), t(B('Effectif', 'العدد')), t(B('Salaire brut mensuel', 'الأجر الإجمالي الشهري')), t(B('Hausse annuelle', 'الزيادة السنوية')), t(B('Début', 'البداية'))],
    rows: model.staff.map((s) => ({ label: s.role, cells: [{ v: s.headcount, u: 'count' }, mad(Math.round(s.grossMonthly * 100)), { v: s.annualRaisePct, u: 'pct' }, txt(ml(s.startMonth))] })),
  });
  if (model.investments.length) blocks.push({
    kind: 'table', title: t(B('Investissements', 'الاستثمارات')),
    head: [t(STR.name), t(B('Montant HT', 'المبلغ دون رسوم')), t(B('TVA', 'الضريبة على القيمة المضافة')), t(B('Durée (ans)', 'المدة (سنوات)')), t(B('Méthode', 'الطريقة')), t(B('Date', 'التاريخ'))],
    rows: model.investments.map((i) => ({
      label: i.name, cells: [mad(Math.round(i.amountHT * 100)), { v: i.vatRatePct, u: 'pct' }, { v: i.usefulLifeYears, u: 'count' }, txt(i.method === 'linear' ? t(B('Linéaire', 'خطية')) : t(B('Dégressif', 'متناقصة'))), txt(ml(i.month))],
    })),
  });
  const f = model.financing;
  const finRows: RRow[] = [
    ...f.equity.map((e) => ({ label: `${t(B('Apport', 'مساهمة'))} — ${e.name}`, cells: [mad(Math.round(e.amount * 100)), txt('—'), txt('—'), txt(ml(e.month))] })),
    ...f.loans.map((l) => ({ label: `${t(B('Emprunt', 'قرض'))} — ${l.name}`, cells: [mad(Math.round(l.principal * 100)), { v: l.annualRatePct, u: 'pct' as const }, { v: l.termMonths, u: 'months' as const }, txt(ml(l.month))] })),
    ...f.grants.map((g) => ({ label: `${t(B('Subvention', 'منحة'))} — ${g.name}`, cells: [mad(Math.round(g.amount * 100)), txt('—'), txt('—'), txt(ml(g.month))] })),
    ...f.leases.map((l) => ({ label: `${t(B('Crédit-bail', 'الائتمان الإيجاري'))} — ${l.name}`, cells: [mad(Math.round(l.monthlyRentHT * 100)), txt('—'), { v: l.termMonths, u: 'months' as const }, txt(ml(l.startMonth))] })),
  ];
  if (finRows.length) blocks.push({ kind: 'table', title: t(B('Financement', 'التمويل')), head: [t(STR.name), t(B('Montant', 'المبلغ')), t(B('Taux', 'النسبة')), t(B('Durée', 'المدة')), t(B('Date', 'التاريخ'))], rows: finRows });
  return { id: 'assumptions', title: t(B('Hypothèses', 'الفرضيات')), blocks };
}

function kpiSection(ctx: Ctx): Section {
  const { x, t, r } = ctx;
  const first = x.years[0];
  const last = x.years[x.years.length - 1];
  const rows: Array<{ label: string; cell: RCell; note?: string }> = [
    { label: t(STR.kpi_revenue), cell: mad(x.totals.revenue) },
    { label: t(STR.kpi_ebitda), cell: mad(x.totals.ebitda) },
    { label: t(STR.kpi_netIncome), cell: mad(x.totals.netIncome) },
    { label: t(STR.kpi_caf), cell: mad(x.totals.caf) },
    { label: t(STR.kpi_cashEnd), cell: indCell(x.cashEnd, ctx) },
    { label: t(STR.kpi_minCash), cell: indCell(x.minCash, ctx), note: x.minCash.month != null ? monthLabel(r.calendar.labels[x.minCash.month], ctx.lang) : undefined },
    { label: t(STR.kpi_peak), cell: indCell(x.peakFundingNeed, ctx) },
    { label: t(STR.kpi_npv), cell: indCell(x.npv, ctx), note: x.npv.formula },
    { label: t(STR.kpi_irr), cell: indCell(x.irrProject, ctx) },
    { label: t(STR.kpi_irrEquity), cell: indCell(x.irrEquity, ctx) },
    { label: t(STR.kpi_payback), cell: indCell(x.payback, ctx) },
    { label: t(STR.kpi_roi), cell: indCell(x.roi, ctx) },
    { label: t(STR.kpi_dscr), cell: indCell(x.minDscr, ctx) },
    { label: t(STR.kpi_breakEven), cell: first ? indCell(first.breakEvenRevenue, ctx) : txt('—') },
    { label: t(STR.kpi_grossMargin), cell: last ? indCell(last.grossMarginPct, ctx) : txt('—') },
    { label: t(STR.kpi_capex), cell: mad(x.totals.capex) },
    { label: t(STR.kpi_headcount), cell: { v: last?.headcountEnd ?? 0, u: 'count' } },
  ];
  const blocks: Block[] = [
    { kind: 'notice', tone: r.checks.ok ? 'info' : 'critical', text: t(r.checks.ok ? STR.checksOk : STR.checksKo) },
    { kind: 'kv', rows },
    ...chartBlocks(ctx),
  ];
  return { id: 'kpis', title: t(B('Synthèse financière', 'الملخص المالي')), blocks };
}

function chartBlocks(ctx: Ctx): Block[] {
  const { x, t, r } = ctx;
  const labels = x.years.map((y) => y.label);
  const out: Block[] = [
    {
      kind: 'chart', type: 'bar', unit: 'mad', title: t(B('Chiffre d’affaires, EBE et résultat net par exercice', 'رقم المعاملات والفائض الإجمالي والنتيجة الصافية حسب السنة')), labels,
      series: [
        { name: t(B('CA', 'رقم المعاملات')), values: x.years.map((y) => y.revenue) },
        { name: t(B('EBE', 'الفائض الإجمالي')), values: x.years.map((y) => y.ebitda) },
        { name: t(B('Résultat net', 'النتيجة الصافية')), values: x.years.map((y) => y.netIncome) },
      ],
    },
    {
      kind: 'chart', type: 'line', unit: 'mad', title: t(B('Trésorerie nette de fin de mois', 'الخزينة الصافية في نهاية الشهر')),
      labels: r.calendar.labels.map((l) => monthLabel(l, ctx.lang)), series: [{ name: t(B('Trésorerie', 'الخزينة')), values: r.monthly.cash }],
    },
  ];
  return out;
}

function ratiosSection(ctx: Ctx): Section {
  const { x, t } = ctx;
  const row = (label: Bi, f: (y: StudyMetrics['years'][number]) => RCell): RRow => ({ label: t(label), cells: x.years.map(f) });
  const i = (k: keyof StudyMetrics['years'][number]) => (y: StudyMetrics['years'][number]) => indCell(y[k] as Indicator, ctx);
  return {
    id: 'ratios', title: t(B('Indicateurs et ratios', 'المؤشرات والنسب')),
    blocks: [
      {
        kind: 'table', head: yearHead(ctx, B('Indicateur', 'المؤشر')),
        rows: [
          row(B('Chiffre d’affaires', 'رقم المعاملات'), (y) => mad(y.revenue)),
          row(B('Marge brute', 'الهامش الإجمالي'), (y) => mad(y.grossMargin)),
          row(B('Taux de marge brute', 'نسبة الهامش الإجمالي'), i('grossMarginPct')),
          row(B('EBE', 'الفائض الإجمالي للاستغلال'), (y) => mad(y.ebitda)),
          row(B('Taux d’EBE', 'نسبة الفائض الإجمالي'), i('ebitdaMarginPct')),
          row(B('Résultat net', 'النتيجة الصافية'), (y) => mad(y.netIncome)),
          row(B('Marge nette', 'الهامش الصافي'), i('netMarginPct')),
          row(B('CAF', 'القدرة على التمويل الذاتي'), (y) => mad(y.caf)),
          row(B('CA critique (point mort)', 'رقم المعاملات الحرج (عتبة المردودية)'), i('breakEvenRevenue')),
          row(B('Marge de sécurité', 'هامش الأمان'), i('safetyMarginPct')),
          row(B('Mois du point mort', 'شهر بلوغ عتبة المردودية'), i('breakEvenMonth')),
          row(B('DSCR', 'نسبة تغطية خدمة الدين'), i('dscr')),
          row(B('ROE', 'مردودية الأموال الذاتية'), i('roe')),
          row(B('ROA', 'مردودية الأصول'), i('roa')),
          row(B('Liquidité générale', 'السيولة العامة'), i('currentRatio')),
          row(B('Liquidité réduite', 'السيولة المختصرة'), i('quickRatio')),
          row(B('Endettement (gearing)', 'نسبة المديونية'), i('gearing')),
          row(B('Dette nette / EBE', 'الدين الصافي / الفائض الإجمالي'), i('netDebtToEbitda')),
          row(B('Autonomie financière', 'الاستقلالية المالية'), i('financialAutonomyPct')),
          row(B('Capacité de remboursement (ans)', 'القدرة على السداد (سنوات)'), i('repaymentCapacityYears')),
          row(B('BFR en jours de CA', 'الاحتياج من رأس المال العامل بأيام رقم المعاملات'), i('bfrDaysOfRevenue')),
          row(B('Pression fiscale et sociale', 'الضغط الجبائي والاجتماعي'), i('taxBurdenPct')),
        ],
      },
      { kind: 'notice', tone: 'info', text: t(B('Les seuils indiqués pour le DSCR, l’endettement, l’autonomie financière et la capacité de remboursement sont des pratiques de marché, non des règles légales.', 'العتبات المذكورة لنسبة تغطية الدين والمديونية والاستقلالية المالية والقدرة على السداد ممارسات سوقية وليست قواعد قانونية.')) },
    ],
  };
}

function investorSection(ctx: Ctx): Section {
  const { x, t, model } = ctx;
  const kv: Array<{ label: string; cell: RCell; note?: string }> = [
    { label: t(STR.kpi_npv), cell: indCell(x.npv, ctx), note: x.npv.formula },
    { label: t(B('VAN avec valeur terminale', 'القيمة الحالية الصافية مع القيمة النهائية')), cell: indCell(x.npvTerminal, ctx), note: x.npvTerminal.formula },
    { label: t(STR.kpi_irr), cell: indCell(x.irrProject, ctx) },
    { label: t(STR.kpi_irrEquity), cell: indCell(x.irrEquity, ctx) },
    { label: t(B('TRI actionnaires avec valeur de sortie comptable', 'معدل العائد للمساهمين مع قيمة خروج محاسبية')), cell: indCell(x.irrEquityWithBookValue, ctx), note: x.irrEquityWithBookValue.convention },
    { label: t(STR.kpi_payback), cell: indCell(x.payback, ctx) },
    { label: t(B('Délai de récupération actualisé', 'مدة الاسترداد المحينة')), cell: indCell(x.discountedPayback, ctx) },
    { label: t(B('Indice de profitabilité', 'مؤشر الربحية')), cell: indCell(x.profitabilityIndex, ctx) },
    { label: t(STR.kpi_roi), cell: indCell(x.roi, ctx) },
  ];
  const blocks: Block[] = [{ kind: 'kv', rows: kv }];
  blocks.push({
    kind: 'table', title: t(B('Ressources et emplois sur l’horizon', 'الموارد والاستخدامات على مدى الأفق')),
    head: [t(B('Poste', 'البند')), t(B('Montant', 'المبلغ'))],
    rows: [
      { label: t(B('Apports en capital', 'المساهمات في الرأسمال')), cells: [mad(x.totals.equityRaised)] },
      { label: t(B('Emprunts', 'القروض')), cells: [mad(x.totals.loansRaised)] },
      { label: t(B('Subventions', 'المنح')), cells: [mad(x.totals.grants)] },
      { label: t(B('CAF cumulée', 'القدرة على التمويل الذاتي المتراكمة')), cells: [mad(x.totals.caf)] },
      { label: t(B('Investissements', 'الاستثمارات')), cells: [mad(x.totals.capex)] },
      { label: t(B('Dividendes bruts', 'الأرباح الموزعة الإجمالية')), cells: [mad(x.totals.dividends)] },
    ],
  });
  const s = x.saas;
  if (s) {
    blocks.push({
      kind: 'kv', rows: [
        { label: 'MRR', cell: indCell(s.mrrEnd, ctx) }, { label: 'ARR', cell: indCell(s.arrEnd, ctx) },
        { label: t(B('Churn mensuel', 'معدل الفقد الشهري')), cell: indCell(s.churnMonthlyPct, ctx) }, { label: 'ARPU', cell: indCell(s.arpu, ctx) },
        { label: 'CAC', cell: indCell(s.cac, ctx) }, { label: 'LTV', cell: indCell(s.ltv, ctx) }, { label: 'LTV / CAC', cell: indCell(s.ltvToCac, ctx) },
      ],
    });
  }
  const kpis = sectorKpis(model, ctx.r, x);
  if (kpis.length) {
    blocks.push({
      kind: 'table', title: t(B('Indicateurs sectoriels', 'المؤشرات القطاعية')), head: yearHead(ctx, B('Indicateur', 'المؤشر')),
      rows: kpis.map((k) => ({ label: k.label, cells: k.values.map((v) => (k.unit === 'mad' ? mad(v, k.reason) : { v, u: (k.unit === 'months' ? 'months' : k.unit) as CellUnit, reason: k.reason })) })),
    });
  }
  return { id: 'investor', title: t(B('Rentabilité et création de valeur', 'المردودية وخلق القيمة')), blocks };
}

function debtSection(ctx: Ctx): Section {
  const { r, t, model } = ctx;
  const blocks: Block[] = [];
  const loans = r.loans;
  if (loans.length === 0) blocks.push({ kind: 'notice', tone: 'info', text: t(B('Aucun emprunt saisi.', 'لم يتم إدخال أي قرض.')) });
  else blocks.push({
    kind: 'table', title: t(B('Emprunts', 'القروض')),
    head: [t(STR.name), t(B('Principal', 'أصل الدين')), t(B('Frais', 'المصاريف')), t(B('Intérêts totaux', 'مجموع الفوائد')), t(B('Taux annuel', 'المعدل السنوي'))],
    rows: loans.map((l) => {
      const def = model.financing.loans.find((x) => x.id === l.id);
      return {
        label: l.name, cells: [mad(l.principal), mad(l.fees), mad(l.rows.reduce((s, row) => s + row.interest, 0)),
          def ? { v: def.annualRatePct, u: 'pct' as const } : model.openingBalance.enabled ? { v: model.openingBalance.debtAnnualRatePct, u: 'pct' as const } : txt('—')],
      };
    }),
  });
  blocks.push(statementBlock(ctx, 'dette'));
  return { id: 'debt', title: t(B('Endettement et service de la dette', 'المديونية وخدمة الدين')), blocks };
}

function taxSection(ctx: Ctx): Section {
  const { r, t, lang } = ctx;
  const blocks: Block[] = [];
  blocks.push({
    kind: 'table', title: t(B('Impôt sur le résultat par exercice', 'الضريبة على النتيجة حسب السنة المالية')),
    head: [t(STR.year), t(B('Résultat comptable', 'النتيجة المحاسبية')), t(B('Réintégrations', 'الإدماجات')), t(B('Déficits imputés', 'العجوزات المخصومة')), t(B('Base imposable', 'الوعاء الضريبي')), t(B('Taux', 'السعر')), t(B('Impôt calculé', 'الضريبة المحسوبة')), t(B('Cotisation minimale', 'الحد الأدنى للضريبة')), t(B('Impôt dû', 'الضريبة المستحقة')), t(B('Statut de la règle', 'وضعية القاعدة'))],
    rows: r.isYears.map((y) => ({
      label: `${y.label}${y.partial ? '*' : ''}`,
      cells: [mad(y.accountingResult), mad(y.nonDeductible), mad(y.lossesUsed), mad(y.taxable), { v: y.ratePct, u: 'pct' }, mad(y.computedTax),
        mad(y.minimumContributionExempt ? 0 : y.minimumContribution), mad(y.taxDue), txt(y.rateStatus === 'override' ? t(B('Taux saisi', 'سعر مُدخل')) : (RULE_STATUS_LABEL[y.rateStatus] ?? y.rateStatus))],
    })),
  });
  const fy = r.calendar.fiscalYears;
  const vatRows: RRow[] = fy.map((f) => {
    const ps = r.vatPeriods.filter((p) => p.firstMonth >= f.firstMonth && p.lastMonth <= f.lastMonth);
    const s = (k: 'collected' | 'deductible' | 'payable') => ps.reduce((a, p) => a + p[k], 0);
    const lastP = ps[ps.length - 1];
    return { label: f.label, cells: [mad(s('collected')), mad(s('deductible')), mad(s('payable')), mad(lastP ? lastP.creditCarriedForward : 0)] };
  });
  blocks.push({ kind: 'table', title: t(B('TVA par exercice', 'الضريبة على القيمة المضافة حسب السنة')), head: [t(STR.year), t(B('TVA collectée', 'الضريبة المحصلة')), t(B('TVA déductible', 'الضريبة القابلة للخصم')), t(B('TVA à payer', 'الضريبة الواجب أداؤها')), t(B('Crédit reporté', 'الدين الضريبي المرحل'))], rows: vatRows });
  blocks.push({ kind: 'notice', tone: 'info', text: t(B('La TVA déductible et collectée transite par le bilan ; elle n’est pas une charge du CPC, sauf la part non récupérable intégrée au coût.', 'الضريبة على القيمة المضافة القابلة للخصم والمحصلة تمر عبر الميزانية ولا تُعد تكلفة في حساب العائدات والتكاليف، باستثناء الجزء غير القابل للاسترجاع المدمج في التكلفة.')) });
  const taxes = [...new Set(r.taxPayments.map((p) => p.tax))];
  if (taxes.length) {
    blocks.push({
      kind: 'table', title: t(B('Décaissements fiscaux et sociaux par exercice', 'المدفوعات الجبائية والاجتماعية حسب السنة')),
      head: [t(STR.year), ...taxes],
      rows: fy.map((f) => ({ label: f.label, cells: taxes.map((tax) => mad(r.taxPayments.filter((p) => p.tax === tax && p.month >= f.firstMonth && p.month <= f.lastMonth).reduce((a, p) => a + p.amount, 0))) })),
    });
    const firstYear = r.taxPayments.filter((p) => p.month <= Math.min(r.calendar.months - 1, 23));
    blocks.push({
      kind: 'table', title: t(B('Calendrier fiscal (24 premiers mois)', 'الجدول الزمني الجبائي (أول 24 شهراً)')),
      head: [t(STR.month), t(B('Impôt', 'الضريبة')), t(B('Objet', 'الموضوع')), t(B('Montant', 'المبلغ'))],
      rows: firstYear.map((p) => ({ label: monthLabel(r.calendar.labels[p.month], lang), cells: [txt(p.tax), txt(p.label), mad(p.amount)] })),
    });
  }
  blocks.push(statementBlock(ctx, 'paie'));
  blocks.push(rulesTable(ctx));
  return { id: 'tax', title: t(B('Fiscalité prévisionnelle', 'الجبايات التوقعية')), blocks };
}

function rulesTable(ctx: Ctx): Block {
  const { t } = ctx;
  return {
    kind: 'table', title: t(B(`Référentiel fiscal ${TAX_RULES_VERSION} (dernière loi intégrée : ${LAST_INTEGRATED_FINANCE_LAW})`, `المرجع الجبائي ${TAX_RULES_VERSION}`)),
    head: [t(B('Règle', 'القاعدة')), t(B('Impôt', 'الضريبة')), t(B('Période', 'الفترة')), t(B('Statut', 'الوضعية')), t(B('Source', 'المصدر'))],
    rows: RULES.map((rule) => ({
      label: rule.label,
      cells: [txt(rule.tax), txt(`${rule.effectiveFrom ?? '…'} → ${rule.effectiveTo ?? '…'}`), txt(RULE_STATUS_LABEL[rule.status]), txt(rule.source ? `${rule.source.document}, ${rule.source.reference}` : '—')],
    })),
  };
}

function scenariosSection(ctx: Ctx): Section {
  const { model, t } = ctx;
  const sc = compareScenarios(model);
  const row = (label: Bi, f: (s: (typeof sc)[number]) => RCell): RRow => ({ label: t(label), cells: sc.map(f) });
  return {
    id: 'scenarios', title: t(B('Comparaison des scénarios', 'مقارنة السيناريوهات')),
    blocks: [
      {
        kind: 'table', head: [t(B('Indicateur', 'المؤشر')), ...sc.map((s) => s.name)],
        rows: [
          row(B('CA cumulé', 'رقم المعاملات المتراكم'), (s) => mad(s.metrics.totals.revenue)),
          row(B('EBE cumulé', 'الفائض الإجمالي المتراكم'), (s) => mad(s.metrics.totals.ebitda)),
          row(B('Résultat net cumulé', 'النتيجة الصافية المتراكمة'), (s) => mad(s.metrics.totals.netIncome)),
          row(B('Trésorerie finale', 'الخزينة النهائية'), (s) => indCell(s.metrics.cashEnd, ctx)),
          row(B('Trésorerie minimale', 'أدنى خزينة'), (s) => indCell(s.metrics.minCash, ctx)),
          row(B('VAN', 'القيمة الحالية الصافية'), (s) => indCell(s.metrics.npv, ctx)),
          row(B('TRI projet', 'معدل العائد الداخلي'), (s) => indCell(s.metrics.irrProject, ctx)),
          row(B('DSCR minimal', 'أدنى نسبة تغطية الدين'), (s) => indCell(s.metrics.minDscr, ctx)),
          row(B('Contrôles', 'المراقبة'), (s) => txt(s.result.checks.ok ? 'OK' : t(B('ÉCHEC', 'فشل')))),
        ],
      },
      { kind: 'list', title: t(B('Hypothèses des scénarios', 'فرضيات السيناريوهات')), items: model.scenarios.map((s) => `${s.name} : ${s.description || '—'}`) },
    ],
  };
}

function sensitivitySection(ctx: Ctx): Section {
  const { model, t } = ctx;
  const sid = model.activeScenarioId;
  const bars = tornado(model, 'npv', sid);
  const stress = runStressTests(model, sid);
  const matrixRows = [-20, -10, 0, 10, 20];
  const matrixCols = [-20, -10, 0, 10, 20];
  const mx = sensitivityMatrix(model, 'priceFactorPct', 'volumeFactorPct', matrixRows, matrixCols, 'npv', sid);
  const unitLabel = (u: string) => (u === 'pct' ? '%' : u === 'pts' ? 'pts' : u === 'days' ? t(B('j', 'يوم')) : t(B('mois', 'شهر')));
  return {
    id: 'sensitivity', title: t(B('Sensibilité et stress tests', 'الحساسية واختبارات الضغط')),
    blocks: [
      {
        kind: 'table', title: t(B('Sensibilité de la VAN (un paramètre à la fois)', 'حساسية القيمة الحالية الصافية (معامل واحد في كل مرة)')),
        head: [t(B('Paramètre', 'المعامل')), t(B('Variation basse', 'التغير الأدنى')), t(B('VAN basse', 'القيمة الدنيا')), t(B('Variation haute', 'التغير الأعلى')), t(B('VAN haute', 'القيمة العليا')), t(B('Écart', 'الفرق'))],
        rows: bars.map((b) => ({
          label: b.lever.label,
          cells: [txt(`${b.low} ${unitLabel(b.lever.unit)}`), mad(b.valueLow), txt(`+${b.high} ${unitLabel(b.lever.unit)}`), mad(b.valueHigh), mad(b.valueHigh != null && b.valueLow != null ? b.valueHigh - b.valueLow : null)],
        })),
      },
      {
        kind: 'table', title: t(B('VAN selon le prix (lignes) et les volumes (colonnes)', 'القيمة الحالية الصافية حسب الثمن (الأسطر) والحجم (الأعمدة)')),
        head: [t(B('Prix \\ Volumes', 'الثمن \\ الحجم')), ...mx.cols.map((c) => `${c > 0 ? '+' : ''}${c} %`)],
        rows: mx.rows.map((rv, i) => ({ label: `${rv > 0 ? '+' : ''}${rv} %`, cells: mx.values[i].map((v) => mad(v)) })),
      },
      {
        kind: 'table', title: t(B('Stress tests (chocs hypothétiques, non des prévisions)', 'اختبارات الضغط (صدمات افتراضية وليست توقعات)')),
        head: [t(B('Choc', 'الصدمة')), t(B('Résultat net cumulé', 'النتيجة الصافية المتراكمة')), t(B('Trésorerie minimale', 'أدنى خزينة')), t(B('VAN', 'القيمة الحالية الصافية')), t(B('DSCR minimal', 'أدنى نسبة تغطية')), t(B('Alerte', 'تنبيه'))],
        rows: stress.map((s) => ({
          label: s.test.label,
          cells: [mad(s.netIncome), mad(s.minCash), mad(s.npv), { v: s.minDscr, u: 'ratio' },
            txt([s.cashNegative ? t(B('trésorerie négative', 'خزينة سالبة')) : '', s.dscrBelowOne ? 'DSCR < 1' : '', s.equityNegative ? t(B('capitaux propres négatifs', 'أموال ذاتية سالبة')) : ''].filter(Boolean).join(', ') || '—')],
        })),
      },
    ],
  };
}

function risksSection(ctx: Ctx): Section {
  const { model, t } = ctx;
  const blocks: Block[] = [];
  if (model.risks.length) blocks.push({
    kind: 'table', title: t(B('Registre des risques', 'سجل المخاطر')),
    head: [t(B('Risque', 'الخطر')), t(B('Catégorie', 'الفئة')), t(B('Probabilité (1–5)', 'الاحتمال (1–5)')), t(B('Impact (1–5)', 'الأثر (1–5)')), t(B('Criticité', 'الخطورة')), t(B('Mesure', 'الإجراء')), t(B('Responsable', 'المسؤول'))],
    rows: [...model.risks].sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact).map((r) => ({
      label: r.title || '—', cells: [txt(r.category), { v: r.likelihood, u: 'count' }, { v: r.impact, u: 'count' }, { v: r.likelihood * r.impact, u: 'count' }, txt(r.mitigation), txt(r.owner)],
    })),
  });
  else blocks.push({ kind: 'notice', tone: 'warning', text: t(B('Aucun risque saisi dans le registre.', 'لم يتم إدخال أي خطر في السجل.')) });
  const sw = model.swot;
  const swot: Array<[Bi, string[]]> = [[B('Forces', 'نقاط القوة'), sw.strengths], [B('Faiblesses', 'نقاط الضعف'), sw.weaknesses], [B('Opportunités', 'الفرص'), sw.opportunities], [B('Menaces', 'التهديدات'), sw.threats]];
  const swotTitle = t(B('SWOT', 'التحليل الرباعي'));
  const pestelTitle = t(B('PESTEL', 'تحليل المحيط'));
  for (const [label, items] of swot) if (items.length) blocks.push({ kind: 'list', title: `${swotTitle} — ${t(label)}`, items });
  const pe = model.pestel;
  const pestel: Array<[Bi, string[]]> = [[B('Politique', 'سياسي'), pe.political], [B('Économique', 'اقتصادي'), pe.economic], [B('Social', 'اجتماعي'), pe.social], [B('Technologique', 'تكنولوجي'), pe.technological], [B('Environnemental', 'بيئي'), pe.environmental], [B('Légal', 'قانوني'), pe.legal]];
  for (const [label, items] of pestel) if (items.length) blocks.push({ kind: 'list', title: `${pestelTitle} — ${t(label)}`, items });
  blocks.push({ kind: 'notice', tone: 'info', text: t(B('Risques, SWOT et PESTEL sont saisis par l’utilisateur ; l’outil ne produit aucune statistique de marché.', 'المخاطر والتحليل الرباعي وتحليل المحيط يدخلها المستخدم؛ ولا ينتج البرنامج أي إحصائيات عن السوق.')) });
  return { id: 'risks', title: t(B('Risques, SWOT et PESTEL', 'المخاطر والتحليل الرباعي وتحليل المحيط')), blocks };
}

function findingsSection(ctx: Ctx): Section {
  const { model, r, x, t } = ctx;
  const fs = findings(model, r, x);
  const kindLabel = { calculated: B('Calcul', 'حساب'), assumption: B('Hypothèse', 'فرضية'), convention: B('Convention', 'اصطلاح') };
  return {
    id: 'findings', title: t(B('Analyse et alertes', 'التحليل والتنبيهات')),
    blocks: fs.length
      ? [
        { kind: 'notice', tone: 'info', text: t(B('Constats calculés à partir des valeurs de l’étude ; chacun indique s’il découle d’un calcul, d’une hypothèse saisie ou d’une convention. Aucun texte n’est généré par une IA.', 'ملاحظات محسوبة من قيم الدراسة؛ كل منها يبين إن كان ناتجاً عن حساب أو فرضية أو اصطلاح. لا يوجد نص منشأ بالذكاء الاصطناعي.')) },
        { kind: 'table', head: [t(B('Constat', 'الملاحظة')), t(B('Nature', 'الطبيعة')), t(B('Gravité', 'الدرجة')), t(B('Détail', 'التفاصيل'))], rows: fs.map((f) => ({ label: f.title, cells: [txt(t(kindLabel[f.kind])), txt(f.severity), txt(f.detail)] })) },
      ]
      : [{ kind: 'notice', tone: 'info', text: t(B('Aucun constat particulier.', 'لا توجد ملاحظات خاصة.')) }],
  };
}

function actualsSection(ctx: Ctx, actuals: ActualsByMonth | null | undefined, includeUnvalidated: boolean): Section {
  const { r, t } = ctx;
  const blocks: Block[] = [];
  if (!actuals) {
    blocks.push({ kind: 'notice', tone: 'warning', text: t(B('Aucune donnée réelle chargée : l’étude n’est pas rattachée à une société ou la comptabilité n’a pas été lue.', 'لم يتم تحميل أي بيانات فعلية: الدراسة غير مرتبطة بشركة أو لم تتم قراءة المحاسبة.')) });
  } else {
    blocks.push({
      kind: 'notice', tone: includeUnvalidated ? 'warning' : 'info',
      text: includeUnvalidated
        ? t(B('Données réelles incluant des écritures non validées (brouillon, à revoir, revues) : chiffres provisoires.', 'بيانات فعلية تشمل قيوداً غير مصادق عليها: أرقام مؤقتة.'))
        : t(B('Données réelles : écritures validées uniquement, lues en lecture seule depuis la comptabilité.', 'بيانات فعلية: القيود المصادق عليها فقط، مقروءة دون تعديل من المحاسبة.')),
    });
    for (const f of r.calendar.fiscalYears) {
      const rows = variance(r, actuals, f.firstMonth, f.lastMonth);
      if (rows.every((row) => row.actual === 0)) continue;
      blocks.push({
        kind: 'table', title: `${t(STR.year)} ${f.label}`,
        head: [t(B('Poste', 'البند')), t(B('Prévisionnel', 'التوقعي')), t(B('Réel', 'الفعلي')), t(B('Écart', 'الفرق')), t(B('Écart %', 'الفرق %'))],
        rows: rows.map((row) => ({ label: row.label, cells: [mad(row.forecast), mad(row.actual), mad(row.variance), { v: row.variancePct, u: 'pct' }] })),
      });
    }
    if (blocks.length === 1) blocks.push({ kind: 'notice', tone: 'info', text: t(B('Aucune écriture réelle sur la période de l’étude.', 'لا توجد قيود فعلية خلال فترة الدراسة.')) });
  }
  return { id: 'actuals', title: t(B('Réel vs prévisionnel', 'الفعلي مقابل التوقعي')), blocks };
}

function methodSection(ctx: Ctx): Section {
  const { r, t } = ctx;
  return {
    id: 'method', title: t(B('Méthode, contrôles et avertissements', 'المنهجية والمراقبة والتنبيهات')),
    blocks: [
      {
        kind: 'kv', rows: [
          { label: t(STR.engine), cell: txt(r.engineVersion) },
          { label: t(STR.rules), cell: txt(r.rulesVersion) },
          { label: t(B('Écart maximal du bilan', 'أقصى فرق في الميزانية')), cell: mad(r.checks.balanceSheetMaxAbsDiff) },
          { label: t(B('Écart maximal des flux de trésorerie', 'أقصى فرق في التدفقات')), cell: mad(r.checks.cashFlowMaxAbsDiff) },
          { label: t(B('Écart maximal du plan de financement', 'أقصى فرق في مخطط التمويل')), cell: mad(r.checks.planFinancementMaxAbsDiff) },
          { label: t(B('Écart maximal du CPC', 'أقصى فرق في حساب العائدات والتكاليف')), cell: mad(r.checks.pnlMaxAbsDiff) },
        ],
      },
      { kind: 'paragraph', text: t(B('Calcul mensuel en centimes entiers, agrégé par trimestre et par exercice. Les flux sont sommés ; les soldes de bilan sont pris à la clôture de la période.', 'حساب شهري بالسنتيمات الصحيحة، مجمع حسب الفصل والسنة المالية. تُجمع التدفقات وتؤخذ أرصدة الميزانية عند إقفال الفترة.')) },
      ...(r.warnings.length ? [{ kind: 'list' as const, title: t(B('Avertissements du moteur', 'تنبيهات المحرك')), items: r.warnings.map((w) => w.message) }] : []),
      { kind: 'notice', tone: 'warning', text: t(STR.forecastNotice) },
    ],
  };
}

// ─── Assembly ────────────────────────────────────────────────────────────────────────────────────

const TITLE: Record<ReportType, keyof typeof STR> = {
  full: 'rep_full', bank: 'rep_bank', investor: 'rep_investor', financials: 'rep_financials', tax: 'rep_tax', scenarios: 'rep_scenarios', actuals: 'rep_actuals',
};

export function buildReport(input: ReportInput): Report {
  const { type, lang, model, result: r, metrics: x } = input;
  const ctx: Ctx = { model, r, x, lang, t: (b) => b[lang] };
  const N = r.calendar.months;
  const firstYearMonths: [number, number] = [0, Math.min(11, N - 1)];
  const S = (id: StatementId) => statementSection(ctx, id);
  let sections: Section[];
  switch (type) {
    case 'full':
      sections = [projectSection(ctx), assumptionsSection(ctx), kpiSection(ctx), S('cpc'), S('sig'), S('bilan_actif'), S('bilan_passif'), S('tft'), S('financement'),
        S('tresorerie'), S('bfr'), S('investissements'), debtSection(ctx), taxSection(ctx), ratiosSection(ctx), investorSection(ctx), scenariosSection(ctx),
        sensitivitySection(ctx), risksSection(ctx), findingsSection(ctx), methodSection(ctx)];
      break;
    case 'bank':
      sections = [projectSection(ctx, true), kpiSection(ctx), S('financement'), debtSection(ctx),
        statementSection(ctx, 'tresorerie', 'month', firstYearMonths, B('Plan de trésorerie mensuel — premiers 12 mois', 'مخطط الخزينة الشهري — أول 12 شهراً')),
        S('tresorerie'), S('cpc'), S('bilan_actif'), S('bilan_passif'), ratiosSection(ctx), sensitivitySection(ctx), risksSection(ctx), methodSection(ctx)];
      break;
    case 'investor':
      sections = [projectSection(ctx, true), kpiSection(ctx), investorSection(ctx), S('cpc'), S('tft'), scenariosSection(ctx), sensitivitySection(ctx), risksSection(ctx), findingsSection(ctx), methodSection(ctx)];
      break;
    case 'financials':
      sections = [S('cpc'), S('sig'), S('bilan_actif'), S('bilan_passif'), S('tft'), S('financement'), S('tresorerie'), S('bfr'), S('investissements'), S('dette'), S('paie'), S('tva'), S('is'), methodSection(ctx)];
      break;
    case 'tax':
      sections = [taxSection(ctx), S('tva'), S('is'), methodSection(ctx)];
      break;
    case 'scenarios':
      sections = [scenariosSection(ctx), sensitivitySection(ctx), methodSection(ctx)];
      break;
    case 'actuals':
      sections = [actualsSection(ctx, input.actuals, Boolean(input.actualsIncludeUnvalidated)), methodSection(ctx)];
      break;
  }
  const scenario = model.scenarios.find((s) => s.id === r.scenarioId);
  const disclaimers: string[] = [STR.forecastNotice[lang]];
  if (lang === 'ar') disclaimers.push(STR.arabicFrenchOnly.ar);
  return {
    type, lang, title: tr(TITLE[type], lang), studyName: input.studyName, companyName: model.profile.company.name,
    sector: SECTOR_LABEL[model.sector]?.[lang] ?? model.sector, projectType: PROJECT_TYPE_LABEL[model.projectType]?.[lang] ?? model.projectType,
    generatedAt: input.generatedAt ?? new Date().toISOString(), revision: input.revision ?? null, status: input.status ?? '',
    scenarioName: scenario?.name ?? r.scenarioId, engineVersion: r.engineVersion, rulesVersion: r.rulesVersion, checksOk: r.checks.ok,
    logoDataUrl: model.profile.company.logoDataUrl, disclaimers, sections,
  };
}

export function reportFileName(report: Report, ext: 'pdf' | 'xlsx'): string {
  const base = `${report.studyName || 'etude'}-${report.type}-${report.lang}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);
  return `${base}.${ext}`;
}
