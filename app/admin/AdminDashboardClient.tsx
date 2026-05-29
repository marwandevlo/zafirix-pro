'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Building2,
  Boxes,
  Activity,
  ArrowRight,
  Clock,
  BadgeCheck,
  Ban,
} from 'lucide-react';
import { atlasDataBackend, isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { ATLAS_PRICING_PLANS, formatLimit } from '@/app/lib/atlas-pricing-plans';
import { isLocalDevAdminEnabled } from '@/app/lib/atlas-sprint0-flags';

type DashboardStats = {
  paymentRequests: { pending: number; paid: number; rejected: number; total: number };
  subscriptions: { active: number; trial: number; cancelled: number; total: number };
  users?: { total: number; active: number; trial: number; paid: number };
  companies?: { total: number; byPlan?: Record<string, number> };
  recentPaymentRequests?: Array<{ id: string; status: string; planId: string; createdAt: string }>;
  system: { backend: 'local' | 'supabase'; localAdminMode: boolean };
  warnings?: string[];
};

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  paymentRequests: { pending: 0, paid: 0, rejected: 0, total: 0 },
  subscriptions: { active: 0, trial: 0, cancelled: 0, total: 0 },
  users: { total: 0, active: 0, trial: 0, paid: 0 },
  companies: { total: 0 },
  recentPaymentRequests: [],
  system: { backend: 'supabase', localAdminMode: false },
  warnings: [],
};

const LOCAL_ADMIN_ROLE_KEY = 'atlas_user_role';

function hasLocalAdminRole(): boolean {
  if (typeof window === 'undefined') return false;
  return (localStorage.getItem(LOCAL_ADMIN_ROLE_KEY) ?? '').trim() === 'admin';
}

function Card(props: { title: string; value: string | number; icon: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">{props.title}</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{props.value}</p>
          {props.hint ? <p className="text-xs text-gray-400 mt-1">{props.hint}</p> : null}
        </div>
        <div className="w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-700">
          {props.icon}
        </div>
      </div>
      {props.href ? (
        <div className="mt-4 flex items-center justify-end text-xs font-semibold text-gray-600">
          <span className="inline-flex items-center gap-2 hover:text-gray-900">
            Open <ArrowRight size={14} />
          </span>
        </div>
      ) : null}
    </div>
  );

  return props.href ? (
    <Link href={props.href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const plans = useMemo(() => ATLAS_PRICING_PLANS, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        if (isAtlasSupabaseDataEnabled()) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token ?? '';
          if (!token) {
            router.push('/login?next=/admin');
            return;
          }

          const res = await fetch('/api/admin/dashboard-stats', {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });

          const json = (await res.json().catch(() => ({}))) as DashboardStats & { error?: string };

          if (res.status === 401) {
            router.push('/login?next=/admin');
            return;
          }
          if (res.status === 403) {
            router.push('/access-denied');
            return;
          }
          if (!res.ok) {
            if (!cancelled) {
              setStats(EMPTY_DASHBOARD_STATS);
              setError(
                typeof json.error === 'string'
                  ? json.error
                  : 'Impossible de charger les statistiques admin. Réessayez plus tard.',
              );
            }
            return;
          }

          if (!cancelled) setStats(json as DashboardStats);
          return;
        }

        // LOCAL TESTING ONLY: gated by env + localStorage role.
        if (!isLocalDevAdminEnabled() || !hasLocalAdminRole()) {
          router.push('/access-denied');
          return;
        }

        const pendingCount = 0;
        const paidCount = 0;
        const rejectedCount = 0;
        const activeCount = 0;

        const localStats: DashboardStats = {
          paymentRequests: { pending: pendingCount, paid: paidCount, rejected: rejectedCount, total: 0 },
          subscriptions: { active: activeCount, trial: 0, cancelled: 0, total: 0 },
          users: { total: 0, active: 0, trial: 0, paid: 0 },
          companies: { total: 0, byPlan: {} },
          system: { backend: atlasDataBackend(), localAdminMode: true },
          warnings: ['Local admin mode is enabled (development only).'],
        };

        if (!cancelled) setStats(localStats);
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
  }, [router]);

  const nav = (
    <aside className="hidden lg:block w-64 shrink-0">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sticky top-6">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-9 h-9 rounded-2xl bg-[#0F1F3D] text-white flex items-center justify-center">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500">ZAFIRIX GROUP</p>
            <p className="text-sm font-extrabold text-gray-900">Admin</p>
          </div>
        </div>

        <nav className="mt-4 space-y-1">
          <Link href="/admin" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-gray-50 border border-gray-100 text-gray-900">
            <LayoutDashboard size={16} /> Dashboard
          </Link>
          <Link href="/admin/subscriptions" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <CreditCard size={16} /> Subscriptions
          </Link>
          <Link href="/admin/analytics" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <BarChart3 size={16} /> Analytics
          </Link>
          <Link href="/pricing" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <Boxes size={16} /> Plans
          </Link>
        </nav>
      </div>
    </aside>
  );

  const planList = (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Boxes size={16} /> Plans · الخطط
        </p>
        <Link href="/pricing" className="text-xs font-semibold text-gray-600 hover:text-gray-900">
          View pricing
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {plans.map((p) => (
          <div key={p.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-extrabold text-gray-900">{p.name}</p>
            <p className="text-xs text-gray-500 mt-1">{p.id}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-white border border-gray-100 p-2">
                <p className="text-[11px] text-gray-500">Users</p>
                <p className="font-semibold text-gray-900 mt-0.5">{formatLimit(p.usersLimit)}</p>
              </div>
              <div className="rounded-lg bg-white border border-gray-100 p-2">
                <p className="text-[11px] text-gray-500">Companies</p>
                <p className="font-semibold text-gray-900 mt-0.5">{formatLimit(p.companiesLimit)}</p>
              </div>
              <div className="rounded-lg bg-white border border-gray-100 p-2">
                <p className="text-[11px] text-gray-500">Ops</p>
                <p className="font-semibold text-gray-900 mt-0.5">{formatLimit(p.operationsLimit)}</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-3">Editing limits is planned for later.</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            ZAFIRIX PRO
          </Link>
          <span className="text-gray-200">/</span>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={18} /> Admin · Dashboard
          </h1>
        </div>
        <div className="lg:hidden">
          <Link
            href="/admin/subscriptions"
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Subscriptions
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 flex gap-6">
        {nav}

        <div className="flex-1 space-y-6">
          {loading ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">Chargement…</div>
          ) : null}
          {error ? <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{error}</div> : null}

          {stats?.warnings?.length ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              {stats.warnings.map((w, idx) => (
                <div key={idx}>{w}</div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card
              title="Subscriptions · الاشتراكات"
              value={stats ? stats.subscriptions.active : '—'}
              hint="Active subscriptions"
              icon={<BadgeCheck size={18} />}
              href="/admin/subscriptions"
            />
            <Card
              title="Pending payments · مدفوعات معلقة"
              value={stats ? stats.paymentRequests.pending : '—'}
              hint="Manual payment requests"
              icon={<Clock size={18} />}
              href="/admin/subscriptions"
            />
            <Card
              title="Rejected payments · مرفوض"
              value={stats ? stats.paymentRequests.rejected : '—'}
              hint="Rejected payment requests"
              icon={<Ban size={18} />}
              href="/admin/subscriptions"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <BarChart3 size={16} /> Overview · نظرة عامة
                </p>
                <Link href="/admin/subscriptions" className="text-xs font-semibold text-gray-600 hover:text-gray-900">
                  Manage subscriptions
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <Users size={14} /> Users · المستخدمون
                  </p>
                  <p className="text-xl font-extrabold text-gray-900 mt-2">{stats?.users?.total ?? '—'}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Paid: {stats?.users?.paid ?? '—'} · Trial: {stats?.users?.trial ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <Building2 size={14} /> Companies · الشركات
                  </p>
                  <p className="text-xl font-extrabold text-gray-900 mt-2">{stats?.companies?.total ?? '—'}</p>
                  <p className="text-xs text-gray-400 mt-1">By plan: {stats?.companies?.byPlan ? 'available' : '—'}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs text-gray-500 flex items-center gap-2">
                  <Activity size={14} /> System status · حالة النظام
                </p>
                <div className="mt-2 text-sm text-gray-700">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span>
                      Backend: <span className="font-semibold">{stats?.system.backend ?? atlasDataBackend()}</span>
                    </span>
                    <span>
                      Mode: <span className="font-semibold">{stats?.system.backend === 'supabase' ? 'Supabase' : 'Local'}</span>
                    </span>
                    <span>
                      Health: <span className="font-semibold text-emerald-700">OK</span>
                    </span>
                  </div>
                  {stats?.system.localAdminMode ? (
                    <p className="text-xs text-amber-700 mt-2">
                      Local admin fallback is enabled (development only).
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CreditCard size={16} /> Payments · المدفوعات
              </p>
              <p className="text-xs text-gray-500 mt-1">Recent payment requests</p>

              <div className="mt-4 space-y-2">
                {(stats?.recentPaymentRequests ?? []).slice(0, 6).map((r) => (
                  <div key={r.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-mono text-gray-700">{r.id}</p>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">{r.status}</span>
                      <span>{r.planId}</span>
                    </div>
                  </div>
                ))}
                {!stats?.recentPaymentRequests?.length ? (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    No data yet.
                  </div>
                ) : null}
              </div>

              <div className="mt-4">
                <Link
                  href="/admin/subscriptions"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Review pending payments <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>

          {planList}
        </div>
      </main>
    </div>
  );
}

