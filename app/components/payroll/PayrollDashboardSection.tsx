'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Loader2, Users } from 'lucide-react';
import { MadAmount } from '@/app/components/ui/MadAmount';

type PayrollKpis = {
  employees: number;
  payslips_extracted: number;
  payslips_draft: number;
  cnss_total: number;
  ir_total: number;
  anomalies: number;
};

type CnssSummary = { total_employees: number; total_cnss: number; pending_declarations: number };
type IrSummary = { retained_ir: number; payroll_taxes: number; period: string };

export function PayrollDashboardSection() {
  const router = useRouter();
  const [kpis, setKpis] = useState<PayrollKpis | null>(null);
  const [cnss, setCnss] = useState<CnssSummary | null>(null);
  const [ir, setIr] = useState<IrSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/payroll/dashboard', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { kpis: PayrollKpis; cnss: CnssSummary; ir: IrSummary };
        if (!cancelled) {
          setKpis(data.kpis);
          setCnss(data.cnss);
          setIr(data.ir);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-green-600" />
          <h2 className="font-semibold text-gray-800 text-sm">Paie &amp; conformité RH</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push('/rh')}
          className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
        >
          Module RH <ArrowRight size={10} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400">Employés</p>
            <p className="text-xl font-bold text-gray-800 mt-1">{kpis?.employees ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400">Bulletins extraits</p>
            <p className="text-xl font-bold text-gray-800 mt-1">{kpis?.payslips_extracted ?? 0}</p>
            {(kpis?.payslips_draft ?? 0) > 0 && (
              <p className="text-[10px] text-amber-600 mt-0.5">{kpis?.payslips_draft} en attente</p>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400">CNSS (période)</p>
            <p className="text-lg font-bold text-blue-700 mt-1">
              <MadAmount value={cnss?.total_cnss ?? kpis?.cnss_total ?? 0} />
            </p>
            <p className="text-[10px] text-gray-400">{cnss?.pending_declarations ?? 0} décl. en attente</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400">IR retenu — {ir?.period}</p>
            <p className="text-lg font-bold text-purple-700 mt-1">
              <MadAmount value={ir?.retained_ir ?? kpis?.ir_total ?? 0} />
            </p>
          </div>
        </div>
      )}

      {(kpis?.anomalies ?? 0) > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertTriangle size={14} />
          {kpis?.anomalies} bulletin(s) nécessitent une révision (matching employé ou CNSS)
        </div>
      )}
    </section>
  );
}
