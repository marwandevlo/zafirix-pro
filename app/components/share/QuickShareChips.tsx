'use client';

import { Mail, MessageCircle } from 'lucide-react';
import { openMailtoShare, openWhatsAppShare } from '@/app/lib/atlas-quick-share';

export type QuickShareChipsProps = {
  whatsAppMessage: string;
  whatsAppPhone?: string;
  /** Custom email handler (e.g. modal). Falls back to mailto when mailto props provided. */
  onSendEmail?: () => void;
  mailto?: { to?: string; subject: string; body: string };
  disabled?: boolean;
  className?: string;
};

/** Inline WhatsApp + Email action chips for table rows. */
export function QuickShareChips({
  whatsAppMessage,
  whatsAppPhone,
  onSendEmail,
  mailto,
  disabled = false,
  className = '',
}: QuickShareChipsProps) {
  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    openWhatsAppShare(whatsAppMessage, whatsAppPhone);
  };

  const handleEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSendEmail) {
      onSendEmail();
      return;
    }
    if (mailto) {
      openMailtoShare(mailto);
    }
  };

  const emailEnabled = Boolean(onSendEmail || mailto);

  return (
    <div className={`inline-flex items-center gap-1 shrink-0 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        title="Partager via WhatsApp"
        aria-label="Partager via WhatsApp"
        onClick={handleWhatsApp}
        className="inline-flex items-center gap-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 transition-colors"
      >
        <MessageCircle size={11} aria-hidden />
        <span className="hidden sm:inline">WA</span>
      </button>
      {emailEnabled && (
        <button
          type="button"
          disabled={disabled}
          title="Envoyer par email"
          aria-label="Envoyer par email"
          onClick={handleEmail}
          className="inline-flex items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-1 text-[10px] font-semibold text-blue-800 hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50 transition-colors"
        >
          <Mail size={11} aria-hidden />
          <span className="hidden sm:inline">Email</span>
        </button>
      )}
    </div>
  );
}
