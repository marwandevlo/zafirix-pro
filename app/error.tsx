'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureAtlasClientException } from '@/app/lib/atlas-client-log';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureAtlasClientException(error, { boundary: 'app/error' });
  }, [error]);

  const ref = error.digest?.slice(0, 8) ?? 'ERR-APP';

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Module temporairement indisponible</h1>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Un problème est survenu lors du chargement de cette page. Vous pouvez réessayer ou revenir au tableau de bord.
        </p>
        <p className="text-xs text-slate-400 font-mono mb-6">Référence : {ref}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
          <a href="/" className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Tableau de bord
          </a>
        </div>
      </div>
    </div>
  );
}
