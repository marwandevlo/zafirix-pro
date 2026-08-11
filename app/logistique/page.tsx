'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ExternalLink, Package, Plus, Truck, Users } from 'lucide-react';
import { ModuleAppShell } from '@/app/components/shell/ModuleAppShell';
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

function LogisticsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Chargement logistique">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 h-20">
            <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-6 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border h-72" />
        <div className="bg-white rounded-xl border h-72" />
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4 shadow-sm">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? ''}`}>{value}</p>
    </div>
  );
}

export default function LogistiquePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<AtlasDelivery[]>([]);
  const [partners, setPartners] = useState<AtlasDeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loadGenRef = useRef(0);
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
    const gen = ++loadGenRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [delResult, partnerResult] = await Promise.all([
        fetchEnterpriseModule<{ deliveries?: AtlasDelivery[]; warning?: string }>(
          `/api/logistics/deliveries?companyId=${encodeURIComponent(cid)}&includeEvents=1`,
        ),
        fetchEnterpriseModule<{ partners?: AtlasDeliveryPartner[]; warning?: string }>(
          `/api/logistics/partners?companyId=${encodeURIComponent(cid)}`,
        ),
      ]);

      if (gen !== loadGenRef.current) return;

      const warnings: string[] = [];

      if (!delResult.ok) {
        setDeliveries([]);
        warnings.push(delResult.error);
      } else {
        setDeliveries(delResult.data.deliveries ?? []);
        if (delResult.warning) warnings.push(delResult.warning);
      }

      if (!partnerResult.ok) {
        setPartners([]);
        // Partners missing shouldn't blank the whole module if deliveries loaded.
        if (delResult.ok) {
          warnings.push(`Transporteurs: ${partnerResult.error}`);
        } else {
          warnings.push(partnerResult.error);
        }
      } else {
        setPartners(partnerResult.data.partners ?? []);
        if (partnerResult.warning) warnings.push(partnerResult.warning);
      }

      setLoadError(warnings.length ? warnings[0] : null);
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      console.error('[logistique] load failed', err);
      setLoadError('Impossible de charger la logistique. Réessayez.');
      setDeliveries([]);
      setPartners([]);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      if (cancelled) return;
      setCompanyId(cid);
      if (cid) await load(cid);
      else setLoading(false);
    })();
    const off = onCompanySwitched((cid) => {
      setCompanyId(cid);
      setSelectedId(null);
      if (cid) void load(cid);
      else {
        setDeliveries([]);
        setPartners([]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      off();
      loadGenRef.current += 1;
    };
  }, [load]);

  const kpis = useMemo(() => {
    const active = deliveries.filter((d) => !['delivered', 'cod_collected', 'cancelled'].includes(d.status)).length;
    const pendingCod = deliveries
      .filter((d) => d.status !== 'cod_collected' && d.codAmount > 0)
      .reduce((s, d) => s + d.codAmount - d.codCollected, 0);
    return {
      active,
      pendingCod,
      partners: partners.length,
      total: deliveries.length,
    };
  }, [deliveries, partners.length]);

  const selected = useMemo(
    () => deliveries.find((d) => d.id === selectedId) ?? null,
    [deliveries, selectedId],
  );

  const parseActionError = async (res: Response): Promise<string> => {
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string; warning?: string };
    return json.message ?? json.warning ?? json.error ?? `Erreur HTTP ${res.status}`;
  };

  const createDelivery = async () => {
    if (!companyId || !form.waybillNumber.trim() || mutating) return;
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch('/api/logistics/deliveries', {
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
      if (!res.ok) {
        setActionError(await parseActionError(res));
        return;
      }
      setShowForm(false);
      setForm({
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
      await load(companyId);
    } catch (err) {
      console.error('[logistique] createDelivery', err);
      setActionError('Création du BL impossible. Vérifiez la connexion.');
    } finally {
      setMutating(false);
    }
  };

  const createPartner = async () => {
    if (!companyId || !partnerForm.name.trim() || mutating) return;
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch('/api/logistics/partners', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...partnerForm }),
      });
      if (!res.ok) {
        setActionError(await parseActionError(res));
        return;
      }
      setShowPartnerForm(false);
      setPartnerForm({ name: '', code: '', phone: '', trackingUrlTemplate: '' });
      await load(companyId);
    } catch (err) {
      console.error('[logistique] createPartner', err);
      setActionError('Création du transporteur impossible.');
    } finally {
      setMutating(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (!companyId || mutating) return;
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch('/api/logistics/deliveries', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        setActionError(await parseActionError(res));
        return;
      }
      await load(companyId);
    } catch (err) {
      console.error('[logistique] updateStatus', err);
      setActionError('Mise à jour du statut impossible.');
    } finally {
      setMutating(false);
    }
  };

  const reconcileCod = async (d: AtlasDelivery) => {
    if (!companyId || mutating) return;
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch('/api/logistics/cod-reconciliation', {
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
      if (!res.ok) {
        setActionError(await parseActionError(res));
        return;
      }
      await load(companyId);
    } catch (err) {
      console.error('[logistique] reconcileCod', err);
      setActionError('Rapprochement COD impossible.');
    } finally {
      setMutating(false);
    }
  };

  const migrationHint =
    loadError?.includes('migration') || loadError?.includes('déploiement')
      ? 'Appliquez les migrations logistique (npm run apply:production-migrations) puis rechargez.'
      : null;

  return (
    <ModuleAppShell
      title="Logistique & COD"
      subtitle="Expéditions, transporteurs et rapprochement contre-remboursement"
      headerActions={
        <>
          <BetaSurfaceBadge className="hidden sm:block" />
          <button
            type="button"
            disabled={!companyId || loading || mutating}
            onClick={() => setShowPartnerForm(true)}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium rounded-xl border bg-white disabled:opacity-50"
          >
            <Users size={14} /> Transporteur
          </button>
          <button
            type="button"
            disabled={!companyId || loading || mutating}
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium rounded-xl bg-[#1B2A4A] text-white disabled:opacity-50"
          >
            <Plus size={14} /> Nouveau BL
          </button>
        </>
      }
    >
      <div className="space-y-6">
          <BetaSurfaceBadge className="sm:hidden" />
          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
          {migrationHint && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p>{migrationHint}</p>
            </div>
          )}
          {actionError && (
            <ModuleLoadErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
          )}
          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="la logistique" />}

          {loading ? (
            <LogisticsSkeleton />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Expéditions actives" value={kpis.active} />
                <KpiCard
                  label="COD en attente"
                  value={`${kpis.pendingCod.toLocaleString('fr-MA')} MAD`}
                  accent="text-amber-600"
                />
                <KpiCard label="Transporteurs" value={kpis.partners} />
                <KpiCard label="Total expéditions" value={kpis.total} />
              </div>

              <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 ${mutating ? 'opacity-70 pointer-events-none' : ''}`}>
                {/* Mobile cards */}
                <div className="lg:hidden space-y-3">
                  {deliveries.length === 0 ? (
                    <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
                      {loadError
                        ? 'Données indisponibles pour le moment.'
                        : 'Aucune expédition — créez un bon de livraison'}
                    </div>
                  ) : (
                    deliveries.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedId(d.id)}
                        className={`w-full text-left rounded-xl border bg-white p-4 shadow-sm active:bg-gray-50 ${
                          selectedId === d.id ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{d.waybillNumber}</p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {d.partnerName ?? d.carrier ?? 'Sans transporteur'}
                              {d.invoiceNumber ? ` · ${d.invoiceNumber}` : ''}
                            </p>
                          </div>
                          <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${deliveryStatusColor(d.status)}`}>
                            {deliveryStatusLabel(d.status)}
                          </span>
                        </div>
                        {d.codAmount > 0 && (
                          <p className="text-sm font-medium text-amber-700 mt-2">
                            COD {d.codAmount.toLocaleString('fr-MA')} MAD
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                          {d.status === 'pending' && (
                            <button type="button" onClick={() => void updateStatus(d.id, 'in_transit')} className="min-h-10 px-3 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium">
                              Expédier
                            </button>
                          )}
                          {d.status === 'in_transit' && (
                            <button type="button" onClick={() => void updateStatus(d.id, 'delivered')} className="min-h-10 px-3 rounded-lg bg-green-50 text-green-700 text-xs font-medium">
                              Livré
                            </button>
                          )}
                          {d.codAmount > 0 && d.status === 'delivered' && (
                            <button type="button" onClick={() => void reconcileCod(d)} className="min-h-10 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium">
                              Rapprocher COD
                            </button>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                  {selected && (
                    <div className="rounded-xl border bg-white p-4 space-y-2 text-sm">
                      <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Package size={16} /> Détail</h2>
                      {selected.trackingUrl && (
                        <a href={selected.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 text-xs min-h-10">
                          Suivi transporteur <ExternalLink size={12} />
                        </a>
                      )}
                      {selected.trackingEvents && selected.trackingEvents.length > 0 && (
                        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                          {selected.trackingEvents.map((ev) => (
                            <li key={ev.id} className="text-xs text-gray-600 border-l-2 border-gray-200 pl-2">
                              <span className="font-medium">{deliveryStatusLabel(ev.status)}</span>
                              <p className="text-[10px] text-gray-400">{new Date(ev.recordedAt).toLocaleString('fr-FR')}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden lg:block lg:col-span-2 bg-white rounded-xl shadow-sm border overflow-x-auto mobile-scroll-x">
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
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                            {loadError
                              ? 'Données indisponibles pour le moment — la liste s’affichera après migration / reconnexion.'
                              : 'Aucune expédition — créez un bon de livraison ou liez une facture'}
                          </td>
                        </tr>
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
                          <td className="px-4 py-3 text-right">
                            {d.codAmount > 0 ? `${d.codAmount.toLocaleString('fr-MA')} MAD` : '—'}
                          </td>
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
                                <button type="button" onClick={() => void updateStatus(d.id, 'in_transit')} className="text-xs text-blue-600 hover:underline shrink-0">
                                  Expédier
                                </button>
                              )}
                              {d.status === 'in_transit' && (
                                <button type="button" onClick={() => void updateStatus(d.id, 'delivered')} className="text-xs text-green-600 hover:underline shrink-0">
                                  Livré
                                </button>
                              )}
                              {d.codAmount > 0 && d.status === 'delivered' && (
                                <button type="button" onClick={() => void reconcileCod(d)} className="text-xs text-emerald-600 hover:underline shrink-0">
                                  Rapprocher COD
                                </button>
                              )}
                            </RowShareActionBar>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="hidden lg:block bg-white rounded-xl shadow-sm border p-4 min-h-[280px]">
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
            </>
          )}
      </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-2"><Truck size={18} /><h3 className="font-semibold">Nouveau bon de livraison</h3></div>
              <select value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm min-h-11">
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm min-h-11"
                />
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={mutating} onClick={() => setShowForm(false)} className="min-h-11 px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" disabled={mutating || !form.waybillNumber.trim()} onClick={() => void createDelivery()} className="min-h-11 px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-xl disabled:opacity-50">
                  {mutating ? 'Création…' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showPartnerForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md p-6 space-y-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <h3 className="font-semibold">Nouveau transporteur</h3>
              <input value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} placeholder="Nom *" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <input value={partnerForm.code} onChange={(e) => setPartnerForm({ ...partnerForm, code: e.target.value })} placeholder="Code" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <input value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="Téléphone" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <input value={partnerForm.trackingUrlTemplate} onChange={(e) => setPartnerForm({ ...partnerForm, trackingUrlTemplate: e.target.value })} placeholder="URL suivi (ex: https://carrier.ma/track/{tracking_id})" className="w-full border rounded-xl px-3 py-3 text-sm min-h-11" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={mutating} onClick={() => setShowPartnerForm(false)} className="min-h-11 px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" disabled={mutating || !partnerForm.name.trim()} onClick={() => void createPartner()} className="min-h-11 px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-xl disabled:opacity-50">
                  {mutating ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
    </ModuleAppShell>
  );
}
