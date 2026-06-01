'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, Mail, Share2 } from 'lucide-react';

type ShareAction = {
  id: string;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
};

type ShareExportMenuProps = {
  /** PDF download handler. */
  onDownloadPdf?: () => void;
  /** Email share handler. */
  onSendEmail?: () => void | Promise<void>;
  /** Copy link handler. */
  onCopyLink?: () => void | Promise<void>;
  /** Extra custom actions. */
  extraActions?: ShareAction[];
};

export function ShareExportMenu({ onDownloadPdf, onSendEmail, onCopyLink, extraActions }: ShareExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  const handleCopy = async () => {
    if (onCopyLink) {
      await onCopyLink();
    } else {
      await navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    close();
  };

  const actions: { id: string; label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; onClick: () => void; disabled?: boolean }[] = [
    ...(onDownloadPdf ? [{ id: 'pdf', label: 'Télécharger PDF', Icon: Download, onClick: () => { onDownloadPdf(); close(); } }] : []),
    ...(onSendEmail ? [{ id: 'email', label: 'Envoyer par email', Icon: Mail, onClick: () => { void onSendEmail(); close(); } }] : []),
    { id: 'copy', label: copied ? 'Lien copié !' : 'Copier le lien', Icon: Copy, onClick: () => void handleCopy() },
    ...(extraActions ?? []).map(a => ({ id: a.id, label: a.label, Icon: Share2, onClick: () => { void a.onClick(); close(); }, disabled: a.disabled })),
  ];

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg p-1.5 transition-colors"
        title="Partager / Exporter"
        aria-label="Partager"
      >
        <Share2 size={14} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          role="menu"
        >
          {actions.map(({ id, label, Icon, onClick, disabled }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={onClick}
              disabled={disabled}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon size={14} className="shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
