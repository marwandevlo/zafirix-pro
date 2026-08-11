'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  History,
  LayoutDashboard,
  Loader2,
  Package,
  Plus,
  Store,
  TrendingDown,
} from 'lucide-react';
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
import type {
  AtlasInventoryItem,
  AtlasInventoryStock,
  AtlasStockMovement,
  AtlasStockTransfer,
  AtlasStore,
  StockTransferStatus,
  StoreType,
} from '@/app/types/atlas-enterprise-modules';

type Tab = 'dashboard' | 'stock' | 'transfers' | 'movements';

type Summary = {
  totalUnits: number;
  totalValuation: number;
  lowStockCount: number;
  skuCount: number;
};

const MOVEMENT_LABELS: Record<string, string> = {
  in: 'Entrée',
  out: 'Sortie',
  adjustment: 'Ajustement',
  transfer_in: 'Transfert entrant',
  transfer_out: 'Transfert sortant',
  sale: 'Vente',
  usage: 'Usage interne',
  purchase: 'Achat',
  return: 'Retour',
};

const TRANSFER_STATUS_LABELS: Record<StockTransferStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  in_transit: 'En transit',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

function formatMad(n: number): string {
  return `${n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

export default function InventairePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stores, setStores] = useState<AtlasStore[]>([]);
  const [items, setItems] = useState<AtlasInventoryItem[]>([]);
  const [stock, setStock] = useState<(AtlasInventoryStock & { isLowStock?: boolean; valuation?: number })[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalUnits: 0, totalValuation: 0, lowStockCount: 0, skuCount: 0 });
  const [transfers, setTransfers] = useState<AtlasStockTransfer[]>([]);
  const [movements, setMovements] = useState<AtlasStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<string>('all');

  const [showStoreForm, setShowStoreForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [newStore, setNewStore] = useState({ name: '', code: '', address: '', storeType: 'point_of_sale' as StoreType });
  const [newItem, setNewItem] = useState({ sku: '', name: '', unit: 'unité', reorderLevel: 10, unitCost: 0, salePrice: 0, category: '' });
  const [newTransfer, setNewTransfer] = useState({ fromStoreId: '', toStoreId: '', notes: '', lines: [{ itemId: '', quantity: 1 }] });

  const loadDashboard = useCallback(async (cid: string) => {
    const [dash, tr] = await Promise.all([
      fetchEnterpriseModule<{
        stores?: AtlasStore[];
        items?: AtlasInventoryItem[];
        stock?: (AtlasInventoryStock & { isLowStock?: boolean; valuation?: number })[];
        summary?: Summary;
        lowStockCount?: number;
      }>(`/api/inventory?companyId=${encodeURIComponent(cid)}`),
      fetchEnterpriseModule<{ transfers?: AtlasStockTransfer[] }>(
        `/api/inventory?companyId=${encodeURIComponent(cid)}&view=transfers`,
      ),
    ]);
    if (!dash.ok) throw new Error(dash.error);
    setStores(dash.data.stores ?? []);
    setItems(dash.data.items ?? []);
    setStock(dash.data.stock ?? []);
    setSummary(dash.data.summary ?? {
      totalUnits: 0,
      totalValuation: 0,
      lowStockCount: dash.data.lowStockCount ?? 0,
      skuCount: (dash.data.items ?? []).length,
    });
    if (tr.ok) setTransfers(tr.data.transfers ?? []);
    if (dash.warning) setLoadError(dash.warning);
  }, []);

  const loadMovements = useCallback(async (cid: string) => {
    const result = await fetchEnterpriseModule<{ movements?: AtlasStockMovement[] }>(
      `/api/inventory?companyId=${encodeURIComponent(cid)}&view=movements`,
    );
    if (!result.ok) throw new Error(result.error);
    setMovements(result.data.movements ?? []);
  }, []);

  const load = useCallback(async (cid: string, activeTab: Tab = tab) => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadDashboard(cid);
      // Transfers already loaded with dashboard — only movements need a second round-trip.
      if (activeTab === 'movements') await loadMovements(cid);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement');
      setStores([]);
      setItems([]);
      setStock([]);
      setTransfers([]);
      setMovements([]);
    }
    setLoading(false);
  }, [tab, loadDashboard, loadMovements]);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid);
      else setLoading(false);
    })();
    const off = onCompanySwitched((cid) => {
      setCompanyId(cid);
      if (cid) void load(cid);
    });
    return off;
  }, [load]);

  useEffect(() => {
    if (!companyId) return;
    // Dashboard already hydrates transfers; only fetch movements on demand.
    if (tab === 'movements' && movements.length === 0) void loadMovements(companyId);
  }, [tab, companyId, loadMovements, movements.length]);

  const postInventory = async (payload: Record<string, unknown>) => {
    if (!companyId) return null;
    const res = await fetch('/api/inventory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...payload }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!json.ok) throw new Error(json.error ?? 'action_failed');
    return json;
  };

  const createStore = async () => {
    if (!newStore.name) return;
    await postInventory({ action: 'create_store', ...newStore });
    setShowStoreForm(false);
    setNewStore({ name: '', code: '', address: '', storeType: 'point_of_sale' });
    if (companyId) await load(companyId);
  };

  const createItem = async () => {
    if (!newItem.name || !newItem.sku) return;
    await postInventory({ action: 'create_item', ...newItem });
    setShowItemForm(false);
    setNewItem({ sku: '', name: '', unit: 'unité', reorderLevel: 10, unitCost: 0, salePrice: 0, category: '' });
    if (companyId) await load(companyId);
  };

  const adjustStock = async (storeId: string, itemId: string, quantity: number) => {
    await postInventory({ action: 'adjust_stock', storeId, itemId, quantity });
    if (companyId) await load(companyId);
  };

  const recordUsage = async (storeId: string, itemId: string) => {
    const qtyStr = window.prompt('Quantité consommée :', '1');
    if (!qtyStr) return;
    const quantity = Number(qtyStr);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    await postInventory({ action: 'record_usage', storeId, itemId, quantity });
    if (companyId) await load(companyId, 'movements');
    setTab('movements');
  };

  const createTransfer = async () => {
    const lines = newTransfer.lines.filter((l) => l.itemId && l.quantity > 0);
    if (!newTransfer.fromStoreId || !newTransfer.toStoreId || !lines.length) return;
    await postInventory({
      action: 'create_transfer',
      fromStoreId: newTransfer.fromStoreId,
      toStoreId: newTransfer.toStoreId,
      notes: newTransfer.notes,
      lines,
    });
    setShowTransferForm(false);
    setNewTransfer({ fromStoreId: '', toStoreId: '', notes: '', lines: [{ itemId: '', quantity: 1 }] });
    if (companyId) {
      await load(companyId, 'transfers');
      setTab('transfers');
    }
  };

  const updateTransfer = async (transferId: string, status: StockTransferStatus) => {
    await postInventory({ action: 'update_transfer', transferId, status });
    if (companyId) await load(companyId, 'transfers');
  };

  const filteredStock = useMemo(() => {
    if (storeFilter === 'all') return stock;
    return stock.filter((s) => s.storeId === storeFilter);
  }, [stock, storeFilter]);

  const lowStockRows = useMemo(() => stock.filter((s) => s.isLowStock), [stock]);

  const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'transfers', label: 'Transferts', icon: ArrowLeftRight },
    { id: 'movements', label: 'Mouvements', icon: History },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Stock & multi-magasins</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">Entrepôts, points de vente, transferts et valorisation COGS</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowStoreForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                <Store size={14} /> Magasin
              </button>
              <button type="button" onClick={() => setShowItemForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                <Plus size={14} /> Article
              </button>
              <button type="button" onClick={() => setShowTransferForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B2A4A] text-white hover:bg-[#0F1F3D]">
                <ArrowLeftRight size={14} /> Transfert
              </button>
            </div>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />

          {!companyId && !loading && <ModuleNoCompanyState moduleLabel="l'inventaire" />}

          <div className="flex gap-1 border-b border-gray-200">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === id ? 'border-[#1B2A4A] text-[#1B2A4A]' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {summary.lowStockCount > 0 && tab !== 'movements' && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="shrink-0" />
              <span><strong>{summary.lowStockCount}</strong> ligne(s) sous le seuil de réapprovisionnement</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16 text-gray-400"><Loader2 size={24} className="animate-spin" /></div>
          ) : (
            <>
              {tab === 'dashboard' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard label="Magasins actifs" value={String(stores.filter((s) => s.isActive).length)} />
                    <KpiCard label="Articles (SKU)" value={String(summary.skuCount)} />
                    <KpiCard label="Unités en stock" value={summary.totalUnits.toLocaleString('fr-MA')} />
                    <KpiCard label="Valorisation stock" value={formatMad(summary.totalValuation)} accent />
                  </div>

                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <TrendingDown size={16} className="text-amber-600" />
                        <h2 className="font-semibold text-sm text-gray-700">Alertes stock bas</h2>
                      </div>
                      {lowStockRows.length === 0 ? (
                        <p className="px-4 py-8 text-sm text-gray-400 text-center">Aucune alerte — stocks OK</p>
                      ) : (
                        <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                          {lowStockRows.map((s) => (
                            <li key={s.id} className="px-4 py-3 flex justify-between items-center text-sm">
                              <div>
                                <p className="font-medium text-gray-800">{s.itemName}</p>
                                <p className="text-xs text-gray-500">{s.storeName} · {s.itemSku}</p>
                              </div>
                              <span className="text-amber-700 font-semibold">{s.quantity} / {s.reorderLevel}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <ArrowLeftRight size={16} className="text-[#1B2A4A]" />
                        <h2 className="font-semibold text-sm text-gray-700">Transferts récents</h2>
                      </div>
                      {transfers.length === 0 ? (
                        <p className="px-4 py-8 text-sm text-gray-400 text-center">Aucun transfert — créez-en un</p>
                      ) : (
                        <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                          {transfers.slice(0, 5).map((t) => (
                            <li key={t.id} className="px-4 py-3 text-sm">
                              <p className="font-medium text-gray-800">{t.fromStoreName ?? t.fromStoreId} → {t.toStoreName ?? t.toStoreId}</p>
                              <p className="text-xs text-gray-500">{TRANSFER_STATUS_LABELS[t.status]} · {t.lines.length} article(s)</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'stock' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-500">Filtrer par magasin</label>
                    <select
                      value={storeFilter}
                      onChange={(e) => setStoreFilter(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
                    >
                      <option value="all">Tous les magasins</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                          <th className="px-4 py-3">Magasin</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Article</th>
                          <th className="px-4 py-3 text-right">Qté</th>
                          <th className="px-4 py-3 text-right">Coût unit.</th>
                          <th className="px-4 py-3 text-right">Valorisation</th>
                          <th className="px-4 py-3">Statut</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStock.map((s) => (
                          <tr key={s.id} className={`border-b border-gray-50 ${s.isLowStock ? 'bg-amber-50/40' : ''}`}>
                            <td className="px-4 py-3 text-gray-600">{s.storeName}</td>
                            <td className="px-4 py-3 font-mono text-xs">{s.itemSku}</td>
                            <td className="px-4 py-3 font-medium text-gray-700">{s.itemName}</td>
                            <td className="px-4 py-3 text-right font-semibold">{s.quantity}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{formatMad(s.unitCost ?? 0)}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{formatMad(s.valuation ?? 0)}</td>
                            <td className="px-4 py-3">
                              {s.isLowStock ? (
                                <span className="text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Stock bas</span>
                              ) : (
                                <span className="text-[10px] font-semibold uppercase bg-green-100 text-green-800 px-2 py-0.5 rounded-full">OK</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 justify-end flex-wrap">
                                <button type="button" onClick={() => void adjustStock(s.storeId, s.itemId, s.quantity + 1)} className="text-xs text-blue-600 hover:underline">+1</button>
                                <button type="button" onClick={() => void recordUsage(s.storeId, s.itemId)} className="text-xs text-orange-600 hover:underline">Usage</button>
                                <RowShareActionBar
                                  entityLabel={`${s.itemName} — ${s.storeName}`}
                                  whatsAppMessage={`Stock Zafirix Pro\n${s.itemName} (${s.itemSku}) @ ${s.storeName}\nQté: ${s.quantity} · Valo: ${formatMad(s.valuation ?? 0)}`}
                                  mailto={{
                                    subject: `Stock — ${s.itemSku}`,
                                    body: `${s.itemName} @ ${s.storeName}\nQuantité: ${s.quantity}\nValorisation: ${formatMad(s.valuation ?? 0)}`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                        {items.flatMap((item) =>
                          stores
                            .filter((store) => storeFilter === 'all' || store.id === storeFilter)
                            .map((store) => {
                              const existing = stock.find((s) => s.storeId === store.id && s.itemId === item.id);
                              if (existing) return null;
                              return (
                                <tr key={`${store.id}-${item.id}`} className="border-b border-gray-50 text-gray-400">
                                  <td className="px-4 py-2">{store.name}</td>
                                  <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                                  <td className="px-4 py-2">{item.name}</td>
                                  <td className="px-4 py-2 text-right">—</td>
                                  <td className="px-4 py-2 text-right">{formatMad(item.unitCost)}</td>
                                  <td className="px-4 py-2 text-right">—</td>
                                  <td className="px-4 py-2">—</td>
                                  <td className="px-4 py-2">
                                    <button type="button" onClick={() => void adjustStock(store.id, item.id, 0)} className="text-xs text-blue-600 hover:underline">Initialiser</button>
                                  </td>
                                </tr>
                              );
                            }),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'transfers' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                        <th className="px-4 py-3">Origine → Destination</th>
                        <th className="px-4 py-3">Articles</th>
                        <th className="px-4 py-3">Statut</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Aucun transfert en cours</td></tr>
                      )}
                      {transfers.map((t) => (
                        <tr key={t.id} className="border-b border-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800">{t.fromStoreName ?? '—'} → {t.toStoreName ?? '—'}</p>
                            {t.notes && <p className="text-xs text-gray-500 mt-0.5">{t.notes}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {t.lines.map((l) => (
                              <div key={l.itemId} className="text-xs">{l.itemSku ?? l.itemId} × {l.quantity}</div>
                            ))}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                              t.status === 'completed' ? 'bg-green-100 text-green-800'
                                : t.status === 'cancelled' ? 'bg-gray-100 text-gray-600'
                                  : 'bg-blue-100 text-blue-800'
                            }`}>
                              {TRANSFER_STATUS_LABELS[t.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{t.requestedAt.slice(0, 10)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 justify-end">
                              {t.status === 'pending' && (
                                <>
                                  <button type="button" onClick={() => void updateTransfer(t.id, 'approved')} className="text-xs text-blue-600 hover:underline">Approuver</button>
                                  <button type="button" onClick={() => void updateTransfer(t.id, 'completed')} className="text-xs text-green-600 hover:underline">Expédier</button>
                                  <button type="button" onClick={() => void updateTransfer(t.id, 'cancelled')} className="text-xs text-red-600 hover:underline">Annuler</button>
                                </>
                              )}
                              {t.status === 'approved' && (
                                <button type="button" onClick={() => void updateTransfer(t.id, 'completed')} className="text-xs text-green-600 hover:underline">Terminer</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'movements' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Magasin</th>
                        <th className="px-4 py-3">Article</th>
                        <th className="px-4 py-3 text-right">Δ Qté</th>
                        <th className="px-4 py-3 text-right">Coût</th>
                        <th className="px-4 py-3 text-right">Solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Aucun mouvement enregistré</td></tr>
                      )}
                      {movements.map((m) => (
                        <tr key={m.id} className="border-b border-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-500">{m.createdAt.slice(0, 16).replace('T', ' ')}</td>
                          <td className="px-4 py-3 text-gray-700">{MOVEMENT_LABELS[m.movementType] ?? m.movementType}</td>
                          <td className="px-4 py-3 text-gray-600">{m.storeName ?? m.storeId}</td>
                          <td className="px-4 py-3">{m.itemName ?? m.itemSku ?? m.itemId}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${m.quantityDelta < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatMad(m.totalCost)}</td>
                          <td className="px-4 py-3 text-right">{m.quantityAfter}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {showStoreForm && (
          <Modal title="Nouveau magasin / entrepôt" onClose={() => setShowStoreForm(false)} onSubmit={() => void createStore()}>
            <input value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} placeholder="Nom" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={newStore.code} onChange={(e) => setNewStore({ ...newStore, code: e.target.value })} placeholder="Code (ex: CAS01)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <select value={newStore.storeType} onChange={(e) => setNewStore({ ...newStore, storeType: e.target.value as StoreType })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="point_of_sale">Point de vente</option>
              <option value="warehouse">Entrepôt</option>
              <option value="both">Mixte</option>
            </select>
            <input value={newStore.address} onChange={(e) => setNewStore({ ...newStore, address: e.target.value })} placeholder="Adresse" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </Modal>
        )}

        {showItemForm && (
          <Modal title="Nouvel article" onClose={() => setShowItemForm(false)} onSubmit={() => void createItem()}>
            <input value={newItem.sku} onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })} placeholder="SKU" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Désignation" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={newItem.unitCost} onChange={(e) => setNewItem({ ...newItem, unitCost: Number(e.target.value) })} placeholder="Coût unitaire (MAD)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={newItem.reorderLevel} onChange={(e) => setNewItem({ ...newItem, reorderLevel: Number(e.target.value) })} placeholder="Seuil réappro." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <input value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} placeholder="Catégorie (optionnel)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </Modal>
        )}

        {showTransferForm && (
          <Modal title="Demande de transfert inter-magasins" onClose={() => setShowTransferForm(false)} onSubmit={() => void createTransfer()} submitLabel="Créer la demande">
            <select value={newTransfer.fromStoreId} onChange={(e) => setNewTransfer({ ...newTransfer, fromStoreId: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Magasin source</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={newTransfer.toStoreId} onChange={(e) => setNewTransfer({ ...newTransfer, toStoreId: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Magasin destination</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {newTransfer.lines.map((line, idx) => (
              <div key={idx} className="flex gap-2">
                <select
                  value={line.itemId}
                  onChange={(e) => {
                    const lines = [...newTransfer.lines];
                    lines[idx] = { ...lines[idx], itemId: e.target.value };
                    setNewTransfer({ ...newTransfer, lines });
                  }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Article</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                </select>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => {
                    const lines = [...newTransfer.lines];
                    lines[idx] = { ...lines[idx], quantity: Number(e.target.value) };
                    setNewTransfer({ ...newTransfer, lines });
                  }}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setNewTransfer({ ...newTransfer, lines: [...newTransfer.lines, { itemId: '', quantity: 1 }] })}
              className="text-xs text-blue-600 hover:underline"
            >
              + Ajouter une ligne
            </button>
            <textarea value={newTransfer.notes} onChange={(e) => setNewTransfer({ ...newTransfer, notes: e.target.value })} placeholder="Notes (optionnel)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
          </Modal>
        )}
      </main>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-xl font-bold mt-1 ${accent ? 'text-[#1B2A4A]' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Créer',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
          <button type="button" onClick={onSubmit} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}
