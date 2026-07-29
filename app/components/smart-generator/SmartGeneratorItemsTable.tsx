'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { SmartGeneratorItemSpec } from '@/app/types/atlas-smart-generator';

export type ItemRow = SmartGeneratorItemSpec & { id: string };

const UNITS = ['Pcs', 'Heures', 'Forfait', 'Kg', 'm²', 'Lot', 'Jour'];
const TVA_RATES = [0, 7, 10, 14, 20] as const;

export function emptyItemRow(): ItemRow {
  return {
    id: crypto.randomUUID(),
    reference: '',
    category: '',
    designation: '',
    quantity: 1,
    unit: 'Pcs',
    unitPriceHT: undefined,
    vatRatePercent: 20,
  };
}

type Props = {
  items: ItemRow[];
  onChange: (items: ItemRow[]) => void;
};

function updateRow(items: ItemRow[], idx: number, patch: Partial<ItemRow>): ItemRow[] {
  return items.map((r, i) => (i === idx ? { ...r, ...patch } : r));
}

export function SmartGeneratorItemsTable({ items, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 w-[90px]">Code / Réf.</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 min-w-[160px]">Désignation</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 w-[72px]">Quantité</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 w-[96px]">Unité</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 w-[100px]">Prix unitaire HT</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 w-[80px]">TVA %</th>
              <th className="px-3 py-2.5 w-10" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-gray-400">
                  Aucune ligne — cliquez sur &quot;Ajouter une ligne&quot; ci-dessous
                </td>
              </tr>
            )}
            {items.map((item, idx) => (
              <tr key={item.id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">
                  <input
                    value={item.reference ?? ''}
                    onChange={(e) => onChange(updateRow(items, idx, { reference: e.target.value }))}
                    placeholder="REF-001"
                    aria-label="Code ou référence"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 font-mono"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={item.designation}
                    onChange={(e) => onChange(updateRow(items, idx, { designation: e.target.value }))}
                    placeholder="Libellé de l'article ou prestation"
                    aria-label="Désignation"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    value={item.quantity}
                    onChange={(e) => onChange(updateRow(items, idx, { quantity: Number(e.target.value) || 1 }))}
                    aria-label="Quantité"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={item.unit}
                    onChange={(e) => onChange(updateRow(items, idx, { unit: e.target.value }))}
                    aria-label="Unité"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 bg-white"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unitPriceHT ?? ''}
                    onChange={(e) => onChange(updateRow(items, idx, {
                      unitPriceHT: e.target.value ? Number(e.target.value) : undefined,
                    }))}
                    placeholder="0.00"
                    aria-label="Prix unitaire HT en MAD"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={item.vatRatePercent ?? 20}
                    onChange={(e) => onChange(updateRow(items, idx, { vatRatePercent: Number(e.target.value) }))}
                    aria-label="Taux TVA"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 bg-white"
                  >
                    {TVA_RATES.map((r) => (
                      <option key={r} value={r}>{r} %</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((_, i) => i !== idx))}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                    aria-label="Supprimer la ligne"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => onChange([...items, emptyItemRow()])}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
      >
        <Plus size={14} /> Ajouter une ligne
      </button>
    </div>
  );
}
