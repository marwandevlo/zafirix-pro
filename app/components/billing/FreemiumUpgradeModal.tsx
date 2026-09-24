'use client';

import { useRouter } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { FREEMIUM_METER_LABELS_FR, type FreemiumMeter } from '@/app/lib/atlas-freemium';

export type FreemiumUpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  meter?: FreemiumMeter;
  used?: number;
  limit?: number | null;
  message?: string;
};

export function FreemiumUpgradeModal({
  open,
  onClose,
  meter,
  used,
  limit,
  message,
}: FreemiumUpgradeModalProps) {
  const router = useRouter();
  if (!open) return null;

  const label = meter ? FREEMIUM_METER_LABELS_FR[meter] : 'cette fonctionnalité';
  const detail =
    message ??
    (limit != null
      ? `Vous avez utilisé ${used ?? limit}/${limit} ${label.toLowerCase()} ce mois-ci.`
      : `Passez à Pro pour débloquer ${label.toLowerCase()}.`);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="freemium-upgrade-title"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700 font-semibold">Forfait Gratuit</p>
            <h2 id="freemium-upgrade-title" className="text-lg font-bold text-[#0F1F3D] mt-1">
              Passer à Pro
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">{detail}</p>
          <ul className="text-sm text-slate-700 space-y-1.5">
            <li>Factures & Devis illimités</li>
            <li>Suivi COD illimité</li>
            <li>Scans IA étendus</li>
            <li>Multi-utilisateurs & support prioritaire</li>
          </ul>
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/pricing?plan=pro');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F1F3D] text-white text-sm font-semibold hover:bg-[#1a3060]"
          >
            <Sparkles size={14} />
            Passer à Pro
          </button>
        </div>
      </div>
    </div>
  );
}
