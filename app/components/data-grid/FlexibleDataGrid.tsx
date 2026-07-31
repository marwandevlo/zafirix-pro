'use client';

import { useMemo, useState } from 'react';
import { Edit3, Mail, MoreVertical, Share2, Trash2 } from 'lucide-react';
import { openMailtoShare, openWhatsAppShare } from '@/app/lib/atlas-quick-share';
import { normalizeGlobalTableRows } from '@/app/components/data-grid/global-table-id';

export type FlexibleDataGridRow = {
  id: string;
  name?: string;
  title?: string;
  amount?: number | string;
  detail?: string;
};

export type FlexibleDataGridProps = {
  data: FlexibleDataGridRow[];
  onBulkDelete?: (ids: string[]) => void;
  onBulkEdit?: (ids: string[]) => void;
  /** Optional per-row action from the ⋮ menu */
  onRowAction?: (id: string, action: 'edit' | 'delete') => void;
  emptyLabel?: string;
};

function rowLabel(item: FlexibleDataGridRow): string {
  return String(item.name ?? item.title ?? item.id);
}

function rowAmount(item: FlexibleDataGridRow): string {
  if (item.detail) return item.detail;
  if (item.amount == null || item.amount === '') return '—';
  return `${item.amount} MAD`;
}

function buildSelectionText(items: FlexibleDataGridRow[]): string {
  return items.map((item) => `- ${rowLabel(item)}: ${rowAmount(item)}`).join('\n');
}

export default function FlexibleDataGrid({
  data,
  onBulkDelete,
  onBulkEdit,
  onRowAction,
  emptyLabel = 'Aucun élément à afficher.',
}: FlexibleDataGridProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const normalizedData = useMemo(
    () => normalizeGlobalTableRows(data as Record<string, unknown>[]),
    [data],
  );

  const allSelected =
    normalizedData.length > 0 &&
    normalizedData.every((row) => selectedIds.includes(row.id));

  const selectedItems = useMemo(
    () => normalizedData.filter((item) => selectedIds.includes(item.id)),
    [normalizedData, selectedIds],
  );

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(normalizedData.map((item) => item.id));
  };

  const handleShareWhatsApp = () => {
    openWhatsAppShare(`العناصر المحددة:\n${buildSelectionText(selectedItems)}`);
  };

  const handleSendEmail = () => {
    openMailtoShare({
      subject: 'تقرير العناصر المختارة - Zafirix Pro',
      body: `إليك العناصر المحددة:\n\n${buildSelectionText(selectedItems)}`,
    });
  };

  const handleBulkEdit = () => {
    if (onBulkEdit) {
      onBulkEdit(selectedIds);
      return;
    }
    window.alert(`تعديل جماعي لـ ${selectedIds.length} عناصر`);
  };

  const handleBulkDelete = () => {
    if (!onBulkDelete) return;
    onBulkDelete(selectedIds);
    setSelectedIds([]);
  };

  return (
    <div className="space-y-4">
      {selectedIds.length > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-blue-50 border border-blue-200 p-3 rounded-xl shadow-sm">
          <span className="text-sm font-medium text-blue-800">
            تم تحديد <strong className="text-blue-600">{selectedIds.length}</strong> من أصل {normalizedData.length} عنصر
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-green-700 transition"
            >
              <Share2 size={14} /> واتساب
            </button>
            <button
              type="button"
              onClick={handleSendEmail}
              className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-700 transition"
            >
              <Mail size={14} /> إيميل
            </button>
            <button
              type="button"
              onClick={handleBulkEdit}
              className="flex items-center gap-1 bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-amber-700 transition"
            >
              <Edit3 size={14} /> تعديل
            </button>
            {onBulkDelete ? (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-red-700 transition"
              >
                <Trash2 size={14} /> مسح
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={handleToggleSelectAll}
          disabled={normalizedData.length === 0}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
        >
          {allSelected ? <>إلغاء تحديد الكل</> : <>تحديد الكل (Tout sélectionner)</>}
        </button>
        <span className="text-xs text-gray-500">اختر يدوياً أو عبر الزر</span>
      </div>

      <div className="overflow-x-auto border border-gray-100 rounded-2xl bg-white shadow-sm">
        {normalizedData.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">{emptyLabel}</div>
        ) : (
          <table className="min-w-full text-right border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase">
                <th className="p-3 w-10 text-center">✓</th>
                <th className="p-3 font-semibold">المرجع / الاسم</th>
                <th className="p-3 font-semibold">المبلغ / التفاصيل</th>
                <th className="p-3 text-center font-semibold">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {normalizedData.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <tr key={item.id} className={isSelected ? 'bg-blue-50/40' : 'hover:bg-gray-50'}>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                        aria-label={`Sélectionner ${rowLabel(item as FlexibleDataGridRow)}`}
                      />
                    </td>
                    <td className="p-3 font-medium text-gray-900">{rowLabel(item as FlexibleDataGridRow)}</td>
                    <td className="p-3 text-gray-600">{rowAmount(item as FlexibleDataGridRow)}</td>
                    <td className="p-3 text-center relative">
                      {onRowAction ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setOpenMenuId((prev) => (prev === item.id ? null : item.id))}
                            className="p-1.5 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 transition"
                            aria-label="Actions"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {openMenuId === item.id ? (
                            <div className="absolute left-1/2 -translate-x-1/2 mt-1 z-10 w-36 bg-white border border-gray-100 rounded-xl shadow-lg py-1 text-left">
                              <button
                                type="button"
                                onClick={() => {
                                  onRowAction(item.id, 'edit');
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-right"
                              >
                                تعديل
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onRowAction(item.id, 'delete');
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-xs text-red-700 hover:bg-red-50 text-right"
                              >
                                مسح
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
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
