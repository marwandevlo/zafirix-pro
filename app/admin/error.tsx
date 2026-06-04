'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin-error]', error.message);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <h1 className="text-lg font-bold text-gray-900 mb-2">Erreur admin</h1>
        <p className="text-sm text-gray-600 mb-4">Impossible de charger cette section. Réessayez ou contactez le support.</p>
        <p className="text-xs font-mono text-gray-400 mb-6">{error.digest?.slice(0, 8) ?? 'ADMIN-ERR'}</p>
        <button type="button" onClick={() => reset()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold">
          <RefreshCw className="w-4 h-4" /> Réessayer
        </button>
      </div>
    </div>
  );
}
