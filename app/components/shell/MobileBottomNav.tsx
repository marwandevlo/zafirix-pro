'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  Package,
  Truck,
  UserRound,
} from 'lucide-react';

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  match?: (pathname: string) => boolean;
};

const PRIMARY: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Accueil',
    href: '/',
    icon: LayoutDashboard,
    match: (p) => p === '/' || p === '',
  },
  {
    id: 'factures',
    label: 'Factures',
    href: '/factures',
    icon: FileText,
    match: (p) => p.startsWith('/factures'),
  },
  {
    id: 'logistique',
    label: 'Logistique',
    href: '/logistique',
    icon: Truck,
    match: (p) => p.startsWith('/logistique'),
  },
  {
    id: 'ae',
    label: 'AE',
    href: '/auto-entrepreneur',
    icon: Briefcase,
    match: (p) => p.startsWith('/auto-entrepreneur'),
  },
  {
    id: 'pp',
    label: 'PP',
    href: '/personne-physique',
    icon: UserRound,
    match: (p) => p.startsWith('/personne-physique'),
  },
];

/** Routes where the bottom bar should stay hidden (auth / marketing / portal). */
const HIDDEN_PREFIXES = [
  '/login',
  '/signup',
  '/landing',
  '/pricing',
  '/portal',
  '/client',
  '/auditor',
  '/auth',
  '/pending-approval',
  '/access-denied',
];

export function shouldShowMobileBottomNav(pathname: string): boolean {
  if (!pathname) return false;
  return !HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type Props = {
  onOpenMenu?: () => void;
};

/**
 * Fixed bottom navigation for phones — large touch targets + safe-area padding.
 */
export function MobileBottomNav({ onOpenMenu }: Props) {
  const pathname = usePathname() || '/';
  const router = useRouter();

  const visible = useMemo(() => shouldShowMobileBottomNav(pathname), [pathname]);
  if (!visible) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigation mobile"
    >
      <ul className="grid grid-cols-6 gap-0 px-1 pt-1">
        {PRIMARY.map((item) => {
          const active = item.match ? item.match(pathname) : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => router.push(item.href)}
                className={`w-full flex flex-col items-center justify-center gap-0.5 min-h-14 rounded-xl px-1 py-1.5 transition-colors ${
                  active ? 'text-[#0F1F3D]' : 'text-gray-400 active:bg-gray-50'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} className={active ? 'text-cyan-600' : undefined} />
                <span className={`text-[10px] font-medium leading-tight truncate max-w-full ${active ? 'text-[#0F1F3D]' : ''}`}>
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => (onOpenMenu ? onOpenMenu() : router.push('/inventaire'))}
            className="w-full flex flex-col items-center justify-center gap-0.5 min-h-14 rounded-xl px-1 py-1.5 text-gray-400 active:bg-gray-50"
            aria-label="Plus de modules"
          >
            {onOpenMenu ? <MoreHorizontal size={20} /> : <Package size={20} />}
            <span className="text-[10px] font-medium">Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
