'use client';

import type React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, CreditCard, LayoutDashboard, ShieldCheck, Users, Boxes, BarChart3, Banknote, TrendingUp, ScrollText, HeartPulse, Activity } from 'lucide-react';
import { atlasDataBackend, isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { AdminTableSkeleton } from '@/app/admin/_components/AdminUi';
import { isLocalDevAdminEnabled } from '@/app/lib/atlas-sprint0-flags';

const LOCAL_ADMIN_ROLE_KEY = 'atlas_user_role';

function hasLocalAdminRole(): boolean {
  if (typeof window === 'undefined') return false;
  return (localStorage.getItem(LOCAL_ADMIN_ROLE_KEY) ?? '').trim() === 'admin';
}

function SidebarLink(props: { href: string; icon: React.ReactNode; label: string }) {
  const pathname = usePathname();
  const active = pathname === props.href;
  return (
    <Link
      href={props.href}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
        active ? 'bg-gray-50 border border-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {props.icon} {props.label}
    </Link>
  );
}

export default function AdminShell(props: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const guard = async () => {
      try {
        if (isAtlasSupabaseDataEnabled()) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token ?? '';
          if (!token) {
            router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
            return;
          }
          // Role enforcement happens server-side (middleware + admin APIs).
          if (!cancelled) setReady(true);
          return;
        }

        // LOCAL TESTING ONLY: gated by env + localStorage role.
        if (!isLocalDevAdminEnabled() || !hasLocalAdminRole()) {
          router.push('/access-denied');
          return;
        }

        if (!cancelled) setReady(true);
      } catch {
        router.push('/access-denied');
      }
    };

    void guard();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 sm:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gray-100 border border-gray-200 animate-pulse" />
            <div>
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-48 bg-gray-200 rounded mt-2 animate-pulse" />
            </div>
          </div>
          <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
        </header>
        <main className="max-w-6xl mx-auto px-6 py-10 flex gap-6">
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sticky top-6">
              <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          </aside>
          <div className="flex-1">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-72 bg-gray-200 rounded mt-2 animate-pulse" />
              </div>
              <div className="px-6 py-6">
                <AdminTableSkeleton cols={5} rows={6} />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 sm:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
            Dashboard
          </Link>
          <span className="text-gray-200">/</span>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={18} /> {props.title}
          </h1>
        </div>
        <div className="hidden sm:block text-xs text-gray-500">
          Backend: <span className="font-semibold text-gray-700">{atlasDataBackend()}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col lg:flex-row gap-6 min-w-0">
        <div className="lg:hidden">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap gap-2">
            <SidebarLink href="/admin/overview" icon={<TrendingUp size={16} />} label="Overview" />
            <SidebarLink href="/admin" icon={<LayoutDashboard size={16} />} label="Dashboard" />
            <SidebarLink href="/admin/billing" icon={<CreditCard size={16} />} label="Billing" />
            <SidebarLink href="/admin/subscriptions" icon={<CreditCard size={16} />} label="Subscriptions" />
            <SidebarLink href="/admin/users" icon={<Users size={16} />} label="Users" />
            <SidebarLink href="/admin/activity" icon={<Activity size={16} />} label="Activity" />
            <SidebarLink href="/admin/companies" icon={<Building2 size={16} />} label="Companies" />
            <SidebarLink href="/admin/plans" icon={<Boxes size={16} />} label="Plans" />
            <SidebarLink href="/admin/payments" icon={<CreditCard size={16} />} label="Payments" />
            <SidebarLink href="/admin/manual-payments" icon={<Banknote size={16} />} label="Manuel (MA)" />
            <SidebarLink href="/admin/analytics" icon={<BarChart3 size={16} />} label="Analytics" />
            <SidebarLink href="/admin/logs" icon={<ScrollText size={16} />} label="Logs" />
            <SidebarLink href="/admin/security" icon={<ShieldCheck size={16} />} label="Security" />
            <SidebarLink href="/admin/operations" icon={<HeartPulse size={16} />} label="Operations" />
          </div>
        </div>
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
              <SidebarLink href="/admin/overview" icon={<TrendingUp size={16} />} label="Overview" />
            <SidebarLink href="/admin" icon={<LayoutDashboard size={16} />} label="Dashboard" />
              <SidebarLink href="/admin/billing" icon={<CreditCard size={16} />} label="Billing" />
              <SidebarLink href="/admin/subscriptions" icon={<CreditCard size={16} />} label="Subscriptions" />
              <SidebarLink href="/admin/users" icon={<Users size={16} />} label="Users" />
            <SidebarLink href="/admin/activity" icon={<Activity size={16} />} label="Activity" />
              <SidebarLink href="/admin/companies" icon={<Building2 size={16} />} label="Companies" />
              <SidebarLink href="/admin/plans" icon={<Boxes size={16} />} label="Plans" />
              <SidebarLink href="/admin/payments" icon={<CreditCard size={16} />} label="Payments" />
              <SidebarLink href="/admin/manual-payments" icon={<Banknote size={16} />} label="Manuel (MA)" />
              <SidebarLink href="/admin/analytics" icon={<BarChart3 size={16} />} label="Analytics" />
              <SidebarLink href="/admin/logs" icon={<ScrollText size={16} />} label="Logs" />
              <SidebarLink href="/admin/security" icon={<ShieldCheck size={16} />} label="Security" />
              <SidebarLink href="/admin/operations" icon={<HeartPulse size={16} />} label="Operations" />
            </nav>
          </div>
        </aside>

        <div className="flex-1 min-w-0">{props.children}</div>
      </main>
    </div>
  );
}

