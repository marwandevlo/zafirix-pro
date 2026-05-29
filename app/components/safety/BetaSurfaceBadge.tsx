type Props = {
  /** Short label, e.g. "Bêta · OCR" */
  label?: string;
  className?: string;
};

/**
 * Non-intrusive Bêta strip for AI / OCR / experimental modules (Sprint 0).
 */
export function BetaSurfaceBadge({ label = 'Bêta', className = '' }: Props) {
  return (
    <div
      role="note"
      className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 leading-snug ${className}`.trim()}
    >
      <span className="font-semibold">{label}</span>
      {' · '}
      Fonctionnalité en cours de stabilisation. Vérification humaine requise pour toute décision comptable, fiscale ou juridique.
    </div>
  );
}
