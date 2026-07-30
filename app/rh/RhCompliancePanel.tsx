'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  FileText,
  Loader2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { EXPERT_DISCLAIMER } from '@/app/lib/atlas-payroll-calculations';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type {
  AtlasEmployeeProfile,
  AtlasEmploymentContract,
  AtlasEmployeeDocument,
  AtlasEmployeeAttendance,
  AtlasHrComplianceItem,
  AttendanceStatus,
  ComplianceStatus,
  ContractType,
  EmployeeDocumentType,
  HrComplianceDashboard,
} from '@/app/types/atlas-hr-compliance';
import {
  ATTENDANCE_STATUS_LABELS,
  COMPLIANCE_CATEGORY_LABELS,
  COMPLIANCE_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
} from '@/app/types/atlas-hr-compliance';

type Tab = 'overview' | 'contracts' | 'documents' | 'attendance' | 'compliance';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-800',
  terminated: 'bg-gray-100 text-gray-600',
  valid: 'bg-green-100 text-green-800',
  expiring: 'bg-amber-100 text-amber-800',
  pending: 'bg-blue-100 text-blue-800',
  compliant: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  present: 'bg-green-100 text-green-800',
  absent: 'bg-red-100 text-red-800',
};

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

export function RhCompliancePanel() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [employees, setEmployees] = useState<AtlasEmployeeProfile[]>([]);
  const [contracts, setContracts] = useState<AtlasEmploymentContract[]>([]);
  const [documents, setDocuments] = useState<AtlasEmployeeDocument[]>([]);
  const [attendance, setAttendance] = useState<AtlasEmployeeAttendance[]>([]);
  const [complianceItems, setComplianceItems] = useState<AtlasHrComplianceItem[]>([]);
  const [summary, setSummary] = useState<HrComplianceDashboard['summary']>({
    totalEmployees: 0, activeContracts: 0, expiringContracts: 0, documentsExpiring: 0,
    overdueCompliance: 0, attendanceTodayPresent: 0, attendanceTodayTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [contractForm, setContractForm] = useState({
    contractType: 'cdi' as ContractType,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    jobTitle: '',
    grossSalaryMad: '',
  });
  const [docForm, setDocForm] = useState({
    documentType: 'cin' as EmployeeDocumentType,
    title: '',
    fileUrl: '',
    expiresAt: '',
  });
  const [attForm, setAttForm] = useState({
    attendanceDate: new Date().toISOString().slice(0, 10),
    status: 'present' as AttendanceStatus,
    notes: '',
  });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<HrComplianceDashboard>(
      `/api/hr-compliance?companyId=${encodeURIComponent(cid)}&sync=true`,
    );
    if (!result.ok) {
      setLoadError(result.error);
    } else {
      setEmployees(result.data.employees ?? []);
      setContracts(result.data.contracts ?? []);
      setDocuments(result.data.documents ?? []);
      setAttendance(result.data.attendance ?? []);
      setComplianceItems(result.data.complianceItems ?? []);
      setSummary(result.data.summary ?? {
        totalEmployees: 0, activeContracts: 0, expiringContracts: 0, documentsExpiring: 0,
        overdueCompliance: 0, attendanceTodayPresent: 0, attendanceTodayTotal: 0,
      });
      if (result.warning) setLoadError(result.warning);
      if (!selectedEmployeeId && result.data.employees?.[0]) {
        setSelectedEmployeeId(result.data.employees[0].id);
      }
    }
    setLoading(false);
  }, [selectedEmployeeId]);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid);
    })();
  }, [load]);

  useEffect(() => {
    return onCompanySwitched(() => {
      void (async () => {
        const cid = await getActiveCompanyDbRowId();
        setCompanyId(cid);
        if (cid) await load(cid);
      })();
    });
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    if (!companyId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr-compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ companyId, ...body }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'action_failed');
      await load(companyId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setSubmitting(false);
    }
  };

  const markCompliant = (itemId: string) => void post({ action: 'update_compliance', itemId, status: 'compliant' });

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 py-16 text-gray-400 gap-2">
        <Loader2 className="animate-spin" size={20} /> Chargement conformité RH…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800">Conformité RH &amp; droit du travail</h1>
          </div>
          <p className="text-xs text-amber-700 mt-1">{EXPERT_DISCLAIMER} — Loi 65-99 (Code du travail marocain)</p>
        </div>
        <button
          type="button"
          onClick={() => companyId && void load(companyId)}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {!companyId && <ModuleNoCompanyState moduleLabel="la conformité RH" />}
      {loadError && <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Users className="h-3 w-3" /> Employés</p>
          <p className="text-2xl font-semibold">{summary.totalEmployees}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Contrats actifs</p>
          <p className="text-2xl font-semibold text-green-700">{summary.activeContracts}</p>
          {summary.expiringContracts > 0 && (
            <p className="text-xs text-amber-600">{summary.expiringContracts} expirent sous 30 j</p>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Non-conformités</p>
          <p className="text-2xl font-semibold text-red-600">{summary.overdueCompliance}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Présence aujourd&apos;hui</p>
          <p className="text-2xl font-semibold">{summary.attendanceTodayPresent}/{summary.attendanceTodayTotal || summary.totalEmployees}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Vue d&apos;ensemble</TabBtn>
        <TabBtn active={tab === 'contracts'} onClick={() => setTab('contracts')}>Contrats</TabBtn>
        <TabBtn active={tab === 'documents'} onClick={() => setTab('documents')}>Dossiers</TabBtn>
        <TabBtn active={tab === 'attendance'} onClick={() => setTab('attendance')}>Présences</TabBtn>
        <TabBtn active={tab === 'compliance'} onClick={() => setTab('compliance')}>Conformité légale</TabBtn>
      </div>

      {employees.length > 0 && tab !== 'overview' && (
        <label className="block max-w-xs">
          <span className="text-xs text-gray-500">Employé sélectionné</span>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </select>
        </label>
      )}

      {tab === 'overview' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Employé</th>
                <th className="px-4 py-3 text-left">Contrat</th>
                <th className="px-4 py-3 text-left">CNSS</th>
                <th className="px-4 py-3 text-left">Dossiers</th>
                <th className="px-4 py-3 text-left">Alertes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucun employé — ajoutez-en dans l&apos;onglet Employés.</td></tr>
              ) : employees.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{e.fullName}{e.roleTitle ? ` — ${e.roleTitle}` : ''}</td>
                  <td className="px-4 py-3">
                    {e.activeContract ? (
                      <span className="text-xs">{CONTRACT_TYPE_LABELS[e.activeContract.contractType]} · {e.activeContract.startDate}</span>
                    ) : (
                      <span className="text-xs text-red-600">Sans contrat</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">{e.cnssMatricule ?? '—'}</td>
                  <td className="px-4 py-3">{e.documentCount}</td>
                  <td className="px-4 py-3">
                    {e.complianceOverdue > 0 ? (
                      <span className="text-xs text-red-600 font-medium">{e.complianceOverdue} en retard</span>
                    ) : (
                      <span className="text-xs text-green-600">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'contracts' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Nouveau contrat de travail</h3>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={contractForm.contractType}
              onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value as ContractType })}
            >
              {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={contractForm.startDate}
              onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} />
            {contractForm.contractType === 'cdd' && (
              <input type="date" placeholder="Date fin" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} />
            )}
            <input placeholder="Poste" className="w-full border rounded-lg px-3 py-2 text-sm" value={contractForm.jobTitle}
              onChange={(e) => setContractForm({ ...contractForm, jobTitle: e.target.value })} />
            <input type="number" placeholder="Salaire brut MAD" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={contractForm.grossSalaryMad} onChange={(e) => setContractForm({ ...contractForm, grossSalaryMad: e.target.value })} />
            <button
              type="button"
              disabled={submitting || !selectedEmployeeId}
              onClick={() => void post({
                action: 'create_contract',
                employeeId: selectedEmployeeId,
                contractType: contractForm.contractType,
                startDate: contractForm.startDate,
                endDate: contractForm.endDate || undefined,
                jobTitle: contractForm.jobTitle || undefined,
                grossSalaryMad: contractForm.grossSalaryMad ? Number(contractForm.grossSalaryMad) : undefined,
              })}
              className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50"
            >
              Créer contrat + checklist conformité
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                <th className="px-4 py-2 text-left">Employé</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Fin</th><th className="px-4 py-2">Statut</th>
              </tr></thead>
              <tbody className="divide-y">
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.employeeName}</td>
                    <td className="px-4 py-2">{CONTRACT_TYPE_LABELS[c.contractType]}</td>
                    <td className="px-4 py-2 text-xs">{c.endDate ?? '—'}{c.daysUntilEnd != null && c.daysUntilEnd <= 30 ? ` (${c.daysUntilEnd}j)` : ''}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[c.status]}`}>{CONTRACT_STATUS_LABELS[c.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1"><FileText className="h-4 w-4" /> Ajouter un document</h3>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={docForm.documentType}
              onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value as EmployeeDocumentType })}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input placeholder="Titre *" className="w-full border rounded-lg px-3 py-2 text-sm" value={docForm.title}
              onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
            <input placeholder="URL du fichier" className="w-full border rounded-lg px-3 py-2 text-sm" value={docForm.fileUrl}
              onChange={(e) => setDocForm({ ...docForm, fileUrl: e.target.value })} />
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={docForm.expiresAt}
              onChange={(e) => setDocForm({ ...docForm, expiresAt: e.target.value })} />
            <button type="button" disabled={submitting || !selectedEmployeeId || !docForm.title.trim()}
              onClick={() => void post({ action: 'add_document', employeeId: selectedEmployeeId, ...docForm, fileUrl: docForm.fileUrl || undefined, expiresAt: docForm.expiresAt || undefined })}
              className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50">
              Enregistrer document
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                <th className="px-4 py-2 text-left">Employé</th><th className="px-4 py-2">Document</th><th className="px-4 py-2">Expiration</th><th className="px-4 py-2">Statut</th>
              </tr></thead>
              <tbody className="divide-y">
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2">{d.employeeName}</td>
                    <td className="px-4 py-2">
                      {d.fileUrl ? <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{d.title}</a> : d.title}
                    </td>
                    <td className="px-4 py-2 text-xs">{d.expiresAt ?? '—'}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[d.status]}`}>{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Enregistrer présence</h3>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={attForm.attendanceDate}
              onChange={(e) => setAttForm({ ...attForm, attendanceDate: e.target.value })} />
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={attForm.status}
              onChange={(e) => setAttForm({ ...attForm, status: e.target.value as AttendanceStatus })}>
              {Object.entries(ATTENDANCE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input placeholder="Notes" className="w-full border rounded-lg px-3 py-2 text-sm" value={attForm.notes}
              onChange={(e) => setAttForm({ ...attForm, notes: e.target.value })} />
            <button type="button" disabled={submitting || !selectedEmployeeId}
              onClick={() => void post({ action: 'record_attendance', employeeId: selectedEmployeeId, ...attForm, notes: attForm.notes || undefined })}
              className="w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50">
              Enregistrer
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden max-h-96 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0"><tr>
                <th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2">Employé</th><th className="px-4 py-2">Statut</th>
              </tr></thead>
              <tbody className="divide-y">
                {attendance.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-mono text-xs">{a.attendanceDate}</td>
                    <td className="px-4 py-2">{a.employeeName}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[a.status]}`}>{ATTENDANCE_STATUS_LABELS[a.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'compliance' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold">Exigences légales (Loi 65-99, CNSS, documents obligatoires)</h3>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Employé</th>
                <th className="px-4 py-3 text-left">Exigence</th>
                <th className="px-4 py-3 text-left">Base légale</th>
                <th className="px-4 py-3 text-left">Échéance</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {complianceItems.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Créez un contrat pour générer la checklist de conformité.</td></tr>
              ) : complianceItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{item.employeeName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{item.title}</span>
                    <span className="block text-xs text-gray-400">{COMPLIANCE_CATEGORY_LABELS[item.category]}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">{item.legalBasis ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{item.dueDate ?? '—'}{item.daysUntilDue != null && item.daysUntilDue < 0 ? ' (dépassé)' : ''}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[item.status]}`}>{COMPLIANCE_STATUS_LABELS[item.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    {item.status !== 'compliant' && (
                      <button type="button" onClick={() => markCompliant(item.id)} className="text-xs text-indigo-600 hover:underline">
                        Marquer conforme
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
