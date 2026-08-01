'use client';

import { useState } from 'react';
import { ClipboardCopy, Check } from 'lucide-react';
import { copyTextToClipboard } from '@/app/lib/atlas-document-upload-error-ui';

type DocumentUploadErrorBannerProps = {
  message: string;
  hint?: string | null;
  reportJson?: string | null;
  failureReason?: string | null;
  onDismiss?: () => void;
};

export function DocumentUploadErrorBanner({
  message,
  hint,
  reportJson,
  failureReason,
  onDismiss,
}: DocumentUploadErrorBannerProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopyReport() {
    if (!reportJson) return;
    const ok = await copyTextToClipboard(reportJson);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
      <p className="font-medium">{message}</p>
      {hint ? <p className="text-red-600/90 leading-relaxed">{hint}</p> : null}
      {failureReason ? (
        <p className="text-xs text-red-500/80 font-mono">Code technique : {failureReason}</p>
      ) : null}
      {reportJson ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCopyReport()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            {copied ? 'Rapport copié' : 'Copier le rapport d’erreur'}
          </button>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-red-600/80 hover:text-red-800 underline-offset-2 hover:underline"
            >
              Fermer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
