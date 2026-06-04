'use client';

import { BookOpen, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AiSourceRef } from '@/app/types/atlas-ai-copilot';

const SOURCE_HREF: Partial<Record<AiSourceRef['type'], string>> = {
  invoice: '/factures',
  accounting_entry: '/comptabilite',
  payroll: '/rh',
  bank: '/banque',
  tva: '/tva',
  liasse: '/liasse',
  document: '/documents',
  legal: '/juridique',
  anomaly: '/assistant',
  readiness: '/liasse',
  audit_log: '/comptabilite',
};

type Props = {
  sources: AiSourceRef[];
  confidence?: number | null;
};

export function AssistantSourcesPanel({ sources, confidence }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1 mb-2">
          <BookOpen size={12} /> Sources utilisées
        </h3>
        {confidence != null && (
          <p className="text-[10px] text-gray-500 mb-2">
            Confiance: <strong className={confidence >= 0.8 ? 'text-green-600' : 'text-amber-600'}>{Math.round(confidence * 100)}%</strong>
          </p>
        )}
        {sources.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune source pour cette réponse.</p>
        ) : (
          <ul className="space-y-1.5 max-h-56 overflow-y-auto">
            {sources.map((s, i) => {
              const href = SOURCE_HREF[s.type];
              return (
                <li key={`${s.type}-${s.id}-${i}`} className="text-xs p-2 rounded-lg bg-violet-50 border border-violet-100">
                  <span className="font-medium text-violet-800 uppercase text-[10px]">{s.type}</span>
                  <p className="text-gray-700 mt-0.5">{s.label ?? s.id}</p>
                  {href && (
                    <button
                      type="button"
                      onClick={() => router.push(href)}
                      className="mt-1 text-[10px] text-violet-600 hover:underline flex items-center gap-0.5"
                    >
                      Ouvrir <ExternalLink size={10} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed">
        Réponses basées uniquement sur les données Atlas. Si une information manque: « Information non disponible dans Atlas. »
      </p>
    </div>
  );
}

export const ASSISTANT_SUGGESTED_QUESTIONS = [
  'Pourquoi mon IS est élevé ?',
  'Comment est calculé mon IS ?',
  'Quels éléments augmentent mon IS ?',
  'Pourquoi cette écriture existe ?',
  'Explique le compte 6132',
  'Quel est l\'impact de cette écriture ?',
  'Quelle TVA vais-je payer ?',
  'Quelles factures impactent ma TVA ?',
  'Pourquoi cette TVA est rejetée ?',
  'Quelles anomalies TVA existent ?',
  'Pourquoi ma readiness fiscale est basse ?',
  'Quels points manquent pour la clôture ?',
  'Montre-moi les factures non payées.',
  'Quelles anomalies existent actuellement ?',
  'Résume mon activité de ce mois.',
] as const;
