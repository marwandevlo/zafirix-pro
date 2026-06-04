'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Loader2, Shield } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';

type Finding = { severity: string; category: string; title: string; description: string };

type AuditPayload = {
  score?: number;
  risk_score?: number;
  findings?: Finding[];
  recommendations?: string[];
  criticalIssues?: Finding[];
  sections?: {
    critical: Finding[];
    tva: Finding[];
    banking: Finding[];
    hr: Finding[];
    legal: Finding[];
    fiscal: Finding[];
  };
  provider?: string;
};

const FINDING_COLS: ExportColumn[] = [
  { key: 'severity', label: 'Sévérité' },
  { key: 'category', label: 'Catégorie' },
  { key: 'title', label: 'Titre' },
  { key: 'description', label: 'Description' },
];

function Section({ title, items }: { title: string; items: Finding[] }) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-2">{title}</h3>
      <ul className="space-y-2">
        {items.map((f, i) => (
          <li key={i} className={`text-xs p-2 rounded-lg border ${
            f.severity === 'critical' ? 'bg-red-50 border-red-100' : f.severity === 'warning' ? 'bg-amber-50 border-amber-100' : 'bg-gray-50'
          }`}>
            <p className="font-medium">{f.title}</p>
            <p className="text-gray-600 mt-0.5">{f.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AuditPage() {
  const [data, setData] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cid = companyId ?? await getActiveCompanyDbRowId();
      if (!companyId) setCompanyId(cid);
      const params = new URLSearchParams({ fiscalYear: String(fiscalYear) });
      if (cid) params.set('companyId', cid);
      const res = await fetch(`/api/assistant/audit?${params}`, { credentials: 'include' });
      if (!res.ok) return;
      setData(await res.json() as AuditPayload);
    } finally {
      setLoading(false);
    }
  }, [companyId, fiscalYear]);

  useEffect(() => {
    if (!isAtlasSupabaseDataEnabled()) return;
    void load();
  }, [load]);

  const exportRows = useMemo(
    () => (data?.findings ?? []).map((f) => ({ ...f })),
    [data?.findings],
  );

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
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield className="text-violet-600" size={24} />
            <div>
              <h1 className="text-lg font-bold text-gray-800">Audit IA</h1>
              <p className="text-xs text-gray-400">Rapport d&apos;audit interne — données Atlas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="text-xs border rounded-lg px-2 py-1.5"
            >
              {[0, 1, 2].map((o) => {
                const y = new Date().getFullYear() - o;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
            <button type="button" onClick={() => void load()} className="text-xs border rounded-lg px-3 py-1.5">
              Regénérer
            </button>
            <ExportMenu data={exportRows} columns={FINDING_COLS} filename="audit-ia" title="Audit IA" formats={['csv', 'xlsx', 'json', 'pdf']} size="sm" />
            <button
              type="button"
              onClick={() => window.open(`/api/assistant/audit?fiscalYear=${fiscalYear}${companyId ? `&companyId=${companyId}` : ''}&download=1`, '_blank')}
              className="flex items-center gap-1 text-xs border rounded-lg px-3 py-1.5"
            >
              <Download size={14} /> JSON
            </button>
          </div>
        </header>

        <div className="p-6 space-y-4 max-w-5xl">
          {loading ? (
            <Loader2 className="animate-spin text-violet-500 mx-auto" size={28} />
          ) : data ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border p-4 md:col-span-1">
                  <p className="text-xs text-gray-400">Score Global</p>
                  <p className={`text-4xl font-bold mt-1 ${(data.score ?? 0) >= 80 ? 'text-green-600' : 'text-amber-600'}`}>
                    {data.score ?? '—'}%
                  </p>
                  {data.provider && <p className="text-[10px] text-gray-400 mt-1">Provider: {data.provider}</p>}
                </div>
                <div className="bg-white rounded-xl border p-4 md:col-span-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Recommandations</p>
                  <ul className="text-xs space-y-1 text-gray-700">
                    {(data.recommendations ?? []).slice(0, 6).map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <Section title="Risques Critiques" items={data.sections?.critical ?? data.criticalIssues ?? []} />
              <Section title="Risques TVA" items={data.sections?.tva ?? []} />
              <Section title="Risques Bancaires" items={data.sections?.banking ?? []} />
              <Section title="Risques RH" items={data.sections?.hr ?? []} />
              <Section title="Risques Juridiques" items={data.sections?.legal ?? []} />
              <Section title="Risques Fiscaux" items={data.sections?.fiscal ?? []} />

              {(data.criticalIssues?.length ?? 0) === 0 && (data.findings?.length ?? 0) === 0 && (
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <AlertTriangle size={16} /> Aucun risque majeur détecté pour cet exercice.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Impossible de charger le rapport.</p>
          )}
        </div>
      </main>
    </div>
  );
}
