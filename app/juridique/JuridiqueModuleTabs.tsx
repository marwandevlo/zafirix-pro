'use client';

import type { LucideIcon } from 'lucide-react';
import { Building2, Gavel, History, Landmark, RefreshCw, Scale } from 'lucide-react';

export type JuridiqueTabId = 'creation' | 'modifications' | 'formalites' | 'documents' | 'pv' | 'historique';

const TABS: { id: JuridiqueTabId; label: string; icon: LucideIcon }[] = [
  { id: 'creation', label: 'Création', icon: Building2 },
  { id: 'modifications', label: 'Modifications', icon: RefreshCw },
  { id: 'formalites', label: 'Formalités juridiques', icon: Landmark },
  { id: 'documents', label: 'Documents juridiques', icon: Scale },
  { id: 'pv', label: 'PV Tribunal', icon: Gavel },
  { id: 'historique', label: 'Historique', icon: History },
];

type Props = {
  activeTab: JuridiqueTabId;
  onChange: (tab: JuridiqueTabId) => void;
  variant?: 'main' | 'sidebar';
};

export function JuridiqueModuleTabs({ activeTab, onChange, variant = 'main' }: Props) {
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
              <Icon size={14} /> {tab.label}
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
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export { TABS as JURIDIQUE_MODULE_TABS };
