'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Package, Plus, Truck } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { RowShareActionBar } from '@/app/components/share';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';

type Delivery = {
  id: string;
  waybillNumber: string;
  carrier: string | null;
  status: string;
  codAmount: number;
  codCollected: number;
  recipientName: string | null;
  recipientPhone: string | null;
  trackingUrl: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  in_transit: 'En transit',
  delivered: 'Livré',
  cod_collected: 'COD encaissé',
  cancelled: 'Annulé',
  returned: 'Retourné',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_transit: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  cod_collected: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-700',
  returned: 'bg-amber-100 text-amber-800',
};

export default function LogistiquePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ waybillNumber: '', carrier: '', codAmount: '', recipientName: '', recipientPhone: '' });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{ deliveries?: Delivery[] }>(
      `/api/logistics/deliveries?companyId=${encodeURIComponent(cid)}`,
    );
    if (!result.ok) {
      setLoadError(result.error);
      setDeliveries([]);
    } else {
      setDeliveries(result.data.deliveries ?? []);
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid);
      else setLoading(false);
    })();
    const off = onCompanySwitched((cid) => { setCompanyId(cid); if (cid) void load(cid); });
    return off;
  }, [load]);

  const createDelivery = async () => {
    if (!companyId || !form.waybillNumber) return;
    await fetch('/api/logistics/deliveries', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        waybillNumber: form.waybillNumber,
        carrier: form.carrier || undefined,
        codAmount: Number(form.codAmount) || 0,
        recipientName: form.recipientName || undefined,
        recipientPhone: form.recipientPhone || undefined,
      }),
    });
    setShowForm(false);
    setForm({ waybillNumber: '', carrier: '', codAmount: '', recipientName: '', recipientPhone: '' });
    await load(companyId);
  };

  const updateStatus = async (id: string, status: string, codCollected?: number) => {
    await fetch('/api/logistics/deliveries', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, codCollected }),
    });
    if (companyId) await load(companyId);
  };

  const pendingCod = deliveries.filter((d) => d.status !== 'cod_collected' && d.codAmount > 0).reduce((s, d) => s + d.codAmount - d.codCollected, 0);

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Logistique &amp; COD</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">Bons de livraison et suivi contre-remboursement</p>
            </div>
            <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B2A4A] text-white">
              <Plus size={14} /> Nouveau BL
            </button>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />

          {!companyId && !loading && (
            <ModuleNoCompanyState moduleLabel="la logistique" />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Expéditions actives</p>
              <p className="text-2xl font-bold">{deliveries.filter((d) => !['delivered', 'cod_collected', 'cancelled'].includes(d.status)).length}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">COD en attente</p>
              <p className="text-2xl font-bold text-amber-600">{pendingCod.toLocaleString('fr-MA')} MAD</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Total expéditions</p>
              <p className="text-2xl font-bold">{deliveries.length}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                    <th className="px-4 py-3">N° BL</th>
                    <th className="px-4 py-3">Transporteur</th>
                    <th className="px-4 py-3">Destinataire</th>
                    <th className="px-4 py-3 text-right">COD</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Aucune expédition — créez un bon de livraison</td></tr>
                  )}
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{d.waybillNumber}</td>
                      <td className="px-4 py-3 text-gray-600">{d.carrier ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{d.recipientName ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{d.codAmount > 0 ? `${d.codAmount.toLocaleString('fr-MA')} MAD` : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] ?? 'bg-gray-100'}`}>
                          {STATUS_LABELS[d.status] ?? d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RowShareActionBar
                          entityLabel={`BL ${d.waybillNumber}`}
                          whatsAppMessage={`Suivi livraison ${d.waybillNumber} — statut: ${STATUS_LABELS[d.status] ?? d.status}${d.codAmount ? ` — COD ${d.codAmount} MAD` : ''}`}
                          whatsAppPhone={d.recipientPhone ?? undefined}
                          mailto={{
                            subject: `Suivi livraison ${d.waybillNumber}`,
                            body: `Bonjour,\n\nSuivi de votre livraison ${d.waybillNumber}.\nStatut: ${STATUS_LABELS[d.status] ?? d.status}${d.codAmount ? `\nMontant COD: ${d.codAmount} MAD` : ''}`,
                          }}
                          onCopySecureLink={async () => {
                            await navigator.clipboard.writeText(`${window.location.origin}/logistique`);
                          }}
                        >
                          {d.status === 'pending' && (
                            <button type="button" onClick={() => void updateStatus(d.id, 'in_transit')} className="text-xs text-blue-600 hover:underline shrink-0">Expédier</button>
                          )}
                          {d.status === 'in_transit' && (
                            <button type="button" onClick={() => void updateStatus(d.id, 'delivered')} className="text-xs text-green-600 hover:underline shrink-0">Livré</button>
                          )}
                          {d.codAmount > 0 && d.status === 'delivered' && (
                            <button type="button" onClick={() => void updateStatus(d.id, 'cod_collected', d.codAmount)} className="text-xs text-emerald-600 hover:underline shrink-0">Encaisser COD</button>
                          )}
                        </RowShareActionBar>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3">
              <div className="flex items-center gap-2"><Truck size={18} /><h3 className="font-semibold">Nouveau bon de livraison</h3></div>
              {(['waybillNumber', 'carrier', 'codAmount', 'recipientName', 'recipientPhone'] as const).map((field) => (
                <input
                  key={field}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  placeholder={{ waybillNumber: 'N° BL', carrier: 'Transporteur', codAmount: 'Montant COD (MAD)', recipientName: 'Destinataire', recipientPhone: 'Téléphone' }[field]}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" onClick={() => void createDelivery()} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">Créer</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
