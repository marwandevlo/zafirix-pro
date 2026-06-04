'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { TOUR_STEPS, isTourCompleted, markTourCompleted, resetTour } from '@/app/lib/atlas-guided-tour';
import { trackTourCompleted } from '@/app/lib/atlas-onboarding-analytics';
import { saveOnboardingProgress, loadOnboardingProgress } from '@/app/lib/atlas-onboarding-engine';

type Props = { lang: 'fr' | 'ar'; autoStart?: boolean };

export function GuidedTourEngine({ lang, autoStart = false }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);

  useEffect(() => {
    if (autoStart && !isTourCompleted()) setOpen(true);
    const onRestart = () => {
      resetTour();
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener('atlas-tour-restart', onRestart);
    return () => window.removeEventListener('atlas-tour-restart', onRestart);
  }, [autoStart]);

  const finish = useCallback(() => {
    markTourCompleted();
    const p = loadOnboardingProgress();
    saveOnboardingProgress({ ...p, tourCompleted: true });
    trackTourCompleted();
    setOpen(false);
  }, []);

  const skip = () => finish();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          resetTour();
          setIndex(0);
          setOpen(true);
        }}
        className="fixed bottom-6 left-6 z-40 rounded-full bg-indigo-600 text-white text-xs font-semibold px-4 py-2 shadow-lg hover:bg-indigo-700"
        data-tour="tour-launcher"
      >
        {t('Visite guidée', 'جولة إرشادية')}
      </button>
    );
  }

  const step = TOUR_STEPS[index];
  const isLast = index >= TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[min(420px,calc(100vw-2rem))] bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 pointer-events-auto"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p id="tour-title" className="font-bold text-gray-900">
              {t(step.titleFr, step.titleAr)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {index + 1} / {TOUR_STEPS.length}
            </p>
          </div>
          <button type="button" onClick={skip} className="p-1 rounded hover:bg-gray-100" aria-label={t('Passer', 'تخطي')}>
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-3">{t(step.bodyFr, step.bodyAr)}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="flex items-center gap-1 text-sm font-medium text-gray-600 disabled:opacity-40"
          >
            <ChevronLeft size={16} /> {t('Précédent', 'السابق')}
          </button>
          <button type="button" onClick={skip} className="text-sm text-gray-500 hover:text-gray-800">
            {t('Passer', 'تخطي')}
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={finish}
              className="flex items-center gap-1 text-sm font-semibold text-indigo-600"
            >
              {t('Terminer', 'إنهاء')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => i + 1)}
              className="flex items-center gap-1 text-sm font-semibold text-indigo-600"
            >
              {t('Suivant', 'التالي')} <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
