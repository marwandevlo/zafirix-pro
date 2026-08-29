'use client';

import type React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  Gift,
  HeartPulse,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { atlasDataBackend, isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';
import { AdminTableSkeleton } from '@/app/admin/_components/AdminUi';
import { isLocalDevAdminEnabled } from '@/app/lib/atlas-sprint0-flags';

const LOCAL_ADMIN_ROLE_KEY = 'atlas_user_role';

const NAV = [
  { href: '/admin/overview', icon: TrendingUp, label: 'Overview' },
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { href: '/admin/users', icon: Users, label: 'Users' },
  { href: '/admin/activity', icon: Activity, label: 'Activity' },
  { href: '/admin/subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { href: '/admin/payments', icon: CreditCard, label: 'Payments' },
  { href: '/admin/manual-payments', icon: Banknote, label: 'Manual (MA)' },
  { href: '/admin/affiliate', icon: Gift, label: 'Affiliate' },
  { href: '/admin/companies', icon: Building2, label: 'Companies' },
  { href: '/admin/plans', icon: Boxes, label: 'Plans' },
  { href: '/admin/billing', icon: CreditCard, label: 'Billing' },
  { href: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/admin/logs', icon: ScrollText, label: 'Logs' },
  { href: '/admin/operations', icon: HeartPulse, label: 'Operations' },
  { href: '/admin/security', icon: ShieldCheck, label: 'Security' },
] as const;

function hasLocalAdminRole(): boolean {
  if (typeof window === 'undefined') return false;
  return (localStorage.getItem(LOCAL_ADMIN_ROLE_KEY) ?? '').trim() === 'admin';
}

function SidebarLink(props: { href: string; icon: React.ReactNode; label: string; exact?: boolean }) {
  const pathname = usePathname() || '';
  const active = props.exact ? pathname === props.href : pathname === props.href || pathname.startsWith(`${props.href}/`);
  return (
    <Link
      href={props.href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
        active ? 'bg-white/12 text-white' : 'text-white/55 hover:bg-white/8 hover:text-white'
      }`}
    >
      {props.icon}
      {props.label}
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
          if (!cancelled) setReady(true);
          return;
        }

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

  const desktopNav = (
    <nav className="space-y-0.5">
      {NAV.map((item) => (
        <SidebarLink
          key={item.href}
          href={item.href}
          exact={'exact' in item ? item.exact : false}
          icon={<item.icon size={15} className="shrink-0 text-[#06b6d4]" />}
          label={item.label}
        />
      ))}
    </nav>
  );

  const mobileNav = (
    <nav className="flex gap-1 overflow-x-auto atlas-table-scroll">
      {NAV.map((item) => (
        <div key={item.href} className="shrink-0">
          <SidebarLink
            href={item.href}
            exact={'exact' in item ? item.exact : false}
            icon={<item.icon size={15} className="shrink-0 text-[#06b6d4]" />}
            label={item.label}
          />
        </div>
      ))}
    </nav>
  );

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#f4f6fa]">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <AdminTableSkeleton cols={5} rows={6} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <header className="sticky top-0 z-20 border-b border-[#0F1F3D]/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Zafirixpro Admin</p>
            <h1 className="truncate text-base font-bold text-[#0F1F3D]">{props.title}</h1>
          </div>
          <div className="hidden items-center gap-3 text-[11px] text-slate-500 sm:flex">
            <span>
              Backend <strong className="text-slate-700">{atlasDataBackend()}</strong>
            </span>
            <Link href="/dashboard/affiliate" className="font-semibold text-cyan-700 hover:underline">
              Programme affilié →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <div className="lg:hidden">
          <div className="rounded-2xl bg-[#0F1F3D] p-2">{mobileNav}</div>
        </div>
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 rounded-2xl bg-[#0F1F3D] p-3 shadow-lg">
            <div className="mb-3 flex items-center gap-2 px-2 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#06b6d4] text-[#0F1F3D]">
                <ShieldCheck size={16} />
              </div>
              <div>
                <p className="text-[10px] text-white/40">ZAFIRIX GROUP</p>
                <p className="text-sm font-bold text-white">Control plane</p>
              </div>
            </div>
            {desktopNav}
          </div>
        </aside>
        <div className="min-w-0 flex-1 space-y-4">{props.children}</div>
      </main>
    </div>
  );
}
