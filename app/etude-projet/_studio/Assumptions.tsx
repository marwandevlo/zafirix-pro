'use client';

import { useMemo, useState } from 'react';
import {
  EXPENSE_CATEGORIES, MAX_YEARS, newExpense, newId, newInvestment, newLoan, newProduct, newStaff, PROJECT_TYPES, SECTORS,
  type ExpenseCategory, type IsCategory, type LegalForm, type StudyModel, type TaxRegime, type ValidationIssue,
} from '@/app/lib/business-studio/model';
import { PROJECT_TYPE_LABEL, SECTOR_LABEL, type Bi } from '@/app/lib/business-studio/i18n';
import { SECTOR_TEMPLATES } from '@/app/lib/business-studio/sectors';
import { legalDecliningCoefficient, legalVatRates, monthlyPayroll } from '@/app/lib/business-studio/tax-rules';
import {
  bi, Card, ListEditor, MonthField, Notice, NumField, SelectField, Tabs, TextField, Toggle, useFormat, useStudio,
} from './ui';

type Props = { model: StudyModel; onChange: (m: StudyModel) => void; disabled: boolean; labels: string[]; issues: ValidationIssue[] };
type Sub = 'general' | 'products' | 'expenses' | 'staff' | 'investments' | 'financing' | 'wc' | 'tax' | 'opening' | 'sector';

const CATEGORY_LABEL: Record<ExpenseCategory, Bi> = {
  rent: bi('Loyer', 'الكراء'), utilities: bi('Eau, électricité', 'الماء والكهرباء'), marketing: bi('Marketing', 'التسويق'), maintenance: bi('Entretien', 'الصيانة'),
  insurance: bi('Assurances', 'التأمين'), admin: bi('Administratif', 'الإدارة'), logistics: bi('Logistique', 'اللوجستيك'), raw_materials: bi('Matières', 'المواد'),
  subcontracting: bi('Sous-traitance', 'المناولة'), it: bi('Informatique', 'المعلوميات'), travel: bi('Déplacements', 'التنقلات'), fees: bi('Honoraires', 'الأتعاب'),
  telecom: bi('Télécom', 'الاتصالات'), other: bi('Autre', 'أخرى'),
};

export function Assumptions({ model, onChange, disabled, labels, issues }: Props) {
  const { t } = useStudio();
  const [sub, setSub] = useState<Sub>('general');
  const tabs: Array<{ id: Sub; label: string }> = [
    { id: 'general', label: t('as_general') }, { id: 'products', label: t('as_products') }, { id: 'expenses', label: t('as_expenses') },
    { id: 'staff', label: t('as_staff') }, { id: 'investments', label: t('as_investments') }, { id: 'financing', label: t('as_financing') },
    { id: 'wc', label: t('as_wc') }, { id: 'tax', label: t('as_tax') }, { id: 'opening', label: t('as_opening') }, { id: 'sector', label: t('as_sector') },
  ];
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const set = <K extends keyof StudyModel>(k: K, v: StudyModel[K]) => onChange({ ...model, [k]: v });
  const p = { model, set, onChange, disabled, labels };
  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Notice tone="critical">
          <p className="font-semibold">{t('validationErrors')}</p>
          <ul className="mt-1 list-disc ps-4">{errors.slice(0, 12).map((e) => <li key={`${e.path}-${e.message}`}><code>{e.path}</code> : {e.message}</li>)}</ul>
        </Notice>
      )}
      {warnings.length > 0 && (
        <Notice tone="warning"><ul className="list-disc ps-4">{warnings.slice(0, 8).map((e) => <li key={`${e.path}-${e.message}`}>{e.message}</li>)}</ul></Notice>
      )}
      <Tabs tabs={tabs} value={sub} onChange={setSub} label={t('tab_assumptions')} />
      {sub === 'general' && <General {...p} />}
      {sub === 'products' && <Products {...p} />}
      {sub === 'expenses' && <Expenses {...p} />}
      {sub === 'staff' && <Staff {...p} />}
      {sub === 'investments' && <Investments {...p} />}
      {sub === 'financing' && <FinancingEditor {...p} />}
      {sub === 'wc' && <WorkingCapital {...p} />}
      {sub === 'tax' && <TaxEditor {...p} />}
      {sub === 'opening' && <Opening {...p} />}
      {sub === 'sector' && <Sector {...p} />}
    </div>
  );
}

type P = { model: StudyModel; set: <K extends keyof StudyModel>(k: K, v: StudyModel[K]) => void; onChange: (m: StudyModel) => void; disabled: boolean; labels: string[] };

function useVatOptions(model: StudyModel, current: number[]) {
  return useMemo(() => {
    const rates = new Set(legalVatRates(`${model.horizon.startMonth}-01`));
    current.forEach((c) => rates.add(c));
    return [...rates].sort((a, b) => a - b).map((r) => ({ value: r, label: `${r} %` }));
  }, [model.horizon.startMonth, current]);
}

function General({ model, set, onChange, disabled }: P) {
  const { t, lang } = useStudio();
  const h = model.horizon;
  const g = model.general;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title={t('horizon')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600" htmlFor="h-start">{t('startMonth')}</label>
            <input id="h-start" type="month" min="2023-01" disabled={disabled} value={h.startMonth} onChange={(e) => e.target.value && set('horizon', { ...h, startMonth: e.target.value })}
              aria-describedby={h.startMonth < '2023-01' ? 'h-start-help' : undefined}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            {h.startMonth < '2023-01' && (
              <p id="h-start-help" className="text-xs text-amber-700">{t(bi('Aucun taux d’IS vérifié avant 2023 : saisissez une règle fiscale de substitution.', 'لا يوجد سعر متحقق منه للضريبة على الشركات قبل 2023: أدخل قاعدة جبائية بديلة.'))}</p>
            )}
          </div>
          <NumField label={`${t('horizon')} (${t('years')})`} value={h.years} integer min={1} max={MAX_YEARS} disabled={disabled} onChange={(v) => v != null && set('horizon', { ...h, years: v })} />
          <NumField label={t('fiscalYearStart')} value={h.fiscalYearStartMonth} integer min={1} max={12} disabled={disabled} onChange={(v) => v != null && set('horizon', { ...h, fiscalYearStartMonth: v })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={t(bi('Horizons usuels', 'آفاق شائعة'))}>
          {[3, 5, 7, 10, 15, 20, 30].map((y) => (
            <button key={y} type="button" disabled={disabled} aria-pressed={h.years === y} onClick={() => set('horizon', { ...h, years: y })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${h.years === y ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50`}>
              {y} {t('years')}
            </button>
          ))}
        </div>
      </Card>
      <Card title={t(bi('Projet', 'المشروع'))}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField label={t('sector')} value={model.sector} disabled={disabled} options={SECTORS.map((s) => ({ value: s, label: SECTOR_LABEL[s][lang] }))} onChange={(v) => set('sector', v)} />
          <SelectField label={t('projectType')} value={model.projectType} disabled={disabled} options={PROJECT_TYPES.map((s) => ({ value: s, label: PROJECT_TYPE_LABEL[s][lang] }))} onChange={(v) => set('projectType', v)} />
        </div>
      </Card>
      <Card title={t(bi('Paramètres économiques', 'المعطيات الاقتصادية'))}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumField label={t(bi('Inflation annuelle', 'التضخم السنوي'))} suffix="%" value={g.inflationPct} min={-50} max={100} disabled={disabled} onChange={(v) => v != null && set('general', { ...g, inflationPct: v })} help={t(bi('Hypothèse saisie, appliquée aux charges indexées.', 'فرضية مُدخلة تطبق على التكاليف المفهرسة.'))} />
          <NumField label={t(bi('Taux d’actualisation', 'معدل التحيين'))} suffix="%" value={g.discountRatePct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && set('general', { ...g, discountRatePct: v })} />
          <NumField label={t(bi('Croissance terminale (optionnelle)', 'النمو النهائي (اختياري)'))} suffix="%" nullable value={g.terminalGrowthPct} min={-20} max={20} disabled={disabled} onChange={(v) => set('general', { ...g, terminalGrowthPct: v })} />
        </div>
      </Card>
      <ListEditor title={t(bi('Devises (taux saisis)', 'العملات (أسعار مُدخلة)'))} disabled={disabled} addLabel={t('add')} emptyLabel={t(bi('Toutes les valeurs sont en MAD.', 'جميع القيم بالدرهم.'))}
        items={g.exchangeRates.map((x, i) => ({ ...x, id: `fx-${i}` }))}
        onChange={(items) => onChange({ ...model, general: { ...g, exchangeRates: items.map(({ currency, rateToMad, annualChangePct }) => ({ currency, rateToMad, annualChangePct })) } })}
        create={() => ({ id: `fx-${g.exchangeRates.length}`, currency: 'EUR', rateToMad: 0, annualChangePct: 0 })}
        render={(x, u) => (<>
          <TextField label={t(bi('Code devise', 'رمز العملة'))} value={x.currency} maxLength={3} disabled={disabled} onChange={(v) => u({ currency: v.toUpperCase() })} />
          <NumField label={t(bi('1 unité = … MAD', 'وحدة واحدة = … درهم'))} value={x.rateToMad} min={0} disabled={disabled} onChange={(v) => v != null && u({ rateToMad: v })} help={t(bi('Taux saisi par l’utilisateur ; aucun cours n’est récupéré automatiquement.', 'سعر يدخله المستخدم؛ لا يتم جلب أي سعر تلقائياً.'))} />
          <NumField label={t(bi('Évolution annuelle', 'التغير السنوي'))} suffix="%" value={x.annualChangePct} min={-50} max={100} disabled={disabled} onChange={(v) => v != null && u({ annualChangePct: v })} />
        </>)} />
    </div>
  );
}

function Products({ model, set, disabled, labels }: P) {
  const { t } = useStudio();
  const vatOpts = useVatOptions(model, model.products.flatMap((p) => [p.vatRatePct, p.purchaseVatRatePct]));
  const currencies = [{ value: 'MAD', label: 'MAD' }, ...model.general.exchangeRates.map((x) => ({ value: x.currency, label: x.currency }))];
  return (
    <ListEditor title={t('as_products')} items={model.products} onChange={(v) => set('products', v)} create={() => newProduct({ name: `${t(bi('Produit', 'منتج'))} ${model.products.length + 1}` })}
      disabled={disabled} addLabel={t('add')} emptyLabel={t(bi('Aucun produit : le chiffre d’affaires sera nul.', 'لا يوجد منتج: سيكون رقم المعاملات صفراً.'))}
      render={(p, u) => (<>
        <TextField label={t('name')} value={p.name} disabled={disabled} onChange={(v) => u({ name: v })} />
        <SelectField label={t(bi('Type de revenu', 'نوع الإيراد'))} value={p.kind} disabled={disabled} options={[{ value: 'one_time', label: t(bi('Vente ponctuelle', 'بيع عادي')) }, { value: 'subscription', label: t(bi('Abonnement récurrent', 'اشتراك متكرر')) }]} onChange={(v) => u({ kind: v })} />
        <TextField label={t(bi('Segment', 'الشريحة'))} value={p.segment} disabled={disabled} onChange={(v) => u({ segment: v })} />
        <TextField label={t(bi('Canal de vente', 'قناة البيع'))} value={p.channel} disabled={disabled} onChange={(v) => u({ channel: v })} />
        <SelectField label={t(bi('Phase', 'المرحلة'))} value={p.phase} disabled={disabled} options={[{ value: 'initial', label: t(bi('Initiale', 'أولية')) }, { value: 'expansion', label: t(bi('Extension', 'توسعة')) }]} onChange={(v) => u({ phase: v })} />
        <SelectField label={t(bi('Devise', 'العملة'))} value={p.currency} disabled={disabled} options={currencies} onChange={(v) => u({ currency: v })} />
        <NumField label={t(bi('Prix unitaire HT', 'الثمن الوحدوي دون رسوم'))} value={p.unitPrice} min={0} disabled={disabled} onChange={(v) => v != null && u({ unitPrice: v })} />
        <NumField label={t(bi('Évolution annuelle du prix', 'التطور السنوي للثمن'))} suffix="%" value={p.priceGrowthPct} min={-100} max={1000} disabled={disabled} onChange={(v) => v != null && u({ priceGrowthPct: v })} />
        <NumField label={p.kind === 'subscription' ? t(bi('Nouveaux abonnés au 1er mois', 'المشتركون الجدد في الشهر الأول')) : t(bi('Volume du 1er mois', 'حجم الشهر الأول'))} value={p.volumeMonth1} min={0} disabled={disabled} onChange={(v) => v != null && u({ volumeMonth1: v })} />
        <TextField label={t(bi('Croissance annuelle des volumes (%, par année, séparées par ;)', 'النمو السنوي للحجم (%، لكل سنة، مفصولة بـ ;)'))} value={p.volumeGrowthPct.join(' ; ')} disabled={disabled}
          onChange={(v) => { const arr = v.split(/[;]/).map((s) => Number(s.trim().replace(',', '.'))).filter((n) => Number.isFinite(n)); if (arr.length) u({ volumeGrowthPct: arr }); }} help={t(bi('La dernière valeur se répète.', 'تتكرر القيمة الأخيرة.'))} />
        <MonthField label={t(bi('Lancement', 'الإطلاق'))} value={p.launchMonth} labels={labels} disabled={disabled} onChange={(v) => v != null && u({ launchMonth: v })} />
        <MonthField label={t(bi('Fin (optionnelle)', 'النهاية (اختياري)'))} value={p.endMonth} nullable labels={labels} disabled={disabled} onChange={(v) => u({ endMonth: v })} />
        <NumField label={t(bi('Remise', 'التخفيض'))} suffix="%" value={p.discountPct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ discountPct: v })} />
        <NumField label={t(bi('Retours', 'المرتجعات'))} suffix="%" value={p.returnsPct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ returnsPct: v })} />
        <NumField label={t(bi('Capacité mensuelle (optionnelle)', 'الطاقة الشهرية (اختياري)'))} nullable value={p.capacityPerMonth} min={0} disabled={disabled} onChange={(v) => u({ capacityPerMonth: v })} />
        <NumField label={t(bi('Taux d’utilisation', 'نسبة الاستغلال'))} suffix="%" value={p.utilizationPct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ utilizationPct: v })} />
        <NumField label={t(bi('Coût unitaire HT', 'التكلفة الوحدوية دون رسوم'))} value={p.unitCost} min={0} disabled={disabled} onChange={(v) => v != null && u({ unitCost: v })} />
        <NumField label={t(bi('Évolution annuelle du coût', 'التطور السنوي للتكلفة'))} suffix="%" value={p.unitCostGrowthPct} min={-100} max={1000} disabled={disabled} onChange={(v) => v != null && u({ unitCostGrowthPct: v })} />
        <SelectField label={t(bi('TVA sur ventes', 'الضريبة على المبيعات'))} value={p.vatRatePct} disabled={disabled} options={vatOpts} onChange={(v) => u({ vatRatePct: v })} />
        <SelectField label={t(bi('TVA sur achats', 'الضريبة على المشتريات'))} value={p.purchaseVatRatePct} disabled={disabled} options={vatOpts} onChange={(v) => u({ purchaseVatRatePct: v })} />
        {p.kind === 'subscription' && (<>
          <NumField label={t(bi('Churn mensuel', 'معدل الفقد الشهري'))} suffix="%" value={p.churnPctMonthly} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ churnPctMonthly: v })} />
          <NumField label={t(bi('Coût d’acquisition par client (CAC)', 'تكلفة اكتساب الزبون'))} value={p.cacPerCustomer} min={0} disabled={disabled} onChange={(v) => v != null && u({ cacPerCustomer: v })} />
        </>)}
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-xs font-medium text-gray-600 mb-1">{t(bi('Saisonnalité (coefficients mensuels, janvier → décembre)', 'الموسمية (معاملات شهرية، يناير ← دجنبر)'))}</p>
          <div className="grid grid-cols-6 lg:grid-cols-12 gap-1">
            {p.seasonality.map((s, i) => (
              <input key={`${i}-${s}`} aria-label={`M${i + 1}`} inputMode="decimal" disabled={disabled} defaultValue={s} className="w-full rounded border border-gray-300 px-1 py-1 text-xs text-center tabular-nums"
                onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n) && n >= 0 && n <= 10) { const next = [...p.seasonality]; next[i] = n; u({ seasonality: next }); } else e.target.value = String(s); }} />
            ))}
          </div>
        </div>
      </>)} />
  );
}

function Expenses({ model, set, disabled, labels }: P) {
  const { t, lang } = useStudio();
  const vatOpts = useVatOptions(model, model.expenses.map((e) => e.vatRatePct));
  return (
    <ListEditor title={t('as_expenses')} items={model.expenses} onChange={(v) => set('expenses', v)} create={() => newExpense({ name: `${t(bi('Charge', 'تكلفة'))} ${model.expenses.length + 1}` })}
      disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
      render={(e, u) => (<>
        <TextField label={t('name')} value={e.name} disabled={disabled} onChange={(v) => u({ name: v })} />
        <SelectField label={t(bi('Catégorie', 'الفئة'))} value={e.category} disabled={disabled} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c][lang] }))} onChange={(v) => u({ category: v })} />
        <TextField label={t(bi('Centre de coût', 'مركز التكلفة'))} value={e.costCenter} disabled={disabled} onChange={(v) => u({ costCenter: v })} />
        <SelectField label={t(bi('Comportement', 'السلوك'))} value={e.behavior} disabled={disabled} options={[{ value: 'fixed', label: t(bi('Fixe (montant mensuel)', 'ثابتة (مبلغ شهري)')) }, { value: 'variable_revenue_pct', label: t(bi('Variable (% du CA)', 'متغيرة (% من رقم المعاملات)')) }]} onChange={(v) => u({ behavior: v })} />
        {e.behavior === 'fixed'
          ? <NumField label={t(bi('Montant mensuel HT', 'المبلغ الشهري دون رسوم'))} value={e.amountMonthly} min={0} disabled={disabled} onChange={(v) => v != null && u({ amountMonthly: v })} />
          : <NumField label={t(bi('% du CA', '% من رقم المعاملات'))} suffix="%" value={e.pctOfRevenue} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ pctOfRevenue: v })} />}
        <NumField label={t(bi('Croissance annuelle', 'النمو السنوي'))} suffix="%" value={e.growthPct} min={-100} max={1000} disabled={disabled} onChange={(v) => v != null && u({ growthPct: v })} />
        <Toggle label={t(bi('Indexée sur l’inflation', 'مفهرسة على التضخم'))} checked={e.indexedOnInflation} disabled={disabled} onChange={(v) => u({ indexedOnInflation: v })} />
        <MonthField label={t(bi('Début', 'البداية'))} value={e.startMonth} labels={labels} disabled={disabled} onChange={(v) => v != null && u({ startMonth: v })} />
        <MonthField label={t(bi('Fin (optionnelle)', 'النهاية (اختياري)'))} value={e.endMonth} nullable labels={labels} disabled={disabled} onChange={(v) => u({ endMonth: v })} />
        <SelectField label={t(bi('TVA', 'الضريبة على القيمة المضافة'))} value={e.vatRatePct} disabled={disabled} options={vatOpts} onChange={(v) => u({ vatRatePct: v })} />
        <Toggle label={t(bi('TVA déductible', 'ضريبة قابلة للخصم'))} checked={e.vatDeductible} disabled={disabled} onChange={(v) => u({ vatDeductible: v })} />
        <NumField label={t(bi('Délai de paiement spécifique (jours)', 'أجل أداء خاص (أيام)'))} nullable integer value={e.paymentDelayDays} min={0} max={365} disabled={disabled} onChange={(v) => u({ paymentDelayDays: v })} help={t(bi('Vide : délai fournisseurs général.', 'فارغ: أجل الموردين العام.'))} />
      </>)} />
  );
}

function Staff({ model, set, disabled, labels }: P) {
  const { t } = useStudio();
  const f = useFormat();
  const year = Number(model.horizon.startMonth.slice(0, 4));
  return (
    <div className="space-y-3">
      <Notice>{t(bi('Cotisations CNSS, AMO, taxe de formation professionnelle et IR calculés selon le référentiel versionné (onglet Fiscalité). Salaire brut mensuel par personne.', 'الاشتراكات في الضمان الاجتماعي والتأمين الإجباري عن المرض وضريبة التكوين المهني والضريبة على الدخل محسوبة وفق المرجع المؤرخ (تبويب الجبايات). الأجر الإجمالي الشهري لكل شخص.'))}</Notice>
      <ListEditor title={t('as_staff')} items={model.staff} onChange={(v) => set('staff', v)} create={() => newStaff({ role: `${t(bi('Poste', 'منصب'))} ${model.staff.length + 1}` })}
        disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        render={(s, u) => {
          const slip = monthlyPayroll(s.grossMonthly, s.dependants, year);
          return (<>
            <TextField label={t(bi('Poste', 'المنصب'))} value={s.role} disabled={disabled} onChange={(v) => u({ role: v })} />
            <TextField label={t(bi('Centre de coût', 'مركز التكلفة'))} value={s.costCenter} disabled={disabled} onChange={(v) => u({ costCenter: v })} />
            <NumField label={t(bi('Effectif', 'العدد'))} value={s.headcount} min={0} max={100000} disabled={disabled} onChange={(v) => v != null && u({ headcount: v })} />
            <NumField label={t(bi('Salaire brut mensuel', 'الأجر الإجمالي الشهري'))} value={s.grossMonthly} min={0} disabled={disabled} onChange={(v) => v != null && u({ grossMonthly: v })} />
            <MonthField label={t(bi('Embauche', 'التوظيف'))} value={s.startMonth} labels={labels} disabled={disabled} onChange={(v) => v != null && u({ startMonth: v })} />
            <MonthField label={t(bi('Départ (optionnel)', 'المغادرة (اختياري)'))} value={s.endMonth} nullable labels={labels} disabled={disabled} onChange={(v) => u({ endMonth: v })} />
            <NumField label={t(bi('Augmentation annuelle', 'الزيادة السنوية'))} suffix="%" value={s.annualRaisePct} min={-50} max={100} disabled={disabled} onChange={(v) => v != null && u({ annualRaisePct: v })} />
            <NumField label={t(bi('Personnes à charge', 'الأشخاص المتكفل بهم'))} integer value={s.dependants} min={0} max={20} disabled={disabled} onChange={(v) => v != null && u({ dependants: v })} />
            <p className="sm:col-span-2 lg:col-span-4 text-[11px] text-gray-500" dir="ltr">
              {t(bi(`Bulletin ${year} par personne`, `ورقة الأداء ${year} لكل شخص`))} — {t(bi('net', 'الصافي'))} {f.num(slip.net, 2)} · IR {f.num(slip.ir, 2)} · CNSS+AMO {t(bi('salarié', 'الأجير'))} {f.num(slip.cnssEmployee + slip.amoEmployee, 2)} · {t(bi('charges patronales', 'تكاليف المشغل'))} {f.num(slip.cnssEmployer + slip.amoEmployer + slip.tfpEmployer, 2)} MAD
            </p>
          </>);
        }} />
    </div>
  );
}

function Investments({ model, set, disabled, labels }: P) {
  const { t } = useStudio();
  const vatOpts = useVatOptions(model, model.investments.map((i) => i.vatRatePct));
  const kinds = [
    { value: 'tangible', label: t(bi('Corporelle', 'مادية')) }, { value: 'intangible', label: t(bi('Incorporelle', 'غير مادية')) },
    { value: 'land', label: t(bi('Terrain (non amortissable)', 'أرض (غير قابلة للاهتلاك)')) }, { value: 'goodwill', label: t(bi('Fonds commercial (non amorti)', 'الأصل التجاري (غير مستهلك)')) },
    { value: 'deposit', label: t(bi('Dépôt et cautionnement', 'الودائع والضمانات')) },
  ] as const;
  return (
    <ListEditor title={t('as_investments')} items={model.investments} onChange={(v) => set('investments', v)} create={() => newInvestment({ name: `${t(bi('Investissement', 'استثمار'))} ${model.investments.length + 1}` })}
      disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
      render={(i, u) => {
        const legal = legalDecliningCoefficient(i.usefulLifeYears);
        return (<>
          <TextField label={t('name')} value={i.name} disabled={disabled} onChange={(v) => u({ name: v })} />
          <SelectField label={t(bi('Nature', 'الطبيعة'))} value={i.kind} disabled={disabled} options={kinds} onChange={(v) => u({ kind: v })} />
          <SelectField label={t(bi('Phase', 'المرحلة'))} value={i.phase} disabled={disabled} options={[{ value: 'initial', label: t(bi('Initiale', 'أولية')) }, { value: 'expansion', label: t(bi('Extension', 'توسعة')) }]} onChange={(v) => u({ phase: v })} />
          <NumField label={t(bi('Montant HT', 'المبلغ دون رسوم'))} value={i.amountHT} min={0} disabled={disabled} onChange={(v) => v != null && u({ amountHT: v })} />
          <SelectField label={t(bi('TVA', 'الضريبة على القيمة المضافة'))} value={i.vatRatePct} disabled={disabled} options={vatOpts} onChange={(v) => u({ vatRatePct: v })} />
          <Toggle label={t(bi('TVA récupérable', 'ضريبة قابلة للاسترجاع'))} checked={i.vatRecoverable} disabled={disabled} onChange={(v) => u({ vatRecoverable: v })} />
          {i.vatRecoverable && model.tax.vatInvestmentRefund && (
            <Toggle label={t(bi('Éligible au remboursement (art. 103 bis : hors mobilier, matériel de bureau et véhicules de tourisme)', 'مؤهل للاسترداد (المادة 103 مكرر: باستثناء أثاث ومعدات المكتب وسيارات نقل الأشخاص)'))} checked={i.vatRefundEligible} disabled={disabled} onChange={(v) => u({ vatRefundEligible: v })} />
          )}
          <MonthField label={t(bi('Date d’acquisition', 'تاريخ الاقتناء'))} value={i.month} labels={labels} disabled={disabled} onChange={(v) => v != null && u({ month: v })} />
          {i.kind !== 'tangible' && i.kind !== 'intangible' && (
            <p className="text-xs text-gray-500 self-end">{t(bi('Non amortissable (terrain, fonds commercial, dépôt) : reste à son coût au bilan.', 'غير قابل للاهتلاك (أرض، أصل تجاري، ضمان): يبقى بتكلفته في الميزانية.'))}</p>
          )}
          {(i.kind === 'tangible' || i.kind === 'intangible') && <>
          <NumField label={t(bi('Durée d’amortissement (ans)', 'مدة الاهتلاك (سنوات)'))} integer value={i.usefulLifeYears} min={0} max={50} disabled={disabled} onChange={(v) => v != null && u({ usefulLifeYears: v })} />
          <SelectField label={t(bi('Méthode', 'الطريقة'))} value={i.method} disabled={disabled} options={[{ value: 'linear', label: t(bi('Linéaire', 'خطية')) }, { value: 'declining', label: t(bi('Dégressive', 'متناقصة')) }]} onChange={(v) => u({ method: v })} />
          </>}
          {(i.kind === 'tangible' || i.kind === 'intangible') && i.method === 'declining' && (
            <NumField label={t(bi('Coefficient dégressif', 'المعامل المتناقص'))} value={i.decliningCoefficient} min={1} max={5} disabled={disabled} onChange={(v) => v != null && u({ decliningCoefficient: v })}
              help={legal == null ? t(bi('Pas de coefficient légal pour cette durée (CGI art. 10).', 'لا يوجد معامل قانوني لهذه المدة.')) : `${t(bi('Coefficient CGI art. 10', 'معامل المدونة العامة للضرائب'))} : ${legal}`} />
          )}
        </>);
      }} />
  );
}

function FinancingEditor({ model, set, disabled, labels }: P) {
  const { t } = useStudio();
  const fin = model.financing;
  const setFin = (patch: Partial<typeof fin>) => set('financing', { ...fin, ...patch });
  const vatOpts = useVatOptions(model, fin.leases.map((l) => l.vatRatePct));
  return (
    <div className="space-y-4">
      <ListEditor title={t(bi('Apports en capital', 'المساهمات في الرأسمال'))} items={fin.equity} onChange={(v) => setFin({ equity: v })} create={() => ({ id: newId('eq'), name: t(bi('Apport', 'مساهمة')), amount: 0, month: 0 })}
        disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        render={(e, u) => (<>
          <TextField label={t('name')} value={e.name} disabled={disabled} onChange={(v) => u({ name: v })} />
          <NumField label={t(bi('Montant', 'المبلغ'))} value={e.amount} min={0} disabled={disabled} onChange={(v) => v != null && u({ amount: v })} />
          <MonthField label={t(bi('Date', 'التاريخ'))} value={e.month} labels={labels} disabled={disabled} onChange={(v) => v != null && u({ month: v })} />
        </>)} />
      <ListEditor title={t(bi('Emprunts bancaires et comptes courants d’associés', 'القروض البنكية والحسابات الجارية للشركاء'))} items={fin.loans} onChange={(v) => setFin({ loans: v })} create={() => newLoan()}
        disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        render={(l, u) => (<>
          <TextField label={t('name')} value={l.name} disabled={disabled} onChange={(v) => u({ name: v })} />
          <SelectField label={t(bi('Type', 'النوع'))} value={l.kind} disabled={disabled} options={[{ value: 'bank', label: t(bi('Banque', 'بنك')) }, { value: 'shareholder', label: t(bi('Compte courant d’associé', 'حساب جاري للشريك')) }]} onChange={(v) => u({ kind: v })} />
          <NumField label={t(bi('Principal', 'أصل الدين'))} value={l.principal} min={0} disabled={disabled} onChange={(v) => v != null && u({ principal: v })} />
          <MonthField label={t(bi('Déblocage', 'تاريخ الصرف'))} value={l.month} labels={labels} disabled={disabled} onChange={(v) => v != null && u({ month: v })} />
          <NumField label={t(bi('Taux annuel', 'المعدل السنوي'))} suffix="%" value={l.annualRatePct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ annualRatePct: v })} />
          <NumField label={t(bi('Durée (mois)', 'المدة (أشهر)'))} integer value={l.termMonths} min={1} max={480} disabled={disabled} onChange={(v) => v != null && u({ termMonths: v })} />
          <NumField label={t(bi('Différé (mois)', 'فترة الإعفاء (أشهر)'))} integer value={l.graceMonths} min={0} max={l.termMonths - 1} disabled={disabled} onChange={(v) => v != null && u({ graceMonths: v })} />
          <SelectField label={t(bi('Type de différé', 'نوع الإعفاء'))} value={l.graceType} disabled={disabled} options={[{ value: 'interest_only', label: t(bi('Intérêts payés', 'أداء الفوائد')) }, { value: 'capitalized', label: t(bi('Intérêts capitalisés', 'فوائد مرسملة')) }]} onChange={(v) => u({ graceType: v })} />
          <SelectField label={t(bi('Amortissement', 'طريقة السداد'))} value={l.method} disabled={disabled} options={[{ value: 'annuity', label: t(bi('Annuités constantes', 'أقساط ثابتة')) }, { value: 'constant_principal', label: t(bi('Amortissement constant', 'استهلاك ثابت')) }, { value: 'bullet', label: t(bi('In fine', 'دفعة واحدة في النهاية')) }]} onChange={(v) => u({ method: v })} />
          <NumField label={t(bi('Frais de dossier', 'مصاريف الملف'))} suffix="%" value={l.feesPct} min={0} max={20} disabled={disabled} onChange={(v) => v != null && u({ feesPct: v })} />
        </>)} />
      <ListEditor title={t(bi('Subventions', 'المنح'))} items={fin.grants} onChange={(v) => setFin({ grants: v })} create={() => ({ id: newId('grt'), name: t(bi('Subvention', 'منحة')), kind: 'investment' as const, amount: 0, month: 0, amortizationYears: 5 })}
        disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        render={(g, u) => (<>
          <TextField label={t('name')} value={g.name} disabled={disabled} onChange={(v) => u({ name: v })} />
          <SelectField label={t(bi('Nature', 'الطبيعة'))} value={g.kind} disabled={disabled} options={[{ value: 'investment', label: t(bi('Subvention d’investissement', 'منحة استثمار')) }, { value: 'operating', label: t(bi('Subvention d’exploitation', 'منحة استغلال')) }]} onChange={(v) => u({ kind: v, amortizationYears: v === 'operating' ? 0 : Math.max(1, g.amortizationYears) })} />
          <NumField label={t(bi('Montant', 'المبلغ'))} value={g.amount} min={0} disabled={disabled} onChange={(v) => v != null && u({ amount: v })} />
          <MonthField label={t(bi('Encaissement', 'التحصيل'))} value={g.month} labels={labels} disabled={disabled} onChange={(v) => v != null && u({ month: v })} />
          {g.kind === 'investment' && <NumField label={t(bi('Reprise sur (ans)', 'الإدراج على مدى (سنوات)'))} integer value={g.amortizationYears} min={1} max={50} disabled={disabled} onChange={(v) => v != null && u({ amortizationYears: v })} />}
        </>)} />
      <ListEditor title={t(bi('Crédit-bail', 'الائتمان الإيجاري'))} items={fin.leases} onChange={(v) => setFin({ leases: v })} create={() => ({ id: newId('lse'), name: t(bi('Crédit-bail', 'ائتمان إيجاري')), monthlyRentHT: 0, vatRatePct: 20, startMonth: 0, termMonths: 36, purchaseOptionHT: 0, optionAssetLifeYears: 5 })}
        disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        render={(l, u) => (<>
          <TextField label={t('name')} value={l.name} disabled={disabled} onChange={(v) => u({ name: v })} />
          <NumField label={t(bi('Loyer mensuel HT', 'الكراء الشهري دون رسوم'))} value={l.monthlyRentHT} min={0} disabled={disabled} onChange={(v) => v != null && u({ monthlyRentHT: v })} />
          <SelectField label={t(bi('TVA', 'الضريبة على القيمة المضافة'))} value={l.vatRatePct} disabled={disabled} options={vatOpts} onChange={(v) => u({ vatRatePct: v })} />
          <MonthField label={t(bi('Début', 'البداية'))} value={l.startMonth} labels={labels} disabled={disabled} onChange={(v) => v != null && u({ startMonth: v })} />
          <NumField label={t(bi('Durée (mois)', 'المدة (أشهر)'))} integer value={l.termMonths} min={1} max={240} disabled={disabled} onChange={(v) => v != null && u({ termMonths: v })} />
          <NumField label={t(bi('Option d’achat HT', 'خيار الشراء دون رسوم'))} value={l.purchaseOptionHT} min={0} disabled={disabled} onChange={(v) => v != null && u({ purchaseOptionHT: v })} />
          <NumField label={t(bi('Amortissement de l’option (ans)', 'اهتلاك الخيار (سنوات)'))} integer value={l.optionAssetLifeYears} min={1} max={50} disabled={disabled} onChange={(v) => v != null && u({ optionAssetLifeYears: v })} />
        </>)} />
      <Card title={t(bi('Découvert et dividendes', 'السحب على المكشوف والأرباح'))}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <NumField label={t(bi('Taux du découvert', 'معدل السحب على المكشوف'))} suffix="%" value={fin.overdraftRatePct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && setFin({ overdraftRatePct: v })} />
          <NumField label={t(bi('Taux de distribution', 'نسبة التوزيع'))} suffix="%" value={fin.dividends.payoutPct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && setFin({ dividends: { ...fin.dividends, payoutPct: v } })} />
          <NumField label={t(bi('À partir de l’exercice n°', 'ابتداءً من السنة رقم'))} integer value={fin.dividends.fromFiscalYearIndex} min={1} max={MAX_YEARS + 1} disabled={disabled} onChange={(v) => v != null && setFin({ dividends: { ...fin.dividends, fromFiscalYearIndex: v } })} help={t(bi('Bénéfice de l’exercice n°, distribué au cours de l’exercice suivant (1 = premier exercice).', 'ربح السنة رقم، يوزع خلال السنة الموالية (1 = السنة الأولى).'))} />
          <NumField label={t(bi('Mois de paiement dans l’exercice', 'شهر الأداء في السنة'))} integer value={fin.dividends.paymentMonthOfFiscalYear} min={1} max={12} disabled={disabled} onChange={(v) => v != null && setFin({ dividends: { ...fin.dividends, paymentMonthOfFiscalYear: v } })} />
          <SelectField label={t(bi('Retenue à la source sur dividendes', 'الاقتطاع من المنبع على الأرباح'))} value={fin.dividends.withholdingMode} disabled={disabled}
            options={[{ value: 'legal', label: t(bi('Taux légal à la date de paiement (art. 19-IV-B)', 'السعر القانوني في تاريخ الأداء (المادة 19-IV-B)')) }, { value: 'custom', label: t(bi('Taux saisi', 'سعر مُدخل')) }]}
            onChange={(v) => setFin({ dividends: { ...fin.dividends, withholdingMode: v } })} />
          {fin.dividends.withholdingMode === 'custom' ? (
            <NumField label={t(bi('Taux de retenue saisi', 'سعر الاقتطاع المُدخل'))} suffix="%" value={fin.dividends.withholdingRatePct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && setFin({ dividends: { ...fin.dividends, withholdingRatePct: v } })} help={t(bi('À confirmer par un professionnel selon le bénéficiaire (non-résidents, conventions).', 'يؤكده مهني حسب المستفيد (غير المقيمين، الاتفاقيات).'))} />
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 self-end">{t(bi('Personnes physiques résidentes et sociétés : 12,5 % en 2025, 11,25 % en 2026, 10 % à partir de 2027 (art. 247-XXXVII-C). Autres bénéficiaires : à faire vérifier.', 'الأشخاص الذاتيون المقيمون والشركات: 12,5% سنة 2025، و11,25% سنة 2026، و10% ابتداءً من 2027 (المادة 247-XXXVII-C). باقي المستفيدين: يجب التحقق.'))}</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function WorkingCapital({ model, set, disabled }: P) {
  const { t } = useStudio();
  const wc = model.workingCapital;
  const u = (patch: Partial<typeof wc>) => set('workingCapital', { ...wc, ...patch });
  return (
    <Card title={t('as_wc')}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumField label={t(bi('Ventes encaissées au comptant', 'المبيعات المحصلة نقداً'))} suffix="%" value={wc.cashSalesPct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ cashSalesPct: v })} />
        <NumField label={t(bi('Délai clients (jours)', 'أجل الزبناء (أيام)'))} integer value={wc.dsoDays} min={0} max={365} disabled={disabled} onChange={(v) => v != null && u({ dsoDays: v })} />
        <NumField label={t(bi('Délai fournisseurs (jours)', 'أجل الموردين (أيام)'))} integer value={wc.dpoDays} min={0} max={365} disabled={disabled} onChange={(v) => v != null && u({ dpoDays: v })} />
        <NumField label={t(bi('Stock (jours d’achats consommés)', 'المخزون (أيام المشتريات المستهلكة)'))} integer value={wc.inventoryDays} min={0} max={720} disabled={disabled} onChange={(v) => v != null && u({ inventoryDays: v })} />
        <NumField label={t(bi('Créances irrécouvrables', 'الديون غير القابلة للاسترداد'))} suffix="%" value={wc.badDebtPct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && u({ badDebtPct: v })} />
        <NumField label={t(bi('Trésorerie minimale souhaitée', 'الحد الأدنى المرغوب للخزينة'))} value={wc.minimumCash} min={0} disabled={disabled} onChange={(v) => v != null && u({ minimumCash: v })} />
      </div>
    </Card>
  );
}

function TaxEditor({ model, set, disabled, labels }: P) {
  const { t } = useStudio();
  const tax = model.tax;
  const u = (patch: Partial<typeof tax>) => set('tax', { ...tax, ...patch });
  const fyCount = Math.max(1, model.horizon.years + (model.horizon.fiscalYearStartMonth === 1 ? 0 : 1));
  return (
    <div className="space-y-4">
      <Notice tone="warning">{t(bi('Les régimes, exonérations et taux particuliers dépendent de l’éligibilité de l’entreprise : ils ne sont jamais appliqués automatiquement. Toute exonération saisie doit citer sa base légale et être validée par un professionnel.', 'الأنظمة والإعفاءات والأسعار الخاصة تتوقف على أهلية المقاولة ولا تطبق تلقائياً. كل إعفاء مُدخل يجب أن يذكر سنده القانوني وأن يصادق عليه مهني.'))}</Notice>
      <Card title={t('as_tax')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SelectField<TaxRegime> label={t(bi('Régime d’imposition du résultat', 'نظام الضريبة على النتيجة'))} value={tax.regime} disabled={disabled}
            options={[{ value: 'is', label: t(bi('Impôt sur les sociétés', 'الضريبة على الشركات')) }, { value: 'ir_professional', label: t(bi('IR professionnel (résultat net réel)', 'الضريبة على الدخل المهني')) }, { value: 'auto_entrepreneur', label: t(bi('Auto-entrepreneur', 'المقاول الذاتي')) }]} onChange={(v) => u({ regime: v })} />
          <SelectField<IsCategory> label={t(bi('Catégorie IS (transitoire 2023–2025)', 'فئة الضريبة على الشركات (انتقالية 2023–2025)'))} value={tax.isCategory} disabled={disabled}
            options={[{ value: 'standard', label: t(bi('Droit commun', 'القانون العام')) }, { value: 'industrial', label: t(bi('Industriel', 'صناعي')) }, { value: 'zai_cfc', label: 'ZAI / CFC' }, { value: 'former_20pct_sector', label: t(bi('Ancien secteur à 20 %', 'قطاع سابق بنسبة 20%')) }, { value: 'credit_insurance', label: t(bi('Établissement de crédit / assurance', 'مؤسسة ائتمان / تأمين')) }]} onChange={(v) => u({ isCategory: v })} />
          <Toggle label={t(bi('Assujetti à la TVA', 'خاضع للضريبة على القيمة المضافة'))} checked={tax.vatSubject} disabled={disabled} onChange={(v) => u({ vatSubject: v })} />
          <SelectField label={t(bi('Régime de TVA', 'نظام الضريبة على القيمة المضافة'))} value={tax.vatRegime} disabled={disabled} options={[{ value: 'encaissement', label: t(bi('Encaissement', 'التحصيل')) }, { value: 'debit', label: t(bi('Débit (option)', 'الاستحقاق (اختيار)')) }]} onChange={(v) => u({ vatRegime: v })} />
          <SelectField label={t(bi('Périodicité TVA', 'دورية التصريح'))} value={tax.vatPeriodicity} disabled={disabled} options={[{ value: 'auto', label: t(bi('Selon le CA (art. 108)', 'حسب رقم المعاملات (المادة 108)')) }, { value: 'monthly', label: t(bi('Mensuelle', 'شهرية')) }, { value: 'quarterly', label: t(bi('Trimestrielle', 'فصلية')) }]} onChange={(v) => u({ vatPeriodicity: v })} />
          <Toggle label={t(bi('Demander le remboursement du crédit de TVA sur investissements (art. 103 bis)', 'طلب استرداد دين الضريبة على الاستثمارات (المادة 103 مكرر)'))} checked={tax.vatInvestmentRefund} disabled={disabled || !tax.vatSubject} onChange={(v) => u({ vatInvestmentRefund: v })} />
          <NumField label={t(bi('Début d’activité (mois relatif, négatif si antérieur)', 'بداية النشاط (شهر نسبي، سالب إن كان سابقاً)'))} integer value={tax.activityStartMonth} min={-600} max={labels.length} disabled={disabled} onChange={(v) => v != null && u({ activityStartMonth: v })} />
          <Toggle label={t(bi('Exonération de cotisation minimale (36 premiers mois, art. 144-I-C)', 'إعفاء من الحد الأدنى للضريبة (36 شهراً الأولى)'))} checked={tax.applyMinimumContributionExemption} disabled={disabled} onChange={(v) => u({ applyMinimumContributionExemption: v })} />
          <NumField label={t(bi('Taux de cotisation minimale saisi (optionnel)', 'سعر الحد الأدنى المُدخل (اختياري)'))} suffix="%" nullable value={tax.minimumContributionRateOverridePct} min={0} max={10} disabled={disabled} onChange={(v) => u({ minimumContributionRateOverridePct: v })} />
          <NumField label={t(bi('Report des déficits (exercices)', 'ترحيل العجز (سنوات)'))} integer value={tax.lossCarryforwardYears} min={0} max={30} disabled={disabled} onChange={(v) => v != null && u({ lossCarryforwardYears: v })} />
          {tax.regime === 'auto_entrepreneur' && <NumField label={t(bi('Taux auto-entrepreneur (saisi)', 'سعر المقاول الذاتي (مُدخل)'))} suffix="%" value={tax.autoEntrepreneurRatePct} min={0} max={10} disabled={disabled} onChange={(v) => v != null && u({ autoEntrepreneurRatePct: v })} />}
        </div>
      </Card>
      <Card title={t(bi('Réintégrations fiscales par exercice (MAD)', 'الإدماجات الجبائية حسب السنة (درهم)'))}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: fyCount }, (_, i) => (
            <NumField key={i} label={`${t('year')} ${i + 1}`} value={tax.nonDeductibleByFiscalYear[i] ?? 0} min={0} disabled={disabled}
              onChange={(v) => { if (v == null) return; const next = [...tax.nonDeductibleByFiscalYear]; while (next.length <= i) next.push(0); next[i] = v; u({ nonDeductibleByFiscalYear: next }); }} />
          ))}
        </div>
      </Card>
      <ListEditor title={t(bi('Exonérations et réductions d’IS (saisies)', 'الإعفاءات والتخفيضات (مُدخلة)'))} items={tax.exemptions} onChange={(v) => u({ exemptions: v })}
        create={() => ({ id: newId('exm'), tax: 'is' as const, label: '', fromFiscalYearIndex: 0, toFiscalYearIndex: 0, reductionPct: 0, minimumContributionExempt: false, legalBasis: '' })}
        disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        render={(e, uu) => (<>
          <TextField label={t(bi('Libellé', 'التسمية'))} value={e.label} disabled={disabled} onChange={(v) => uu({ label: v })} />
          <TextField label={t(bi('Base légale (obligatoire)', 'السند القانوني (إلزامي)'))} value={e.legalBasis} disabled={disabled} onChange={(v) => uu({ legalBasis: v })} />
          <NumField label={t(bi('Du n° d’exercice', 'من السنة رقم'))} integer value={e.fromFiscalYearIndex} min={0} max={MAX_YEARS} disabled={disabled} onChange={(v) => v != null && uu({ fromFiscalYearIndex: v })} />
          <NumField label={t(bi('Au n° d’exercice', 'إلى السنة رقم'))} integer value={e.toFiscalYearIndex} min={0} max={MAX_YEARS} disabled={disabled} onChange={(v) => v != null && uu({ toFiscalYearIndex: v })} />
          <NumField label={t(bi('Réduction', 'التخفيض'))} suffix="%" value={e.reductionPct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && uu({ reductionPct: v })} />
          <Toggle label={t(bi('Exonère aussi la cotisation minimale', 'يعفي أيضاً من الحد الأدنى'))} checked={e.minimumContributionExempt} disabled={disabled} onChange={(v) => uu({ minimumContributionExempt: v })} />
        </>)} />
      <ListEditor title={t(bi('Impôts locaux et droits (TP, TSC, enregistrement…)', 'الضرائب المحلية والرسوم'))} items={tax.localTaxes} onChange={(v) => u({ localTaxes: v })}
        create={() => ({ id: newId('ltx'), name: '', kind: 'tp' as const, base: 'fixed' as const, ratePct: 0, amount: 0, baseAmount: 0, startFiscalYearIndex: 0, exemptYears: 0, paymentMonthOfFiscalYear: 1, legalBasis: '' })}
        disabled={disabled} addLabel={t('add')} emptyLabel={t(bi('Aucun impôt local saisi : TP, TSC et droits d’enregistrement dépendent de la commune et de la valeur locative ; saisissez-les avec leur base légale.', 'لم يتم إدخال أي ضريبة محلية.'))}
        render={(l, uu) => (<>
          <TextField label={t('name')} value={l.name} disabled={disabled} onChange={(v) => uu({ name: v })} />
          <SelectField label={t(bi('Nature', 'الطبيعة'))} value={l.kind} disabled={disabled} options={[{ value: 'tp', label: t(bi('Taxe professionnelle', 'الرسم المهني')) }, { value: 'tsc', label: t(bi('Taxe de services communaux', 'رسم الخدمات الجماعية')) }, { value: 'registration', label: t(bi('Droits d’enregistrement', 'رسوم التسجيل')) }, { value: 'other', label: t(bi('Autre', 'أخرى')) }]} onChange={(v) => uu({ kind: v })} />
          <SelectField label={t(bi('Assiette', 'الوعاء'))} value={l.base} disabled={disabled} options={[{ value: 'fixed', label: t(bi('Montant fixe', 'مبلغ ثابت')) }, { value: 'rental_value', label: t(bi('Valeur locative', 'القيمة الكرائية')) }, { value: 'investment', label: t(bi('Montant investi', 'المبلغ المستثمر')) }, { value: 'revenue', label: t(bi('CA', 'رقم المعاملات')) }]} onChange={(v) => uu({ base: v })} />
          {l.base === 'fixed'
            ? <NumField label={t(bi('Montant annuel', 'المبلغ السنوي'))} value={l.amount} min={0} disabled={disabled} onChange={(v) => v != null && uu({ amount: v })} />
            : <NumField label={t(bi('Taux', 'السعر'))} suffix="%" value={l.ratePct} min={0} max={100} disabled={disabled} onChange={(v) => v != null && uu({ ratePct: v })} />}
          {(l.base === 'rental_value' || l.base === 'investment') && <NumField label={t(bi('Montant de l’assiette', 'مبلغ الوعاء'))} value={l.baseAmount} min={0} disabled={disabled} onChange={(v) => v != null && uu({ baseAmount: v })} />}
          <NumField label={t(bi('Premier exercice n°', 'السنة الأولى رقم'))} integer value={l.startFiscalYearIndex} min={0} max={MAX_YEARS} disabled={disabled} onChange={(v) => v != null && uu({ startFiscalYearIndex: v })} />
          <NumField label={t(bi('Années exonérées', 'سنوات الإعفاء'))} integer value={l.exemptYears} min={0} max={MAX_YEARS} disabled={disabled} onChange={(v) => v != null && uu({ exemptYears: v })} />
          <NumField label={t(bi('Mois de paiement', 'شهر الأداء'))} integer value={l.paymentMonthOfFiscalYear} min={1} max={12} disabled={disabled} onChange={(v) => v != null && uu({ paymentMonthOfFiscalYear: v })} />
          <TextField label={t(bi('Base légale', 'السند القانوني'))} value={l.legalBasis} disabled={disabled} onChange={(v) => uu({ legalBasis: v })} />
        </>)} />
      <ListEditor title={t(bi('Taux saisis par exercice (remplacent le référentiel)', 'أسعار مُدخلة حسب السنة (تعوض المرجع)'))} items={tax.overrides} onChange={(v) => u({ overrides: v })}
        create={() => ({ id: newId('ovr'), fromFiscalYear: Number(model.horizon.startMonth.slice(0, 4)), isRatePct: null, minimumContributionRatePct: null, note: '' })}
        disabled={disabled} addLabel={t('add')} emptyLabel={t('none')}
        render={(o, uu) => (<>
          <NumField label={t(bi('À partir de l’exercice ouvert en', 'ابتداءً من السنة المفتوحة في'))} integer value={o.fromFiscalYear} min={2000} max={2100} disabled={disabled} onChange={(v) => v != null && uu({ fromFiscalYear: v })} />
          <NumField label={t(bi('Taux IS', 'سعر الضريبة على الشركات'))} suffix="%" nullable value={o.isRatePct} min={0} max={100} disabled={disabled} onChange={(v) => uu({ isRatePct: v })} />
          <NumField label={t(bi('Taux de cotisation minimale', 'سعر الحد الأدنى'))} suffix="%" nullable value={o.minimumContributionRatePct} min={0} max={10} disabled={disabled} onChange={(v) => uu({ minimumContributionRatePct: v })} />
          <TextField label={t(bi('Justification', 'التبرير'))} value={o.note} disabled={disabled} onChange={(v) => uu({ note: v })} />
        </>)} />
    </div>
  );
}

function Opening({ model, set, disabled }: P) {
  const { t } = useStudio();
  const ob = model.openingBalance;
  const u = (patch: Partial<typeof ob>) => set('openingBalance', { ...ob, ...patch });
  const fields: Array<[keyof typeof ob, Bi, { integer?: boolean; suffix?: string; max?: number }?]> = [
    ['cash', bi('Trésorerie', 'الخزينة')], ['receivables', bi('Créances clients', 'ديون الزبناء')], ['inventory', bi('Stocks', 'المخزون')], ['vatCredit', bi('Crédit de TVA', 'دين الضريبة على القيمة المضافة')],
    ['fixedAssetsGross', bi('Immobilisations brutes', 'الأصول الثابتة الإجمالية')], ['accumulatedDepreciation', bi('Amortissements cumulés', 'الاهتلاكات المتراكمة')], ['remainingLifeYears', bi('Durée résiduelle (ans)', 'المدة المتبقية (سنوات)'), { integer: true, max: 50 }],
    ['payables', bi('Dettes fournisseurs', 'ديون الموردين')], ['vatPayable', bi('TVA due', 'الضريبة المستحقة')], ['socialPayable', bi('Dettes sociales', 'الديون الاجتماعية')], ['isPayable', bi('IS dû', 'الضريبة على الشركات المستحقة')],
    ['debtBalance', bi('Encours d’emprunt', 'رصيد القرض')], ['debtAnnualRatePct', bi('Taux de l’emprunt', 'معدل القرض'), { suffix: '%', max: 100 }], ['debtRemainingMonths', bi('Durée restante (mois)', 'المدة المتبقية (أشهر)'), { integer: true, max: 480 }],
    ['capital', bi('Capital', 'الرأسمال')], ['reserves', bi('Réserves et report à nouveau', 'الاحتياطيات والمرحل')], ['priorYearIsDue', bi('Solde d’IS de l’exercice précédent', 'رصيد الضريبة للسنة السابقة')],
  ];
  return (
    <Card title={t('as_opening')}>
      <Toggle label={t(bi('Entreprise existante : saisir un bilan d’ouverture', 'مقاولة قائمة: إدخال ميزانية افتتاحية'))} checked={ob.enabled} disabled={disabled} onChange={(v) => u({ enabled: v })}
        help={t(bi('Le bilan d’ouverture doit être équilibré (actif = passif) ; il est contrôlé à l’enregistrement.', 'يجب أن تكون الميزانية الافتتاحية متوازنة؛ تتم مراقبتها عند الحفظ.'))} />
      {ob.enabled && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {fields.map(([k, label, opt]) => (
            <NumField key={k} label={t(label)} value={ob[k] as number} min={k === 'reserves' ? undefined : 0} max={opt?.max} integer={opt?.integer} suffix={opt?.suffix} disabled={disabled} onChange={(v) => v != null && u({ [k]: v } as Partial<typeof ob>)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function Sector({ model, set, disabled }: P) {
  const { t, lang } = useStudio();
  const tpl = SECTOR_TEMPLATES[model.sector];
  return (
    <Card title={`${t('as_sector')} — ${SECTOR_LABEL[model.sector][lang]}`}>
      {tpl.inputs.length === 0 ? <p className="text-sm text-gray-500">{t(bi('Aucune donnée sectorielle spécifique pour ce secteur.', 'لا توجد معطيات قطاعية خاصة.'))}</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tpl.inputs.map((inp) => (
            <NumField key={inp.id} label={`${inp.label} (${inp.unit})`} value={model.sectorInputs[inp.id] ?? 0} min={0} disabled={disabled} onChange={(v) => v != null && set('sectorInputs', { ...model.sectorInputs, [inp.id]: v })} />
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-500">{t(bi('Les indicateurs sectoriels du tableau de bord sont calculés à partir de ces données et de la projection ; aucune statistique de marché externe n’est utilisée.', 'تحسب المؤشرات القطاعية من هذه المعطيات ومن الإسقاط؛ لا تستعمل أي إحصائيات خارجية.'))}</p>
    </Card>
  );
}

export function LegalFormSelect({ value, onChange, disabled }: { value: LegalForm; onChange: (v: LegalForm) => void; disabled?: boolean }) {
  const { t } = useStudio();
  const opts: Array<{ value: LegalForm; label: string }> = [
    { value: '', label: t(bi('Non définie (projet)', 'غير محددة (مشروع)')) }, { value: 'sarl', label: 'SARL' }, { value: 'sarl_au', label: 'SARL AU' }, { value: 'sa', label: 'SA' },
    { value: 'sas', label: 'SAS' }, { value: 'snc', label: 'SNC' }, { value: 'scs', label: 'SCS' }, { value: 'gie', label: 'GIE' },
    { value: 'cooperative', label: t(bi('Coopérative', 'تعاونية')) }, { value: 'auto_entrepreneur', label: t(bi('Auto-entrepreneur', 'مقاول ذاتي')) },
    { value: 'personne_physique', label: t(bi('Personne physique', 'شخص ذاتي')) }, { value: 'other', label: t(bi('Autre', 'أخرى')) },
  ];
  return <SelectField label={t(bi('Forme juridique', 'الشكل القانوني'))} value={value} disabled={disabled} options={opts} onChange={onChange} />;
}
