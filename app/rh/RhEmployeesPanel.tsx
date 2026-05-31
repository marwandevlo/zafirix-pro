'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, RefreshCw } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { EXPERT_DISCLAIMER } from '@/app/lib/atlas-payroll-calculations';
import type { AtlasSalary, AtlasPayrollRun } from '@/app/types/atlas-payroll';

type EmployeeRow = {
  id: string;
  full_name: string;
  cin: string | null;
  cnss_matricule: string | null;
  gross_salary_mad: number | null;
  role_title: string | null;
  status: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T };
}

export function RhEmployeesPanel() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [run, setRun] = useState<AtlasPayrollRun | null>(null);
  const [salaries, setSalaries] = useState<AtlasSalary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: '', cin: '', cnssMatricule: '', grossSalaryMad: '', roleTitle: '' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!isAtlasSupabaseDataEnabled()) {
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (!cid) {
        setEmployees([]);
        return;
      }
      const empRes = await apiFetch<{ employees?: EmployeeRow[]; error?: string }>(
        `/api/rh/employees?companyId=${encodeURIComponent(cid)}`,
      );
      if (!empRes.ok) {
        setError(empRes.data.error ?? 'Erreur employés');
        return;
      }
      setEmployees(empRes.data.employees ?? []);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addEmployee = async () => {
    if (!companyId || !form.fullName.trim()) return;
    setBusy(true);
    try {
      const { ok, data } = await apiFetch<{ error?: string }>('/api/rh/employees', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          fullName: form.fullName.trim(),
          cin: form.cin.trim() || undefined,
          cnssMatricule: form.cnssMatricule.trim() || undefined,
          grossSalaryMad: form.grossSalaryMad ? Number(form.grossSalaryMad) : undefined,
          roleTitle: form.roleTitle.trim() || undefined,
        }),
      });
      if (!ok) {
        setError(data.error ?? 'Création impossible');
        return;
      }
      setForm({ fullName: '', cin: '', cnssMatricule: '', grossSalaryMad: '', roleTitle: '' });
      setShowForm(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const removeEmployee = async (id: string) => {
    if (!confirm('Supprimer cet employé ?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/rh/employees/${id}`, { method: 'DELETE' });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (!isAtlasSupabaseDataEnabled()) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Activez Supabase pour gérer les employés en production.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <Loader2 className="animate-spin" size={20} /> Chargement…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Employés</h1>
          <p className="text-xs text-amber-700 mt-1">{EXPERT_DISCLAIMER}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void reload()} className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {!companyId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">Sélectionnez une société active.</div>
      )}

      {run && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">Paie {run.periodMonth}/{run.periodYear}</p><p className="font-bold">{run.totalGross.toLocaleString()} MAD brut</p></div>
          <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">IR total</p><p className="font-bold text-red-600">{run.totalIr.toLocaleString()} MAD</p></div>
          <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">Net total</p><p className="font-bold text-green-600">{run.totalNet.toLocaleString()} MAD</p></div>
          <div className="bg-white rounded-xl p-4 border"><p className="text-xs text-gray-400">Statut</p><p className="font-bold">{run.status}</p><p className="text-[10px] text-gray-400">{run.formulaVersion}</p></div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl p-5 border border-blue-200 grid grid-cols-2 gap-3">
          <input placeholder="Nom complet *" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
          <input placeholder="Poste" value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
          <input placeholder="CIN" value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
          <input placeholder="Matricule CNSS" value={form.cnssMatricule} onChange={(e) => setForm({ ...form, cnssMatricule: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
          <input placeholder="Salaire brut MAD" type="number" value={form.grossSalaryMad} onChange={(e) => setForm({ ...form, grossSalaryMad: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void addEmployee()} className="px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm">Enregistrer</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
              <th className="px-4 py-3">Employé</th>
              <th className="px-4 py-3">CIN</th>
              <th className="px-4 py-3 text-right">Brut</th>
              <th className="px-4 py-3 text-right">IR</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucun employé enregistré.</td></tr>
            )}
            {employees.map((e) => {
              const sal = salaries.find((s) => s.employeeId === e.id);
              return (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{e.full_name}{e.role_title ? ` — ${e.role_title}` : ''}</td>
                  <td className="px-4 py-3 text-gray-500">{e.cin ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{(sal?.grossSalary ?? Number(e.gross_salary_mad ?? 0)).toLocaleString()} MAD</td>
                  <td className="px-4 py-3 text-right text-red-600">{(sal?.irAmount ?? 0).toFixed(2)} MAD</td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">{(sal?.netSalary ?? 0).toFixed(2)} MAD</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => void removeEmployee(e.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
