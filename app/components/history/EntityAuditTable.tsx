'use client';

/**
 * EntityAuditTable
 *
 * Reusable "Historique" tab component.
 * Reads from /api/audit/recent?entityType=X[&entityId=Y]
 * Shows: Date | Action | Entité | Utilisateur | Détails
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Archive,
  CheckCircle,
  CheckCheck,
  Edit3,
  Eye,
  Loader2,
  RefreshCcw,
  Send,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import type { AuditAction } from '@/app/lib/atlas-audit-log-constants';
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_COLORS } from '@/app/lib/atlas-audit-log-constants';

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditEvent = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  performed_by: string | null;
  source_document_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Props = {
  /** Filter by entity type (e.g. 'invoice', 'accounting_entry') */
  entityType?: string;
  /** If provided, filter to a single entity */
  entityId?: string;
  /** Max rows to display */
  limit?: number;
  /** Label for the section header */
  title?: string;
};

// ── Action icon map ───────────────────────────────────────────────────────────

const ACTION_ICONS: Partial<Record<AuditAction, React.ElementType>> = {
  created:    UploadCloud,
  corrected:  Edit3,
  reviewed:   Eye,
  validated:  CheckCircle,
  rejected:   XCircle,
  propagated: Send,
  routed:     Send,
  archived:   Archive,
  deleted:    Trash2,
  restored:   RefreshCcw,
};

function ActionBadge({ action }: { action: AuditAction }) {
  const Icon = ACTION_ICONS[action] ?? CheckCheck;
  const color = AUDIT_ACTION_COLORS[action] ?? 'bg-gray-50 text-gray-600 border-gray-200';
  const label = AUDIT_ACTION_LABELS[action] ?? action;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${color}`}>
      <Icon size={9} />
      {label}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return iso; }
}

function EntityLabel(entityType: string): string {
  const map: Record<string, string> = {
    invoice: 'Facture vente',
    supplier_invoice: 'Facture achat',
    accounting_entry: 'Écriture comptable',
    tva_suggestion: 'TVA',
    legal_document: 'Contrat',
    payroll_record: 'Fiche de paie',
    routing_record: 'Enregistrement routé',
    document: 'Document IA',
    export: 'Export',
    backup: 'Sauvegarde',
  };
  return map[entityType] ?? entityType;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EntityAuditTable({ entityType, entityId, limit = 50, title }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (entityType) params.set('entityType', entityType);
      if (entityId) params.set('entityId', entityId);
      const res = await fetch(`/api/audit/recent?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur réseau');
      const data = await res.json() as { ok: boolean; events: AuditEvent[] };
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, limit]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-gray-500" />
          <h3 className="font-semibold text-gray-700 text-sm">{title ?? 'Historique d\'activité'}</h3>
          {!loading && <span className="text-xs text-gray-400">{events.length} événement{events.length > 1 ? 's' : ''}</span>}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-4 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          Aucun événement enregistré pour ce module.
          <br />
          <span className="text-xs">Les actions (création, validation, correction…) apparaîtront ici.</span>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Entité</th>
                <th className="px-4 py-2.5">Source doc</th>
                <th className="px-4 py-2.5">Détails</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">
                    {formatDate(ev.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <ActionBadge action={ev.action} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-[11px]">
                      <span className="font-medium text-gray-700">{EntityLabel(ev.entity_type)}</span>
                      <span className="text-gray-400 ml-1 font-mono">{String(ev.entity_id).slice(0, 8)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-400 font-mono">
                    {ev.source_document_id ? String(ev.source_document_id).slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-500 max-w-xs truncate">
                    {ev.new_values
                      ? Object.entries(ev.new_values).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
                      : ev.metadata
                        ? Object.entries(ev.metadata).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default EntityAuditTable;
