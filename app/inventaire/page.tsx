'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Package, Plus, Store } from 'lucide-react';
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

type StoreRow = { id: string; name: string; code: string; address: string | null; isActive: boolean };
type ItemRow = { id: string; sku: string; name: string; unit: string; reorderLevel: number };
type StockRow = {
  id: string; storeId: string; itemId: string; quantity: number;
  storeName: string; itemName: string; itemSku: string; reorderLevel: number; isLowStock: boolean;
};

export default function InventairePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [newStore, setNewStore] = useState({ name: '', code: '', address: '' });
  const [newItem, setNewItem] = useState({ sku: '', name: '', unit: 'unité', reorderLevel: 10 });

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchEnterpriseModule<{
      stores?: StoreRow[];
      items?: ItemRow[];
      stock?: StockRow[];
      lowStockCount?: number;
    }>(`/api/inventory?companyId=${encodeURIComponent(cid)}`);
    if (!result.ok) {
      setLoadError(result.error);
      setStores([]);
      setItems([]);
      setStock([]);
      setLowStockCount(0);
    } else {
      setStores(result.data.stores ?? []);
      setItems(result.data.items ?? []);
      setStock(result.data.stock ?? []);
      setLowStockCount(result.data.lowStockCount ?? 0);
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

  const createStore = async () => {
    if (!companyId || !newStore.name) return;
    await fetch('/api/inventory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_store', companyId, ...newStore }),
    });
    setShowStoreForm(false);
    setNewStore({ name: '', code: '', address: '' });
    await load(companyId);
  };

  const createItem = async () => {
    if (!companyId || !newItem.name || !newItem.sku) return;
    await fetch('/api/inventory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_item', companyId, ...newItem }),
    });
    setShowItemForm(false);
    setNewItem({ sku: '', name: '', unit: 'unité', reorderLevel: 10 });
    await load(companyId);
  };

  const adjustStock = async (storeId: string, itemId: string, quantity: number) => {
    if (!companyId) return;
    await fetch('/api/inventory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'adjust_stock', companyId, storeId, itemId, quantity }),
    });
    await load(companyId);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800">Inventaire multi-magasins</h1>
                <BetaSurfaceBadge />
              </div>
              <p className="text-sm text-gray-500 mt-1">Suivi des stocks par point de vente / entrepôt</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowStoreForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                <Store size={14} /> Magasin
              </button>
              <button type="button" onClick={() => setShowItemForm(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B2A4A] text-white hover:bg-[#0F1F3D]">
                <Plus size={14} /> Article
              </button>
            </div>
          </div>

          <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />

          {!companyId && !loading && (
            <ModuleNoCompanyState moduleLabel="l'inventaire" />
          )}

          {lowStockCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="shrink-0" />
              <span><strong>{lowStockCount}</strong> article(s) sous le seuil de réapprovisionnement</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16 text-gray-400"><Loader2 size={24} className="animate-spin" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <p className="text-xs text-gray-400">Magasins actifs</p>
                  <p className="text-2xl font-bold text-gray-800">{stores.filter((s) => s.isActive).length}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <p className="text-xs text-gray-400">Articles catalogués</p>
                  <p className="text-2xl font-bold text-gray-800">{items.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <p className="text-xs text-gray-400">Alertes stock bas</p>
                  <p className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>{lowStockCount}</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Package size={16} className="text-[#1B2A4A]" />
                  <h2 className="font-semibold text-sm text-gray-700">Stock par magasin</h2>
                </div>
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3">Magasin</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Article</th>
                      <th className="px-4 py-3 text-right">Quantité</th>
                      <th className="px-4 py-3 text-right">Seuil</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.length === 0 && items.length > 0 && stores.length > 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Aucun stock enregistré — ajustez les quantités ci-dessous</td></tr>
                    )}
                    {stock.map((s) => (
                      <tr key={s.id} className={`border-b border-gray-50 ${s.isLowStock ? 'bg-amber-50/40' : ''}`}>
                        <td className="px-4 py-3 text-gray-600">{s.storeName}</td>
                        <td className="px-4 py-3 font-mono text-xs">{s.itemSku}</td>
                        <td className="px-4 py-3 font-medium text-gray-700">{s.itemName}</td>
                        <td className="px-4 py-3 text-right font-semibold">{s.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{s.reorderLevel}</td>
                        <td className="px-4 py-3">
                          {s.isLowStock ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Stock bas</span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-800 px-2 py-0.5 rounded-full">OK</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end flex-wrap">
                            <button type="button" onClick={() => void adjustStock(s.storeId, s.itemId, s.quantity + 1)} className="text-xs text-blue-600 hover:underline shrink-0">+1</button>
                            <RowShareActionBar
                              entityLabel={`${s.itemName} — ${s.storeName}`}
                              whatsAppMessage={
                                s.isLowStock
                                  ? `Alerte stock bas Zafirix Pro\n${s.itemName} (${s.itemSku}) — ${s.storeName}\nQuantité: ${s.quantity} (seuil: ${s.reorderLevel})`
                                  : `Stock Zafirix Pro\n${s.itemName} (${s.itemSku}) — ${s.storeName}: ${s.quantity} unités`
                              }
                              mailto={{
                                subject: s.isLowStock ? `Alerte stock bas — ${s.itemSku}` : `Stock — ${s.itemSku}`,
                                body: `${s.itemName} @ ${s.storeName}\nQuantité: ${s.quantity}\nSeuil: ${s.reorderLevel}`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.flatMap((item) =>
                      stores.map((store) => {
                        const existing = stock.find((s) => s.storeId === store.id && s.itemId === item.id);
                        if (existing) return null;
                        return (
                          <tr key={`${store.id}-${item.id}`} className="border-b border-gray-50 text-gray-400">
                            <td className="px-4 py-2">{store.name}</td>
                            <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                            <td className="px-4 py-2">{item.name}</td>
                            <td className="px-4 py-2 text-right">—</td>
                            <td className="px-4 py-2 text-right">{item.reorderLevel}</td>
                            <td className="px-4 py-2">—</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5 justify-end flex-wrap">
                                <button type="button" onClick={() => void adjustStock(store.id, item.id, 0)} className="text-xs text-blue-600 hover:underline shrink-0">Initialiser</button>
                                <RowShareActionBar
                                  entityLabel={`${item.name} — ${store.name}`}
                                  whatsAppMessage={`Stock Zafirix Pro\n${item.name} (${item.sku}) — ${store.name}\nQuantité non initialisée (seuil: ${item.reorderLevel})`}
                                  mailto={{
                                    subject: `Stock — ${item.sku}`,
                                    body: `${item.name} @ ${store.name}\nStock à initialiser.\nSeuil: ${item.reorderLevel}`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {showStoreForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Nouveau magasin</h3>
              <input value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} placeholder="Nom du magasin" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={newStore.code} onChange={(e) => setNewStore({ ...newStore, code: e.target.value })} placeholder="Code (ex: CAS01)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={newStore.address} onChange={(e) => setNewStore({ ...newStore, address: e.target.value })} placeholder="Adresse" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowStoreForm(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" onClick={() => void createStore()} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">Créer</button>
              </div>
            </div>
          </div>
        )}

        {showItemForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Nouvel article</h3>
              <input value={newItem.sku} onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })} placeholder="SKU" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Désignation" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={newItem.reorderLevel} onChange={(e) => setNewItem({ ...newItem, reorderLevel: Number(e.target.value) })} placeholder="Seuil réappro." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowItemForm(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
                <button type="button" onClick={() => void createItem()} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">Créer</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
