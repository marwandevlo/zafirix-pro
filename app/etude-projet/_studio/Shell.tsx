'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { AppSidebar, AppSidebarMobileOverlay } from '@/app/components/shell/AppSidebar';
import { StudioLangProvider, useStudio } from './ui';

function Frame({ children }: { children: ReactNode }) {
  const { lang, setLang, dir } = useStudio();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex h-screen bg-gray-50" dir={dir} lang={lang}>
      <AppSidebar variant="module" lang={lang} setLang={setLang} t={(fr, ar) => (lang === 'ar' ? ar : fr)}
        menuOpen={menuOpen} setMenuOpen={setMenuOpen} onNavigate={() => setMenuOpen(false)} />
      <AppSidebarMobileOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="lg:hidden flex items-center gap-2 bg-[#1B2A4A] px-3 py-2">
          <button type="button" onClick={() => setMenuOpen(true)} className="min-h-11 min-w-11 inline-flex items-center justify-center text-white" aria-label={lang === 'ar' ? 'فتح القائمة' : 'Ouvrir le menu'}>
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-white">ZafirixPro</span>
        </div>
        {children}
      </main>
    </div>
  );
}

export function StudioShell({ children }: { children: ReactNode }) {
  return (
    <StudioLangProvider>
      <Frame>{children}</Frame>
    </StudioLangProvider>
  );
}
