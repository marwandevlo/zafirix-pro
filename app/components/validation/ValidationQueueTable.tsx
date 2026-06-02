'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

type QueueSummaryRow = {
  module: string;
  label: string;
  draft: number;
  reviewed: number;
  validated: number;
  rejected: number;
  total: number;
};

type QueueResponse = { ok: boolean; summary: QueueSummaryRow[] };

const MODULE_HREFS: Record<string, string> = {
  comptabilite: '/comptabilite',
  factures: '/factures',
  tva: '/tva',
  rh: '/rh',
  juridique: '/juridique',
  banque: '/banque',
  rapports: '/rapports',
  fiscalite: '/rapports',
};

function statusPill(count: number, color: string) {
  if (count === 0) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-semibold ${color}`}>
      {count}
    </span>
  );
}

type ValidationQueueTableProps = {
  compact?: boolean;
  className?: string;
};

export function ValidationQueueTable({ compact = false, className = '' }: ValidationQueueTableProps) {
  const [summary, setSummary] = useState<QueueSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/validation/queue?status=draft,reviewed,validated,rejected', { credentials: 'include' })
      .then(r => r.json())
      .then((d: QueueResponse) => { if (d.ok) setSummary(d.summary); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (summary.length === 0) {
    return (
      <div className={`text-center py-8 text-sm text-gray-400 ${className}`}>
        Aucun enregistrement routé pour le moment.
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="py-2 pr-4 font-medium">Module</th>
            <th className="py-2 px-3 text-center font-medium text-amber-600">Brouillons</th>
            <th className="py-2 px-3 text-center font-medium text-purple-600">Révision</th>
            {!compact && <th className="py-2 px-3 text-center font-medium text-green-600">Validés</th>}
            {!compact && <th className="py-2 px-3 text-center font-medium text-red-600">Rejetés</th>}
            <th className="py-2 pl-3 text-center font-medium">Total</th>
            {!compact && <th className="py-2 pl-3"></th>}
          </tr>
        </thead>
        <tbody>
          {summary.map(row => (
            <tr key={row.module} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2.5 pr-4 font-medium text-gray-800">{row.label}</td>
              <td className="py-2.5 px-3 text-center">{statusPill(row.draft, 'bg-amber-100 text-amber-700')}</td>
              <td className="py-2.5 px-3 text-center">{statusPill(row.reviewed, 'bg-purple-100 text-purple-700')}</td>
              {!compact && <td className="py-2.5 px-3 text-center">{statusPill(row.validated, 'bg-green-100 text-green-700')}</td>}
              {!compact && <td className="py-2.5 px-3 text-center">{statusPill(row.rejected, 'bg-red-100 text-red-700')}</td>}
              <td className="py-2.5 pl-3 text-center text-gray-500 text-xs font-medium">{row.total}</td>
              {!compact && (
                <td className="py-2.5 pl-3">
                  <a
                    href={MODULE_HREFS[row.module] ?? '/validation'}
                    className="text-gray-300 hover:text-blue-600 transition-colors"
                    title={`Aller vers ${row.label}`}
                  >
                    <ExternalLink size={13} />
                  </a>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
