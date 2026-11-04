'use client';

import { useState } from 'react';
import type { StudyResult } from '@/app/lib/business-studio/engine';
import { monthLabel, RULE_STATUS_BI } from '@/app/lib/business-studio/i18n';
import { LAST_INTEGRATED_FINANCE_LAW, RULES, TAX_RULES_VERSION, type RuleStatus } from '@/app/lib/business-studio/tax-rules';
import { Badge, bi, Card, Notice, SelectField, useFormat, useStudio } from './ui';

const STATUS_TONE: Record<RuleStatus | 'override', 'green' | 'amber' | 'blue' | 'red'> = {
  verified_official: 'green', verified_regulator: 'green', convention: 'amber', assumed_unchanged: 'amber',
  user_defined: 'blue', override: 'blue', not_covered: 'red',
};

function StatusBadge({ status }: { status: RuleStatus | 'override' }) {
  const { t } = useStudio();
  return <Badge tone={STATUS_TONE[status]}>{t(RULE_STATUS_BI[status])}</Badge>;
}

const th = 'px-2 py-2 border-b text-start font-semibold whitespace-nowrap';
const td = 'px-2 py-1.5 border-b whitespace-nowrap';
const tdn = `${td} text-end tabular-nums`;

export function Tax({ r }: { r: StudyResult }) {
  const { t, lang } = useStudio();
  const f = useFormat();
  const [fy, setFy] = useState(0);
  const [taxFilter, setTaxFilter] = useState('all');
  const fiscalYears = r.calendar.fiscalYears;
  const y = fiscalYears[Math.min(fy, fiscalYears.length - 1)];
  const inYear = (m: number) => m >= y.firstMonth && m < y.firstMonth + y.months;
  const ml = (m: number | null) => (m == null ? t(bi('Au-delà de l’horizon', 'خارج الأفق')) : monthLabel(r.calendar.labels[m], lang));
  const vat = r.vatPeriods.filter((p) => inYear(p.firstMonth));
  const payments = r.taxPayments.filter((p) => inYear(p.month)).sort((a, b) => a.month - b.month);
  const taxes = Array.from(new Set(RULES.map((x) => x.tax)));
  const rules = RULES.filter((x) => taxFilter === 'all' || x.tax === taxFilter);

  return (
    <div className="space-y-4">
      <Notice tone="warning">
        {t(bi(
          `Référentiel ${TAX_RULES_VERSION} — dernière loi intégrée : ${LAST_INTEGRATED_FINANCE_LAW}. Calcul prévisionnel indicatif : il ne constitue ni une déclaration fiscale ni un avis juridique, et doit être validé par un expert-comptable ou un conseiller fiscal. La TVA est suivie en trésorerie et au bilan ; elle n’est pas une charge du CPC.`,
          `المرجع ${TAX_RULES_VERSION}. حساب تقديري إرشادي: لا يشكل تصريحاً جبائياً ولا رأياً قانونياً، ويجب التحقق منه من طرف خبير محاسب أو مستشار جبائي. تُتبع الضريبة على القيمة المضافة في الخزينة والميزانية وليست تكلفة في حساب العائدات والتكاليف.`,
        ))}
      </Notice>

      <Card title={t(bi('Impôt sur le résultat par exercice', 'الضريبة على النتيجة حسب السنة المالية'))}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr>
              <th className={th}>{t('year')}</th>
              <th className={th}>{t(bi('Régime', 'النظام'))}</th>
              <th className={`${th} text-end`}>{t(bi('Résultat comptable', 'النتيجة المحاسبية'))}</th>
              <th className={`${th} text-end`}>{t(bi('Réintégrations', 'الإدماجات'))}</th>
              <th className={`${th} text-end`}>{t(bi('Déficits imputés', 'العجز المخصوم'))}</th>
              <th className={`${th} text-end`}>{t(bi('Base imposable', 'الوعاء الضريبي'))}</th>
              <th className={`${th} text-end`}>{t(bi('Taux', 'السعر'))}</th>
              <th className={`${th} text-end`}>{t(bi('Impôt calculé', 'الضريبة المحسوبة'))}</th>
              <th className={`${th} text-end`}>{t(bi('Cotisation minimale', 'الحد الأدنى للضريبة'))}</th>
              <th className={`${th} text-end`}>{t(bi('Impôt dû', 'الضريبة المستحقة'))}</th>
              <th className={th}>{t(bi('Statut de la règle', 'وضعية القاعدة'))}</th>
            </tr></thead>
            <tbody>
              {r.isYears.map((x) => (
                <tr key={x.fiscalYearIndex}>
                  <td className={td}>{x.label}{x.partial ? ` (${t('partial')})` : ''}</td>
                  <td className={td}>{x.regime}</td>
                  <td className={tdn}>{f.mad(x.accountingResult)}</td>
                  <td className={tdn}>{f.mad(x.nonDeductible)}</td>
                  <td className={tdn}>{f.mad(x.lossesUsed)}</td>
                  <td className={tdn}>{f.mad(x.taxable)}</td>
                  <td className={tdn} title={x.rateDetail}>{f.pct(x.ratePct, 2)}</td>
                  <td className={tdn}>{f.mad(x.computedTax)}</td>
                  <td className={tdn}>{x.minimumContributionExempt ? t(bi('Exonérée', 'معفاة')) : f.mad(x.minimumContribution)}{x.minimumContributionApplied ? ' *' : ''}</td>
                  <td className={`${tdn} font-semibold`}>{f.mad(x.taxDue)}</td>
                  <td className={td}><StatusBadge status={x.rateStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">{t(bi('* La cotisation minimale excède l’impôt calculé et s’applique. Survolez le taux pour le détail de la règle.', '* الحد الأدنى للضريبة يفوق الضريبة المحسوبة ويُطبق. مرر المؤشر على السعر لعرض تفاصيل القاعدة.'))}</p>
      </Card>

      <Card title={t(bi('TVA et calendrier fiscal', 'الضريبة على القيمة المضافة والجدولة الجبائية'))}
        actions={<SelectField label={t(bi('Exercice', 'السنة المالية'))} value={String(fy)} onChange={(v) => setFy(Number(v))}
          options={fiscalYears.map((x, i) => ({ value: String(i), label: x.label }))} />}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="overflow-x-auto">
            <h4 className="text-sm font-semibold mb-2">{t(bi('Déclarations de TVA', 'تصاريح الضريبة على القيمة المضافة'))}</h4>
            {vat.length === 0 ? <p className="text-xs text-gray-500">{t('emptyData')}</p> : (
              <table className="min-w-full text-xs">
                <thead><tr>
                  <th className={th}>{t(bi('Période', 'الفترة'))}</th>
                  <th className={`${th} text-end`}>{t(bi('Collectée', 'المحصلة'))}</th>
                  <th className={`${th} text-end`}>{t(bi('Déductible', 'القابلة للخصم'))}</th>
                  <th className={`${th} text-end`}>{t(bi('Crédit antérieur', 'الدين السابق'))}</th>
                  <th className={`${th} text-end`}>{t(bi('À payer', 'الواجب أداؤها'))}</th>
                  <th className={`${th} text-end`}>{t(bi('Crédit reporté', 'الدين المرحل'))}</th>
                  <th className={th}>{t(bi('Paiement', 'الأداء'))}</th>
                </tr></thead>
                <tbody>
                  {vat.map((p) => (
                    <tr key={p.label}>
                      <td className={td}>{monthLabel(p.label, lang)}</td>
                      <td className={tdn}>{f.mad(p.collected)}</td>
                      <td className={tdn}>{f.mad(p.deductible)}</td>
                      <td className={tdn}>{f.mad(p.creditBroughtForward)}</td>
                      <td className={`${tdn} font-semibold`}>{f.mad(p.payable)}</td>
                      <td className={tdn}>{f.mad(p.creditCarriedForward)}</td>
                      <td className={td}>{p.payable === 0 ? '—' : ml(p.paymentMonth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="overflow-x-auto">
            <h4 className="text-sm font-semibold mb-2">{t(bi('Décaissements fiscaux et sociaux', 'المدفوعات الجبائية والاجتماعية'))}</h4>
            {payments.length === 0 ? <p className="text-xs text-gray-500">{t(bi('Aucun décaissement fiscal ou social dans cet exercice.', 'لا توجد مدفوعات جبائية أو اجتماعية في هذه السنة المالية.'))}</p> : (
              <table className="min-w-full text-xs">
                <thead><tr>
                  <th className={th}>{t('month')}</th>
                  <th className={th}>{t(bi('Impôt', 'الضريبة'))}</th>
                  <th className={th}>{t(bi('Libellé', 'البيان'))}</th>
                  <th className={`${th} text-end`}>{t('mad')}</th>
                </tr></thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={`${p.month}-${p.tax}-${i}`}>
                      <td className={td}>{ml(p.month)}</td>
                      <td className={td}>{p.tax}</td>
                      <td className={`${td} whitespace-normal`}>{p.label}</td>
                      <td className={tdn}>{f.mad(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>

      <Card title={t(bi('Référentiel des règles fiscales et sociales', 'مرجع القواعد الجبائية والاجتماعية'))}
        actions={<SelectField label={t(bi('Impôt', 'الضريبة'))} value={taxFilter} onChange={setTaxFilter}
          options={[{ value: 'all', label: t(bi('Tous', 'الكل')) }, ...taxes.map((x) => ({ value: x, label: x }))]} />}>
        {lang === 'ar' && <p className="mb-2 text-[11px] text-gray-500">البيانات والمراجع معروضة بالفرنسية كما وردت في النصوص الرسمية.</p>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr>
              <th className={th}>{t(bi('Impôt', 'الضريبة'))}</th>
              <th className={th}>{t(bi('Règle', 'القاعدة'))}</th>
              <th className={th}>{t(bi('Période d’effet', 'فترة السريان'))}</th>
              <th className={th}>{t(bi('Statut', 'الوضعية'))}</th>
              <th className={th}>{t(bi('Source', 'المصدر'))}</th>
            </tr></thead>
            <tbody>
              {rules.map((x) => (
                <tr key={x.id} className="align-top">
                  <td className={td}>{x.tax}</td>
                  <td className={`${td} whitespace-normal min-w-[260px]`} dir="ltr">{x.label}{x.note && <span className="block text-[10px] text-gray-500">{x.note}</span>}</td>
                  <td className={td} dir="ltr">{x.effectiveFrom ?? '…'} → {x.effectiveTo ?? '…'}</td>
                  <td className={td}><StatusBadge status={x.status} /></td>
                  <td className={`${td} whitespace-normal min-w-[200px]`} dir="ltr">
                    {x.source ? (x.source.url
                      ? <a href={x.source.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{x.source.document}, {x.source.reference}</a>
                      : `${x.source.document}, ${x.source.reference}`) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
