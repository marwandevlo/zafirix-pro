'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Clock, PlayCircle } from 'lucide-react';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { listAtlasInvoices } from '@/app/lib/atlas-invoices-repository';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import {
  buildChecklistItems,
  checklistCompletionPercent,
  loadOnboardingProgress,
  wizardProgressPercent,
  type ChecklistSignals,
} from '@/app/lib/atlas-onboarding-engine';
import { buildSmartRecommendations } from '@/app/lib/atlas-smart-recommendations';
import { generateDemoWorkspace, isDemoModeActive } from '@/app/lib/atlas-demo-workspace';

type Props = { lang: 'fr' | 'ar' };

export function GettingStartedWidget({ lang }: Props) {
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
  const [demoActive, setDemoActive] = useState(false);
  const t = useMemo(() => (fr: string, ar: string) => (lang === 'ar' ? ar : fr), [lang]);

  useEffect(() => {
    setDemoActive(isDemoModeActive());
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

  const progress = loadOnboardingProgress();
  const checklistItems = buildChecklistItems(signals);
  const percent = checklistCompletionPercent(checklistItems);
  const wizardPct = wizardProgressPercent(progress.wizardStep, progress.wizardCompleted);
  const recs = buildSmartRecommendations(signals);
  const next = recs[0];
  const estMin = Math.max(2, Math.round((100 - percent) / 10));

  const startDemo = () => {
    generateDemoWorkspace();
    setDemoActive(true);
  };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-linear-to-br from-indigo-50 to-white p-5 shadow-sm" data-tour="getting-started">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-indigo-950 flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-600" />
            {t('Démarrage rapide', 'بدء سريع')}
          </p>
          <p className="text-xs text-indigo-800/70 mt-1">
            {percent}% {t('complété', 'مكتمل')} · ~{estMin} min {t('restantes', 'متبقية')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/setup')}
          className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg"
        >
          {t('Assistant setup', 'معالج الإعداد')} ({wizardPct}%)
        </button>
      </div>
      <div className="mt-3 h-2 rounded-full bg-indigo-100 overflow-hidden">
        <div className="h-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      {next ? (
        <button
          type="button"
          onClick={() => router.push(next.href)}
          className="mt-4 w-full text-left rounded-xl border border-indigo-100 bg-white px-4 py-3 hover:border-indigo-300 transition-colors"
        >
          <p className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
            <Clock size={12} /> {t('Prochaine action', 'الإجراء التالي')}
          </p>
          <p className="text-sm font-bold text-gray-900 mt-1">{t(next.titleFr, next.titleAr)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t(next.descriptionFr, next.descriptionAr)}</p>
        </button>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => router.push('/help')}
          className="text-xs font-medium text-indigo-700 hover:underline"
        >
          {t('Centre d\'aide', 'مركز المساعدة')}
        </button>
        <button
          type="button"
          onClick={startDemo}
          className="text-xs font-medium text-indigo-700 hover:underline flex items-center gap-1"
        >
          <PlayCircle size={12} />
          {demoActive ? t('Mode démo actif', 'وضع تجريبي نشط') : t('Explorer en démo', 'استكشف تجريبياً')}
        </button>
      </div>
    </div>
  );
}
