/**
 * Shared ID validation for bulk delete and API routes.
 * Prevents invalid UUIDs from reaching PostgreSQL WHERE IN clauses.
 */

const POSTGRES_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Standard PostgreSQL UUID (v4-style hex segments). */
export function isPostgresUuid(id: string): boolean {
  return POSTGRES_UUID_RE.test(id.trim());
}

/** Row ids synthesized by GlobalTable when source rows lack stable ids. */
export function isSyntheticTableRowId(id: string): boolean {
  const trimmed = id.trim();
  return trimmed.length === 0 || trimmed.startsWith('__row-');
}

/** Strip module-specific display prefixes before UUID checks. */
export function stripKnownDisplayIdPrefix(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith('acc-')) return trimmed.slice(4);
  if (trimmed.startsWith('tva-')) return trimmed.slice(4);
  return trimmed;
}

/** Resolve a raw selection id to a backend UUID when possible. */
export function resolveToPostgresUuid(id: string): string | null {
  const trimmed = id.trim();
  if (isSyntheticTableRowId(trimmed)) return null;
  if (isPostgresUuid(trimmed)) return trimmed;
  const stripped = stripKnownDisplayIdPrefix(trimmed);
  return isPostgresUuid(stripped) ? stripped : null;
}

export type TvaLineIdSource = {
  id: string;
  source: string;
};

/** Map a TVA grid line to the backend row UUID used for DELETE. */
export function resolveTvaLineBackendId(line: TvaLineIdSource): string | null {
  if (line.source === 'tva_suggestion') return null;

  if (line.source === 'accounting_entry') {
    return resolveToPostgresUuid(line.id);
  }

  if (line.source === 'supplier_invoice' || line.source === 'invoice') {
    return isPostgresUuid(line.id) ? line.id.trim() : null;
  }

  return null;
}

export type AccountingDeletePartition = {
  uuidIds: string[];
  localIds: string[];
  skippedIds: string[];
};

/**
 * Split accounting journal selection ids into DB UUIDs, local numeric ids, and invalid ids.
 */
export function partitionAccountingEntryDeleteIds(ids: string[]): AccountingDeletePartition {
  const uuidIds: string[] = [];
  const localIds: string[] = [];
  const skippedIds: string[] = [];
  const seenUuid = new Set<string>();
  const seenLocal = new Set<string>();

  for (const raw of ids) {
    const id = String(raw).trim();
    if (isSyntheticTableRowId(id)) {
      skippedIds.push(id);
      continue;
    }

    const uuid = resolveToPostgresUuid(id);
    if (uuid) {
      if (!seenUuid.has(uuid)) {
        seenUuid.add(uuid);
        uuidIds.push(uuid);
      }
      continue;
    }

    if (/^\d+$/.test(id)) {
      if (!seenLocal.has(id)) {
        seenLocal.add(id);
        localIds.push(id);
      }
      continue;
    }

    skippedIds.push(id);
  }

  return { uuidIds, localIds, skippedIds };
}

/** Keep only PostgreSQL UUIDs from a mixed id list (server-side). */
export function filterPostgresUuids(ids: string[]): {
  uuidIds: string[];
  skippedIds: string[];
} {
  const { uuidIds, localIds, skippedIds } = partitionAccountingEntryDeleteIds(ids);
  return { uuidIds, skippedIds: [...skippedIds, ...localIds] };
}

/** Parse bulk-delete request body ids with UUID filtering. */
export function parseBulkDeleteRequestIds(rawIds: unknown): {
  uuidIds: string[];
  skippedIds: string[];
} {
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))]
    : [];
  return filterPostgresUuids(ids);
}
