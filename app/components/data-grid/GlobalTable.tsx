'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Download, Edit3, MoreVertical, Share2, Trash2 } from 'lucide-react';

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
  data: GlobalTableRow[],
) {
  const [internal, setInternal] = useState<string[]>([]);
  const selectedIds = controlled ?? internal;

  const setSelectedIds = (next: string[] | ((prev: string[]) => string[])) => {
    const resolved = typeof next === 'function' ? next(selectedIds) : next;
    const validIds = new Set(data.map((item) => item.id));
    const filtered = resolved.filter((id) => validIds.has(id));
    if (onChange) onChange(filtered);
    else setInternal(filtered);
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
  const [selectedIds, setSelectedIds] = useSelectionState(controlledSelectedIds, onSelectionChange, data);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const isAllSelected = data.length > 0 && selectedIds.length === data.length;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(data.map((item) => item.id));
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

  return (
    <div className="space-y-4 relative w-full">
      {selectedIds.length > 0 && hasBulkActions ? (
        <div className="sticky top-4 z-30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl border border-slate-700">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="bg-blue-600 text-white px-2.5 py-0.5 rounded-md text-xs">{selectedIds.length}</span>
            <span>عناصر محددة</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onModify ? (
              <button
                type="button"
                onClick={() => runBulk(onModify)}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-1.5 rounded-lg text-xs font-medium transition"
              >
                <Edit3 size={14} className="text-amber-400" />
                <span>Modifier</span>
              </button>
            ) : null}

            {onShare ? (
              <button
                type="button"
                onClick={() => runBulk(onShare)}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-1.5 rounded-lg text-xs font-medium transition"
              >
                <Share2 size={14} className="text-blue-400" />
                <span>Partager</span>
              </button>
            ) : null}

            {onDownload ? (
              <button
                type="button"
                onClick={() => runBulk(onDownload)}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-1.5 rounded-lg text-xs font-medium transition"
              >
                <Download size={14} className="text-emerald-400" />
                <span>Télécharger</span>
              </button>
            ) : null}

            {onDelete ? (
              <button
                type="button"
                onClick={() => runBulk(onDelete, clearSelectionOnDelete)}
                className="flex items-center gap-1.5 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition border border-red-500/30"
              >
                <Trash2 size={14} />
                <span>Supprimer</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        {data.length === 0 ? (
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
              {data.map((item) => {
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
    </div>
  );
}
