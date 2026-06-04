'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const ref = error.digest?.slice(0, 8) ?? 'ERR-UNKNOWN';

  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Une erreur est survenue</h1>
          <p className="text-sm text-slate-600 mb-6">
            Zafirix Atlas a rencontré un problème inattendu. Notre équipe a été notifiée.
          </p>
          <p className="text-xs text-slate-400 mb-6 font-mono">Référence support : {ref}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            >
              Réessayer
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retour à l&apos;accueil
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
