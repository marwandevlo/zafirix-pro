'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Download, Edit3, MoreVertical, Share2, Trash2 } from 'lucide-react';
import { normalizeGlobalTableRows } from '@/app/components/data-grid/global-table-id';

export type GlobalTableColumn<T extends GlobalTableRow = GlobalTableRow> = {
  header: string;
  accessor: keyof T & string;
  /** Optional cell formatter */
  render?: (row: T) => ReactNode;
  className?: string;
};

export type GlobalTableRow = {
  id: string;
  [key: string]: unknown;
};

export type GlobalTableProps<T extends GlobalTableRow = GlobalTableRow> = {
  columns: GlobalTableColumn<T>[];
  data: T[];
  /** Controlled selection — sync with ExportMenu or parent state */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onModify?: (selectedIds: string[]) => void;
  onShare?: (selectedIds: string[]) => void;
  onDownload?: (selectedIds: string[]) => void;
  onDelete?: (selectedIds: string[]) => void;
  onRowAction?: (id: string, action: 'edit' | 'share' | 'download' | 'delete') => void;
  /** Hide default ⋮ column when using a custom actions column */
  hideRowActions?: boolean;
  emptyLabel?: string;
  /** Clear selection after bulk delete (default true) */
  clearSelectionOnDelete?: boolean;
};

function useSelectionState(
  controlled: string[] | undefined,
  onChange: ((ids: string[]) => void) | undefined,
  rowIds: string[],
) {
  const [internal, setInternal] = useState<string[]>([]);
  const isControlled = controlled !== undefined;
  const selectedIds = isControlled ? controlled : internal;

  const commitSelection = (next: string[]) => {
    const validIds = new Set(rowIds);
    const filtered = next.filter((id) => validIds.has(id));
    if (onChange) onChange(filtered);
    if (!isControlled) setInternal(filtered);
  };

  const setSelectedIds = (next: string[] | ((prev: string[]) => string[])) => {
    const resolved = typeof next === 'function' ? next(selectedIds) : next;
    commitSelection(resolved);
  };

  return [selectedIds, setSelectedIds] as const;
}

function cellValue<T extends GlobalTableRow>(row: T, col: GlobalTableColumn<T>): ReactNode {
  if (col.render) return col.render(row);
  const raw = row[col.accessor];
  if (raw == null || raw === '') return '—';
  return String(raw);
}

export default function GlobalTable<T extends GlobalTableRow = GlobalTableRow>({
  columns,
  data,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  onModify,
  onShare,
  onDownload,
  onDelete,
  onRowAction,
  hideRowActions = false,
  emptyLabel = 'Aucune donnée à afficher.',
  clearSelectionOnDelete = true,
}: GlobalTableProps<T>) {
  const normalizedData = useMemo(
    () => normalizeGlobalTableRows(data as Record<string, unknown>[]) as T[],
    [data],
  );
  const rowIds = useMemo(() => normalizedData.map((row) => row.id), [normalizedData]);

  const [selectedIds, setSelectedIds] = useSelectionState(
    controlledSelectedIds,
    onSelectionChange,
    rowIds,
  );

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const isAllSelected =
    normalizedData.length > 0 &&
    normalizedData.every((row) => selectedIds.includes(row.id));

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(normalizedData.map((item) => item.id));
      return;
    }
    setSelectedIds([]);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const runBulk = (fn: ((ids: string[]) => void) | undefined, clearAfter = false) => {
    if (!fn || selectedIds.length === 0) return;
    fn(selectedIds);
    if (clearAfter) setSelectedIds([]);
  };

  const hasBulkActions = Boolean(onModify || onShare || onDownload || onDelete);

  const bulkToolbar =
    selectedIds.length > 0 && hasBulkActions ? (
      <div className="sticky bottom-4 z-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center gap-3">
          <span className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm font-bold">
            {selectedIds.length} عناصر محددة
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onModify ? (
            <button
              type="button"
              onClick={() => runBulk(onModify)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-100 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              <Edit3 size={16} className="text-amber-400" />
              <span>Modifier</span>
            </button>
          ) : null}

          {onShare ? (
            <button
              type="button"
              onClick={() => runBulk(onShare)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-100 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              <Share2 size={16} className="text-blue-400" />
              <span>Partager</span>
            </button>
          ) : null}

          {onDownload ? (
            <button
              type="button"
              onClick={() => runBulk(onDownload)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-100 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              <Download size={16} className="text-emerald-400" />
              <span>Télécharger</span>
            </button>
          ) : null}

          {onDelete ? (
            <button
              type="button"
              onClick={() => runBulk(onDelete, clearSelectionOnDelete)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg"
            >
              <Trash2 size={16} />
              <span>Supprimer</span>
            </button>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-4 relative w-full">
      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        {normalizedData.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">{emptyLabel}</div>
        ) : (
          <table className="min-w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
                <th className="p-3.5 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                    title="تحديد الكل / Tout sélectionner"
                    aria-label="Tout sélectionner"
                  />
                </th>

                {columns.map((col) => (
                  <th key={col.accessor} className={`p-3.5 font-semibold ${col.className ?? ''}`}>
                    {col.header}
                  </th>
                ))}

                {!hideRowActions ? (
                  <th className="p-3.5 text-center w-16 font-semibold">إجراءات</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {normalizedData.map((item) => {
                const isSelected = selectedSet.has(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'}`}
                  >
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                        aria-label={`Sélectionner la ligne ${item.id}`}
                      />
                    </td>

                    {columns.map((col) => (
                      <td key={col.accessor} className={`p-3.5 text-slate-800 font-medium ${col.className ?? ''}`}>
                        {cellValue(item, col)}
                      </td>
                    ))}

                    {!hideRowActions ? (
                    <td className="p-3.5 text-center relative">
                      {onRowAction ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setOpenMenuId((prev) => (prev === item.id ? null : item.id))}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                            aria-label="Actions"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenuId === item.id ? (
                            <div className="absolute left-1/2 -translate-x-1/2 mt-1 z-20 w-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  onRowAction(item.id, 'edit');
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onRowAction(item.id, 'share');
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                Partager
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onRowAction(item.id, 'download');
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                Télécharger
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onRowAction(item.id, 'delete');
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                              >
                                Supprimer
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {bulkToolbar}
    </div>
  );
}
