'use client';

import { Check } from 'lucide-react';

const ROWS = [
  { label: 'Factures & Devis', free: '15 / mois', pro: 'Illimités' },
  { label: 'Suivis de colis COD', free: '30 / mois', pro: 'Illimité' },
  { label: 'Scans IA (OCR)', free: '5 / mois', pro: 'Étendus' },
  { label: 'Utilisateurs', free: '1 inclus', pro: 'Multi-utilisateurs' },
  { label: 'Support', free: 'Standard', pro: 'Prioritaire' },
];

export function PricingFeatureMatrix() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-slate-100 bg-slate-50/80">
        <h2 className="text-lg font-bold text-slate-900">Comparatif Gratuit vs Pro</h2>
        <p className="text-sm text-slate-500 mt-1">Prix mensuels TTC indicatifs — DH. Quotas réinitialisés chaque mois.</p>
      </div>
      <div className="overflow-x-auto mobile-scroll-x">
        <table className="min-w-[520px] w-full text-sm">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-semibold">Capacité</th>
              <th className="px-5 py-3 text-center font-semibold">Plan Gratuit</th>
              <th className="px-5 py-3 text-center font-semibold bg-cyan-50/80">Plan Pro</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900">{row.label}</p>
                </td>
                <td className="px-5 py-3 text-center text-slate-600">{row.free}</td>
                <td className="px-5 py-3 text-center bg-cyan-50/30 font-semibold text-[#0F1F3D]">
                  <span className="inline-flex items-center gap-1.5">
                    <Check size={16} className="text-cyan-600" aria-hidden />
                    {row.pro}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
