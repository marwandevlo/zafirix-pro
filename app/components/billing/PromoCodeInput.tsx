'use client';

import { useCallback, useState } from 'react';
import { Tag } from 'lucide-react';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';

export type AppliedPromo = {
  code: string;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
  attributionOnly: boolean;
  message: string;
};

type Props = {
  baseAmountMad: number;
  onApplied: (promo: AppliedPromo | null) => void;
  disabled?: boolean;
  className?: string;
};

function validateErrorMessage(json: unknown, fallback = 'Code promo invalide.'): string {
  if (typeof json !== 'object' || !json) return fallback;
  const row = json as { message?: unknown; error?: unknown };
  if (typeof row.message === 'string' && row.message.trim()) return row.message;
  if (row.error === 'rate_limited') return 'Trop de tentatives. Réessayez dans une minute.';
  return fallback;
}

export function PromoCodeInput({ baseAmountMad, onApplied, disabled, className }: Props) {
  const [input, setInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearPromo = useCallback(() => {
    setError('');
    setSuccess('');
    onApplied(null);
  }, [onApplied]);

  const applyPromo = useCallback(async () => {
    const code = input.trim();
    if (!code) {
      setError('Saisissez un code promo.');
      setSuccess('');
      onApplied(null);
      return;
    }

    if (!isAtlasSupabaseDataEnabled()) {
      setError('Validation indisponible (Supabase requis).');
      return;
    }

    setApplying(true);
    setError('');
    setSuccess('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code, baseAmountMad }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        valid?: boolean;
        code?: string;
        discountPercent?: number;
        discountAmount?: number;
        finalAmount?: number;
        attributionOnly?: boolean;
        message?: string;
      };

      if (!res.ok || !json.valid) {
        clearPromo();
        setError(validateErrorMessage(json));
        return;
      }

      const applied: AppliedPromo = {
        code: String(json.code ?? code).toUpperCase(),
        discountPercent: Number(json.discountPercent) || 0,
        discountAmount: Number(json.discountAmount) || 0,
        finalAmount: Number(json.finalAmount) || baseAmountMad,
        attributionOnly: Boolean(json.attributionOnly),
        message: String(json.message ?? 'Code promo appliqué.'),
      };
      onApplied(applied);
      setSuccess(applied.message);
    } catch (err) {
      clearPromo();
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setApplying(false);
    }
  }, [baseAmountMad, clearPromo, input, onApplied]);

  return (
    <div className={className}>
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
        <Tag size={14} className="text-gray-400" />
        <span>Avez-vous un code promo ? · هل لديك رمز تخفيض؟</span>
      </label>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value.toUpperCase());
            if (error) setError('');
            if (success) setSuccess('');
          }}
          placeholder="CODE PROMO"
          disabled={disabled || applying}
          className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono uppercase tracking-wide text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:opacity-60"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => void applyPromo()}
          disabled={disabled || applying || !input.trim()}
          className="shrink-0 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {applying ? '…' : 'Appliquer'}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      ) : null}
      {success ? (
        <p className="mt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          {success}
        </p>
      ) : null}
    </div>
  );
}
