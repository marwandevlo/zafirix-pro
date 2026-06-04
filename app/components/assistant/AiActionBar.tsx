'use client';

import { useState } from 'react';
import { BarChart2, FileSearch, Loader2, MessageSquare, Wrench } from 'lucide-react';

type AiActionBarProps = {
  companyId?: string | null;
  contextLabel?: string;
  onExplain?: () => void;
};

export function AiActionBar({ companyId, contextLabel, onExplain }: AiActionBarProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState('');

  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';

  const run = async (action: string, path: string, init?: RequestInit) => {
    setLoading(action);
    setResult('');
    try {
      const res = await fetch(path, { credentials: 'include', ...init });
      const data = await res.json().catch(() => ({}));
      if (action === 'audit' && data.report) {
        window.open(`/api/assistant/audit${qs}&download=1`, '_blank');
        setResult('Rapport audit généré.');
      } else if (data.answer) setResult(String(data.answer).slice(0, 500));
      else if (data.explanation) setResult(String(data.explanation).slice(0, 500));
      else setResult(data.labelFr ?? 'Terminé.');
    } catch {
      setResult('Erreur réseau.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {contextLabel && <span className="text-xs text-gray-400 mr-1">{contextLabel}</span>}
      <button
        type="button"
        disabled={!!loading}
        onClick={() => onExplain?.() ?? run('explain', '/api/assistant/readiness' + qs)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
      >
        {loading === 'explain' ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
        Explain
      </button>
      <button
        type="button"
        disabled={!!loading}
        onClick={() => run('analyze', '/api/assistant/anomalies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) })}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
      >
        {loading === 'analyze' ? <Loader2 size={12} className="animate-spin" /> : <BarChart2 size={12} />}
        Analyze
      </button>
      <button
        type="button"
        disabled={!!loading}
        onClick={() => run('investigate', '/api/assistant/anomalies' + qs)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
      >
        {loading === 'investigate' ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} />}
        Investigate
      </button>
      <button
        type="button"
        disabled={!!loading}
        onClick={() => run('audit', '/api/assistant/audit' + qs)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
      >
        {loading === 'audit' ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} />}
        Generate report
      </button>
      <button
        type="button"
        disabled={!!loading}
        onClick={() => window.location.href = '/assistant'}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-violet-600 text-white rounded-lg"
      >
        <Wrench size={12} /> Fix issues
      </button>
      {result && <p className="w-full text-xs text-gray-500 mt-1 line-clamp-3">{result}</p>}
    </div>
  );
}
