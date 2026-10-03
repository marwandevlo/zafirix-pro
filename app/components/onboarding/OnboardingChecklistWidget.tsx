'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import { loadChecklistSignals } from '@/app/lib/atlas-checklist-signals';
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
    hasClient: false,
    hasInvoice: false,
    companyCustomized: false,
    tvaConfigured: false,
    hasDocument: false,
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
    void loadChecklistSignals().then(setSignals);
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
          <li key={item.id}>
            {item.primary && !item.done ? (
              <button
                type="button"
                onClick={() => router.push(item.href)}
                className="w-full rounded-xl bg-[#1B2A4A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#243660]"
              >
                {t(item.labelFr, item.labelAr)}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm">
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
                  {item.optional ? <span className="ml-1 text-xs font-normal text-gray-400">{t('(optionnel)', '(اختياري)')}</span> : null}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
