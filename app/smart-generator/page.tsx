'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { SmartGeneratorChatPanel } from '@/app/components/smart-generator/SmartGeneratorChatPanel';
import {
  EMPTY_HEADER,
  companyToHeader,
} from '@/app/components/smart-generator/SmartGeneratorLegalHeaderPanel';
import { getActiveAtlasCompany, getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { listAtlasCompanies } from '@/app/lib/atlas-companies-repository';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import type { AtlasCompany } from '@/app/types/atlas-company';
import type { SmartGeneratorHeader } from '@/app/types/atlas-smart-generator';

export default function SmartGeneratorPage() {
  const [companies, setCompanies] = useState<AtlasCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyHeader, setCompanyHeader] = useState<SmartGeneratorHeader>({ ...EMPTY_HEADER });

  const reloadCompanies = useCallback(async () => {
    const [list, active, cid] = await Promise.all([
      listAtlasCompanies(),
      getActiveAtlasCompany(),
      getActiveCompanyDbRowId(),
    ]);
    setCompanies(list);
    if (cid) {
      setSelectedCompanyId(cid);
      const match = list.find((c) => (c.dbRowId ?? String(c.id)) === cid) ?? active;
      if (match) setCompanyHeader(companyToHeader(match));
    } else if (active) {
      setSelectedCompanyId(active.dbRowId ?? String(active.id));
      setCompanyHeader(companyToHeader(active));
    }
  }, []);

  useEffect(() => {
    void reloadCompanies();
    const off = onCompanySwitched(() => { void reloadCompanies(); });
    return off;
  }, [reloadCompanies]);

  const handleSelectCompany = (id: string | null, company: AtlasCompany | null) => {
    setSelectedCompanyId(id);
    setCompanyHeader(company ? companyToHeader(company) : { ...EMPTY_HEADER });
  };
  if (!isAtlasSupabaseDataEnabled()) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AppSidebar variant="module" />
        <main className="flex-1 flex items-center justify-center text-sm text-gray-500">Supabase requis.</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-8 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Wand2 className="text-indigo-600" size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Smart Generator</h1>
              <BetaSurfaceBadge label="Assistant IA · Documents dynamiques · DGI Maroc" className="mt-0.5" />
            </div>
          </div>
        </header>

        <SmartGeneratorChatPanel
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          onSelectCompany={handleSelectCompany}
          companyHeader={companyHeader}
        />
      </main>
    </div>
  );
}
