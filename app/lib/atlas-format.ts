/** Deterministic MAD amount formatting (SSR + client must match). */
const MAD_AMOUNT_FORMATTER = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export type AtlasUiLocale = 'fr' | 'ar';

/** Never use a translatable English word ("MAD"/"mad" → "غضب" in naive AR dictionaries). */
export function madCurrencyCode(locale?: AtlasUiLocale | string | null): string {
  return locale === 'ar' ? 'د.م.' : 'MAD';
}

/** Strip corrupted currency tokens produced by bad i18n / machine translation. */
export function sanitizeMadCurrencyText(text: string, locale?: AtlasUiLocale | string | null): string {
  const unit = madCurrencyCode(locale);
  return String(text ?? '')
    .replace(/غضب/g, unit)
    .replace(/\bMADs?\b/gi, unit)
    .replace(/\bdirhams?\b/gi, unit);
}

export function formatMadAmount(value: number): string {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  return MAD_AMOUNT_FORMATTER.format(Math.round(n));
}

export function formatMadAmountLabel(value: number, locale?: AtlasUiLocale | string | null): string {
  return sanitizeMadCurrencyText(`${formatMadAmount(value)}\u00A0${madCurrencyCode(locale)}`, locale);
}
