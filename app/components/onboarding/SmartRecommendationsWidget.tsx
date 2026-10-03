'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb } from 'lucide-react';
import { loadChecklistSignals } from '@/app/lib/atlas-checklist-signals';
import { trackOnboardingWizardOpened } from '@/app/lib/atlas-onboarding-analytics';
import { buildSmartRecommendations } from '@/app/lib/atlas-smart-recommendations';
import type { ChecklistSignals } from '@/app/lib/atlas-onboarding-engine';

type Props = { lang: 'fr' | 'ar' };

export function SmartRecommendationsWidget({ lang }: Props) {
  const router = useRouter();
  const [signals, setSignals] = useState<ChecklistSignals | null>(null);
  const t = useMemo(() => (fr: string, ar: string) => (lang === 'ar' ? ar : fr), [lang]);

  useEffect(() => {
    void loadChecklistSignals().then(setSignals);
  }, []);

  if (!signals) return null;
  const recs = buildSmartRecommendations(signals);
  if (!recs.length) return null;

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4" data-tour="recommendations">
      <p className="text-sm font-bold text-amber-950 flex items-center gap-2">
        <Lightbulb size={16} className="text-amber-600" />
        {t('Recommandations', 'توصيات')}
      </p>
      <ul className="mt-3 space-y-2">
        {recs.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => {
                if (r.href === '/setup' || r.href.startsWith('/setup?')) {
                  trackOnboardingWizardOpened('recommendation');
                }
                router.push(r.href);
              }}
              className="w-full text-left text-sm rounded-lg bg-white border border-amber-100 px-3 py-2 hover:border-amber-300"
            >
              <span className="font-semibold text-gray-900">{t(r.titleFr, r.titleAr)}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{t(r.descriptionFr, r.descriptionAr)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
