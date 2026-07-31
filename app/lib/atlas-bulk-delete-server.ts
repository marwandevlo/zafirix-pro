import { parseBulkDeleteRequestIds } from '@/app/lib/atlas-id-validation';

export type PreparedBulkDelete =
  | { ok: false; error: string; status: number }
  | { ok: true; uuidIds: string[]; skipped: number; skippedIds: string[] };

export function bulkDeleteStatusForError(message: string): number {
  return /foreign key|23503|violates foreign key|invalid input syntax for type uuid/i.test(message)
    ? 409
    : 500;
}

/**
 * Normalize incoming ids: only PostgreSQL UUIDs are passed to SQL `.in('id', ...)`.
 * Non-UUID / synthetic ids are reported as skipped (never sent to the DB).
 */
export function prepareBulkDeleteIds(rawIds: unknown): PreparedBulkDelete {
  const { uuidIds, skippedIds } = parseBulkDeleteRequestIds(rawIds);

  if (uuidIds.length === 0 && skippedIds.length === 0) {
    return { ok: false, error: 'ids_required', status: 400 };
  }

  return {
    ok: true,
    uuidIds,
    skipped: skippedIds.length,
    skippedIds,
  };
}
