'use client';

import { useEffect, useState } from 'react';
import GlobalTable, { type GlobalTableColumn, type GlobalTableRow } from '@/app/components/data-grid/GlobalTable';
import ExportMenu from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
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
  const [data, setData] = useState<T[]>(initialData);

  // Sync internal state when parent data changes
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Default or custom modify behavior
  const handleModify = onModify || ((ids: string[]) => {
    alert(`تعديل جماعي لـ ${ids.length} عنصر في قسم ${moduleTitle}`);
  });

  // Default or custom WhatsApp share behavior via openWhatsAppShare
  const handleShare = onShare || ((ids: string[]) => {
    const selectedRows = data.filter((item) => ids.includes(item.id));
    const summary = selectedRows.map((i) => `- ${String(i[moduleNameKey])}`).join('\n');
    openWhatsAppShare(`ملخص العناصر المحددة (${moduleTitle}):\n${summary}`);
  });

  // Default or custom download behavior via exportTable passing full ExportColumn[]
  const handleDownload = onDownload || ((ids: string[]) => {
    const selectedRows = data.filter((item) => ids.includes(item.id));
    void exportTable(
      'xlsx',
      selectedRows as unknown as Record<string, unknown>[],
      exportColumns as ExportColumn[],
      moduleTitle.toLowerCase(),
    );
  });

  // Default or custom delete behavior
  const handleDelete = onDelete || ((ids: string[]) => {
    if (confirm(`هل أنت متأكد من حذف ${ids.length} عنصر من ${moduleTitle}؟`)) {
      setData((prev) => prev.filter((item) => !ids.includes(item.id)));
      setSelectedIds([]);
    }
  });

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header with module title and ExportMenu scoped to selected rows */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{moduleTitle}</h1>

        <ExportMenu
          data={data as unknown as Record<string, unknown>[]}
          columns={exportColumns as ExportColumn[]}
          selectedIds={selectedIds.length > 0 ? new Set(selectedIds) : undefined}
          filename={moduleTitle.toLowerCase()}
        />
      </div>

      {/* GlobalTable with controlled selection and bulk action bar */}
      <GlobalTable
        columns={columns as GlobalTableColumn<T>[]}
        data={data}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onModify={handleModify}
        onShare={handleShare}
        onDownload={handleDownload}
        onDelete={handleDelete}
        hideRowActions
      />
    </div>
  );
}
