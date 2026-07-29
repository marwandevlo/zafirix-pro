'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Shield, Trash2 } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import { copyTextToClipboard } from '@/app/lib/copy-to-clipboard';

type Pass = {
  id: string;
  label: string;
  guestUrl: string;
  expiresAt: string;
  accessCount: number;
};

export function AuditorPassWidget() {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auditor/pass?companyId=${encodeURIComponent(cid)}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { passes?: Pass[] };
      setPasses(data.passes ?? []);
    } finally {
      setLoading(false);
    }
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
    if (!cid || !label.trim()) return;
    setCreating(true);
    await fetch('/api/auditor/pass', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: cid, label: label.trim(), expiresInDays: 14 }),
    });
    setLabel('');
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
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nom du cabinet / auditeur"
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={creating || !label.trim()}
            onClick={() => void createPass()}
            className="px-3 py-2 text-xs font-medium bg-[#1B2A4A] text-white rounded-lg disabled:opacity-50 shrink-0"
          >
            Créer
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
        ) : passes.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Aucun pass actif — créez un lien sécurisé pour votre auditeur externe</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {passes.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{p.label}</p>
                  <p className="text-gray-400">Expire {new Date(p.expiresAt).toLocaleDateString('fr-FR')} · {p.accessCount} accès</p>
                </div>
                <button type="button" onClick={() => void copyTextToClipboard(p.guestUrl)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Copier le lien">
                  <Copy size={14} />
                </button>
                <button type="button" onClick={() => void revokePass(p.id)} className="p-1.5 text-gray-400 hover:text-red-600" title="Révoquer">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
