'use client';

import { useCallback, useState } from 'react';
import { apiErrorMessageFr, parseApiJson } from '@/app/lib/atlas-api-response';

type LoadState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

/** Safe GET fetch for enterprise module pages — never throws, returns French error messages. */
export function useEnterpriseModuleFetch<T extends Record<string, unknown>>() {
  const [state, setState] = useState<LoadState<T>>({ loading: false, error: null, data: null });

  const load = useCallback(async (url: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(url, { credentials: 'include' });
      const { ok, data, status } = await parseApiJson<T & { error?: string; message?: string }>(res);
      if (!ok) {
        const code = String(data.error ?? 'fetch_failed');
        const message = data.message ?? apiErrorMessageFr(code);
        setState({ loading: false, error: status === 401 ? apiErrorMessageFr('auth_required') : message, data: null });
        return null;
      }
      setState({ loading: false, error: null, data: data as T });
      return data as T;
    } catch {
      setState({ loading: false, error: 'Connexion impossible. Vérifiez votre réseau.', data: null });
      return null;
    }
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return { ...state, load, clearError, setState };
}

/** One-shot safe fetch for enterprise module pages (no hook required). */
export async function fetchEnterpriseModule<T extends Record<string, unknown>>(
  url: string,
): Promise<{ ok: true; data: T; warning?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    const { ok, data, status } = await parseApiJson<
      T & { error?: string; message?: string; warning?: string }
    >(res);
    if (!ok) {
      const code = String(data.error ?? 'fetch_failed');
      const message = data.message ?? apiErrorMessageFr(code);
      return {
        ok: false,
        error: status === 401 ? apiErrorMessageFr('auth_required') : message,
      };
    }
    return { ok: true, data: data as T, warning: data.warning };
  } catch {
    return { ok: false, error: 'Connexion impossible. Vérifiez votre réseau.' };
  }
}

/** Inline banner for module load errors (non-blocking). */
export function ModuleLoadErrorBanner({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start justify-between gap-3">
      <p>{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-xs font-medium text-amber-700 hover:text-amber-900 shrink-0">
          Fermer
        </button>
      )}
    </div>
  );
}

/** Empty state when no company is selected. */
export function ModuleNoCompanyState({ moduleLabel }: { moduleLabel: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
      <p className="font-medium text-gray-700 mb-1">Aucune société active</p>
      <p>Sélectionnez ou créez une société pour accéder à {moduleLabel}.</p>
    </div>
  );
}
