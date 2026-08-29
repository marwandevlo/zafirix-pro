import { formatMadAmountLabel, type AtlasUiLocale } from '@/app/lib/atlas-format';

type Props = {
  value: number | null | undefined;
  locale?: AtlasUiLocale;
  className?: string;
};

/** Currency figure that must not be machine-translated (MAD ≠ "mad"/غضب). */
export function MadAmount({ value, locale = 'fr', className }: Props) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return (
    <span className={`notranslate tabular-nums ${className ?? ''}`} translate="no" lang={locale === 'ar' ? 'ar-MA' : 'fr-MA'}>
      {formatMadAmountLabel(n, locale)}
    </span>
  );
}
