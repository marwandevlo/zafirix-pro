'use client';

import { Info } from 'lucide-react';

type Props = {
  titleFr: string;
  titleAr: string;
  bodyFr: string;
  bodyAr: string;
  lang?: 'fr' | 'ar';
  learnMoreHref?: string;
};

export function HelpHint({ titleFr, titleAr, bodyFr, bodyAr, lang = 'fr', learnMoreHref }: Props) {
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex gap-3 text-sm">
      <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" aria-hidden />
      <div>
        <p className="font-semibold text-indigo-950">{t(titleFr, titleAr)}</p>
        <p className="text-indigo-900/80 mt-1 text-xs leading-relaxed">{t(bodyFr, bodyAr)}</p>
        {learnMoreHref ? (
          <a href={learnMoreHref} className="text-xs font-semibold text-indigo-700 hover:underline mt-2 inline-block">
            {t('En savoir plus', 'المزيد')}
          </a>
        ) : null}
      </div>
    </div>
  );
}
