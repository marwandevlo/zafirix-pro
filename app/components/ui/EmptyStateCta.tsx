'use client';

type Props = {
  title: string;
  description?: string;
  onPrimary?: () => void;
  href?: string;
  primaryLabelFr: string;
  primaryLabelAr: string;
  lang: 'fr' | 'ar';
  exampleFr?: string;
  exampleAr?: string;
};

export function EmptyStateCta({
  title,
  description,
  onPrimary,
  href,
  primaryLabelFr,
  primaryLabelAr,
  lang,
  exampleFr,
  exampleAr,
}: Props) {
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);
  const label = t(primaryLabelFr, primaryLabelAr);
  const example = exampleFr ? t(exampleFr, exampleAr ?? exampleFr) : null;

  const buttonClass =
    'mt-6 inline-flex items-center justify-center rounded-xl bg-[#1B2A4A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#243660]';

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center max-w-lg mx-auto">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {description ? <p className="text-sm text-slate-600 mt-2">{description}</p> : null}
      {example ? (
        <p className="text-xs text-slate-400 mt-3 italic">{example}</p>
      ) : null}
      {href ? (
        <a href={href} className={buttonClass}>
          {label}
        </a>
      ) : (
        <button type="button" onClick={onPrimary} className={buttonClass}>
          {label}
        </button>
      )}
    </div>
  );
}
