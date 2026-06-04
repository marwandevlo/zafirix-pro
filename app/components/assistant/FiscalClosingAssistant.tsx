'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ClipboardCheck, Loader2, XCircle } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import type { AtlasAiClosingChecklist } from '@/app/types/atlas-ai-copilot';

export function FiscalClosingAssistant() {
  const router = useRouter();
  const [closing, setClosing] = useState<AtlasAiClosingChecklist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cid = await getActiveCompanyDbRowId();
        const qs = cid ? `?companyId=${encodeURIComponent(cid)}` : '';
        const res = await fetch(`/api/assistant/readiness${qs}`, { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { closing?: AtlasAiClosingChecklist };
        if (!cancelled) setClosing(data.closing ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck size={16} className="text-indigo-600" />
        <h3 className="font-semibold text-gray-800 text-sm">Fiscal Closing Assistant</h3>
      </div>
      {loading ? (
        <Loader2 className="animate-spin text-gray-400" size={18} />
      ) : closing ? (
        <>
          <div className={`flex items-center gap-2 text-sm font-medium mb-3 ${closing.ready ? 'text-green-700' : 'text-red-700'}`}>
            {closing.ready ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {closing.ready ? 'Ready for closing' : 'Not ready'}
            <span className="text-gray-400 font-normal">({closing.readinessScore}%)</span>
          </div>
          <ul className="space-y-1.5">
            {closing.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => item.href && router.push(item.href)}
                  className="flex items-center gap-2 text-xs w-full text-left hover:bg-gray-50 rounded px-1 py-0.5"
                >
                  {item.ok ? <CheckCircle size={12} className="text-green-600" /> : <XCircle size={12} className="text-red-500" />}
                  <span className={item.ok ? 'text-gray-600' : 'text-gray-800 font-medium'}>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-gray-400">Chargement impossible</p>
      )}
    </div>
  );
}
