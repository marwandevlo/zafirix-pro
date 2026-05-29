'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CreditCard, BadgeCheck, Landmark, Wallet, ShieldCheck, ReceiptText, ArrowRight, Info } from 'lucide-react';
import { formatLimit, formatPriceMadYear, getAtlasPlanById } from '@/app/lib/atlas-pricing-plans';
import { getCompanyAddonById } from '@/app/lib/atlas-company-addons';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { blockCriticalLocalStorageInProduction } from '@/app/lib/atlas-runtime-guards';
import { supabase } from '@/app/lib/supabase';

type PaymentMethod = 'card' | 'cmi' | 'manual';
type ManualProvider = 'cashplus' | 'wafacash' | 'western_union';

type PendingSubscription = {
  id: string;
  status: 'pending';
  planId: string;
  planName: string;
  amount: number;
  currency: 'MAD';
  billingPeriod: 'year' | 'trial';
  paymentMethod: PaymentMethod;
  manualProvider?: ManualProvider;
  createdAt: string;
  /** Pro company slot add-on (not a full plan). */
  addonId?: string;
};

function createReferenceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `atlas_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function PaymentClient() {
  const router = useRouter();
  const search = useSearchParams();
  const planId = search.get('plan') ?? '';
  const addonId = search.get('addon') ?? '';

  const plan = useMemo(() => getAtlasPlanById(planId) ?? null, [planId]);
  const addon = useMemo(() => getCompanyAddonById(addonId), [addonId]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [manualProvider, setManualProvider] = useState<ManualProvider>('cashplus');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const priceLabel = useMemo(() => {
    if (addon) return `${addon.priceMadYear.toLocaleString('fr-MA')} MAD/an`;
    if (!plan) return '';
    return plan.billingPeriod === 'year'
      ? formatPriceMadYear(plan.price)
      : `${plan.price.toLocaleString()} ${plan.currency} · ${plan.durationDays ?? 7} jours`;
  }, [plan, addon]);

  const confirmManual = async () => {
    if (!plan && !addon) return;
    setSubmitting(true);
    setError('');
    try {
      if (addon) {
        if (isAtlasSupabaseDataEnabled()) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token ?? '';
          if (!token) {
            router.push(`/login?next=${encodeURIComponent(`/payment?addon=${addon.id}`)}`);
            return;
          }

          const res = await fetch('/api/payments/manual-request', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ addonId: addon.id, provider: manualProvider }),
          });
          const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
          if (!res.ok) {
            setError(typeof json?.error === 'string' ? json.error : 'Erreur paiement');
            return;
          }
          const id = String(json.id || '');
          if (!id) {
            setError('Erreur paiement');
            return;
          }
          router.push(`/payment/success?ref=${encodeURIComponent(id)}&addon=${encodeURIComponent(addon.id)}`);
          return;
        }

        if (process.env.NODE_ENV === 'production') {
          setError('Paiement indisponible : configuration serveur requise (Supabase).');
          return;
        }

        const id = createReferenceId();
        const pending: PendingSubscription = {
          id,
          status: 'pending',
          planId: 'pro',
          planName: `Extension Pro · ${addon.labelFr}`,
          amount: addon.priceMadYear,
          currency: 'MAD',
          billingPeriod: 'year',
          paymentMethod: 'manual',
          manualProvider,
          createdAt: new Date().toISOString(),
          addonId: addon.id,
        };
        void pending;
        router.push(`/payment/success?ref=${encodeURIComponent(id)}&addon=${encodeURIComponent(addon.id)}`);
        return;
      }

      if (!plan) return;

      if (isAtlasSupabaseDataEnabled()) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        if (!token) {
          router.push(`/login?next=${encodeURIComponent(`/payment?plan=${plan.id}`)}`);
          return;
        }

        const res = await fetch('/api/payments/manual-request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ planId: plan.id, provider: manualProvider }),
        });
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
              ? String((json as { error?: unknown }).error)
              : 'Erreur paiement';
          setError(msg);
          return;
        }
        const id =
          typeof json === 'object' && json && 'id' in json ? String((json as { id?: unknown }).id ?? '') : '';
        if (!id) {
          setError('Erreur paiement');
          return;
        }
        router.push(`/payment/success?ref=${encodeURIComponent(id)}`);
        return;
      }

      if (process.env.NODE_ENV === 'production') {
        setError('Paiement indisponible : configuration serveur requise (Supabase).');
        return;
      }

      // Local/demo fallback
      const id = createReferenceId();
      const pending: PendingSubscription = {
        id,
        status: 'pending',
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        currency: plan.currency,
        billingPeriod: plan.billingPeriod,
        paymentMethod: 'manual',
        manualProvider,
        createdAt: new Date().toISOString(),
      };
      void pending;
      router.push(`/payment/success?ref=${encodeURIComponent(id)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/pricing')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={16} /> Retour aux tarifs
          </button>
          <span className="text-gray-200">/</span>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CreditCard size={18} /> Paiement
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {!plan && !addon ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm text-gray-700">
              Sélectionnez un plan ou une extension depuis la page tarifs.
            </p>
            <button
              onClick={() => router.push('/pricing')}
              className="mt-4 px-4 py-2 rounded-xl bg-[#0F1F3D] text-white text-sm font-semibold hover:bg-[#1a3060]"
            >
              Retour aux tarifs
            </button>
          </div>
        ) : addon ? (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-indigo-50 bg-indigo-50/50">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Extension Pro · hors forfait</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{addon.labelFr}</p>
                <p className="text-sm text-gray-600 mt-1">{addon.descriptionFr}</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-4">{priceLabel}</p>
              </div>
              <div className="px-6 py-6">
                {error && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                  </div>
                )}
                <p className="text-sm font-semibold text-gray-900">Paiement manuel</p>
                <p className="text-xs text-gray-500 mt-1">Demande enregistrée — activation après validation.</p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      onClick={() => setManualProvider(p.id)}
                      className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                        manualProvider === p.id ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void confirmManual()}
                    disabled={submitting}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                      submitting ? 'bg-amber-200 text-amber-900/60 cursor-not-allowed' : 'bg-amber-400 text-[#0F1F3D] hover:bg-amber-300'
                    }`}
                  >
                    {submitting ? 'Création…' : 'Confirmer la demande'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/pricing')}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                </div>
                <p className="mt-4 flex items-start gap-2 text-xs text-gray-500">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  Les extensions sont facturées à part des offres Starter / Pro / Cabinet. Elles augmentent uniquement le plafond sociétés du forfait Pro.
                </p>
              </div>
            </div>
          </div>
        ) : plan ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Checkout</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">Paiement · دفع</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className={`px-2.5 py-1 rounded-full border ${step >= 1 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>1</span>
                    <span className={`px-2.5 py-1 rounded-full border ${step >= 2 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>2</span>
                    <span className={`px-2.5 py-1 rounded-full border ${step >= 3 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>3</span>
                  </div>
                </div>

                <div className="px-6 py-6">
                  {error && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      {error}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">1) Résumé du plan · ملخص الخطة</p>
                      <p className="text-xs text-gray-500 mt-1">Vérifiez votre sélection avant de continuer.</p>
                    </div>
                    <button
                      onClick={() => router.push('/pricing')}
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                    >
                      Modifier
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-bold text-gray-900">{plan.name}</p>
                        <p className="text-sm text-gray-600 mt-1">{plan.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Prix</p>
                        <p className="text-xl font-extrabold text-gray-900 mt-1">{priceLabel}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-gray-100 bg-white p-3">
                        <p className="text-[11px] text-gray-500">Sociétés</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{formatLimit(plan.companiesLimit)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white p-3">
                        <p className="text-[11px] text-gray-500">Utilisateurs</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{formatLimit(plan.usersLimit)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white p-3">
                        <p className="text-[11px] text-gray-500">Opérations</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{formatLimit(plan.operationsLimit)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end">
                    <button
                      onClick={() => setStep(2)}
                      className="px-4 py-2 rounded-xl bg-[#0F1F3D] text-white text-sm font-semibold hover:bg-[#1a3060] flex items-center gap-2"
                    >
                      Continuer <ArrowRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="px-6 py-6 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">2) Méthode de paiement · طريقة الدفع</p>
                  <p className="text-xs text-gray-500 mt-1">Choisissez une option (aucun paiement réel n’est traité pour le moment).</p>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button
                      onClick={() => { setMethod('card'); setStep(3); }}
                      className={`text-left rounded-2xl border p-4 shadow-sm hover:shadow-md transition-shadow ${
                        method === 'card' ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
                          <CreditCard size={18} />
                        </div>
                        {method === 'card' && <BadgeCheck className="text-blue-600" size={18} />}
                      </div>
                      <p className="mt-3 font-semibold text-gray-900 text-sm">Card</p>
                      <p className="text-xs text-gray-500 mt-1">Visa · Mastercard · Maestro</p>
                      <p className="text-[11px] text-gray-400 mt-3">Prêt pour intégration CMI plus tard.</p>
                    </button>

                    <button
                      onClick={() => { setMethod('cmi'); setStep(3); }}
                      className={`text-left rounded-2xl border p-4 shadow-sm hover:shadow-md transition-shadow ${
                        method === 'cmi' ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
                          <Landmark size={18} />
                        </div>
                        {method === 'cmi' && <BadgeCheck className="text-emerald-600" size={18} />}
                      </div>
                      <p className="mt-3 font-semibold text-gray-900 text-sm">CMI</p>
                      <p className="text-xs text-gray-500 mt-1">Paiement en ligne</p>
                      <p className="text-[11px] text-gray-400 mt-3">Structure prête pour intégration.</p>
                    </button>

                    <button
                      onClick={() => { setMethod('manual'); setStep(3); }}
                      className={`text-left rounded-2xl border p-4 shadow-sm hover:shadow-md transition-shadow ${
                        method === 'manual' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-800">
                          <Wallet size={18} />
                        </div>
                        {method === 'manual' && <BadgeCheck className="text-amber-700" size={18} />}
                      </div>
                      <p className="mt-3 font-semibold text-gray-900 text-sm">Manual</p>
                      <p className="text-xs text-gray-500 mt-1">CashPlus · WafaCash · Western Union</p>
                      <p className="text-[11px] text-gray-400 mt-3">Génère une référence + statut “pending”.</p>
                    </button>
                  </div>
                </div>

                <div className="px-6 py-6 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">3) Confirmation · تأكيد</p>
                  {!method ? (
                    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                      Choisissez une méthode de paiement pour afficher les instructions.
                    </div>
                  ) : method === 'card' ? (
                    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-blue-700">
                          <ShieldCheck size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-blue-900">Paiement par carte (à venir)</p>
                          <p className="text-sm text-blue-900/80 mt-1">
                            Cette option est <span className="font-semibold">prête pour une future intégration CMI</span>.
                            Aucun paiement réel n’est traité pour le moment.
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          onClick={() => setStep(2)}
                          className="px-4 py-2 rounded-xl border border-blue-200 text-sm font-semibold text-blue-900 hover:bg-white/60"
                        >
                          Changer de méthode
                        </button>
                        <button
                          disabled
                          className="px-4 py-2 rounded-xl bg-blue-200 text-blue-900/60 text-sm font-semibold cursor-not-allowed"
                        >
                          Confirmer la demande
                        </button>
                      </div>
                    </div>
                  ) : method === 'cmi' ? (
                    <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-emerald-700">
                          <Landmark size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-emerald-900">CMI Online</p>
                          <p className="text-sm text-emerald-900/80 mt-1">الدفع عبر CMI سيكون متاحاً قريباً</p>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          onClick={() => setStep(2)}
                          className="px-4 py-2 rounded-xl border border-emerald-200 text-sm font-semibold text-emerald-900 hover:bg-white/60"
                        >
                          Changer de méthode
                        </button>
                        <button
                          disabled
                          className="px-4 py-2 rounded-xl bg-emerald-200 text-emerald-900/60 text-sm font-semibold cursor-not-allowed"
                        >
                          Confirmer la demande
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-5">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-amber-800">
                          <ReceiptText size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-amber-900">Paiement manuel</p>
                          <p className="text-sm text-amber-900/80 mt-1">
                            Après paiement, un admin activera votre abonnement après confirmation.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {([
                          { id: 'cashplus', label: 'CashPlus' },
                          { id: 'wafacash', label: 'WafaCash' },
                          { id: 'western_union', label: 'Western Union' },
                        ] as const).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setManualProvider(p.id)}
                            className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                              manualProvider === p.id ? 'bg-white border-amber-300 text-amber-900' : 'bg-white/60 border-amber-200 text-amber-900/80 hover:bg-white'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-xl border border-amber-200 bg-white/70 p-4 text-sm text-amber-950">
                        <p className="font-semibold">Instructions</p>
                        <ul className="mt-2 space-y-1 text-sm">
                          <li>- Payez le montant <span className="font-semibold">{priceLabel}</span> via <span className="font-semibold">{manualProvider === 'cashplus' ? 'CashPlus' : manualProvider === 'wafacash' ? 'WafaCash' : 'Western Union'}</span>.</li>
                          <li>- Vous recevrez une <span className="font-semibold">référence unique</span> après confirmation.</li>
                          <li>- Envoyez la preuve de paiement au support (ou via l’admin panel plus tard).</li>
                          <li>- Statut: <span className="font-semibold">pending</span> jusqu’à activation par l’admin.</li>
                        </ul>
                        <div className="mt-3 flex items-start gap-2 text-xs text-amber-900/80">
                          <Info size={14} className="mt-0.5" />
                          <span>Ce flux ne débite rien automatiquement. Il enregistre seulement une demande de paiement.</span>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          onClick={() => setStep(2)}
                          className="px-4 py-2 rounded-xl border border-amber-200 text-sm font-semibold text-amber-900 hover:bg-white/60"
                        >
                          Changer de méthode
                        </button>
                        <button
                          onClick={() => void confirmManual()}
                          disabled={submitting}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                            submitting ? 'bg-amber-200 text-amber-900/60 cursor-not-allowed' : 'bg-amber-400 text-[#0F1F3D] hover:bg-amber-300'
                          }`}
                        >
                          {submitting ? 'Création…' : 'Confirmer la demande'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => router.push('/pricing')}
                      className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Back to pricing
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:sticky lg:top-6">
                <p className="text-sm font-semibold text-gray-900">Résumé</p>
                <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Plan</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">{plan.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{plan.id}</p>
                </div>

                <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Montant</p>
                  <p className="text-xl font-extrabold text-gray-900 mt-1">{priceLabel}</p>
                </div>

                <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Méthode</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {method === 'card' ? 'Card (Visa/Mastercard/Maestro)' : method === 'cmi' ? 'CMI Online' : method === 'manual' ? 'Manual (CashPlus/WafaCash/Western Union)' : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

