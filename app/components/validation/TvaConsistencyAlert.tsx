'use client';

import { AlertTriangle, Calculator } from 'lucide-react';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';

type TvaConsistencyAlertProps = {
  amountHt: number | null | undefined;
  vatRate: number | null | undefined;
  vatAmount: number | null | undefined;
  /** Tolerance as a fraction (default 0.05 = 5%) */
  tolerance?: number;
  className?: string;
};

/**
 * Pure computation alert — no API call.
 *
 * Shows a warning when the detected TVA amount differs
 * significantly from what the rate × HT formula would produce.
 *
 * Example:
 *   HT = 12 000, Rate = 20% → Expected TVA = 2 400
 *   Detected = 0 → ⚠ Incohérence TVA détectée
 */
export function TvaConsistencyAlert({
  amountHt,
  vatRate,
  vatAmount,
  tolerance = 0.05,
  className = '',
}: TvaConsistencyAlertProps) {
  if (amountHt == null || vatRate == null || vatAmount == null) return null;
  if (amountHt <= 0 || vatRate <= 0) return null;

  const expectedVat = Math.round(amountHt * (vatRate / 100) * 100) / 100;
  const diff = Math.abs(expectedVat - vatAmount);
  const threshold = Math.max(1, expectedVat * tolerance);

  if (diff <= threshold) return null;

  const overOrUnder = vatAmount < expectedVat ? 'sous-estimée' : 'surestimée';

  return (
    <div className={`flex items-start gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl ${className}`}>
      <div className="shrink-0 mt-0.5">
        <div className="flex items-center justify-center w-6 h-6 bg-orange-100 rounded-full">
          <Calculator size={13} className="text-orange-600" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} className="text-orange-600 shrink-0" />
          <p className="text-sm font-semibold text-orange-800">Incohérence TVA détectée</p>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white border border-orange-100 rounded-lg px-2 py-1.5">
            <p className="text-gray-500">Montant HT</p>
            <p className="font-semibold text-gray-800 notranslate" translate="no">{formatMadAmountLabel(amountHt)}</p>
          </div>
          <div className="bg-white border border-orange-100 rounded-lg px-2 py-1.5">
            <p className="text-gray-500">TVA attendue ({vatRate}%)</p>
            <p className="font-semibold text-green-700 notranslate" translate="no">{formatMadAmountLabel(expectedVat)}</p>
          </div>
          <div className="bg-orange-100 border border-orange-200 rounded-lg px-2 py-1.5">
            <p className="text-gray-600">TVA détectée</p>
            <p className="font-semibold text-orange-800 notranslate" translate="no">{formatMadAmountLabel(vatAmount)}</p>
          </div>
        </div>
        <p className="text-xs text-orange-600 mt-1.5">
          La TVA est {overOrUnder} de <span className="font-semibold notranslate" translate="no">{formatMadAmountLabel(diff)}</span> par rapport à la formule HT × taux.
          Vérifiez et corrigez si nécessaire avant validation.
        </p>
      </div>
    </div>
  );
}
