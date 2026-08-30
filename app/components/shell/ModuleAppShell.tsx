'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { AppSidebar, AppSidebarMobileOverlay } from '@/app/components/shell/AppSidebar';
import { MobileBottomNav } from '@/app/components/shell/MobileBottomNav';
import { CompanySwitcher } from '@/app/components/shell/CompanySwitcher';

type Props = {
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
};

/**
 * Mobile-first shell for module pages: drawer sidebar, sticky header, bottom nav.
 */
export function ModuleAppShell({ title, subtitle, headerActions, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-gray-50 overflow-hidden">
      <AppSidebarMobileOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
      <AppSidebar
        variant="module"
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onNavigate={() => setMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header
          className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 px-3 py-2.5 flex items-center gap-2"
          style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
        >
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200"
            aria-label="Ouvrir le menu"
          >
            <Menu size={22} className="text-gray-700" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-gray-900 truncate">{title}</h1>
            {subtitle ? <p className="text-[11px] text-gray-500 truncate">{subtitle}</p> : null}
          </div>
          <div className="shrink-0 max-w-[40%]">
            <CompanySwitcher className="w-full" />
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 lg:px-6 py-4 lg:py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className="hidden lg:flex items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{title}</h1>
              {subtitle ? <p className="text-sm text-gray-500 mt-1">{subtitle}</p> : null}
            </div>
            {headerActions ? <div className="flex flex-wrap items-center gap-2">{headerActions}</div> : null}
          </div>
          {headerActions ? (
            <div className="lg:hidden flex flex-wrap items-center gap-2 mb-4">{headerActions}</div>
          ) : null}
          <div className="max-w-6xl mx-auto w-full">{children}</div>
        </main>
      </div>

      <MobileBottomNav onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}
