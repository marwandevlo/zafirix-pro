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

export type QuickShareHubProps = {
  entityLabel: string;
  documentId?: string;
  exportFormats?: ExportFormat[];
  onSendEmail?: () => void;
  whatsAppMessage?: string;
  onDownloadPdf?: () => void;
  disabled?: boolean;
  className?: string;
};

type DriveStatus = 'idle' | 'syncing' | 'synced' | 'failed';

const DEFAULT_EXPORT_FORMATS: ExportFormat[] = ['pdf', 'xlsx', 'docx', 'xml'];

export function QuickShareHub({
  entityLabel,
  documentId,
  exportFormats = DEFAULT_EXPORT_FORMATS,
  onSendEmail,
  whatsAppMessage,
  onDownloadPdf,
  disabled = false,
  className = '',
}: QuickShareHubProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatus>('idle');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

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
    let left = rect.right - menuRect.width;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuRect.height - 6);
    }
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    setCoords({ top, left });
  }, [open]);

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
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

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
      openWhatsAppShare(`Document Zafirix Pro : ${entityLabel}`);
    }
  };

  const handleCopyLink = async () => {
    close();
    if (!documentId) {
      flash('Lien indisponible');
      return;
    }
    try {
      await copyDocumentShareLink(documentId, entityLabel);
      flash('Lien sécurisé copié (7 jours)');
    } catch {
      flash('Échec copie du lien');
    }
  };

  const handleDriveBackup = async () => {
    if (!documentId) return;
    setDriveStatus('syncing');
    const result = await backupDocumentToDrive(documentId, 'pdf');
    if (result.ok) {
      setDriveStatus('synced');
      flash('Sauvegardé sur Google Drive');
    } else if (result.localFallback) {
      setDriveStatus('failed');
      flash(result.message ?? 'Téléchargement local lancé');
    } else {
      setDriveStatus('failed');
      flash(result.message ?? 'Sauvegarde échouée');
    }
    close();
  };

  const driveBadge =
    driveStatus === 'syncing' ? (
      <Loader2 size={10} className="animate-spin text-blue-500" />
    ) : driveStatus === 'synced' ? (
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="Synchronisé" />
    ) : driveStatus === 'failed' ? (
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Fallback local" />
    ) : null;

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      style={{
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        visibility: coords ? 'visible' : 'hidden',
      }}
      className="fixed z-[200] w-56 rounded-xl border border-gray-200 bg-white shadow-lg py-1"
    >
      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
        Partager &amp; exporter
      </p>

      {onDownloadPdf && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onDownloadPdf();
            close();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Download size={14} /> Télécharger PDF
        </button>
      )}

      {documentId &&
        exportFormats.map((fmt) => (
          <button
            key={fmt}
            type="button"
            role="menuitem"
            onClick={() => {
              downloadAuthenticatedExport(documentId, fmt);
              close();
              flash(`${EXPORT_LABELS[fmt]} téléchargé`);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {fmt === 'xlsx' ? <FileSpreadsheet size={14} /> : <FileText size={14} />}
            Exporter {EXPORT_LABELS[fmt]}
          </button>
        ))}

      <div className="mx-3 my-1 border-t border-gray-100" />

      <button
        type="button"
        role="menuitem"
        onClick={() => void handleWhatsApp()}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 font-medium"
      >
        <MessageCircle size={14} /> WhatsApp
      </button>

      {onSendEmail && (
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

      {documentId && (
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
          disabled={driveStatus === 'syncing'}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {driveStatus === 'syncing' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CloudUpload size={14} />
          )}
          <span className="flex-1 text-left">Sauvegarder Drive</span>
          {driveBadge}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Partager & exporter"
        aria-label="Partager et exporter"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-[#1B2A4A] hover:bg-blue-50 hover:border-blue-200 transition-colors disabled:opacity-50"
      >
        <Share2 size={14} />
        <span className="hidden sm:inline">Partager</span>
        {driveBadge}
      </button>

      {toast && (
        <span className="absolute top-full mt-1 z-10 whitespace-nowrap rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
          {toast}
        </span>
      )}

      {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
