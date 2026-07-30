'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, Package, Plus, Truck, Users } from 'lucide-react';
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
import type { AtlasDelivery, AtlasDeliveryPartner } from '@/app/types/atlas-enterprise-modules';
import { deliveryStatusColor, deliveryStatusLabel } from '@/app/lib/atlas-logistics';

export default function LogistiquePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<AtlasDelivery[]>([]);
  const [partners, setPartners] = useState<AtlasDeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    partnerId: '',
    waybillNumber: '',
    trackingId: '',
    carrier: '',
    codAmount: '',
    recipientName: '',
    recipientPhone: '',
    invoiceId: '',
    notes: '',
  });
  const [partnerForm, setPartnerForm] = useState({ name: '', code: '', phone: '', trackingUrlTemplate: '' });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const [delResult, partnerResult] = await Promise.all([
      fetchEnterpriseModule<{ deliveries?: AtlasDelivery[] }>(
        `/api/logistics/deliveries?companyId=${encodeURIComponent(cid)}&includeEvents=1`,
      ),
      fetchEnterpriseModule<{ partners?: AtlasDeliveryPartner[] }>(
        `/api/logistics/partners?companyId=${encodeURIComponent(cid)}`,
      ),
    ]);

    if (!delResult.ok) {
      setLoadError(delResult.error);
      setDeliveries([]);
    } else {
      setDeliveries(delResult.data.deliveries ?? []);
      if (delResult.warning) setLoadError(delResult.warning);
    }

    if (partnerResult.ok) {
      setPartners(partnerResult.data.partners ?? []);
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
    if (!companyId || !form.waybillNumber.trim()) return;
    await fetch('/api/logistics/deliveries', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        partnerId: form.partnerId || undefined,
        waybillNumber: form.waybillNumber.trim(),
        trackingId: form.trackingId.trim() || undefined,
        carrier: form.carrier || undefined,
        codAmount: Number(form.codAmount) || 0,
        recipientName: form.recipientName || undefined,
        recipientPhone: form.recipientPhone || undefined,
        invoiceId: form.invoiceId.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
    });
    setShowForm(false);
    setForm({ partnerId: '', waybillNumber: '', trackingId: '', carrier: '', codAmount: '', recipientName: '', recipientPhone: '', invoiceId: '', notes: '' });
    await load(companyId);
  };

  const createPartner = async () => {
    if (!companyId || !partnerForm.name.trim()) return;
    await fetch('/api/logistics/partners', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...partnerForm }),
    });
    setShowPartnerForm(false);
    setPartnerForm({ name: '', code: '', phone: '', trackingUrlTemplate: '' });
    await load(companyId);
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch('/api/logistics/deliveries', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (companyId) await load(companyId);
  };

  const reconcileCod = async (d: AtlasDelivery) => {
    if (!companyId) return;
    await fetch('/api/logistics/cod-reconciliation', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        deliveryId: d.id,
        collectedAmount: d.codAmount,
        collectionMethod: 'cash',
        recordInvoicePayment: !!d.invoiceId,
      }),
    });
    if (companyId) await load(companyId);
  };

  const pendingCod = deliveries
    .filter((d) => d.status !== 'cod_collected' && d.codAmount > 0)
    .reduce((s, d) => s + d.codAmount - d.codCollected, 0);

  const selected = deliveries.find((d) => d.id === selectedId) ?? null;

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
              <p className="text-sm text-gray-500 mt-1">Expéditions, transporteurs et rapprochement contre-remboursement</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowPartnerForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border bg-white">
                <Users size={14} /> Transporteur
              </button>
              <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B2A4A] text-white">
                <Plus size={14} /> Nouveau BL
              </button>
            </div>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="la logistique" />}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Expéditions actives</p>
              <p className="text-2xl font-bold">{deliveries.filter((d) => !['delivered', 'cod_collected', 'cancelled'].includes(d.status)).length}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">COD en attente</p>
              <p className="text-2xl font-bold text-amber-600">{pendingCod.toLocaleString('fr-MA')} MAD</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Transporteurs</p>
              <p className="text-2xl font-bold">{partners.length}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">Total expéditions</p>
              <p className="text-2xl font-bold">{deliveries.length}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b bg-gray-50">
                      <th className="px-4 py-3">N° BL / Suivi</th>
                      <th className="px-4 py-3">Facture</th>
                      <th className="px-4 py-3">Transporteur</th>
                      <th className="px-4 py-3 text-right">COD</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Aucune expédition — créez un bon de livraison ou liez une facture</td></tr>
                    )}
                    {deliveries.map((d) => (
                      <tr
                        key={d.id}
                        className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${selectedId === d.id ? 'bg-blue-50/50' : ''}`}
                        onClick={() => setSelectedId(d.id)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{d.waybillNumber}</p>
                          {d.trackingId && <p className="text-[10px] font-mono text-gray-400">{d.trackingId}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {d.invoiceNumber ? (
                            <span>{d.invoiceNumber}{d.invoiceClient ? ` · ${d.invoiceClient}` : ''}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{d.partnerName ?? d.carrier ?? '—'}</td>
                        <td className="px-4 py-3 text-right">{d.codAmount > 0 ? `${d.codAmount.toLocaleString('fr-MA')} MAD` : '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${deliveryStatusColor(d.status)}`}>
                            {deliveryStatusLabel(d.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <RowShareActionBar
                            entityLabel={`BL ${d.waybillNumber}`}
                            whatsAppMessage={`Suivi ${d.waybillNumber}${d.trackingId ? ` (${d.trackingId})` : ''} — ${deliveryStatusLabel(d.status)}`}
                            whatsAppPhone={d.recipientPhone ?? undefined}
                            mailto={{
                              subject: `Suivi livraison ${d.waybillNumber}`,
                              body: `Statut: ${deliveryStatusLabel(d.status)}${d.codAmount ? `\nCOD: ${d.codAmount} MAD` : ''}`,
                            }}
                            onCopySecureLink={async () => {
                              await navigator.clipboard.writeText(d.trackingUrl ?? `${window.location.origin}/logistique`);
                            }}
                          >
                            {d.status === 'pending' && (
                              <button type="button" onClick={() => void updateStatus(d.id, 'in_transit')} className="text-xs text-blue-600 hover:underline shrink-0">Expédier</button>
                            )}
                            {d.status === 'in_transit' && (
                              <button type="button" onClick={() => void updateStatus(d.id, 'delivered')} className="text-xs text-green-600 hover:underline shrink-0">Livré</button>
                            )}
                            {d.codAmount > 0 && d.status === 'delivered' && (
                              <button type="button" onClick={() => void reconcileCod(d)} className="text-xs text-emerald-600 hover:underline shrink-0">Rapprocher COD</button>
                            )}
                          </RowShareActionBar>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-4 min-h-[280px]">
                <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Package size={16} /> Détail expédition
                </h2>
                {!selected ? (
                  <p className="text-sm text-gray-400">Sélectionnez une expédition pour voir le suivi et le rapprochement COD.</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Statut</p>
                      <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${deliveryStatusColor(selected.status)}`}>
                        {deliveryStatusLabel(selected.status)}
                      </span>
                    </div>
                    {selected.trackingUrl && (
                      <a href={selected.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 text-xs hover:underline">
                        Ouvrir suivi transporteur <ExternalLink size={12} />
                      </a>
                    )}
                    {selected.codAmount > 0 && (
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs">
                        <p className="font-medium text-amber-800">COD: {selected.codAmount.toLocaleString('fr-MA')} MAD</p>
                        <p className="text-amber-700 mt-0.5">Encaissé: {selected.codCollected.toLocaleString('fr-MA')} MAD</p>
                      </div>
                    )}
                    {selected.trackingEvents && selected.trackingEvents.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Historique</p>
                        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                          {selected.trackingEvents.map((ev) => (
                            <li key={ev.id} className="text-xs text-gray-600 border-l-2 border-gray-200 pl-2">
                              <span className="font-medium">{deliveryStatusLabel(ev.status)}</span>
                              {ev.note && <span className="text-gray-400"> — {ev.note}</span>}
                              <p className="text-[10px] text-gray-400">{new Date(ev.recordedAt).toLocaleString('fr-FR')}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selected.codReconciliations && selected.codReconciliations.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Rapprochements COD</p>
                        {selected.codReconciliations.map((r) => (
                          <div key={r.id} className="text-xs text-gray-600 border rounded p-2 mb-1">
                            {r.collectedAmount.toLocaleString('fr-MA')} MAD · écart {r.varianceAmount.toLocaleString('fr-MA')}
                            <p className="text-[10px] text-gray-400">{new Date(r.reconciledAt).toLocaleString('fr-FR')}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-2"><Truck size={18} /><h3 className="font-semibold">Nouveau bon de livraison</h3></div>
              <select value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Transporteur (optionnel)</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {(['waybillNumber', 'trackingId', 'invoiceId', 'carrier', 'codAmount', 'recipientName', 'recipientPhone', 'notes'] as const).map((field) => (
                <input
                  key={field}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  placeholder={{
                    waybillNumber: 'N° BL *',
                    trackingId: 'ID suivi transporteur',
                    invoiceId: 'UUID facture (optionnel)',
                    carrier: 'Transporteur (si manuel)',
                    codAmount: 'Montant COD (MAD)',
                    recipientName: 'Destinataire',
                    recipientPhone: 'Téléphone',
                    notes: 'Notes',
                  }[field]}
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

        {showPartnerForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3">
              <h3 className="font-semibold">Nouveau transporteur</h3>
              <input value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} placeholder="Nom *" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input value={partnerForm.code} onChange={(e) => setPartnerForm({ ...partnerForm, code: e.target.value })} placeholder="Code" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="Téléphone" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input value={partnerForm.trackingUrlTemplate} onChange={(e) => setPartnerForm({ ...partnerForm, trackingUrlTemplate: e.target.value })} placeholder="URL suivi (ex: https://carrier.ma/track/{tracking_id})" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowPartnerForm(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" onClick={() => void createPartner()} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">Enregistrer</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
