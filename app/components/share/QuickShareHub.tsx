'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CloudUpload,
  Download,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Share2,
  Bell,
  MoreHorizontal,
} from 'lucide-react';
import {
  backupDocumentToDrive,
  buildQuickShareMessage,
  copyDocumentShareLink,
  openWhatsAppShare,
} from '@/app/lib/atlas-quick-share';
import {
  downloadAuthenticatedExport,
  EXPORT_LABELS,
  type ExportFormat,
} from '@/app/lib/atlas-export-engine';
import { DriveSyncBadge, type DriveSyncState } from '@/app/components/share/DriveSyncBadge';

export type QuickShareHubProps = {
  entityLabel: string;
  documentId?: string;
  exportFormats?: ExportFormat[];
  /** Custom export handler (e.g. invoices without document API). */
  onExport?: (format: ExportFormat) => void | Promise<void>;
  onSendEmail?: () => void;
  /** Trigger automated notification (invoice reminder, etc.). */
  onSendReminder?: () => void | Promise<void>;
  whatsAppMessage?: string;
  onDownloadPdf?: () => void;
  /** Custom secure link copy (invoices / reports). */
  onCopySecureLink?: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  /** Persisted Drive status from parent row state. */
  driveSyncStatus?: DriveSyncState;
  onDriveSyncStatusChange?: (status: DriveSyncState) => void;
  /** Icon-only trigger for unified row action bars. */
  compact?: boolean;
  /** Hide WhatsApp / Email in menu when shown as inline chips. */
  hideDirectShare?: boolean;
  /** Hide export items in menu when shown as inline chips. */
  hideExports?: boolean;
  /** Extra export formats shown only in the more menu (e.g. zip). */
  extraExportFormats?: ExportFormat[];
};

type LocalDriveStatus = DriveSyncState;

const DEFAULT_EXPORT_FORMATS: ExportFormat[] = ['pdf', 'xlsx', 'docx', 'xml'];

export function QuickShareHub({
  entityLabel,
  documentId,
  exportFormats = DEFAULT_EXPORT_FORMATS,
  onExport,
  onSendEmail,
  onSendReminder,
  whatsAppMessage,
  onDownloadPdf,
  onCopySecureLink,
  disabled = false,
  className = '',
  driveSyncStatus = 'idle',
  onDriveSyncStatusChange,
  compact = false,
  hideDirectShare = false,
  hideExports = false,
  extraExportFormats = [],
}: QuickShareHubProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [localDrive, setLocalDrive] = useState<LocalDriveStatus>(driveSyncStatus);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setLocalDrive(driveSyncStatus);
  }, [driveSyncStatus]);

  const setDrive = (status: LocalDriveStatus) => {
    setLocalDrive(status);
    onDriveSyncStatusChange?.(status);
  };

  const close = useCallback(() => setOpen(false), []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.right - Math.min(menuRect.width, 240);
    if (top + menuRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuRect.height - 6);
    }
    left = Math.max(8, Math.min(left, window.innerWidth - 240 - 8));
    setCoords({ top, left });
  }, [open, exportFormats.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const handleExport = async (fmt: ExportFormat) => {
    if (onExport) {
      await onExport(fmt);
    } else if (documentId) {
      downloadAuthenticatedExport(documentId, fmt);
    } else if (fmt === 'pdf' && onDownloadPdf) {
      onDownloadPdf();
    }
    close();
    flash(`${EXPORT_LABELS[fmt]} téléchargé`);
  };

  const handleWhatsApp = async () => {
    close();
    try {
      let message = whatsAppMessage;
      if (!message && documentId) {
        const link = await copyDocumentShareLink(documentId, entityLabel);
        message = buildQuickShareMessage({ entityLabel, shareUrl: link });
      }
      openWhatsAppShare(message ?? `Document Zafirix Pro : ${entityLabel}`);
      flash('WhatsApp ouvert');
    } catch {
      openWhatsAppShare(whatsAppMessage ?? `Document Zafirix Pro : ${entityLabel}`);
    }
  };

  const handleCopyLink = async () => {
    close();
    try {
      if (onCopySecureLink) {
        await onCopySecureLink();
        flash('Lien sécurisé copié');
        return;
      }
      if (!documentId) {
        flash('Lien indisponible');
        return;
      }
      await copyDocumentShareLink(documentId, entityLabel);
      flash('Lien sécurisé copié (7 jours)');
    } catch {
      flash('Échec copie du lien');
    }
  };

  const handleDriveBackup = async () => {
    if (!documentId) return;
    setDrive('syncing');
    const result = await backupDocumentToDrive(documentId, 'pdf');
    if (result.ok) {
      setDrive('synced');
      flash('Sauvegardé sur Google Drive');
    } else if (result.localFallback) {
      setDrive('local_fallback');
      flash(result.message ?? 'Téléchargement local lancé');
    } else {
      setDrive('local_fallback');
      flash(result.message ?? 'Sauvegarde échouée');
    }
    close();
  };

  const menuExportFormats = hideExports ? extraExportFormats : exportFormats;
  const showExports = !hideExports ? (onExport || documentId || onDownloadPdf) : extraExportFormats.length > 0 && Boolean(onExport || documentId);
  const showCopyLink = onCopySecureLink || documentId;
  const menuHasExports = (onDownloadPdf && !onExport && !hideExports) || menuExportFormats.length > 0;
  const menuHasShareExtras = Boolean(onSendReminder || showCopyLink || documentId);

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      style={{
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        visibility: coords ? 'visible' : 'hidden',
      }}
      className="fixed z-[200] w-[min(100vw-1rem,15rem)] sm:w-60 max-h-[min(70vh,24rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1"
    >
      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100 sticky top-0 bg-white">
        {compact ? 'Plus d\'actions' : 'Partager &amp; exporter'}
      </p>

      {onDownloadPdf && !onExport && menuHasExports && (
        <button
          type="button"
          role="menuitem"
          onClick={() => void handleExport('pdf')}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Download size={14} /> Télécharger PDF
        </button>
      )}

      {showExports &&
        menuExportFormats.map((fmt) => (
          <button
            key={fmt}
            type="button"
            role="menuitem"
            onClick={() => void handleExport(fmt)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {fmt === 'xlsx' ? <FileSpreadsheet size={14} /> : <FileText size={14} />}
            Exporter {EXPORT_LABELS[fmt]}
          </button>
        ))}

      {menuHasExports && (menuHasShareExtras || !hideDirectShare) && (
        <div className="mx-3 my-1 border-t border-gray-100" />
      )}

      {!hideDirectShare && (
        <button
          type="button"
          role="menuitem"
          onClick={() => void handleWhatsApp()}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 font-medium"
        >
          <MessageCircle size={14} /> WhatsApp
        </button>
      )}

      {!hideDirectShare && onSendEmail && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onSendEmail();
            close();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Mail size={14} /> Envoyer par email
        </button>
      )}

      {!hideDirectShare && (onSendReminder || showCopyLink || documentId) && (
        <div className="mx-3 my-1 border-t border-gray-100" />
      )}

      {onSendReminder && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            void Promise.resolve(onSendReminder()).then(() => {
              close();
              flash('Notification envoyée');
            });
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
        >
          <Bell size={14} /> Rappel automatique
        </button>
      )}

      {showCopyLink && (
        <button
          type="button"
          role="menuitem"
          onClick={() => void handleCopyLink()}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Link2 size={14} /> Copier lien sécurisé
        </button>
      )}

      {documentId && (
        <button
          type="button"
          role="menuitem"
          onClick={() => void handleDriveBackup()}
          disabled={localDrive === 'syncing'}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {localDrive === 'syncing' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CloudUpload size={14} />
          )}
          <span className="flex-1 text-left">Sauvegarder Drive</span>
          <DriveSyncBadge status={localDrive} compact />
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className={`relative inline-flex flex-col items-center shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={compact ? 'Plus d\'actions' : 'Partager & exporter'}
        aria-label={compact ? 'Plus d\'actions' : 'Partager et exporter'}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white text-xs font-medium text-[#1B2A4A] hover:bg-blue-50 hover:border-blue-200 transition-colors disabled:opacity-50 shrink-0 ${
          compact ? 'px-1.5 py-1' : 'px-2 py-1.5'
        }`}
      >
        {compact ? (
          <MoreHorizontal size={14} className="shrink-0" />
        ) : (
          <>
            <Share2 size={14} className="shrink-0" />
            <span className="hidden sm:inline">Partager</span>
          </>
        )}
        {documentId && !compact && <DriveSyncBadge status={localDrive} compact />}
      </button>

      {toast && (
        <span className="absolute top-full mt-1 z-10 max-w-[12rem] truncate rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
          {toast}
        </span>
      )}

      {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
