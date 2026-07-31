'use client';

import type { ReactNode } from 'react';
import GlobalTable from '@/app/components/data-grid/GlobalTable';
import type { GlobalTableColumn, GlobalTableRow } from '@/app/components/data-grid/GlobalTable';
import ExportMenu from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';

export type FacturesTableSectionProps<T extends GlobalTableRow = GlobalTableRow> = {
  /** Rows for GlobalTable (must include string `id`) */
  tableData: T[];
  /** Rows for ExportMenu (full export payload) */
  exportData: Record<string, unknown>[];
  columns: GlobalTableColumn<T>[];
  exportColumns: ExportColumn[];
  /** Controlled selection — starts empty, no pre-selection */
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onModify: (ids: string[]) => void;
  onShare: (ids: string[]) => void;
  onDownload: (ids: string[]) => void | Promise<void>;
  onDelete: (ids: string[]) => void;
  exportFilename?: string;
  exportTitle?: string;
  exportFilters?: Record<string, unknown>;
  emptyState?: ReactNode;
  hideRowActions?: boolean;
};

/**
 * Factures list: GlobalTable bulk selection + ExportMenu linked to selected rows.
 * Selection state must live in the parent (`useState<string[]>([])`).
 */
export function FacturesTableSection<T extends GlobalTableRow = GlobalTableRow>({
  tableData,
  exportData,
  columns,
  exportColumns,
  selectedIds,
  onSelectionChange,
  onModify,
  onShare,
  onDownload,
  onDelete,
  exportFilename = 'factures',
  exportTitle = 'Factures clients',
  exportFilters,
  emptyState,
  hideRowActions = true,
}: FacturesTableSectionProps<T>) {
  if (tableData.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <ExportMenu
          data={exportData}
          columns={exportColumns}
          filename={exportFilename}
          title={exportTitle}
          filters={exportFilters}
          selectedIds={selectedIds.length > 0 ? new Set(selectedIds) : undefined}
          size="xs"
        />
      </div>

      <GlobalTable
        columns={columns}
        data={tableData}
        selectedIds={selectedIds}
        onSelectionChange={onSelectionChange}
        onModify={onModify}
        onShare={onShare}
        onDownload={(ids) => void onDownload(ids)}
        onDelete={onDelete}
        hideRowActions={hideRowActions}
      />
    </div>
  );
}

export default FacturesTableSection;
