'use client';

import { useCallback, useState } from 'react';
import { FileSpreadsheet, FileText, Pencil, Trash2 } from 'lucide-react';
import { EntityActionMenu } from '@/app/components/actions/EntityActionMenu';
import { ConfirmDeleteDialog } from '@/app/components/actions/ConfirmDeleteDialog';
import { EditRecordModal, type EditField } from '@/app/components/actions/EditRecordModal';
import { exportTable } from '@/app/lib/atlas-table-export';
import type { ExportColumn } from '@/app/lib/atlas-table-export';
import { showAtlasErrorToast } from '@/app/lib/atlas-toast';

export type RowActionsProps = {
  entityId: string;
  entityLabel: string;
  entityType?: string;
  /** Row data for single-record export */
  exportData?: Record<string, unknown>;
  exportColumns?: ExportColumn[];
  exportFilename?: string;
  exportTitle?: string;
  editFields?: EditField[];
  onEditSave?: (values: Record<string, string>) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  showArchiveOption?: boolean;
  onArchive?: () => Promise<boolean>;
  hideEdit?: boolean;
  hideDelete?: boolean;
  hideExport?: boolean;
};

export function RowActions({
  entityId,
  entityLabel,
  entityType = 'enregistrement',
  exportData,
  exportColumns,
  exportFilename,
  exportTitle,
  editFields,
  onEditSave,
  onDelete,
  showArchiveOption = false,
  onArchive,
  hideEdit = false,
  hideDelete = false,
  hideExport = false,
}: RowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canExport = !hideExport && exportData && exportColumns && exportFilename;
  const canEdit = !hideEdit && editFields && onEditSave;
  const canDelete = !hideDelete && onDelete;

  const exportRow = useCallback(async (format: 'xlsx' | 'pdf') => {
    if (!exportData || !exportColumns || !exportFilename) return;
    await exportTable(format, [exportData], exportColumns, `${exportFilename}_${entityId.slice(0, 8)}`, {
      title: exportTitle ?? entityLabel,
      totalRows: 1,
      selectedRows: 1,
    });
  }, [exportData, exportColumns, exportFilename, exportTitle, entityId, entityLabel]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      const ok = await onDelete();
      if (ok) {
        setDeleteOpen(false);
      } else {
        console.warn('[RowActions] delete returned false', { entityId, entityLabel });
      }
    } catch (err) {
      console.error('[RowActions] delete threw', err, { entityId, entityLabel });
      showAtlasErrorToast(err instanceof Error ? err.message : 'La suppression a échoué.');
    } finally {
      setDeleting(false);
    }
  }, [onDelete, entityId, entityLabel]);

  if (!canExport && !canEdit && !canDelete) return null;

  return (
    <>
      <EntityActionMenu
        entityLabel={entityLabel}
        triggerClassName="p-1"
        actions={[
          {
            id: 'edit',
            label: 'Modifier',
            Icon: Pencil,
            onClick: () => setEditOpen(true),
            hidden: !canEdit,
          },
          {
            id: 'export-xlsx',
            label: 'Exporter Excel',
            Icon: FileSpreadsheet,
            onClick: () => void exportRow('xlsx'),
            hidden: !canExport,
          },
          {
            id: 'export-pdf',
            label: 'Exporter PDF',
            Icon: FileText,
            onClick: () => void exportRow('pdf'),
            hidden: !canExport,
            dividerAfter: !!canDelete,
          },
          {
            id: 'delete',
            label: 'Supprimer',
            Icon: Trash2,
            variant: 'danger',
            onClick: () => setDeleteOpen(true),
            hidden: !canDelete,
          },
        ]}
      />

      {canEdit && editFields && onEditSave && (
        <EditRecordModal
          open={editOpen}
          title={`Modifier — ${entityLabel}`}
          fields={editFields}
          onSave={onEditSave}
          onClose={() => setEditOpen(false)}
        />
      )}

      {canDelete && (
        <ConfirmDeleteDialog
          open={deleteOpen}
          entityName={entityLabel}
          entityType={entityType}
          showArchiveOption={showArchiveOption && !!onArchive}
          onConfirmArchive={onArchive ? () => void onArchive().then((ok) => ok && setDeleteOpen(false)) : undefined}
          onConfirmDelete={() => void handleDelete()}
          onCancel={() => !deleting && setDeleteOpen(false)}
          message={deleting ? 'Suppression en cours…' : undefined}
        />
      )}
    </>
  );
}
