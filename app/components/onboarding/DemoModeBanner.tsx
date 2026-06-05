'use client';

import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import {
  DEMO_MODE_UPDATED_EVENT,
  exitDemoMode,
  isDemoModeActive,
} from '@/app/lib/atlas-demo-workspace';

type Props = { lang?: 'fr' | 'ar' };

export function DemoModeBanner({ lang = 'fr' }: Props) {
  const [active, setActive] = useState(false);
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);

  const sync = useCallback(() => {
    setActive(isDemoModeActive());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(DEMO_MODE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(DEMO_MODE_UPDATED_EVENT, sync);
  }, [sync]);

  if (!active) return null;

  const quit = () => {
    exitDemoMode();
    setActive(false);
  };

  return (
    <div
      className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      role="status"
      aria-live="polite"
      data-tour="demo-mode-banner"
    >
      <div className="flex items-start gap-2 text-sm text-violet-950">
        <FlaskConical size={18} className="shrink-0 mt-0.5 text-violet-600" aria-hidden />
        <div>
          <p className="font-semibold">{t('Mode démo actif', 'وضع تجريبي نشط')}</p>
          <p className="text-xs text-violet-800/80 mt-0.5">
            {t(
              'Données fictives en session — vos données réelles ne sont pas modifiées.',
              'بيانات وهمية في الجلسة — بياناتك الحقيقية لم تتغير.',
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={quit}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-700 text-white text-xs font-semibold px-4 py-2 hover:bg-violet-800 shrink-0"
      >
        <X size={14} aria-hidden />
        {t('Quitter le mode démo', 'إيقاف الوضع التجريبي')}
      </button>
    </div>
  );
}
