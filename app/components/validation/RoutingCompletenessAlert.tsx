'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react';

type CompletenessData = {
  isComplete: boolean;
  documentType: string;
  requiredModules: { module: string; label: string }[];
  routedModules: { module: string; label: string }[];
  missingModules: { module: string; label: string }[];
};

type RoutingCompletenessAlertProps = {
  documentId: string;
  /** Called when user clicks "Envoyer" on a missing module */
  onRoute?: (module: string) => void;
  className?: string;
};

/**
 * Shows a warning if the document has been routed to some modules
 * but not all required ones for its detected type.
 *
 * Example: purchase_invoice routed to comptabilite but NOT to tva.
 * → ⚠ Routage incomplet — TVA manquante.
 */
export function RoutingCompletenessAlert({ documentId, onRoute, className = '' }: RoutingCompletenessAlertProps) {
  const [data, setData] = useState<CompletenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [routing, setRouting] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) { setLoading(false); return; }
    fetch(`/api/routing/completeness/${documentId}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: CompletenessData & { ok?: boolean }) => {
        if (d.ok !== false) setData(d);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [documentId]);

  if (loading) return null;
  if (!data) return null;

  // Only show if some routing exists but it's incomplete
  if (data.routedModules.length === 0) return null;
  if (data.isComplete) return null;

  const handleRoute = async (module: string) => {
    if (onRoute) {
      setRouting(module);
      onRoute(module);
      setTimeout(() => setRouting(null), 2000);
    }
  };

  return (
    <div className={`flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl ${className}`}>
      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">Routage incomplet</p>
        <p className="text-xs text-amber-600 mt-0.5">
          Ce document a été envoyé vers{' '}
          {data.routedModules.map(m => m.label).join(', ')}
          {' '}mais pas vers{' '}
          <span className="font-medium">{data.missingModules.map(m => m.label).join(', ')}</span>.
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {data.routedModules.map(m => (
            <span key={m.module} className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded">
              <CheckCircle2 size={10} />
              {m.label}
            </span>
          ))}
          {data.missingModules.map(m => (
            <button
              key={m.module}
              type="button"
              disabled={routing === m.module || !onRoute}
              onClick={() => void handleRoute(m.module)}
              className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-200 disabled:opacity-60"
            >
              {routing === m.module ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Send size={10} />
              )}
              Envoyer vers {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
