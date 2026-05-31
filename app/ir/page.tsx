'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, FileCode, Globe, Loader2, RefreshCw } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { EXPERT_DISCLAIMER } from '@/app/lib/atlas-payroll-calculations';
import type { AtlasIrSnapshot, AtlasPayrollRun, AtlasSalary } from '@/app/types/atlas-payroll';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T };
}

export default function IRPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [run, setRun] = useState<AtlasPayrollRun | null>(null);
  const [salaries, setSalaries] = useState<AtlasSalary[]>([]);
  const [snapshots, setSnapshots] = useState<AtlasIrSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [xmlGenerated, setXmlGenerated] = useState(false);

  const reload = useCallback(async () => {
    if (!isAtlasSupabaseDataEnabled()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (!cid) return;

      const now = new Date();
      const payRes = await apiFetch<{ run?: AtlasPayrollRun; salaries?: AtlasSalary[]; error?: string }>(
        '/api/payroll/runs',
        {
          method: 'POST',
          body: JSON.stringify({ companyId: cid, periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 }),
        },
      );
      if (payRes.ok && payRes.data.run) {
        setRun(payRes.data.run);
        setSalaries(payRes.data.salaries ?? []);
      }

      const irRes = await apiFetch<{ snapshots?: AtlasIrSnapshot[] }>(
        `/api/ir/snapshots?companyId=${encodeURIComponent(cid)}`,
      );
      if (irRes.ok) setSnapshots(irRes.data.snapshots ?? []);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalBrut = run?.totalGross ?? 0;
  const totalCNSS = run?.totalCnssEmployee ?? 0;
  const totalAMO = run?.totalAmoEmployee ?? 0;
  const totalIR = run?.totalIr ?? 0;
  const totalNet = run?.totalNet ?? 0;
  const cnssPatronal = salaries.reduce((s, e) => s + e.cnssEmployer, 0);
  const amoPatronal = salaries.reduce((s, e) => s + e.amoEmployer, 0);

  const generateXMLIR = () => {
    const mois = new Date().toISOString().substring(0, 7);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Etat9421 xmlns="http://www.tax.gov.ma/ir/v1">
  <Entete><Periode>${mois}</Periode><NombreEmployes>${salaries.length}</NombreEmployes></Entete>
  <Salaries>${salaries.map((e) => `<Salarie><Nom>${e.employeeName ?? e.employeeId}</Nom><SalaireBrut>${e.grossSalary}</SalaireBrut><IR>${e.irAmount.toFixed(2)}</IR><SalaireNet>${e.netSalary.toFixed(2)}</SalaireNet></Salarie>`).join('')}</Salaries>
  <Totaux><TotalBrut>${totalBrut}</TotalBrut><TotalIR>${totalIR.toFixed(2)}</TotalIR></Totaux>
</Etat9421>`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IR_9421_${mois}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    setXmlGenerated(true);
  };

  if (!isAtlasSupabaseDataEnabled()) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AppSidebar variant="module" />
        <main className="flex-1 flex items-center justify-center text-sm text-gray-500">Supabase requis pour IR / paie.</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-800">IR / Salaires / CNSS</h1>
              <BetaSurfaceBadge />
            </div>
            <p className="text-xs text-amber-700 mt-0.5">{EXPERT_DISCLAIMER} · {run?.formulaVersion ?? '—'}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void reload()} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm"><RefreshCw size={14} /> Actualiser paie</button>
            <button type="button" onClick={generateXMLIR} disabled={!salaries.length} className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm disabled:opacity-50"><FileCode size={14} /> XML IR 9421</button>
            <button type="button" onClick={() => window.open('https://www.tax.gov.ma', '_blank')} className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm"><Globe size={14} /> SIMPL-IR</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {loading && <div className="flex justify-center py-12 text-gray-400 gap-2"><Loader2 className="animate-spin" /> Chargement…</div>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
          {!loading && !companyId && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">Sélectionnez une société active.</div>}

          {!loading && run && (
            <>
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">Masse salariale</p><p className="text-xl font-bold">{totalBrut.toLocaleString()} MAD</p></div>
                <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">CNSS salarial</p><p className="text-xl font-bold text-blue-600">{totalCNSS.toFixed(0)} MAD</p></div>
                <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">CNSS patronal</p><p className="text-xl font-bold text-purple-600">{cnssPatronal.toFixed(0)} MAD</p></div>
                <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">IR à verser</p><p className="text-xl font-bold text-red-600">{totalIR.toFixed(0)} MAD</p></div>
                <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">Total net</p><p className="text-xl font-bold text-green-600">{totalNet.toFixed(0)} MAD</p></div>
              </div>

              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b"><h2 className="font-semibold">Bulletins — {run.periodMonth}/{run.periodYear} ({run.status})</h2></div>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-gray-400 border-b bg-gray-50"><th className="px-4 py-3 text-left">Employé</th><th className="px-4 py-3 text-right">Brut</th><th className="px-4 py-3 text-right">CNSS</th><th className="px-4 py-3 text-right">AMO</th><th className="px-4 py-3 text-right">IR</th><th className="px-4 py-3 text-right">Net</th></tr></thead>
                  <tbody>
                    {salaries.map((e) => (
                      <tr key={e.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{e.employeeName ?? e.employeeId.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-right">{e.grossSalary.toLocaleString()} MAD</td>
                        <td className="px-4 py-3 text-right text-blue-600">{e.cnssEmployee.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-purple-600">{e.amoEmployee.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{e.irAmount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{e.netSalary.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {snapshots.length > 0 && (
                <div className="bg-white rounded-xl border p-5">
                  <h2 className="font-semibold mb-3">Historique IR (snapshots)</h2>
                  <div className="space-y-2">
                    {snapshots.map((s) => (
                      <div key={s.id} className="flex justify-between text-sm border-b pb-2">
                        <span>{s.periodMonth}/{s.periodYear} · {s.employeeCount} employé(s) · {s.formulaVersion}</span>
                        <span className="font-bold text-red-600">{s.totalIr.toLocaleString()} MAD IR</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {xmlGenerated && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle size={20} className="text-green-500" />
                  <p className="text-sm text-green-700">XML généré depuis les données paie persistées.</p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
