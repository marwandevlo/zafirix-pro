'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { adminAuthedFetch } from '@/app/lib/admin/admin-client-auth';
import type { AdminEntitlementSnapshot } from '@/app/lib/admin/admin-entitlement-types';

type Props = {
  userId: string;
  email: string;
  onClose: () => void;
  onSaved: (snapshot: AdminEntitlementSnapshot) => void;
};

const PROFILE_PLANS = [
  { value: 'free', label: 'Free (permanent possible)' },
  { value: 'pro', label: 'Pro' },
  { value: 'vip', label: 'VIP / Cabinet' },
  { value: 'enterprise', label: 'Enterprise (unlimited)' },
] as const;

const WORKSPACE_PLANS = [
  { value: '', label: 'From profile plan' },
  { value: 'FREE', label: 'FREE' },
  { value: 'STARTER', label: 'STARTER' },
  { value: 'PRO', label: 'PRO' },
  { value: 'CABINET', label: 'CABINET' },
  { value: 'ENTERPRISE', label: 'ENTERPRISE' },
] as const;

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function quotaLabel(used: number, limit: number | null, unlimited: boolean): string {
  if (unlimited || limit === null) return `${used} / ∞`;
  return `${used} / ${limit}`;
}

export function UserPlanOverrideModal({ userId, email, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<AdminEntitlementSnapshot | null>(null);

  const [plan, setPlan] = useState('free');
  const [workspacePlanCode, setWorkspacePlanCode] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<'trial' | 'active' | 'expired' | 'cancelled'>('active');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [resetQuotas, setResetQuotas] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await adminAuthedFetch(`/api/admin/users/${userId}/entitlements`);
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          entitlement?: AdminEntitlementSnapshot;
        };
        if (!res.ok) throw new Error(json.error || 'load_failed');
        if (cancelled) return;
        const ent = json.entitlement ?? null;
        setSnapshot(ent);
        if (ent) {
          setPlan(String(ent.profilePlan || 'free').toLowerCase());
          setWorkspacePlanCode(ent.workspace.planCode ?? '');
          const st = String(ent.workspace.status ?? 'active').toLowerCase();
          if (st === 'trial' || st === 'active' || st === 'expired' || st === 'cancelled') {
            setSubscriptionStatus(st);
          }
          setTrialEndsAt(toDatetimeLocal(ent.workspace.trialEndsAt));
          setPermanent(st === 'active' || ent.adminOverride);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const applyPreset = (kind: 'free_permanent' | 'trial_14' | 'trial_30' | 'pro' | 'enterprise') => {
    setResetQuotas(false);
    if (kind === 'free_permanent') {
      setPlan('free');
      setWorkspacePlanCode('FREE');
      setSubscriptionStatus('active');
      setPermanent(true);
      setTrialEndsAt('');
      setNote('Complimentary free plan (admin)');
      return;
    }
    if (kind === 'trial_14' || kind === 'trial_30') {
      const days = kind === 'trial_14' ? 14 : 30;
      const end = new Date();
      end.setDate(end.getDate() + days);
      setPlan('free');
      setWorkspacePlanCode('FREE');
      setSubscriptionStatus('trial');
      setPermanent(false);
      setTrialEndsAt(toDatetimeLocal(end.toISOString()));
      setNote(`Trial extended ${days} days (admin)`);
      return;
    }
    if (kind === 'pro') {
      setPlan('pro');
      setWorkspacePlanCode('PRO');
      setSubscriptionStatus('active');
      setPermanent(true);
      setTrialEndsAt('');
      setNote('Pro access granted (admin)');
      return;
    }
    setPlan('enterprise');
    setWorkspacePlanCode('ENTERPRISE');
    setSubscriptionStatus('active');
    setPermanent(true);
    setTrialEndsAt('');
    setNote('Enterprise / unlimited (admin)');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        plan,
        permanent,
        resetQuotas,
        note: note.trim() || undefined,
      };
      if (workspacePlanCode) payload.workspacePlanCode = workspacePlanCode;
      if (!permanent) {
        payload.subscriptionStatus = subscriptionStatus;
        if (trialEndsAt) payload.trialEndsAt = new Date(trialEndsAt).toISOString();
      } else {
        payload.subscriptionStatus = 'active';
      }

      const res = await adminAuthedFetch(`/api/admin/users/${userId}/entitlements`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        entitlement?: AdminEntitlementSnapshot;
      };
      if (!res.ok) throw new Error(json.message || json.error || 'save_failed');
      if (!json.entitlement) throw new Error('save_failed');
      onSaved(json.entitlement);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">Manage plan & quotas</p>
            <p className="text-xs text-gray-500 mt-0.5">{email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {error ? <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p> : null}
          {loading ? (
            <p className="text-sm text-gray-500">Chargement de l’abonnement…</p>
          ) : (
            <>
              {snapshot ? (
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-slate-500">Subscription</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {snapshot.workspace.planCode ?? '—'} · {snapshot.workspace.status ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-slate-500">Trial</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{snapshot.trialLabelFr}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-slate-500">Documents</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {quotaLabel(snapshot.documents.used, snapshot.documents.limit, snapshot.documents.unlimited)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-slate-500">OCR</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {quotaLabel(snapshot.ocr.used, snapshot.ocr.limit, snapshot.ocr.unlimited)}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="h-8 rounded-lg bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200" onClick={() => applyPreset('free_permanent')}>
                  Free permanent
                </button>
                <button type="button" className="h-8 rounded-lg bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200" onClick={() => applyPreset('trial_14')}>
                  +14j trial
                </button>
                <button type="button" className="h-8 rounded-lg bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200" onClick={() => applyPreset('trial_30')}>
                  +30j trial
                </button>
                <button type="button" className="h-8 rounded-lg bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-800 ring-1 ring-blue-200" onClick={() => applyPreset('pro')}>
                  Grant Pro
                </button>
                <button type="button" className="h-8 rounded-lg bg-slate-800 px-2.5 text-[11px] font-semibold text-white" onClick={() => applyPreset('enterprise')}>
                  Enterprise
                </button>
              </div>

              <label className="block text-xs text-gray-500">
                Profile plan
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-900"
                >
                  {PROFILE_PLANS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-gray-500">
                Workspace catalog plan
                <select
                  value={workspacePlanCode}
                  onChange={(e) => setWorkspacePlanCode(e.target.value)}
                  className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-900"
                >
                  {WORKSPACE_PLANS.map((p) => (
                    <option key={p.value || 'auto'} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={permanent}
                  onChange={(e) => {
                    setPermanent(e.target.checked);
                    if (e.target.checked) setSubscriptionStatus('active');
                  }}
                />
                Permanent access (no trial expiry)
              </label>

              {!permanent ? (
                <>
                  <label className="block text-xs text-gray-500">
                    Subscription status
                    <select
                      value={subscriptionStatus}
                      onChange={(e) => setSubscriptionStatus(e.target.value as typeof subscriptionStatus)}
                      className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-900"
                    >
                      <option value="trial">trial</option>
                      <option value="active">active</option>
                      <option value="expired">expired</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </label>
                  <label className="block text-xs text-gray-500">
                    Trial / expiration date
                    <input
                      type="datetime-local"
                      value={trialEndsAt}
                      onChange={(e) => setTrialEndsAt(e.target.value)}
                      className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-900"
                    />
                  </label>
                </>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={resetQuotas} onChange={(e) => setResetQuotas(e.target.checked)} />
                Reset document / OCR / AI quotas this month
              </label>

              <label className="block text-xs text-gray-500">
                Internal note
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Friend, client, complimentary…"
                  className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-900"
                />
              </label>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-xl px-3 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="h-9 rounded-xl bg-[#0F1F3D] px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Apply override'}
          </button>
        </div>
      </div>
    </div>
  );
}
