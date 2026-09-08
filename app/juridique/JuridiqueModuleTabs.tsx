'use client';

import type { LucideIcon } from 'lucide-react';
import { Building2, Gavel, History, Landmark, Lock, MessageSquare, RefreshCw, Scale } from 'lucide-react';
import type { JuridiqueUiLocale } from '@/app/types/atlas-juridique-categories';
import { juridiqueLabel } from '@/app/types/atlas-juridique-categories';

export type JuridiqueTabId = 'creation' | 'modifications' | 'formalites' | 'documents' | 'assistant' | 'pv' | 'vault' | 'historique';

const TABS: { id: JuridiqueTabId; labelFr: string; labelAr: string; icon: LucideIcon }[] = [
  { id: 'creation', labelFr: 'Création', labelAr: 'التأسيس', icon: Building2 },
  { id: 'modifications', labelFr: 'Modifications', labelAr: 'التعديلات', icon: RefreshCw },
  { id: 'formalites', labelFr: 'Formalités juridiques', labelAr: 'الإجراءات القانونية', icon: Landmark },
  { id: 'documents', labelFr: 'Documents juridiques', labelAr: 'الوثائق القانونية', icon: Scale },
  { id: 'assistant', labelFr: 'Assistant IA', labelAr: 'المساعد الذكي', icon: MessageSquare },
  { id: 'pv', labelFr: 'PV Tribunal', labelAr: 'محاضر الجمعيات', icon: Gavel },
  { id: 'vault', labelFr: 'Coffre-fort', labelAr: 'الخزنة', icon: Lock },
  { id: 'historique', labelFr: 'Historique', labelAr: 'السجل', icon: History },
];

type Props = {
  activeTab: JuridiqueTabId;
  onChange: (tab: JuridiqueTabId) => void;
  variant?: 'main' | 'sidebar';
  lang?: JuridiqueUiLocale;
};

export function JuridiqueModuleTabs({ activeTab, onChange, variant = 'main', lang = 'fr' }: Props) {
  const t = (fr: string, ar: string) => juridiqueLabel(lang, fr, ar);

  if (variant === 'sidebar') {
    return (
      <div className="mt-4 space-y-1" data-testid="juridique-module-tabs-sidebar">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                active ? 'bg-amber-500/20 text-amber-400' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Icon size={14} /> {t(tab.labelFr, tab.labelAr)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <nav
      className="px-4 sm:px-6 pb-3 flex flex-wrap gap-2 border-b border-gray-100 bg-white shrink-0"
      aria-label="Sections du module Juridique"
      data-testid="juridique-module-tabs-main"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
              active
                ? 'bg-[#1B2A4A] text-white border-[#1B2A4A] shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300 hover:bg-amber-50/50'
            }`}
          >
            <Icon size={15} className={active ? 'text-amber-300' : 'text-gray-400'} />
            <span className="whitespace-nowrap">{t(tab.labelFr, tab.labelAr)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export { TABS as JURIDIQUE_MODULE_TABS };
