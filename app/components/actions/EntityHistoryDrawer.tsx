'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, X, CheckCircle, AlertTriangle, Archive, Send, Download, Edit3, Eye, Trash2, RotateCcw, Upload, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EntityEvent = {
  id: string;
  eventType: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  userId?: string;
};

type EntityHistoryDrawerProps = {
  open: boolean;
  entityId: string;
  entityType: 'document' | 'invoice' | 'supplier_invoice' | 'client' | string;
  entityLabel: string;
  onClose: () => void;
  /** Provide events directly (pre-loaded). */
  events?: EntityEvent[];
  /** Or provide a fetcher function. */
  onFetchEvents?: () => Promise<EntityEvent[]>;
};

// ── Event icon + label map ────────────────────────────────────────────────────

type EventMeta = { label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; color: string };

const EVENT_META: Record<string, EventMeta> = {
  uploaded:             { label: 'Document uploadé',           Icon: Upload,      color: 'text-blue-600' },
  ocr_started:          { label: 'Analyse OCR démarrée',       Icon: RotateCcw,   color: 'text-amber-600' },
  ocr_completed:        { label: 'Analyse OCR terminée',       Icon: CheckCircle, color: 'text-green-600' },
  ocr_failed:           { label: 'Échec de l\'analyse OCR',    Icon: AlertTriangle, color: 'text-red-600' },
  user_validated:       { label: 'Validé par l\'utilisateur',  Icon: CheckCircle, color: 'text-green-600' },
  user_rejected:        { label: 'Rejeté',                     Icon: AlertTriangle, color: 'text-red-600' },
  validation_required:  { label: 'Correction demandée',        Icon: Edit3,       color: 'text-amber-600' },
  routed_to_module:     { label: 'Envoyé vers module',         Icon: Send,        color: 'text-indigo-600' },
  sha256_dedup_hit:     { label: 'Doublon détecté (SHA256)',   Icon: AlertTriangle, color: 'text-amber-600' },
  viewed:               { label: 'Consulté',                   Icon: Eye,         color: 'text-gray-500' },
  modified:             { label: 'Modifié',                    Icon: Edit3,       color: 'text-blue-600' },
  archived:             { label: 'Archivé',                    Icon: Archive,     color: 'text-amber-600' },
  deleted:              { label: 'Supprimé',                   Icon: Trash2,      color: 'text-red-600' },
  downloaded:           { label: 'Téléchargé',                 Icon: Download,    color: 'text-blue-500' },
  sent:                 { label: 'Envoyé par email',           Icon: Send,        color: 'text-emerald-600' },
  shared:               { label: 'Partagé',                    Icon: Send,        color: 'text-blue-500' },
  corrected:            { label: 'Champ corrigé',              Icon: Edit3,       color: 'text-amber-600' },
};

function eventMeta(eventType: string): EventMeta {
  return EVENT_META[eventType] ?? { label: eventType, Icon: Clock, color: 'text-gray-400' };
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-MA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Drawer content ─────────────────────────────────────────────────────────────

function DrawerContent({
  entityLabel,
  events,
  loading,
  onClose,
}: {
  entityLabel: string;
  events: EntityEvent[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-[150] flex">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside className="relative ml-auto w-80 sm:w-96 bg-white shadow-2xl flex flex-col h-full">
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-gray-400" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Historique</p>
              <p className="text-xs text-gray-400 truncate max-w-[200px]" title={entityLabel}>{entityLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-gray-300 animate-spin" />
            </div>
          )}

          {!loading && events.length === 0 && (
            <div className="text-center py-12">
              <Clock size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Aucun événement enregistré.</p>
            </div>
          )}

          {!loading && events.length > 0 && (
            <ol className="relative border-l border-gray-100 ml-3 space-y-1">
              {events.map((ev) => {
                const { label, Icon, color } = eventMeta(ev.eventType);
                const module = typeof ev.payload?.module === 'string' ? ev.payload.module : null;
                const fieldName = typeof ev.payload?.field_name === 'string' ? ev.payload.field_name : null;
                return (
                  <li key={ev.id} className="pl-5 pb-5">
                    <span className={`absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-white border border-gray-200 ${color}`}>
                      <Icon size={10} />
                    </span>
                    <p className="text-xs font-medium text-gray-800">{label}</p>
                    {module && (
                      <p className="text-[11px] text-indigo-600 mt-0.5">→ {module}</p>
                    )}
                    {fieldName && (
                      <p className="text-[11px] text-amber-600 mt-0.5">Champ: {fieldName}</p>
                    )}
                    <time className="text-[10px] text-gray-400 mt-0.5 block" dateTime={ev.createdAt}>
                      {formatDate(ev.createdAt)}
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center">
            {events.length} événement{events.length !== 1 ? 's' : ''} enregistré{events.length !== 1 ? 's' : ''}
          </p>
        </footer>
      </aside>
    </div>
  );
}

// ── EntityHistoryDrawer ────────────────────────────────────────────────────────

export function EntityHistoryDrawer({
  open,
  entityId,
  entityType,
  entityLabel,
  onClose,
  events: propEvents,
  onFetchEvents,
}: EntityHistoryDrawerProps) {
  const [events, setEvents] = useState<EntityEvent[]>(propEvents ?? []);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      fetchedRef.current = false;
      return;
    }
    if (propEvents) {
      setEvents(propEvents);
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    if (onFetchEvents) {
      setLoading(true);
      onFetchEvents()
        .then(setEvents)
        .catch(() => setEvents([]))
        .finally(() => setLoading(false));
    } else {
      // Default: fetch from generic history API
      setLoading(true);
      fetch(`/api/entities/${entityType}/${entityId}/history`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : { events: [] })
        .then((data: { events?: EntityEvent[] }) => setEvents(data.events ?? []))
        .catch(() => setEvents([]))
        .finally(() => setLoading(false));
    }
  }, [open, entityId, entityType, propEvents, onFetchEvents]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <DrawerContent
      entityLabel={entityLabel}
      events={events}
      loading={loading}
      onClose={onClose}
    />,
    document.body,
  );
}
