/**
 * Report content for the seven Business Studio report types, built only from the study model and the engine
 * result. The PDF and Excel renderers both consume this structure, so the two formats always carry the same values.
 * Amount cells hold integer centimes taken directly from the engine.
 */

import { variance, type ActualsByMonth } from './actuals';
import { compareScenarios, findings, runStressTests, sensitivityMatrix, tornado } from './analysis';
import type { StudyResult } from './engine';
import {
  formatCentsMad, formatNumber, formatPercent, monthLabel, PROJECT_TYPE_LABEL, RULE_STATUS_BI, scenarioText, SECTOR_LABEL, STR, tr, type Bi, type Lang,
} from './i18n';
import { firstFullYear, type Indicator, type StudyMetrics } from './metrics';
import type { StudyModel } from './model';
import { sectorKpis } from './sectors';
import { statementTable, type StatementId } from './statements';
import { LAST_INTEGRATED_FINANCE_LAW, RULES, TAX_RULES_VERSION } from './tax-rules';

export type ReportType = 'full' | 'bank' | 'investor' | 'financials' | 'tax' | 'scenarios' | 'actuals';
export const REPORT_TYPES: readonly ReportType[] = ['full', 'bank', 'investor', 'financials', 'tax', 'scenarios', 'actuals'];

/** `mad_unit`: a unit price or cost in centimes, shown with its centimes (statements stay in whole MAD). */
export type CellUnit = 'mad' | 'mad_unit' | 'pct' | 'ratio' | 'count' | 'months' | 'years';
export type RCell = { v: number | null; u: CellUnit; reason?: string } | { s: string };
export type RowStyle = 'section' | 'line' | 'detail' | 'subtotal' | 'total';
/**
 * `key` is the statement line id. `sign` is the sign applied to the engine series on a single-series line;
 * `terms` lists the lines a computed subtotal adds up, so the Excel renderer can write it as a live formula.
 */
export type RRow = { label: string; style?: RowStyle; cells: RCell[]; key?: string; sign?: 1 | -1; terms?: ReadonlyArray<readonly [string, 1 | -1]> };
export type ChartSeries = { name: string; values: number[] };
/** Donut charts read the first series as shares of a whole; pyramid charts read it as levels from top to bottom. */
export type ChartType = 'bar' | 'line' | 'donut' | 'pyramid';
export type Block =
  | { kind: 'paragraph'; text: string; userText?: boolean }
  | { kind: 'notice'; text: string; tone: 'info' | 'warning' | 'critical' }
  | { kind: 'kv'; title?: string; rows: Array<{ label: string; cell: RCell; note?: string }> }
  | { kind: 'table'; id?: string; title?: string; head: string[]; rows: RRow[]; source?: string }
  | { kind: 'chart'; title: string; type: ChartType; labels: string[]; series: ChartSeries[]; unit: 'mad' | 'count'; note?: string }
  | { kind: 'list'; title?: string; items: string[] };
export type Section = { id: string; title: string; blocks: Block[] };

export type ReportHighlight = { label: string; value: string; hint: string };

export type Report = {
  type: ReportType; lang: Lang; title: string; studyName: string; companyName: string; sector: string; projectType: string;
  generatedAt: string; revision: number | null; status: string; scenarioName: string; engineVersion: string; rulesVersion: string;
  checksOk: boolean; logoDataUrl: string; disclaimers: string[]; sections: Section[];
  /** Label/value pairs shown on the cover of both formats, already translated. */
  cover: Array<[string, string]>;
  /** Four engine KPIs drawn as cards on the cover and in the workbook. */
  highlights: ReportHighlight[];
  /** Fiscal years and months covered, used to check that every section uses the study horizon. */
  horizon: { startMonth: string; years: number; months: number; fiscalYears: string[] };
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
    case 'mad_unit': return formatCentsMad(c.v, lang, c.v % 100 === 0 ? 0 : 2);
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
  const allMad = rows.every((row) => !row.isCount);
  return {
    kind: 'table',
    id: g === 'year' && !months ? id : `${id}-${g}`,
    title: st.title[ctx.lang],
    head: [ctx.t(allMad ? B('Poste (MAD)', 'البند (درهم)') : B('Poste', 'البند')), ...periods.map((p) => `${monthLabel(p.label, ctx.lang)}${p.partial ? '*' : ''}`)],
    rows: rows.map((row): RRow => {
      const single = row.def.terms.length === 1 && row.def.terms[0][0] === row.def.id;
      return {
        label: row.def.label[ctx.lang],
        style: row.def.style,
        key: row.def.id,
        ...(single ? { sign: row.def.terms[0][1] } : row.def.terms.length > 0 && !row.isCount ? { terms: row.def.terms } : {}),
        cells: row.def.terms.length === 0 ? periods.map(() => txt('')) : row.values.map((v) => (row.isCount ? { v, u: 'count' as const } : mad(v))),
      };
    }),
  };
}

function statementSection(ctx: Ctx, id: StatementId, g: 'year' | 'month' = 'year', months?: [number, number], title?: Bi): Section {
  const block = statementBlock(ctx, id, g, months);
  const sectionTitle = title ? ctx.t(title) : (block.kind === 'table' ? block.title ?? id : id);
  const blocks: Block[] = [block.kind === 'table' && block.title === sectionTitle ? { ...block, title: undefined } : block];
  if (ctx.r.calendar.fiscalYears.some((f) => f.partial) && g === 'year') {
    const open = ctx.model.horizon.fiscalYearStartMonth;
    blocks.push({ kind: 'notice', tone: 'info', text: ctx.t(B(
      `* Exercice partiel : moins de 12 mois tombent dans l’horizon. L’exercice s’ouvre au mois ${open}. L’étoile ne désigne pas une année civile complète.`,
      `* سنة مالية جزئية: أقل من 12 شهراً تقع ضمن الأفق. تبدأ السنة المالية في الشهر ${open}. النجمة لا تعني سنة مدنية كاملة.`,
    )) });
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
  // Template lines left without an amount have no effect on the projection and are not printed.
  const products = model.products.filter((p) => p.unitPrice !== 0 && (p.volumeMonth1 !== 0 || Object.keys(p.overrides).length > 0));
  const expenses = model.expenses.filter((e) => (e.behavior === 'fixed' ? e.amountMonthly : e.pctOfRevenue) !== 0);
  const staff = model.staff.filter((s) => s.headcount > 0 && s.grossMonthly > 0);
  const investments = model.investments.filter((i) => i.amountHT > 0);
  const omitted = model.products.length - products.length + model.expenses.length - expenses.length
    + model.staff.length - staff.length + model.investments.length - investments.length;
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
  if (omitted > 0) {
    blocks.push({ kind: 'notice', tone: 'info', text: t(B(
      `${omitted} ligne(s) d’hypothèse sans montant (sans effet sur les calculs) ne sont pas reprises ci-dessous.`,
      `${omitted} سطر(أسطر) من الفرضيات بدون مبلغ (دون أثر على الحسابات) غير مدرجة أدناه.`,
    )) });
  }
  if (products.length) blocks.push({
    kind: 'table', title: t(B('Produits et services', 'المنتجات والخدمات')),
    head: [t(STR.name), t(B('Type', 'النوع')), t(B('Prix HT', 'الثمن دون رسوم')), t(B('Volume mois 1', 'الحجم الشهر 1')), t(B('Croissance an 2', 'نمو السنة 2')), t(B('Coût unitaire', 'التكلفة الوحدوية')), t(B('TVA', 'الضريبة على القيمة المضافة')), t(B('Lancement', 'الإطلاق'))],
    rows: products.map((p) => ({
      label: p.name, cells: [
        txt(p.kind === 'subscription' ? t(B('Abonnement', 'اشتراك')) : t(B('Vente', 'بيع'))), { v: Math.round(p.unitPrice * 100), u: 'mad_unit' }, { v: p.volumeMonth1, u: 'count' },
        { v: p.volumeGrowthPct[0] ?? 0, u: 'pct' }, { v: Math.round(p.unitCost * 100), u: 'mad_unit' }, { v: p.vatRatePct, u: 'pct' }, txt(ml(p.launchMonth)),
      ],
    })),
  });
  if (expenses.length) blocks.push({
    kind: 'table', title: t(B('Charges d’exploitation', 'تكاليف الاستغلال')),
    head: [t(STR.name), t(B('Nature', 'الطبيعة')), t(B('Montant mensuel HT / % CA', 'المبلغ الشهري / % من رقم المعاملات')), t(B('Croissance', 'النمو')), t(B('TVA', 'الضريبة على القيمة المضافة')), t(B('Début', 'البداية'))],
    rows: expenses.map((e) => ({
      label: e.name, cells: [
        txt(e.behavior === 'fixed' ? t(B('Fixe', 'ثابتة')) : t(B('Variable', 'متغيرة'))),
        e.behavior === 'fixed'
          ? mad(Math.round(e.amountMonthly * 100))
          : e.pctOfRevenue === 0 && e.amountMonthly > 0
            ? txt(t(B(
              `${formatPercent(0, ctx.lang)} — montant mensuel non retenu ${formatCentsMad(Math.round(e.amountMonthly * 100), ctx.lang)}`,
              `${formatPercent(0, ctx.lang)} — مبلغ شهري غير محتسب ${formatCentsMad(Math.round(e.amountMonthly * 100), ctx.lang)}`,
            )))
            : { v: e.pctOfRevenue, u: 'pct' as const },
        { v: e.growthPct, u: 'pct' }, { v: e.vatRatePct, u: 'pct' }, txt(ml(e.startMonth)),
      ],
    })),
  });
  if (staff.length) blocks.push({
    kind: 'table', title: t(B('Personnel', 'المستخدمون')),
    head: [t(B('Poste', 'المنصب')), t(B('Effectif', 'العدد')), t(B('Salaire brut mensuel', 'الأجر الإجمالي الشهري')), t(B('Hausse annuelle', 'الزيادة السنوية')), t(B('Début', 'البداية'))],
    rows: staff.map((s) => ({ label: s.role, cells: [{ v: s.headcount, u: 'count' }, mad(Math.round(s.grossMonthly * 100)), { v: s.annualRaisePct, u: 'pct' }, txt(ml(s.startMonth))] })),
  });
  if (investments.length) blocks.push({
    kind: 'table', title: t(B('Investissements', 'الاستثمارات')),
    head: [t(STR.name), t(B('Montant HT', 'المبلغ دون رسوم')), t(B('TVA', 'الضريبة على القيمة المضافة')), t(B('Durée (ans)', 'المدة (سنوات)')), t(B('Méthode', 'الطريقة')), t(B('Date', 'التاريخ'))],
    rows: investments.map((i) => ({
      label: i.name, cells: i.kind === 'tangible' || i.kind === 'intangible'
        ? [mad(Math.round(i.amountHT * 100)), { v: i.vatRatePct, u: 'pct' }, { v: i.usefulLifeYears, u: 'count' }, txt(i.method === 'linear' ? t(B('Linéaire', 'خطية')) : t(B('Dégressif', 'متناقصة'))), txt(ml(i.month))]
        : [mad(Math.round(i.amountHT * 100)), { v: i.vatRatePct, u: 'pct' }, txt('—'), txt(t(B('Non amortissable', 'غير قابل للاهتلاك'))), txt(ml(i.month))],
    })),
  });
  const f = model.financing;
  const finRows: RRow[] = [
    ...f.equity.map((e) => ({ label: `${t(B('Apport', 'مساهمة'))} — ${e.name}`, cells: [mad(Math.round(e.amount * 100)), txt('—'), txt('—'), txt(ml(e.month))] })),
    ...f.loans.map((l) => ({ label: `${t(B('Emprunt', 'قرض'))} — ${l.name}`, cells: [mad(Math.round(l.principal * 100)), { v: l.annualRatePct, u: 'pct' as const }, { v: l.termMonths, u: 'months' as const }, txt(ml(l.month))] })),
    ...f.grants.map((g) => ({ label: `${t(B('Subvention', 'منحة'))} — ${g.name}`, cells: [mad(Math.round(g.amount * 100)), txt('—'), txt('—'), txt(ml(g.month))] })),
    ...f.leases.map((l) => ({
      label: `${t(B('Crédit-bail', 'الائتمان الإيجاري'))} — ${l.name}${l.purchaseOptionHT > 0
        ? t(B(
          ` — option d’achat ${formatCentsMad(Math.round(l.purchaseOptionHT * 100), ctx.lang)} à l’échéance`,
          ` — خيار شراء ${formatCentsMad(Math.round(l.purchaseOptionHT * 100), ctx.lang)} عند النهاية`,
        ))
        : ''}`,
      cells: [mad(Math.round(l.monthlyRentHT * 100)), txt('—'), { v: l.termMonths, u: 'months' as const }, txt(ml(l.startMonth))],
    })),
  ];
  if (finRows.length) blocks.push({ kind: 'table', title: t(B('Financement', 'التمويل')), head: [t(STR.name), t(B('Montant', 'المبلغ')), t(B('Taux', 'النسبة')), t(B('Durée', 'المدة')), t(B('Date', 'التاريخ'))], rows: finRows });
  return { id: 'assumptions', title: t(B('Hypothèses', 'الفرضيات')), blocks };
}

function kpiSection(ctx: Ctx): Section {
  const { x, t, r } = ctx;
  const first = firstFullYear(x);
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
    { label: t(STR.kpi_irrEquityBook), cell: indCell(x.irrEquityWithBookValue, ctx) },
    { label: t(STR.kpi_payback), cell: indCell(x.payback, ctx) },
    { label: t(STR.kpi_roi), cell: indCell(x.roi, ctx) },
    { label: t(STR.kpi_dscr), cell: indCell(x.minDscr, ctx) },
    { label: t(STR.kpi_breakEven), cell: first ? indCell(first.breakEvenRevenue, ctx) : txt('—'), note: first?.label },
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

/** First complete fiscal year, or the first one when none is complete: the reference year of the structure charts. */
function referenceYear(r: StudyResult) {
  return r.calendar.fiscalYears.find((f) => !f.partial) ?? r.calendar.fiscalYears[0];
}

function fySum(r: StudyResult, s: readonly number[], f: { firstMonth: number; lastMonth: number }): number {
  let v = 0;
  for (let m = f.firstMonth; m <= f.lastMonth; m += 1) v += s[m] ?? 0;
  return v;
}

const KIND_LABEL: Record<string, Bi> = {
  tangible: B('Immobilisations corporelles', 'أصول مادية'), intangible: B('Immobilisations incorporelles', 'أصول غير مادية'),
  land: B('Terrains', 'أراضٍ'), goodwill: B('Fonds commercial', 'الأصل التجاري'), deposit: B('Dépôts et cautionnements', 'الودائع والضمانات'),
};

function financingDonut(ctx: Ctx): Block | null {
  const { r, t } = ctx;
  const sum = (k: keyof StudyResult['monthly']) => r.monthly[k].reduce((a, b) => a + b, 0);
  const parts: Array<[Bi, number]> = [
    [B('Apports en capital', 'المساهمات في الرأسمال'), sum('cashInEquity')],
    [B('Emprunts', 'القروض'), sum('cashInLoans')],
    [B('Subventions', 'المنح'), sum('cashInGrants')],
  ];
  const kept = parts.filter(([, v]) => v > 0);
  if (kept.length === 0) return null;
  return {
    kind: 'chart', type: 'donut', unit: 'mad', title: t(B('Sources de financement externes sur l’horizon', 'مصادر التمويل الخارجية على مدى الأفق')),
    labels: kept.map(([l]) => t(l)), series: [{ name: t(B('Montant', 'المبلغ')), values: kept.map(([, v]) => v) }],
  };
}

function investmentDonut(ctx: Ctx): Block | null {
  const { model, r, t } = ctx;
  const byKind = new Map<string, number>();
  for (const i of model.investments) {
    if (i.month < 0 || i.month >= r.calendar.months || i.amountHT <= 0) continue;
    byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + Math.round(i.amountHT * 100));
  }
  if (byKind.size === 0) return null;
  const entries = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
  return {
    kind: 'chart', type: 'donut', unit: 'mad', title: t(B('Répartition des investissements HT', 'توزيع الاستثمارات دون رسوم')),
    labels: entries.map(([k]) => t(KIND_LABEL[k] ?? B(k, k))), series: [{ name: t(B('Montant HT', 'المبلغ دون رسوم')), values: entries.map(([, v]) => v) }],
  };
}

function chartBlocks(ctx: Ctx): Block[] {
  const { x, t, r } = ctx;
  const labels = x.years.map((y) => y.label);
  const ref = referenceYear(r);
  const M = r.monthly;
  const fs = (s: readonly number[]) => fySum(r, s, ref);
  const refNote = t(B(`Exercice de référence : ${ref.label}${ref.partial ? ' (partiel)' : ''}.`, `السنة المرجعية: ${ref.label}${ref.partial ? ' (جزئية)' : ''}.`));
  const costParts: Array<[Bi, number]> = [
    [B('Achats consommés', 'المشتريات المستهلكة'), fs(M.cogs)],
    [B('Charges externes', 'التكاليف الخارجية'), fs(M.externalCharges)],
    [B('Charges de personnel', 'تكاليف المستخدمين'), fs(M.salaries) + fs(M.employerCharges)],
    [B('Impôts et taxes', 'الضرائب والرسوم'), fs(M.localTaxes)],
    [B('Dotations aux amortissements', 'مخصصات الاهتلاك'), fs(M.depreciation)],
    [B('Charges financières', 'التكاليف المالية'), fs(M.financialCharges)],
  ].filter(([, v]) => (v as number) > 0) as Array<[Bi, number]>;
  const products = r.products.map((p) => [p.name, fs(p.revenue)] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const sigLevels: Array<[Bi, number]> = [
    [B('Chiffre d’affaires', 'رقم المعاملات'), fs(M.revenue)],
    [B('Marge brute', 'الهامش الإجمالي'), fs(M.revenue) - fs(M.cogs)],
    [B('Valeur ajoutée', 'القيمة المضافة'), fs(M.revenue) - fs(M.cogs) - fs(M.externalCharges)],
    [B('EBE', 'الفائض الإجمالي للاستغلال'), fs(M.ebitda)],
    [B('Résultat d’exploitation', 'نتيجة الاستغلال'), fs(M.ebit)],
    [B('Résultat courant', 'النتيجة الجارية'), fs(M.ebit) + fs(M.financialResult)],
    [B('Résultat net', 'النتيجة الصافية'), fs(M.netIncome)],
  ];
  const debtService = x.years.map((_, i) => {
    const f = r.calendar.fiscalYears[i];
    return fySum(r, M.cashOutPrincipal, f) + fySum(r, M.cashOutInterest, f);
  });
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
  if (fs(M.revenue) !== 0) {
    out.push({
      kind: 'chart', type: 'pyramid', unit: 'mad', title: t(B('Pyramide des soldes intermédiaires de gestion', 'هرم الأرصدة الوسيطة للتسيير')), note: refNote,
      labels: sigLevels.map(([l]) => t(l)), series: [{ name: ref.label, values: sigLevels.map(([, v]) => v) }],
    });
  }
  if (costParts.length) {
    out.push({
      kind: 'chart', type: 'donut', unit: 'mad', title: t(B('Structure des charges', 'بنية التكاليف')), note: refNote,
      labels: costParts.map(([l]) => t(l)), series: [{ name: ref.label, values: costParts.map(([, v]) => v) }],
    });
  }
  if (products.length >= 2) {
    out.push({
      kind: 'chart', type: 'donut', unit: 'mad', title: t(B('Répartition du chiffre d’affaires par produit', 'توزيع رقم المعاملات حسب المنتج')), note: refNote,
      labels: products.map(([n]) => n), series: [{ name: ref.label, values: products.map(([, v]) => v) }],
    });
  }
  if (debtService.some((v) => v > 0)) {
    out.push({
      kind: 'chart', type: 'bar', unit: 'mad', title: t(B('CAF et service de la dette par exercice', 'القدرة على التمويل الذاتي وخدمة الدين حسب السنة')), labels,
      series: [
        { name: t(B('CAF', 'القدرة على التمويل الذاتي')), values: x.years.map((y) => y.caf) },
        { name: t(B('Service de la dette (capital + intérêts)', 'خدمة الدين (الأصل + الفوائد)')), values: debtService },
      ],
    });
  }
  return out;
}

/** Pie, donut and pyramid charts shared by the dashboard and the reports, so both show the same computed values. */
export function structureCharts(model: StudyModel, r: StudyResult, x: StudyMetrics, lang: Lang): Array<Extract<Block, { kind: 'chart' }>> {
  const ctx: Ctx = { model, r, x, lang, t: (b) => b[lang] };
  const blocks = [financingDonut(ctx), investmentDonut(ctx), ...chartBlocks(ctx)];
  return blocks.filter((b): b is Extract<Block, { kind: 'chart' }> => b != null && b.kind === 'chart' && (b.type === 'donut' || b.type === 'pyramid'));
}

function pctOf(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** Executive summary: every sentence is derived from computed study values; nothing is generated or assumed. */
function summarySection(ctx: Ctx): Section {
  const { model, r, x, t, lang } = ctx;
  const M = r.monthly;
  const sum = (s: readonly number[]) => s.reduce((a, b) => a + b, 0);
  const m = (c: number) => `${formatCentsMad(c, lang)} ${t(STR.mad)}`;
  const p = (v: number | null) => (v == null ? STR.notAvailable[lang] : formatPercent(v, lang));
  const capex = x.totals.capex;
  const equity = sum(M.cashInEquity);
  const loans = sum(M.cashInLoans);
  const grants = sum(M.cashInGrants);
  const ext = equity + loans + grants;
  const years = x.years;
  const first = years[0];
  const last = years[years.length - 1];
  const items: string[] = [];
  items.push(t(B(
    `Horizon : ${model.horizon.years} ans à partir de ${monthLabel(model.horizon.startMonth, 'fr')} (${r.calendar.fiscalYears.length} exercices, ${r.calendar.months} mois calculés).`,
    `الأفق: ${model.horizon.years} سنوات ابتداءً من ${monthLabel(model.horizon.startMonth, 'ar')} (${r.calendar.fiscalYears.length} سنوات مالية، ${r.calendar.months} شهراً محسوباً).`,
  )));
  if (capex > 0 || ext > 0) {
    items.push(t(B(
      `Investissements HT : ${m(capex)}. Financements externes : ${m(ext)}, dont apports ${p(pctOf(equity, ext))}, emprunts ${p(pctOf(loans, ext))} et subventions ${p(pctOf(grants, ext))}.`,
      `الاستثمارات دون رسوم: ${m(capex)}. التمويلات الخارجية: ${m(ext)}، منها مساهمات ${p(pctOf(equity, ext))} وقروض ${p(pctOf(loans, ext))} ومنح ${p(pctOf(grants, ext))}.`,
    )));
  }
  if (first && last) {
    // Growth between partial years (a one-month opening stub, a truncated last year) would be meaningless.
    const full = years.filter((y) => !y.partial);
    const a = full[0] ?? first;
    const b = full[full.length - 1] ?? last;
    const n = b.index - a.index;
    const cagr = full.length >= 2 && n > 0 && a.revenue > 0 && b.revenue > 0 ? (Math.pow(b.revenue / a.revenue, 1 / n) - 1) * 100 : null;
    const partialFr = (y: typeof a) => (y.partial ? ' (exercice partiel)' : '');
    const partialAr = (y: typeof a) => (y.partial ? ' (سنة مالية جزئية)' : '');
    items.push(t(B(
      a === b
        ? `Chiffre d’affaires : ${m(a.revenue)} en ${a.label}${partialFr(a)}.`
        : `Chiffre d’affaires : ${m(a.revenue)} en ${a.label}${partialFr(a)}, ${m(b.revenue)} en ${b.label}${partialFr(b)}${cagr == null ? '' : ` (croissance annuelle moyenne ${p(cagr)} entre exercices complets)`}.`,
      a === b
        ? `رقم المعاملات: ${m(a.revenue)} سنة ${a.label}${partialAr(a)}.`
        : `رقم المعاملات: ${m(a.revenue)} سنة ${a.label}${partialAr(a)}، و${m(b.revenue)} سنة ${b.label}${partialAr(b)}${cagr == null ? '' : ` (متوسط النمو السنوي ${p(cagr)} بين السنوات المالية الكاملة)`}.`,
    )));
    const firstPositive = years.find((y) => y.ebitda > 0);
    items.push(firstPositive
      ? t(B(`EBE positif à partir de ${firstPositive.label} ; taux d’EBE ${p(b.ebitdaMarginPct.value)} en ${b.label}.`, `الفائض الإجمالي إيجابي ابتداءً من ${firstPositive.label}؛ نسبته ${p(b.ebitdaMarginPct.value)} سنة ${b.label}.`))
      : t(B('EBE négatif sur tout l’horizon.', 'الفائض الإجمالي سلبي طوال الأفق.')));
    items.push(t(B(`Résultat net cumulé : ${m(x.totals.netIncome)} ; CAF cumulée : ${m(x.totals.caf)}.`, `النتيجة الصافية المتراكمة: ${m(x.totals.netIncome)}؛ القدرة على التمويل الذاتي المتراكمة: ${m(x.totals.caf)}.`)));
  }
  const minMonth = x.minCash.month;
  if (x.minCash.value != null) {
    items.push(t(B(
      `Trésorerie la plus basse : ${m(x.minCash.value)}${minMonth != null ? ` (${monthLabel(r.calendar.labels[minMonth], 'fr')})` : ''} ; trésorerie de fin d’horizon : ${m(x.cashEnd.value ?? 0)}.`,
      `أدنى خزينة: ${m(x.minCash.value)}${minMonth != null ? ` (${monthLabel(r.calendar.labels[minMonth], 'ar')})` : ''}؛ الخزينة في نهاية الأفق: ${m(x.cashEnd.value ?? 0)}.`,
    )));
  }
  if (x.minDscr.value != null) {
    items.push(t(B(
      `DSCR minimal : ${formatNumber(x.minDscr.value, 'fr', 2)} (les seuils bancaires usuels sont des pratiques de marché, non des règles légales).`,
      `أدنى نسبة لتغطية خدمة الدين: ${formatNumber(x.minDscr.value, 'ar', 2)} (العتبات البنكية المعتادة ممارسات سوقية وليست قواعد قانونية).`,
    )));
  }
  items.push(t(B(
    `VAN (${formatPercent(model.general.discountRatePct, 'fr')}) : ${x.npv.value == null ? STR.notAvailable.fr : m(x.npv.value)} ; TRI projet : ${p(x.irrProject.value)} ; délai de récupération : ${formatCell(indCell(x.payback, ctx), 'fr')}.`,
    `القيمة الحالية الصافية (${formatPercent(model.general.discountRatePct, 'ar')}): ${x.npv.value == null ? STR.notAvailable.ar : m(x.npv.value)}؛ معدل العائد الداخلي: ${p(x.irrProject.value)}؛ مدة الاسترداد: ${formatCell(indCell(x.payback, ctx), 'ar')}.`,
  )));
  const blocks: Block[] = [
    { kind: 'notice', tone: r.checks.ok ? 'info' : 'critical', text: t(r.checks.ok ? STR.checksOk : STR.checksKo) },
    { kind: 'list', title: t(B('Le projet en chiffres', 'المشروع بالأرقام')), items },
  ];
  const fin = financingDonut(ctx);
  if (fin) blocks.push(fin);
  const inv = investmentDonut(ctx);
  if (inv) blocks.push(inv);
  const critical = r.warnings.filter((w) => w.severity !== 'info');
  if (critical.length) blocks.push({ kind: 'list', title: t(B('Points d’attention calculés', 'نقاط انتباه محسوبة')), items: critical.map((w) => (lang === 'ar' ? w.messageAr : w.message)) });
  blocks.push({
    kind: 'table',
    title: t(B('Nature des informations', 'طبيعة المعلومات')),
    head: [t(B('Nature', 'الطبيعة')), t(B('Dans ce rapport', 'في هذا التقرير'))],
    rows: [
      { label: t(B('Cible déclarée par le porteur', 'هدف مصرح به من صاحب المشروع')), cells: [txt(model.profile.project.objectives || model.profile.project.description ? t(B('Texte saisi présent. Il n’est pas vérifié.', 'يوجد نص مُدخل. لم يتم التحقق منه.')) : t(B('Non renseignée.', 'غير مدخل.')))] },
      { label: t(B('Valeur simulée', 'قيمة محاكاة')), cells: [txt(t(B('Chiffre d’affaires, résultat, trésorerie, VAN, TRI et DSCR sont des sorties du moteur à partir des hypothèses enregistrées.', 'رقم المعاملات والنتيجة والخزينة والقيمة الحالية ومعدل العائد ونسبة تغطية الدين مخرجات المحرك من الفرضيات المسجلة.')))] },
      { label: t(B('Donnée vérifiée', 'معطى تم التحقق منه')), cells: [txt(t(B('Ce rapport ne certifie aucune écriture comptable.', 'هذا التقرير لا يشهد على أي قيد محاسبي.')))] },
      { label: t(B('Hypothèse non confirmée', 'فرضية غير مؤكدة')), cells: [txt(t(B('Régime fiscal, TVA applicable au projet et hypothèses de marché : non vérifiés. Les règles codées ne sont pas un avis.', 'النظام الجبائي والضريبة على القيمة المضافة وفرضيات السوق غير مؤكدة. القواعد المبرمجة ليست رأياً مهنياً.')))] },
    ],
  });
  blocks.push({ kind: 'notice', tone: 'info', text: t(B('Synthèse établie automatiquement à partir des valeurs calculées de l’étude ; aucune appréciation n’est ajoutée.', 'ملخص منجز تلقائياً من القيم المحسوبة للدراسة؛ دون إضافة أي تقدير.')) });
  return { id: 'summary', title: t(B('Synthèse exécutive', 'الملخص التنفيذي')), blocks };
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
        mad(y.minimumContributionExempt ? 0 : y.minimumContribution), mad(y.taxDue), txt(t(RULE_STATUS_BI[y.rateStatus]))],
    })),
  });
  const fy = r.calendar.fiscalYears;
  const refundOn = r.vatPeriods.some((p) => p.refundClaimed > 0);
  const vatRows: RRow[] = fy.map((f) => {
    const ps = r.vatPeriods.filter((p) => p.firstMonth >= f.firstMonth && p.lastMonth <= f.lastMonth);
    const s = (k: 'collected' | 'deductible' | 'payable' | 'refundClaimed') => ps.reduce((a, p) => a + p[k], 0);
    const lastP = ps[ps.length - 1];
    const cells = [mad(s('collected')), mad(s('deductible')), mad(s('payable')), mad(lastP ? lastP.creditCarriedForward : 0)];
    if (refundOn) cells.splice(3, 0, mad(s('refundClaimed')));
    return { label: f.label, cells };
  });
  const vatHead = [t(STR.year), t(B('TVA collectée', 'الضريبة المحصلة')), t(B('TVA déductible', 'الضريبة القابلة للخصم')), t(B('TVA à payer', 'الضريبة الواجب أداؤها')), t(B('Crédit reporté', 'الدين الضريبي المرحل'))];
  if (refundOn) vatHead.splice(4, 0, t(B('Remboursement demandé (art. 103 bis)', 'الاسترداد المطلوب (المادة 103 مكرر)')));
  blocks.push({ kind: 'table', title: t(B('TVA par exercice', 'الضريبة على القيمة المضافة حسب السنة')), head: vatHead, rows: vatRows });
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
      cells: [txt(rule.tax), txt(`${rule.effectiveFrom ?? '…'} → ${rule.effectiveTo ?? '…'}`), txt(t(RULE_STATUS_BI[rule.status])), txt(rule.source ? `${rule.source.document}, ${rule.source.reference}` : '—')],
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
        kind: 'table', head: [t(B('Indicateur', 'المؤشر')), ...sc.map((s) => scenarioText(s.name, ctx.lang))],
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
      { kind: 'list', title: t(B('Hypothèses des scénarios', 'فرضيات السيناريوهات')), items: model.scenarios.map((s) => `${scenarioText(s.name, ctx.lang)}${ctx.lang === 'ar' ? ':' : ' :'} ${scenarioText(s.description, ctx.lang) || '—'}`) },
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
  const fs = findings(model, r, x, ctx.lang);
  const severityLabel = { info: B('Information', 'معلومة'), warning: B('Attention', 'تنبيه'), critical: B('Critique', 'حرج') };
  const kindLabel = { calculated: B('Calcul', 'حساب'), assumption: B('Hypothèse', 'فرضية'), convention: B('Convention', 'اصطلاح') };
  return {
    id: 'findings', title: t(B('Analyse et alertes', 'التحليل والتنبيهات')),
    blocks: fs.length
      ? [
        { kind: 'notice', tone: 'info', text: t(B('Constats calculés à partir des valeurs de l’étude ; chacun indique s’il découle d’un calcul, d’une hypothèse saisie ou d’une convention. Aucun texte n’est généré par une IA.', 'ملاحظات محسوبة من قيم الدراسة؛ كل منها يبين إن كان ناتجاً عن حساب أو فرضية أو اصطلاح. لا يوجد نص منشأ بالذكاء الاصطناعي.')) },
        { kind: 'table', head: [t(B('Constat', 'الملاحظة')), t(B('Nature', 'الطبيعة')), t(B('Gravité', 'الدرجة')), t(B('Détail', 'التفاصيل'))], rows: fs.map((f) => ({ label: f.title, cells: [txt(t(kindLabel[f.kind])), txt(t(severityLabel[f.severity])), txt(f.detail)] })) },
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
      ...(r.warnings.length ? [{ kind: 'list' as const, title: t(B('Avertissements du moteur', 'تنبيهات المحرك')), items: r.warnings.map((w) => (ctx.lang === 'ar' ? w.messageAr : w.message)) }] : []),
      { kind: 'notice', tone: 'warning', text: t(STR.forecastNotice) },
    ],
  };
}

// ─── Assembly ────────────────────────────────────────────────────────────────────────────────────

function reportHighlights(ctx: Ctx): ReportHighlight[] {
  const { x, lang, t } = ctx;
  const y = firstFullYear(x);
  if (!y) return [];
  const money = (cents: number | null) => (cents == null ? STR.notAvailable[lang] : `${formatCentsMad(cents, lang)} ${STR.mad[lang]}`);
  return [
    { label: t(B('Chiffre d’affaires', 'رقم المعاملات')), value: money(y.revenue), hint: y.label },
    { label: t(B('Résultat net', 'النتيجة الصافية')), value: money(y.netIncome), hint: y.label },
    { label: t(B('VAN', 'القيمة الحالية الصافية')), value: money(x.npv.value), hint: `${ctx.model.general.discountRatePct} %` },
    { label: 'DSCR', value: x.minDscr.value == null ? STR.notAvailable[lang] : formatNumber(x.minDscr.value, lang, 2), hint: x.minDscr.reason ?? t(B('minimum', 'الأدنى')) },
  ];
}

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
      sections = [summarySection(ctx), projectSection(ctx), assumptionsSection(ctx), kpiSection(ctx), S('cpc'), S('sig'), S('bilan_actif'), S('bilan_passif'), S('tft'), S('financement'),
        S('tresorerie'), S('bfr'), S('investissements'), debtSection(ctx), taxSection(ctx), ratiosSection(ctx), investorSection(ctx), scenariosSection(ctx),
        sensitivitySection(ctx), risksSection(ctx), findingsSection(ctx), methodSection(ctx)];
      break;
    case 'bank':
      sections = [summarySection(ctx), projectSection(ctx, true), kpiSection(ctx), S('financement'), debtSection(ctx),
        statementSection(ctx, 'tresorerie', 'month', firstYearMonths, B('Plan de trésorerie mensuel — premiers 12 mois', 'مخطط الخزينة الشهري — أول 12 شهراً')),
        S('tresorerie'), S('cpc'), S('bilan_actif'), S('bilan_passif'), ratiosSection(ctx), sensitivitySection(ctx), risksSection(ctx), methodSection(ctx)];
      break;
    case 'investor':
      sections = [summarySection(ctx), projectSection(ctx, true), kpiSection(ctx), investorSection(ctx), S('cpc'), S('tft'), scenariosSection(ctx), sensitivitySection(ctx), risksSection(ctx), findingsSection(ctx), methodSection(ctx)];
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
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const statusKey = `st_${input.status ?? ''}`;
  const status = statusKey in STR ? tr(statusKey as keyof typeof STR, lang) : (input.status ?? '');
  const sector = SECTOR_LABEL[model.sector]?.[lang] ?? model.sector;
  const projectType = PROJECT_TYPE_LABEL[model.projectType]?.[lang] ?? model.projectType;
  const company = model.profile.company;
  const scenarioName = scenarioText(scenario?.name ?? r.scenarioId, lang);
  const loansRequested = model.financing.loans.filter((l) => l.month >= 0 && l.month < N).reduce((a, l) => a + Math.round(l.principal * 100), 0);
  const [gy, gm, gd] = generatedAt.slice(0, 10).split('-');
  const cover: Array<[string, string]> = [
    [lang === 'ar' ? 'الدراسة' : 'Étude', input.studyName],
    [STR.company[lang], company.name || '—'],
    [STR.sector[lang], sector],
    [STR.projectType[lang], projectType],
    [ctx.t(B('Ville', 'المدينة')), company.city || '—'],
    [ctx.t(STR.horizon), lang === 'ar'
      ? `المدة ${model.horizon.years} سنوات، من ${monthLabel(model.horizon.startMonth, lang)} إلى ${monthLabel(r.calendar.labels[N - 1] ?? '', lang)}`
      : `${model.horizon.years} ans — de ${model.horizon.startMonth} à ${r.calendar.labels[N - 1] ?? ''}`],
    [ctx.t(B('Investissements HT', 'الاستثمارات دون رسوم')), (() => {
      const lined = model.investments.reduce((s, i) => s + Math.round(i.amountHT * 100), 0);
      const option = model.financing.leases.reduce((s, l) => s + Math.round(l.purchaseOptionHT * 100), 0);
      const note = lined === 0 && option > 0
        ? (lang === 'ar' ? ' (خيار شراء ائتمان إيجاري)' : ' (option d’achat de crédit-bail)')
        : '';
      return `${formatCentsMad(x.totals.capex, lang)} ${STR.mad[lang]}${note}`;
    })()],
    [ctx.t(B('Emprunts sollicités', 'القروض المطلوبة')), `${formatCentsMad(loansRequested, lang)} ${STR.mad[lang]}`],
    [STR.scenario[lang], scenarioName],
    [STR.status[lang], status || '—'],
    [STR.revision[lang], input.revision == null ? '—' : String(input.revision)],
    [STR.generatedOn[lang], `${gd}/${gm}/${gy}`],
    [STR.engine[lang], r.engineVersion],
    [STR.rules[lang], r.rulesVersion],
  ];
  return {
    type, lang, title: tr(TITLE[type], lang), studyName: input.studyName, companyName: company.name, sector, projectType,
    generatedAt, revision: input.revision ?? null, status, scenarioName, engineVersion: r.engineVersion, rulesVersion: r.rulesVersion, checksOk: r.checks.ok,
    logoDataUrl: company.logoDataUrl, disclaimers, sections, cover, highlights: reportHighlights(ctx),
    horizon: { startMonth: model.horizon.startMonth, years: model.horizon.years, months: N, fiscalYears: r.calendar.fiscalYears.map((f) => f.label) },
  };
}

/** A draft may be exported. The file then carries this label in every format. */
export function isDraftStatus(status: string): boolean {
  return /brouillon|^draft$|مسودة/i.test(status.trim());
}

export function reportFileName(report: Report, ext: 'pdf' | 'xlsx' | 'docx'): string {
  const base = `${report.studyName || 'etude'}-${report.type}-${report.lang}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);
  return `${base}.${ext}`;
}
