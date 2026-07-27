'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Send, X } from 'lucide-react';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import {
  buildManualSubscriptionWhatsAppUrl,
  MANUAL_PAYMENT_FALLBACK_EMAIL,
  planDisplayName,
} from '@/app/lib/atlas-manual-subscription';
import { ATLAS_INCIDENT_HOTFIX_GROWTH } from '@/app/lib/atlas-hotfix';
import { trackEvent } from '@/app/lib/analytics-track';
import { getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';

type ManualProvider = 'cashplus' | 'wafacash' | 'western_union';

type Props = {
  open: boolean;
  onClose: () => void;
  planId: string;
};

function submitErrorMessage(json: unknown, fallback = 'Échec de l’envoi'): string {
  if (typeof json !== 'object' || !json) return fallback;
  const row = json as { error?: unknown; message?: unknown; hint?: unknown };
  const error = typeof row.error === 'string' ? row.error : '';
  const message = typeof row.message === 'string' ? row.message : '';
  const hint = typeof row.hint === 'string' ? row.hint : '';

  if (error === 'temporarily_unavailable') {
    return message || 'Paiement temporairement indisponible. Réessayez plus tard.';
  }
  if (error === 'auth_required') return 'Connectez-vous pour envoyer la demande.';
  if (error === 'invalid_plan') return 'Plan invalide. Rouvrez la page tarifs.';
  if (error === 'rate_limited') return 'Trop de tentatives. Réessayez dans une minute.';
  if (error === 'payment_requests_table_missing' || error === 'db_error') {
    return [message || 'Erreur base de données', hint].filter(Boolean).join(' · ') || fallback;
  }
  return message || error || fallback;
}

export function ManualPaymentModal({ open, onClose, planId }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [provider, setProvider] = useState<ManualProvider>('cashplus');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const planLabel = useMemo(() => {
    const fromCatalog = getAtlasPlanById(planId);
    return fromCatalog?.name ?? planDisplayName(planId);
  }, [planId]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setMessage('');
    let cancelled = false;
    void (async () => {
      if (!isAtlasSupabaseDataEnabled()) {
        setEmail(null);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setEmail(data.session?.user?.email?.trim() ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, planId]);

  const whatsappHref = useMemo(
    () =>
      buildManualSubscriptionWhatsAppUrl({
        planLabel,
        userEmail: email?.trim() || MANUAL_PAYMENT_FALLBACK_EMAIL,
      }),
    [email, planLabel],
  );

  const submitRequest = useCallback(async () => {
    setError('');
    setMessage('');
    if (!isAtlasSupabaseDataEnabled()) {
      setError('Supabase requis pour enregistrer la demande.');
      return;
    }

    const catalogPlan = getAtlasPlanById(planId);
    if (!catalogPlan) {
      setError('Plan invalide. Rouvrez la page tarifs.');
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push(`/login?next=${encodeURIComponent('/pricing')}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/payments/manual-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId: catalogPlan.id, provider }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        message?: string;
        hint?: string;
      };

      if (!res.ok) {
        setError(submitErrorMessage(json));
        return;
      }

      const requestId = typeof json.id === 'string' ? json.id : '';
      if (!requestId) {
        setError('Demande créée sans référence. Contactez le support.');
        return;
      }

      trackEvent('manual_payment_requested', {
        planId: catalogPlan.id,
        provider,
        source: 'pricing_modal',
        requestId,
      });
      setMessage(
        `Demande enregistrée (réf. ${requestId.slice(0, 8)}…). Notre équipe activera votre forfait après confirmation du paiement.`,
      );
    } catch (err) {
      console.error('[ManualPaymentModal] submit failed', err);
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }, [planId, provider, router]);

  if (ATLAS_INCIDENT_HOTFIX_GROWTH) return null;
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Paiement manuel</h2>
            <p className="text-xs text-slate-500 mt-0.5">Maroc · CashPlus · WafaCash · Western Union</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-white hover:text-slate-800 transition-colors"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Contactez-nous sur WhatsApp ou envoyez une demande. L’équipe ZAFIRIX PRO valide votre règlement puis active
            l’offre.
          </p>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Forfait sélectionné</p>
          <p className="text-base font-bold text-slate-900">{planLabel}</p>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Canal de paiement</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'cashplus' as const, label: 'CashPlus' },
                  { id: 'wafacash' as const, label: 'WafaCash' },
                  { id: 'western_union' as const, label: 'Western Union' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`px-2 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                    provider === p.id
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          ) : null}
          {message ? (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              {message}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 pt-1">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:brightness-95 transition-all"
            >
              <MessageCircle size={18} />
              WhatsApp
            </a>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitRequest()}
              className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#0F1F3D] text-white text-sm font-bold hover:bg-[#1a3060] disabled:opacity-50 transition-colors"
            >
              <Send size={16} />
              {submitting ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            WhatsApp ouvre un chat avec +212 622 171 488. « Envoyer la demande » enregistre une ligne dans
            atlas_payment_requests (visible dans Admin → Manuel).
          </p>
        </div>
      </div>
    </div>
  );
}
