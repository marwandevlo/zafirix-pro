'use client';

import type { ReactNode } from 'react';
import { DocumentExportChips } from '@/app/components/share/DocumentExportChips';
import { QuickShareChips } from '@/app/components/share/QuickShareChips';
import { QuickShareHub } from '@/app/components/share/QuickShareHub';
import type { DriveSyncState } from '@/app/components/share/DriveSyncBadge';
import type { ExportFormat } from '@/app/lib/atlas-export-engine';

export type RowShareActionBarProps = {
  entityLabel: string;
  whatsAppMessage: string;
  whatsAppPhone?: string;
  onSendEmail?: () => void;
  mailto?: { to?: string; subject: string; body: string };
  exportFormats?: ExportFormat[];
  /** Formats available only in the more menu (e.g. zip). */
  menuExtraExportFormats?: ExportFormat[];
  onExport?: (format: ExportFormat) => void;
  documentId?: string;
  onCopySecureLink?: () => void | Promise<void>;
  onSendReminder?: () => void | Promise<void>;
  onSendFeedbackRequest?: () => void | Promise<void>;
  onDownloadPdf?: () => void;
  driveSyncStatus?: DriveSyncState;
  onDriveSyncStatusChange?: (status: DriveSyncState) => void;
  disabled?: boolean;
  /** Extra row actions (payment, validate, etc.) rendered before share bar. */
  children?: ReactNode;
  className?: string;
};

/**
 * Unified table action bar:
 * [extra actions] + [Export chips] + [WhatsApp] + [Email] + [More menu …]
 */
export function RowShareActionBar({
  entityLabel,
  whatsAppMessage,
  whatsAppPhone,
  onSendEmail,
  mailto,
  exportFormats,
  menuExtraExportFormats,
  onExport,
  documentId,
  onCopySecureLink,
  onSendReminder,
  onSendFeedbackRequest,
  onDownloadPdf,
  driveSyncStatus,
  onDriveSyncStatusChange,
  disabled = false,
  children,
  className = '',
}: RowShareActionBarProps) {
  const showExports = Boolean(onExport && exportFormats?.length);

  return (
    <div
      className={`flex items-center gap-1 justify-end flex-wrap min-w-0 ml-auto ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      {showExports && (
        <DocumentExportChips
          formats={exportFormats}
          onExport={onExport!}
          disabled={disabled}
        />
      )}
      <QuickShareChips
        whatsAppMessage={whatsAppMessage}
        whatsAppPhone={whatsAppPhone}
        onSendEmail={onSendEmail}
        mailto={mailto}
        disabled={disabled}
      />
      <QuickShareHub
        entityLabel={entityLabel}
        documentId={documentId}
        exportFormats={exportFormats}
        extraExportFormats={menuExtraExportFormats}
        onExport={onExport}
        onSendEmail={onSendEmail}
        onSendReminder={onSendReminder}
        onSendFeedbackRequest={onSendFeedbackRequest}
        onCopySecureLink={onCopySecureLink}
        onDownloadPdf={onDownloadPdf}
        whatsAppMessage={whatsAppMessage}
        driveSyncStatus={driveSyncStatus}
        onDriveSyncStatusChange={onDriveSyncStatusChange}
        disabled={disabled}
        compact
        hideDirectShare
        hideExports={showExports}
      />
    </div>
  );
}
