'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Gauge, PackagePlus, Sparkles, Truck, FileText, Bot } from 'lucide-react';
import type {
  ZafirixAddonPack,
  ZafirixMeterSnapshot,
  ZafirixPlanCode,
  ZafirixUsageSummary,
} from '@/app/types/zafirix-usage';
import { ZAFIRIX_PLAN_LABELS_FR, ZAFIRIX_PLAN_UPGRADE } from '@/app/types/zafirix-usage';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { formatMadAmountLabel } from '@/app/lib/atlas-format';

const METER_ICONS: Record<string, typeof FileText> = {
  invoices: FileText,
  shipments: Truck,
  ai_requests: Bot,
};

function barColor(pct: number | null, exceeded: boolean): string {
  if (exceeded) return 'bg-rose-500';
  if (pct === null) return 'bg-cyan-500';
  if (pct >= 0.9) return 'bg-rose-500';
  if (pct >= 0.75) return 'bg-amber-500';
  return 'bg-cyan-500';
}

export function UsagePlanWidget() {
  const [summary, setSummary] = useState<ZafirixUsageSummary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const cid = (await getActiveCompanyDbRowId())?.trim() || null;
      setCompanyId(cid);
      if (!cid) {
        setSummary(null);
        return;
      }
      const res = await fetch(`/api/usage?companyId=${encodeURIComponent(cid)}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (json.unavailable) {
        setUnavailable(true);
        setSummary(null);
        return;
      }
      if (json.ok && json.subscription) {
        setUnavailable(false);
        setSummary(json as ZafirixUsageSummary);
      }
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const highlightMeters = useMemo(() => {
    if (!summary) return [] as ZafirixMeterSnapshot[];
    return (summary.meters ?? []).filter((m) =>
      ['invoices', 'shipments', 'ai_requests'].includes(m.meterCode),
    );
  }, [summary]);

  const nearOrOver = useMemo(
    () => highlightMeters.filter((m) => m.nearLimit || m.exceeded),
    [highlightMeters],
  );

  const buyAddon = async (pack: ZafirixAddonPack) => {
    if (!companyId) return;
    setBusy(pack.code);
    setToast(null);
    try {
      const res = await fetch('/api/usage', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addon',
          companyId,
          packCode: pack.code,
          activateNow: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setToast(json.message ?? 'Achat impossible pour le moment.');
        return;
      }
      setToast(json.message ?? 'Pack enregistré.');
      if (json.summary) setSummary(json.summary as ZafirixUsageSummary);
      else await reload();
    } finally {
      setBusy(null);
    }
  };

  const upgrade = async () => {
    if (!companyId || !summary) return;
    const next = summary.subscription?.planCode
      ? ZAFIRIX_PLAN_UPGRADE[summary.subscription.planCode]
      : undefined;
    if (!next) return;
    setBusy('upgrade');
    try {
      const res = await fetch('/api/usage', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plan', companyId, planCode: next }),
      });
      const json = await res.json();
      if (json.ok && json.summary) {
        setSummary(json.summary as ZafirixUsageSummary);
        setToast(`Forfait passé à ${ZAFIRIX_PLAN_LABELS_FR[next as ZafirixPlanCode]}.`);
      } else {
        setToast(json.message ?? 'Changement de forfait impossible.');
      }
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-5 h-44 animate-pulse" />;
  }

  if (unavailable) {
    return (
      <section className="rounded-xl border border-dashed border-gray-200 bg-white p-5 text-sm text-gray-500">
        Compteurs d’utilisation bientôt disponibles.
      </section>
    );
  }

  if (!companyId || !summary) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
        Sélectionnez une société pour suivre votre consommation.
      </section>
    );
  }

  const plan = summary.subscription;
  if (!plan) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
        Forfait indisponible pour cette société.
      </section>
    );
  }
  const upgradeTo = plan.planCode ? ZAFIRIX_PLAN_UPGRADE[plan.planCode] : undefined;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0F1F3D]/5 text-[#0F1F3D] flex items-center justify-center shrink-0">
            <Gauge size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-sm sm:text-base">Utilisation &amp; Forfait</h2>
            <p className="text-[11px] text-gray-500 truncate">
              {plan.planLabel} · {plan.status}
              {summary.periodYm ? ` · ${summary.periodYm}` : ''}
            </p>
          </div>
        </div>
        <Link href="/billing" className="text-xs text-cyan-700 hover:underline shrink-0">
          Facturation →
        </Link>
      </div>

      <div className="space-y-3">
        {highlightMeters.map((m) => {
          const Icon = METER_ICONS[m.meterCode] ?? PackagePlus;
          const limitLabel = m.unlimited ? '∞' : String(m.effectiveLimit ?? '—');
          return (
            <div key={m.meterCode} className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={15} className="text-gray-500 shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate">{m.label}</span>
                </div>
                <span className="text-xs font-semibold text-gray-600 tabular-nums">
                  {m.used} / {limitLabel}
                  {m.addonBonus > 0 ? (
                    <span className="text-cyan-700 font-medium"> (+{m.addonBonus})</span>
                  ) : null}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] ${barColor(m.pct, m.exceeded)}`}
                  style={{ width: m.unlimited ? '8%' : `${Math.round((m.pct ?? 0) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {nearOrOver.length > 0 ? (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 space-y-2">
          <p className="text-xs text-amber-900 flex items-center gap-1.5 font-medium">
            <AlertTriangle size={13} />
            Limite proche ou atteinte — ajoutez un pack ou changez de forfait.
          </p>
          <div className="flex flex-wrap gap-2">
            {(summary.addons ?? [])
              .filter((a) => nearOrOver.some((m) => m.meterCode === a.meterCode))
              .slice(0, 3)
              .map((pack) => (
                <button
                  key={pack.code}
                  type="button"
                  disabled={busy === pack.code}
                  onClick={() => void buyAddon(pack)}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl bg-white border border-amber-200 px-3 text-xs font-semibold text-[#0F1F3D] hover:bg-amber-50 disabled:opacity-60"
                >
                  <PackagePlus size={13} />
                  {pack.nameFr} · {formatMadAmountLabel(pack.priceMad)}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-2">
        {upgradeTo ? (
          <button
            type="button"
            disabled={busy === 'upgrade'}
            onClick={() => void upgrade()}
            className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F1F3D] text-white text-sm font-semibold hover:bg-[#1B2A4A] disabled:opacity-60"
          >
            <Sparkles size={14} />
            Passer à {ZAFIRIX_PLAN_LABELS_FR[upgradeTo]}
          </button>
        ) : null}
        <Link
          href="/pricing"
          className="flex-1 min-h-11 inline-flex items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Voir les offres
        </Link>
      </div>

      {toast ? <p className="text-xs text-cyan-800 bg-cyan-50 rounded-lg px-3 py-2">{toast}</p> : null}
    </section>
  );
}
