'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import {
  buildChecklistItems,
  checklistCompletionPercent,
  loadOnboardingProgress,
  saveOnboardingProgress,
  type ChecklistSignals,
} from '@/app/lib/atlas-onboarding-engine';
import { trackChecklistProgress } from '@/app/lib/atlas-onboarding-analytics';

type Props = { lang: 'fr' | 'ar' };

export function OnboardingChecklistWidget({ lang }: Props) {
  const router = useRouter();
  const [signals, setSignals] = useState<ChecklistSignals>({
    hasCompany: false,
    tvaConfigured: false,
    hasDocument: false,
    hasInvoice: false,
    hasAiAnalysis: false,
    hasBankImport: false,
    hasPayrollRun: false,
    wizardCompleted: false,
  });
  const [dismissed, setDismissed] = useState(false);
  const t = useMemo(() => (fr: string, ar: string) => (lang === 'ar' ? ar : fr), [lang]);

  useEffect(() => {
    const p = loadOnboardingProgress();
    setDismissed(p.checklistDismissed);
    void (async () => {
      const progress = loadOnboardingProgress();
      let hasCompany = false;
      let hasInvoice = false;
      if (isAtlasSupabaseDataEnabled()) {
        const [companies, inv] = await Promise.all([listAtlasCompanies(), listAtlasInvoices()]);
        hasCompany = companies.length > 0;
        hasInvoice = inv.length > 0;
      }
      const stepTva = progress.stepData.tva as { configured?: boolean } | undefined;
      setSignals({
        hasCompany,
        tvaConfigured: Boolean(stepTva?.configured),
        hasDocument: Boolean(progress.stepData.company?.firstDocument),
        hasInvoice,
        hasAiAnalysis: Boolean(progress.stepData.finish?.aiDone),
        hasBankImport: Boolean(progress.stepData.banking?.imported),
        hasPayrollRun: Boolean(progress.stepData.payroll?.runDone),
        wizardCompleted: progress.wizardCompleted,
      });
    })();
  }, []);

  const items = buildChecklistItems(signals);
  const percent = checklistCompletionPercent(items);

  useEffect(() => {
    trackChecklistProgress(percent);
  }, [percent]);

  if (dismissed && percent >= 100) return null;

  const dismiss = () => {
    const p = loadOnboardingProgress();
    saveOnboardingProgress({ ...p, checklistDismissed: true });
    setDismissed(true);
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4" data-tour="checklist">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-950">{t('Checklist d\'adoption', 'قائمة التبنّي')}</p>
          <p className="text-xs text-emerald-800/70 mt-0.5">{percent}% {t('complété', 'مكتمل')}</p>
        </div>
        <button type="button" onClick={dismiss} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">
          {t('Masquer', 'إخفاء')}
        </button>
      </div>
      <div className="mt-2 h-2 rounded-full bg-emerald-100 overflow-hidden">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            {item.done ? (
              <CheckCircle2 className="text-emerald-600 shrink-0" size={18} />
            ) : (
              <Circle className="text-emerald-300 shrink-0" size={18} />
            )}
            <button
              type="button"
              onClick={() => router.push(item.href)}
              className={`text-left ${item.done ? 'text-gray-500 line-through' : 'text-gray-900 font-medium hover:text-emerald-800'}`}
            >
              {t(item.labelFr, item.labelAr)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
