/** Deterministic MAD amount formatting (SSR + client must match). */
const MAD_AMOUNT_FORMATTER = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatMadAmount(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return MAD_AMOUNT_FORMATTER.format(Math.round(n));
}

export function formatMadAmountLabel(value: number): string {
  return `${formatMadAmount(value)} MAD`;
}
