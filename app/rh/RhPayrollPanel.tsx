'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Receipt } from 'lucide-react';
import { ExportMenu } from '@/app/components/ExportMenu';
import type { ExportColumn } from '@/app/components/ExportMenu';
import { ValidationStatusBadge } from '@/app/components/validation/ValidationStatusBadge';

type Tab = 'bulletins' | 'cnss' | 'ir';

type Payslip = {
  id: string;
  employee_name: string | null;
  gross_salary: number | null;
  net_salary: number | null;
  cnss_amount: number | null;
  ir_amount: number | null;
  match_confidence: number | null;
  validation_status: string;
  period_year: number | null;
  period_month: number | null;
};

const PAYSLIP_EXPORT: ExportColumn[] = [
  { key: 'employee_name', label: 'Employé' },
  { key: 'period', label: 'Période' },
  { key: 'gross_salary', label: 'Brut (MAD)' },
  { key: 'net_salary', label: 'Net (MAD)' },
  { key: 'cnss_amount', label: 'CNSS (MAD)' },
  { key: 'ir_amount', label: 'IR (MAD)' },
  { key: 'match_confidence', label: 'Confiance %' },
  { key: 'validation_status', label: 'Statut' },
];

export function RhPayrollPanel() {
  const [tab, setTab] = useState<Tab>('bulletins');
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [cnss, setCnss] = useState<{ total_employees: number; total_cnss: number; pending_declarations: number } | null>(null);
  const [ir, setIr] = useState<{ retained_ir: number; payroll_taxes: number; period: string } | null>(null);
  const [alerts, setAlerts] = useState<{ title: string; description: string; severity: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, dash, al] = await Promise.all([
        fetch('/api/payroll/payslips', { credentials: 'include' }),
        fetch('/api/payroll/dashboard', { credentials: 'include' }),
        fetch('/api/payroll/alerts', { credentials: 'include' }),
      ]);
      if (ps.ok) {
        const d = await ps.json() as { payslips: Payslip[] };
        setPayslips(d.payslips ?? []);
      }
      if (dash.ok) {
        const d = await dash.json() as { cnss: typeof cnss; ir: typeof ir };
        setCnss(d.cnss);
        setIr(d.ir);
      }
      if (al.ok) {
        const d = await al.json() as { alerts: typeof alerts };
        setAlerts(d.alerts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const exportData = payslips.map(p => ({
    id: p.id,
    employee_name: p.employee_name ?? '',
    period: p.period_month && p.period_year ? `${p.period_month}/${p.period_year}` : '',
    gross_salary: p.gross_salary,
    net_salary: p.net_salary,
    cnss_amount: p.cnss_amount,
    ir_amount: p.ir_amount,
    match_confidence: p.match_confidence,
    validation_status: p.validation_status,
  }));

  const patchPayslips = async (ids: string[], action: 'review' | 'validate' | 'reject') => {
    await fetch('/api/payroll/payslips', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action }),
    });
    void load();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-green-600" />
          <h1 className="text-lg font-bold text-gray-800">Paie — Bulletins &amp; conformité</h1>
        </div>
        <ExportMenu
          data={exportData as unknown as Record<string, unknown>[]}
          columns={PAYSLIP_EXPORT}
          filename="bulletins_paie"
          title="Bulletins de paie"
          size="sm"
        />
      </div>

      <div className="px-6 py-3 bg-white border-b border-gray-100 flex gap-2">
        {(['bulletins', 'cnss', 'ir'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${tab === t ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t === 'bulletins' ? 'Bulletins' : t === 'cnss' ? 'CNSS' : 'IR'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.slice(0, 5).map(a => (
              <div key={a.title} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                <span className="font-medium text-amber-800">{a.title}</span>
                <span className="text-amber-600">— {a.description}</span>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : tab === 'cnss' ? (
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm max-w-lg">
            <h2 className="font-semibold text-gray-800 mb-4">Synthèse CNSS</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Employés actifs</dt><dd className="font-bold">{cnss?.total_employees ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Total cotisations CNSS</dt><dd className="font-bold text-blue-700">{(cnss?.total_cnss ?? 0).toLocaleString('fr-FR')} MAD</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Déclarations en attente</dt><dd className="font-bold text-amber-600">{cnss?.pending_declarations ?? 0}</dd></div>
            </dl>
          </div>
        ) : tab === 'ir' ? (
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm max-w-lg">
            <h2 className="font-semibold text-gray-800 mb-4">Synthèse IR — {ir?.period}</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">IR retenu à la source</dt><dd className="font-bold text-purple-700">{(ir?.retained_ir ?? 0).toLocaleString('fr-FR')} MAD</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Charges paie estimées</dt><dd className="font-bold">{(ir?.payroll_taxes ?? 0).toLocaleString('fr-FR')} MAD</dd></div>
            </dl>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                  <th className="px-4 py-3">Employé</th>
                  <th className="px-4 py-3">Période</th>
                  <th className="px-4 py-3 text-right">Brut</th>
                  <th className="px-4 py-3 text-right">Net</th>
                  <th className="px-4 py-3">Confiance</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun bulletin extrait. Routez un bulletin via Documents IA.</td></tr>
                )}
                {payslips.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.employee_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.period_month}/{p.period_year}</td>
                    <td className="px-4 py-3 text-right">{p.gross_salary?.toLocaleString('fr-FR') ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{p.net_salary?.toLocaleString('fr-FR') ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">{p.match_confidence ?? 0}%</td>
                    <td className="px-4 py-3"><ValidationStatusBadge status={p.validation_status as 'draft' | 'validated' | 'reviewed' | 'rejected'} /></td>
                    <td className="px-4 py-3">
                      {p.validation_status === 'draft' && (
                        <div className="flex gap-1">
                          <button type="button" onClick={() => void patchPayslips([p.id], 'review')} className="text-[10px] text-purple-600 hover:underline">Réviser</button>
                          <button type="button" onClick={() => void patchPayslips([p.id], 'validate')} className="text-[10px] text-green-600 hover:underline">Valider</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
