import type { GlobalTableRow } from '@/app/components/data-grid/GlobalTable';

const ID_KEYS = ['id', '_id', 'numero', 'reference', 'invoiceNumber'] as const;

/** Resolve a stable string id from common row fields (deterministic when index is provided). */
export function resolveRowId(item: Record<string, unknown>, index?: number): string {
  for (const key of ID_KEYS) {
    const val = item[key];
    if (val != null && String(val).trim() !== '') return String(val);
  }
  if (index !== undefined) return `__row-${index}`;
  return String(Math.random());
}

/** Ensure every row has a unique string `id` for selection, keys, and export filtering. */
export function normalizeGlobalTableRows<T extends Record<string, unknown>>(
  rows: T[],
): (T & GlobalTableRow)[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    let id = resolveRowId(row, index);
    if (seen.has(id)) id = `${id}__${index}`;
    seen.add(id);
    return { ...row, id };
  });
}

/** Keep only selection ids that still exist in the current dataset. */
export function pruneSelectedIds(selectedIds: string[], rows: GlobalTableRow[]): string[] {
  const valid = new Set(rows.map((row) => row.id));
  return selectedIds.filter((id) => valid.has(id));
}

/** Filter export/table rows by normalized ids (matches GlobalTable selection). */
export function filterRowsBySelectedIds<T extends Record<string, unknown>>(
  rows: T[],
  selectedIds: string[],
): T[] {
  if (selectedIds.length === 0) return [];
  const selected = new Set(selectedIds);
  return rows.filter((row, index) => selected.has(resolveRowId(row, index)));
}
