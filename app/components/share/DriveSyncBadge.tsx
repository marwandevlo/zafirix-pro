'use client';

import { Cloud, Loader2 } from 'lucide-react';

export type DriveSyncState = 'idle' | 'syncing' | 'synced' | 'local_fallback';

type Props = {
  status: DriveSyncState;
  compact?: boolean;
  className?: string;
};

const LABELS: Record<DriveSyncState, string> = {
  idle: 'Non synchronisé',
  syncing: 'Synchronisation…',
  synced: 'Drive synchronisé',
  local_fallback: 'Fallback local',
};

const STYLES: Record<DriveSyncState, string> = {
  idle: 'bg-gray-100 text-gray-500 border-gray-200',
  syncing: 'bg-blue-50 text-blue-700 border-blue-200',
  synced: 'bg-green-50 text-green-700 border-green-200',
  local_fallback: 'bg-amber-50 text-amber-700 border-amber-200',
};

/** Google Drive sync status pill for document rows and category headers. */
export function DriveSyncBadge({ status, compact = false, className = '' }: Props) {
  if (status === 'idle') return null;

  return (
    <span
      title={LABELS[status]}
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${STYLES[status]} ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      } ${className}`}
    >
      {status === 'syncing' ? (
        <Loader2 size={compact ? 10 : 12} className="animate-spin shrink-0" aria-hidden />
      ) : (
        <Cloud size={compact ? 10 : 12} className="shrink-0" aria-hidden />
      )}
      {!compact && <span>{LABELS[status]}</span>}
      {compact && status === 'synced' && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden />
      )}
      {compact && status === 'local_fallback' && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
      )}
    </span>
  );
}
