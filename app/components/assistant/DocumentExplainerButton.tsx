'use client';

import { useState } from 'react';
import { FileQuestion, Loader2 } from 'lucide-react';

type Props = {
  documentId: string;
  companyId?: string | null;
  className?: string;
};

export function DocumentExplainerButton({ documentId, companyId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');

  const explain = async () => {
    setLoading(true);
    setOpen(true);
    setAnswer('');
    try {
      const res = await fetch('/api/assistant/explain', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'document',
          entityId: documentId,
          companyId,
          question: 'Expliquer ce document: type, champs extraits, impact comptable et fiscal, routage, validation.',
        }),
      });
      const data = await res.json() as { answer?: string; error?: string };
      setAnswer(data.answer ?? data.error ?? 'Erreur');
    } catch {
      setAnswer('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void explain()}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <FileQuestion size={12} />}
        Expliquer ce document
      </button>
      {open && answer && (
        <div className="mt-2 p-3 text-xs bg-violet-50 border border-violet-100 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap">
          {answer}
        </div>
      )}
    </div>
  );
}
