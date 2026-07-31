'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import GlobalTable, { type GlobalTableColumn, type GlobalTableRow } from '@/app/components/data-grid/GlobalTable';
import ExportMenu from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import {
  filterRowsBySelectedIds,
  normalizeGlobalTableRows,
  pruneSelectedIds,
} from '@/app/components/data-grid/global-table-id';
import { exportTable } from '@/app/lib/atlas-table-export';
import { openWhatsAppShare } from '@/app/lib/atlas-quick-share';

interface ColumnConfig {
  header: string;
  accessor: string;
}

interface ExportColumnConfig {
  key: string;
  label: string;
}

interface GenericModuleSectionProps<T extends GlobalTableRow> {
  moduleTitle: string;
  initialData: T[];
  moduleNameKey: keyof T & string;
  columns: ColumnConfig[];
  exportColumns: ExportColumnConfig[];
  onModify?: (ids: string[]) => void;
  onShare?: (ids: string[]) => void;
  onDownload?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
}

export default function GenericModuleSection<T extends GlobalTableRow>({
  moduleTitle,
  initialData,
  moduleNameKey,
  columns,
  exportColumns,
  onModify,
  onShare,
  onDownload,
  onDelete,
}: GenericModuleSectionProps<T>) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [data, setData] = useState<T[]>(() =>
    normalizeGlobalTableRows(initialData as Record<string, unknown>[]) as T[],
  );

  useEffect(() => {
    setData(normalizeGlobalTableRows(initialData as Record<string, unknown>[]) as T[]);
  }, [initialData]);

  useEffect(() => {
    setSelectedIds((prev) => pruneSelectedIds(prev, data));
  }, [data]);

  const exportRows = useMemo(
    () => data as unknown as Record<string, unknown>[],
    [data],
  );

  const rowsForIds = useCallback(
    (ids: string[]) => filterRowsBySelectedIds(data as Record<string, unknown>[], ids) as T[],
    [data],
  );

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const handleModify = onModify || ((ids: string[]) => {
    alert(`تعديل جماعي لـ ${ids.length} عنصر في قسم ${moduleTitle}`);
  });

  const handleShare = onShare || ((ids: string[]) => {
    const selectedRows = rowsForIds(ids);
    const summary = selectedRows.map((i) => `- ${String(i[moduleNameKey])}`).join('\n');
    openWhatsAppShare(`ملخص العناصر المحددة (${moduleTitle}):\n${summary}`);
  });

  const handleDownload = onDownload || ((ids: string[]) => {
    const selectedRows = rowsForIds(ids);
    void exportTable(
      'xlsx',
      selectedRows as unknown as Record<string, unknown>[],
      exportColumns as ExportColumn[],
      moduleTitle.toLowerCase(),
    );
  });

  const handleDelete = onDelete || ((ids: string[]) => {
    if (confirm(`هل أنت متأكد من حذف ${ids.length} عنصر من ${moduleTitle}؟`)) {
      setData((prev) => prev.filter((item) => !ids.includes(item.id)));
      setSelectedIds([]);
    }
  });

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{moduleTitle}</h1>

        <ExportMenu
          data={exportRows}
          columns={exportColumns as ExportColumn[]}
          selectedIds={selectedIds.length > 0 ? new Set(selectedIds) : undefined}
          filename={moduleTitle.toLowerCase()}
        />
      </div>

      <GlobalTable
        columns={columns as GlobalTableColumn<T>[]}
        data={data}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onModify={handleModify}
        onShare={handleShare}
        onDownload={handleDownload}
        onDelete={handleDelete}
        hideRowActions
      />
    </div>
  );
}
