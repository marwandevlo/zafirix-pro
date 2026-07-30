'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Shield, Trash2 } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { fetchEnterpriseModule, ModuleLoadErrorBanner } from '@/app/lib/use-enterprise-module-fetch';
import { copyTextToClipboard } from '@/app/lib/copy-to-clipboard';
import type { AuditorPermission, AuditorRole, AuditorScope } from '@/app/types/atlas-auditor-pass';
import { AUDITOR_ROLE_LABELS, AUDITOR_SCOPE_LABELS } from '@/app/types/atlas-auditor-pass';

type Pass = {
  id: string;
  label: string;
  guestUrl: string;
  expiresAt: string;
  accessCount: number;
  scope: AuditorScope;
  scopeLabel: string;
  auditorRole: AuditorRole;
  auditorRoleLabel: string;
  permissions: AuditorPermission[];
  auditorEmail: string | null;
  lastAccessAt: string | null;
};

export function AuditorPassWidget() {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    label: '',
    auditorRole: 'external_auditor' as AuditorRole,
    scope: 'read_only' as AuditorScope,
    auditorEmail: '',
    expiresInDays: 14,
  });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{ passes?: Pass[] }>(
      `/api/auditor/pass?companyId=${encodeURIComponent(cid)}`,
    );
    if (!result.ok) {
      setLoadError(result.error);
      setPasses([]);
    } else {
      setPasses(result.data.passes ?? []);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      if (cid) await load(cid);
      else setLoading(false);
    })();
    const off = onCompanySwitched((cid) => { if (cid) void load(cid); });
    return off;
  }, [load]);

  const createPass = async () => {
    const cid = await getActiveCompanyDbRowId();
    if (!cid || !form.label.trim()) return;
    setCreating(true);
    await fetch('/api/auditor/pass', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: cid,
        label: form.label.trim(),
        auditorRole: form.auditorRole,
        scope: form.scope,
        auditorEmail: form.auditorEmail.trim() || undefined,
        expiresInDays: form.expiresInDays,
      }),
    });
    setForm({ label: '', auditorRole: 'external_auditor', scope: 'read_only', auditorEmail: '', expiresInDays: 14 });
    await load(cid);
    setCreating(false);
  };

  const revokePass = async (id: string) => {
    await fetch(`/api/auditor/pass?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
    const cid = await getActiveCompanyDbRowId();
    if (cid) await load(cid);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Shield size={14} className="text-[#1B2A4A]" />
        <h2 className="font-semibold text-gray-700 text-sm">Pass auditeur invité</h2>
      </div>

      <div className="p-4 space-y-3">
        <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />

        <div className="space-y-2">
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Cabinet / auditeur *"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.auditorRole}
              onChange={(e) => setForm({ ...form, auditorRole: e.target.value as AuditorRole })}
              className="border border-gray-200 rounded-lg px-2 py-2 text-xs"
            >
              {Object.entries(AUDITOR_ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value as AuditorScope })}
              className="border border-gray-200 rounded-lg px-2 py-2 text-xs"
            >
              {Object.entries(AUDITOR_SCOPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <input
            value={form.auditorEmail}
            onChange={(e) => setForm({ ...form, auditorEmail: e.target.value })}
            placeholder="Email auditeur (optionnel)"
            type="email"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={creating || !form.label.trim()}
            onClick={() => void createPass()}
            className="w-full px-3 py-2 text-xs font-medium bg-[#1B2A4A] text-white rounded-lg disabled:opacity-50"
          >
            Créer un pass sécurisé
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
        ) : passes.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Aucun pass actif — créez un lien lecture seule pour votre auditeur ou expert-comptable
          </p>
        ) : (
          <ul className="space-y-2 max-h-56 overflow-y-auto">
            {passes.map((p) => (
              <li key={p.id} className="text-xs border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{p.label}</p>
                    <p className="text-gray-500">{p.auditorRoleLabel} · {p.scopeLabel}</p>
                    <p className="text-gray-400">
                      Expire {new Date(p.expiresAt).toLocaleDateString('fr-FR')} · {p.accessCount} accès
                    </p>
                  </div>
                  <button type="button" onClick={() => void copyTextToClipboard(p.guestUrl)} className="p-1.5 text-gray-400 hover:text-blue-600 shrink-0" title="Copier le lien">
                    <Copy size={14} />
                  </button>
                  <button type="button" onClick={() => void revokePass(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 shrink-0" title="Révoquer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
