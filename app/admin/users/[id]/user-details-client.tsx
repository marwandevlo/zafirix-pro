'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/app/admin/_components/AdminShell';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { adminAuthedFetch, fetchAdminBearerToken } from '@/app/lib/admin/admin-client-auth';
import { isOwnerEmail, getOwnerEmail } from '@/app/lib/owner';
import { supabase } from '@/app/lib/supabase';
import { AdminAlert, AdminTableSkeleton } from '@/app/admin/_components/AdminUi';
import { atlasPlanIdToProfilePlan } from '@/app/lib/atlas-subscription-sync';
import { UserApprovalRow } from '@/app/admin/users/_components/UserApprovalRow';

const PROFILE_PLAN_OPTIONS = ['free', 'pro', 'vip', 'enterprise'] as const;
type ProfilePlanOption = (typeof PROFILE_PLAN_OPTIONS)[number];

function normalizePlanToken(raw: string | null | undefined): ProfilePlanOption {
  const s = String(raw ?? '').trim().toLowerCase();
  if ((PROFILE_PLAN_OPTIONS as readonly string[]).includes(s)) return s as ProfilePlanOption;
  return 'free';
}

const PROFILE_PLAN_RANK: Record<ProfilePlanOption, number> = {
  free: 0,
  pro: 1,
  vip: 2,
  enterprise: 3,
};

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Derive profiles.plan bucket from the best currently active atlas_subscriptions row. */
function resolvePlanFromSubscriptions(subscriptions: AtlasSubscriptionRow[]): ProfilePlanOption | null {
  const today = todayYmdLocal();
  let best: ProfilePlanOption | null = null;
  let bestRank = -1;

  for (const row of subscriptions) {
    const st = String(row.status ?? '').trim().toLowerCase();
    if (st !== 'active' && st !== 'trial') continue;

    const start = String(row.start_date ?? '').slice(0, 10);
    const end = String(row.end_date ?? '').slice(0, 10);
    if (!start || !end || today < start || today > end) continue;

    const bucket = normalizePlanToken(atlasPlanIdToProfilePlan(String(row.plan_id ?? '')));
    const rank = PROFILE_PLAN_RANK[bucket];
    if (rank > bestRank) {
      bestRank = rank;
      best = bucket;
    }
  }

  return best;
}

/** Canonical plan for the admin select: profile cache, upgraded by active entitlement when higher. */
function resolveCanonicalPlan(
  profilePlan: string | null | undefined,
  subscriptions: AtlasSubscriptionRow[],
): ProfilePlanOption {
  const fromProfile = normalizePlanToken(profilePlan);
  const fromSubs = resolvePlanFromSubscriptions(subscriptions);
  if (!fromSubs) return fromProfile;
  return PROFILE_PLAN_RANK[fromSubs] > PROFILE_PLAN_RANK[fromProfile] ? fromSubs : fromProfile;
}

type UserDetail = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  role: string;
  plan: string;
  status: string;
  created_at: string | null;
  last_login: string | null;
};

type AtlasSubscriptionRow = {
  id: unknown;
  plan_id: unknown;
  status: unknown;
  start_date: unknown;
  end_date: unknown;
  created_at: unknown;
};

type AdminLogRow = {
  id: unknown;
  created_at: unknown;
  action: unknown;
  details: unknown;
};

export default function UserDetailsAdminClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');

  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actorEmail, setActorEmail] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState<UserDetail | null>(null);
  const [subs, setSubs] = useState<AtlasSubscriptionRow[]>([]);
  const [logs, setLogs] = useState<AdminLogRow[]>([]);

  const [role, setRole] = useState('user');
  const [plan, setPlan] = useState('free');
  const [status, setStatus] = useState('active');
  const [fullName, setFullName] = useState('');

  // Refs mirror select/input state so save always reads the latest values,
  // even if React hasn't re-rendered between onChange and click.
  const roleRef = useRef(role);
  const planRef = useRef(plan);
  const statusRef = useRef(status);
  const fullNameRef = useRef(fullName);
  roleRef.current = role;
  planRef.current = plan;
  statusRef.current = status;
  fullNameRef.current = fullName;

  const actionBusyRef = useRef(false);

  const syncFormFromUser = (u: UserDetail | null, subscriptions: AtlasSubscriptionRow[] = subs) => {
    setRole(String(u?.role ?? 'user').trim().toLowerCase());
    setPlan(resolveCanonicalPlan(u?.plan, subscriptions));
    setStatus(String(u?.status ?? 'active').trim().toLowerCase());
    setFullName(String(u?.full_name ?? ''));
  };

  const applySavedSnapshot = (
    saved: Pick<UserDetail, 'role' | 'plan' | 'status' | 'full_name'>,
    subscriptions: AtlasSubscriptionRow[] = subs,
  ) => {
    const canonicalPlan = resolveCanonicalPlan(saved.plan, subscriptions);
    setUser((prev) => (prev ? { ...prev, ...saved, plan: canonicalPlan } : prev));
    setRole(saved.role);
    setPlan(canonicalPlan);
    setStatus(saved.status);
    setFullName(saved.full_name);
  };

  const reload = useCallback(async (opts?: { syncForm?: boolean }) => {
    const syncForm = opts?.syncForm !== false;
    if (!isAtlasSupabaseDataEnabled()) {
      setError('Mode Supabase requis pour charger cet utilisateur.');
      return null;
    }
    setInitialLoading(true);
    setError('');
    try {
      await fetchAdminBearerToken();
      const res = await adminAuthedFetch(`/api/admin/users/${id}?t=${Date.now()}`);
      const json: unknown = await res.json().catch(() => ({}));
      const msg =
        typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
          ? String((json as { error?: unknown }).error)
          : 'error';
      if (!res.ok) throw new Error(msg);

      const u =
        typeof json === 'object' && json && 'user' in json && (json as { user?: unknown }).user
          ? ((json as { user: unknown }).user as UserDetail)
          : null;

      const subscriptions =
        typeof json === 'object' && json && 'subscriptions' in json && Array.isArray((json as { subscriptions?: unknown }).subscriptions)
          ? ((json as { subscriptions: unknown[] }).subscriptions as AtlasSubscriptionRow[])
          : [];
      setSubs(subscriptions);

      const adminLogs =
        typeof json === 'object' && json && 'adminLogs' in json && Array.isArray((json as { adminLogs?: unknown }).adminLogs)
          ? ((json as { adminLogs: unknown[] }).adminLogs as AdminLogRow[])
          : [];
      setLogs(adminLogs);

      if (syncForm && u) {
        const canonicalPlan = resolveCanonicalPlan(u.plan, subscriptions);
        const mergedUser = { ...u, plan: canonicalPlan };
        setUser(mergedUser);
        syncFormFromUser(mergedUser, subscriptions);
      }

      return { user: u, subscriptions, adminLogs };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur';
      if (message.includes('Session expirée')) {
        router.push(`/login?next=${encodeURIComponent(`/admin/users/${id}`)}`);
      }
      setError(message);
      return null;
    } finally {
      setInitialLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setActorEmail(String(data.user?.email ?? '').trim());
    });
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const protectedOwner = useMemo(() => {
    if (!isOwnerEmail(user?.email ?? null)) return false;
    return !isOwnerEmail(actorEmail);
  }, [user?.email, actorEmail]);

  const save = useCallback(async () => {
    if (actionBusyRef.current || protectedOwner) return;
    actionBusyRef.current = true;
    setSaving(true);
    setSaveSuccess(false);
    setError('');
    try {
      const payload = {
        role: roleRef.current,
        plan: planRef.current,
        status: statusRef.current,
        full_name: fullNameRef.current,
      };

      const res = await adminAuthedFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const json: unknown = await res.json().catch(() => ({}));
      const body = (typeof json === 'object' && json ? json : {}) as {
        error?: unknown;
        message?: unknown;
        user?: unknown;
      };
      const msg =
        typeof body.message === 'string' && body.message
          ? body.message
          : typeof body.error === 'string'
            ? body.error
            : 'error';
      if (!res.ok) throw new Error(msg);

      const savedUser =
        body.user && typeof body.user === 'object' ? (body.user as UserDetail) : null;

      const refreshed = await reload({ syncForm: false });
      const latestSubs = refreshed?.subscriptions ?? subs;

      if (savedUser) {
        const canonicalPlan = resolveCanonicalPlan(savedUser.plan ?? payload.plan, latestSubs);
        const mergedUser = { ...savedUser, plan: canonicalPlan };
        setUser(mergedUser);
        syncFormFromUser(mergedUser, latestSubs);
      } else {
        applySavedSnapshot(payload, latestSubs);
      }

      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      actionBusyRef.current = false;
      setSaving(false);
    }
  }, [id, protectedOwner, reload, router, subs]);

  const del = useCallback(async () => {
    if (actionBusyRef.current || protectedOwner) return;
    const ok = window.confirm('Supprimer cet utilisateur ? Cette action est irréversible.');
    if (!ok) return;
    actionBusyRef.current = true;
    setDeleting(true);
    setError('');
    try {
      const res = await adminAuthedFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const json: unknown = await res.json().catch(() => ({}));
      const msg =
        typeof json === 'object' && json && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
          ? String((json as { error?: unknown }).error)
          : 'error';
      if (!res.ok) throw new Error(msg);
      router.push('/admin/users');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      actionBusyRef.current = false;
      setDeleting(false);
    }
  }, [id, protectedOwner, router]);

  const displayPlan = useMemo(() => normalizePlanToken(plan), [plan]);
  const actionBusy = saving || deleting || approving;
  const isPendingAccount = String(user?.status ?? status).trim().toLowerCase() === 'pending';

  const createdLabel = useMemo(() => {
    if (!user?.created_at) return '—';
    const d = new Date(user.created_at);
    return Number.isNaN(d.getTime()) ? user.created_at : d.toLocaleString();
  }, [user?.created_at]);

  return (
    <AdminShell title="Admin · User details">
      {initialLoading ? <AdminAlert variant="info">Chargement…</AdminAlert> : null}
      {saveSuccess ? <AdminAlert variant="info">Modifications enregistrées.</AdminAlert> : null}
      {error ? <AdminAlert variant="error">{error}</AdminAlert> : null}

      {!user ? (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <AdminTableSkeleton cols={2} rows={6} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500">User</p>
                  <p className="text-lg font-extrabold text-gray-900 mt-1">{user.email || '—'}</p>
                  <p className="text-xs text-gray-500 mt-1 font-mono">{user.id}</p>
                  {protectedOwner ? (
                    <p className="text-xs text-gray-500 mt-2">
                      Owner protected — only <span className="font-semibold">{getOwnerEmail()}</span> may edit this account.
                    </p>
                  ) : isOwnerEmail(user?.email) && isOwnerEmail(actorEmail) ? (
                    <p className="text-xs text-emerald-700 mt-2">
                      Platform owner session — full enterprise backend control enabled.
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {isPendingAccount ? (
                    <UserApprovalRow
                      user={{ id: user.id, email: user.email, full_name: user.full_name, status: user.status }}
                      showStatus={false}
                      busy={actionBusy}
                      onBusyChange={(busy) => {
                        actionBusyRef.current = busy;
                        setApproving(busy);
                      }}
                      onApproved={(approved) => {
                        setStatus(approved.status);
                        setUser((prev) => (prev ? { ...prev, status: approved.status, email: approved.email || prev.email } : prev));
                        setSaveSuccess(true);
                        window.setTimeout(() => setSaveSuccess(false), 3000);
                        router.refresh();
                      }}
                      onError={(message) => setError(message)}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => router.push('/admin/users')}
                    disabled={actionBusy}
                    className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void del()}
                    disabled={protectedOwner || actionBusy}
                    className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs font-semibold hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>

              <form
                className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <div>
                  <p className="text-xs text-gray-500">Full name</p>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <div className="mt-1 px-3 py-2 rounded-xl border border-gray-100 bg-gray-50 text-gray-800">{createdLabel}</div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Role</p>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={protectedOwner}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-60"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                    <option value="moderator">moderator</option>
                    <option value="owner">owner</option>
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Plan</p>
                  <select
                    key={`plan-${displayPlan}`}
                    value={displayPlan}
                    onChange={(e) => setPlan(normalizePlanToken(e.target.value))}
                    disabled={protectedOwner}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-60"
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                    <option value="vip">vip</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={protectedOwner}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-60"
                  >
                    <option value="pending">pending (en attente)</option>
                    <option value="active">active (validé)</option>
                    <option value="suspended">suspended</option>
                    <option value="banned">banned</option>
                  </select>
                  {status === 'pending' ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      Cliquez sur <strong>Approve</strong> pour valider le compte et envoyer l’e-mail.
                    </p>
                  ) : null}
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={protectedOwner || actionBusy}
                    className="w-full px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving…' : saveSuccess ? 'Saved' : 'Save changes'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 min-w-0 w-full max-w-full overflow-x-visible">
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Subscriptions</p>
                <p className="text-xs text-gray-500 mt-0.5">Latest 25 from `atlas_subscriptions`.</p>
              </div>
              <div className="atlas-table-scroll">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr className="text-left">
                      <th className="px-6 py-4 font-semibold">Plan</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Start</th>
                      <th className="px-6 py-4 font-semibold">End</th>
                      <th className="px-6 py-4 font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                          No subscriptions.
                        </td>
                      </tr>
                    ) : (
                      subs.map((s) => (
                        <tr key={String(s.id)} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-6 py-4 text-gray-900 font-semibold">{String(s.plan_id ?? '—')}</td>
                          <td className="px-6 py-4 text-gray-700">{String(s.status ?? '—')}</td>
                          <td className="px-6 py-4 text-gray-700">{String(s.start_date ?? '—')}</td>
                          <td className="px-6 py-4 text-gray-700">{String(s.end_date ?? '—')}</td>
                          <td className="px-6 py-4 text-gray-700">{s.created_at ? new Date(String(s.created_at)).toLocaleString() : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Admin logs</p>
                <p className="text-xs text-gray-500 mt-0.5">Actions targeting this user.</p>
              </div>
              <div className="px-6 py-4 space-y-3">
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-500">No admin actions yet.</p>
                ) : (
                  logs.map((l) => (
                    <div key={String(l.id)} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">{l.created_at ? new Date(String(l.created_at)).toLocaleString() : ''}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-1">{String(l.action ?? '')}</p>
                      <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap wrap-break-word">{JSON.stringify(l.details ?? {}, null, 2)}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

