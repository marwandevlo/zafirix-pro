'use client';

import { useState } from 'react';
import { FileQuestion, Loader2 } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';

type Props = {
  documentId: string;
  companyId?: string | null;
  className?: string;
};

export function DocumentExplainerButton({ documentId, companyId: companyIdProp, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Array<{ type: string; label?: string }>>([]);
  const [confidence, setConfidence] = useState<number | null>(null);

  const explain = async () => {
    setLoading(true);
    setOpen(true);
    setAnswer('');
    setSources([]);
    try {
      let companyId = companyIdProp ?? null;
      if (!companyId) {
        companyId = await getActiveCompanyDbRowId();
      }
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
      const data = await res.json() as {
        answer?: string;
        error?: string;
        sources?: Array<{ type: string; label?: string }>;
        confidence?: number;
      };
      setAnswer(data.answer ?? data.error ?? 'Erreur');
      setSources(data.sources ?? []);
      setConfidence(data.confidence ?? null);
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
          {confidence != null && (
            <p className="text-[10px] text-gray-500 mb-1">Confiance: {Math.round(confidence * 100)}%</p>
          )}
          {answer}
          {sources.length > 0 && (
            <p className="mt-2 text-[10px] text-violet-700">
              Sources: {sources.map((s) => s.label ?? s.type).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
