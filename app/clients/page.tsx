'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Search, CheckCircle } from 'lucide-react';
import type { AtlasClient } from '@/app/types/atlas-client';
import type { AtlasPaymentTerms, AtlasPaymentTermsPreset } from '@/app/types/atlas-payment-terms';
import { normalizePaymentTerms, paymentTermsLabel } from '@/app/types/atlas-payment-terms';
import {
  atlasClientErrorMessage,
  deleteAtlasClient,
  listAtlasClients,
  readClientsFromLocalStorage,
  upsertAtlasClient,
  writeClientsToLocalStorage,
} from '@/app/lib/atlas-clients-repository';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { EmptyStateCta } from '@/app/components/ui/EmptyStateCta';
import { trackOnboardingMilestoneOnce } from '@/app/lib/atlas-onboarding-milestones';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';

export default function ClientsPage() {
  const [clients, setClients] = useState<AtlasClient[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<AtlasClient['id'] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);

  const [termsKind, setTermsKind] = useState<'30' | '60' | '90' | 'custom'>('30');
  const [termsCustomDays, setTermsCustomDays] = useState('45');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: 'Casablanca',
    balance: '0',
  });

  const reloadClients = useCallback(async () => {
    setLoadError('');
    if (isAtlasSupabaseDataEnabled()) {
      setLoading(true);
      try {
        const companyId = await getActiveCompanyDbRowId();
        setActiveCompanyId(companyId);
        if (!companyId) {
          setClients([]);
          setLoadError('Sélectionnez une société active dans Mes sociétés pour gérer vos clients.');
          return;
        }
        const list = await listAtlasClients({ companyId });
        setClients(list);
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(false);
    const existing = readClientsFromLocalStorage();
    setClients(existing);
  }, []);

  useEffect(() => {
    void reloadClients();
  }, [reloadClients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  const persistLocal = (next: AtlasClient[]) => {
    setClients(next);
    writeClientsToLocalStorage(next);
  };

  const resetForm = () => {
    setForm({ name: '', email: '', phone: '', address: '', city: 'Casablanca', balance: '0' });
    setTermsKind('30');
    setTermsCustomDays('45');
    setEditingId(null);
    setSaveError('');
  };

  const startCreate = () => {
    if (isAtlasSupabaseDataEnabled() && !activeCompanyId) {
      setSaveError('Sélectionnez d’abord une société active dans Mes sociétés.');
      return;
    }
    resetForm();
    setShowForm(true);
  };

  const startEdit = (c: AtlasClient) => {
    setForm({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      address: c.address ?? '',
      city: c.city ?? 'Casablanca',
      balance: String(c.balance ?? 0),
    });
    if (c.paymentTerms.kind === 'preset') {
      const d = c.paymentTerms.days;
      if (d === 30 || d === 60 || d === 90) {
        setTermsKind(String(d) as '30' | '60' | '90');
        setTermsCustomDays('45');
      } else {
        setTermsKind('custom');
        setTermsCustomDays(String(d ?? 0));
      }
    } else {
      setTermsKind('custom');
      setTermsCustomDays(String(c.paymentTerms.days ?? 0));
    }
    setEditingId(c.id);
    setShowForm(true);
  };

  const upsertClient = async () => {
    if (!form.name.trim()) return;
    setSaveError('');
    const paymentTerms: AtlasPaymentTerms =
      termsKind === 'custom'
        ? { kind: 'custom', days: Number.parseInt(termsCustomDays || '0', 10) || 0 }
        : { kind: 'preset', days: Number.parseInt(termsKind, 10) as AtlasPaymentTermsPreset };
    const normalized = normalizePaymentTerms(paymentTerms);
    const now = new Date().toISOString();
    const isUpdate = editingId != null;

    const payload: AtlasClient = {
      id: isUpdate ? editingId! : Date.now(),
      companyId: activeCompanyId ?? undefined,
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      paymentTerms: normalized,
      balance: Number.parseFloat(form.balance || '0') || 0,
      createdAt: isUpdate ? (clients.find((c) => c.id === editingId)?.createdAt ?? now) : now,
      updatedAt: now,
    };

    const wasFirst = !isUpdate && clients.length === 0;

    if (isAtlasSupabaseDataEnabled()) {
      const companyId = activeCompanyId ?? (await getActiveCompanyDbRowId());
      if (!companyId) {
        setSaveError(atlasClientErrorMessage('company_required'));
        return;
      }
      if (isUpdate && typeof payload.id !== 'string') {
        setSaveError(atlasClientErrorMessage('invalid_id'));
        return;
      }
      const supabasePayload: AtlasClient = isUpdate
        ? { ...payload, id: String(payload.id) }
        : { ...payload, id: '' };
      const res = await upsertAtlasClient(supabasePayload, { companyId, isUpdate });
      if (!res.ok) {
        setSaveError(atlasClientErrorMessage(res.error));
        return;
      }
      await reloadClients();
      if (wasFirst) trackOnboardingMilestoneOnce('atlas_ms_first_client', 'onboarding_first_client_created');
    } else {
      const next = isUpdate
        ? clients.map((c) => (c.id === editingId ? payload : c))
        : [...clients, payload];
      persistLocal(next);
      if (wasFirst) trackOnboardingMilestoneOnce('atlas_ms_first_client', 'onboarding_first_client_created');
    }

    resetForm();
    setShowForm(false);
  };

  const removeClient = async (id: AtlasClient['id']) => {
    setSaveError('');
    if (isAtlasSupabaseDataEnabled()) {
      const res = await deleteAtlasClient(id);
      if (!res.ok) {
        setSaveError(atlasClientErrorMessage(res.error));
        return;
      }
      await reloadClients();
      return;
    }
    persistLocal(clients.filter((c) => c.id !== id));
  };

  const totalBalance = useMemo(() => clients.reduce((sum, c) => sum + (c.balance || 0), 0), [clients]);

  const showEmpty = !loading && clients.length === 0 && !loadError;

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Clients</h1>
            <p className="text-xs text-gray-400 mt-0.5">Données clients · Délai de paiement · Balance</p>
          </div>
          <button
            onClick={() => (showForm ? setShowForm(false) : startCreate())}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660] transition-colors"
          >
            <Plus size={16} /> Nouveau client
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-10">Chargement des clients…</p>
          ) : null}
          {loadError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <a
                href="/companies"
                className="shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
              >
                Aller à Mes sociétés
              </a>
            </div>
          ) : null}
          {saveError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{saveError}</div>
          ) : null}
          {showEmpty && !showForm ? (
            <EmptyStateCta
              lang="fr"
              title="Aucun client"
              description="Ajoutez un client pour facturer et suivre les délais de paiement."
              primaryLabelFr="Ajouter maintenant"
              primaryLabelAr="ابدأ الآن"
              onPrimary={() => startCreate()}
            />
          ) : null}

          {showForm && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-200">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="font-semibold text-gray-700">
                  {editingId ? 'Modifier le client' : 'Nouveau client'}
                </h2>
                {editingId && (
                  <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle size={12} /> Edition
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Nom *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Société Alpha"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Balance (MAD)</label>
                  <input
                    value={form.balance}
                    onChange={(e) => setForm({ ...form, balance: e.target.value })}
                    type="number"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="contact@exemple.ma"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Téléphone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="05..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Ville</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Casablanca"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="col-span-3">
                  <label className="text-xs text-gray-400 mb-1 block">Adresse</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Rue, quartier, ... "
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Délai de paiement</label>
                  <div className="flex gap-2">
                    <select
                      value={termsKind}
                      onChange={(e) => setTermsKind(e.target.value as '30' | '60' | '90' | 'custom')}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    >
                      <option value="30">30 jours</option>
                      <option value="60">60 jours</option>
                      <option value="90">90 jours</option>
                      <option value="custom">Personnalisé</option>
                    </select>
                    {termsKind === 'custom' && (
                      <input
                        value={termsCustomDays}
                        onChange={(e) => setTermsCustomDays(e.target.value)}
                        placeholder="Jours"
                        type="number"
                        min={0}
                        className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                      />
                    )}
                  </div>
                </div>

                <div className="col-span-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => void upsertClient()}
                    className="px-6 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm hover:bg-[#243660]"
                  >
                    {editingId ? 'Enregistrer' : 'Ajouter'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowForm(false);
                    }}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && clients.length > 0 ? (
          <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Total clients</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{clients.length}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Balance totale</p>
              <p className={`text-2xl font-bold mt-1 ${totalBalance >= 0 ? 'text-amber-600' : 'text-blue-700'}`}>
                {Math.round(totalBalance).toLocaleString()} MAD
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400">Clients en crédit</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{clients.filter((c) => (c.balance || 0) > 0).length}</p>
            </div>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client…"
              className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-white"
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Délai</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                      Aucun résultat pour cette recherche.
                    </td>
                  </tr>
                ) : (
                filtered.map((c) => (
                  <tr key={String(c.id)} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-700">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.city ?? '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p className="truncate max-w-[18rem]">{c.email ?? '-'}</p>
                      <p className="text-xs text-gray-400">{c.phone ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{paymentTermsLabel(c.paymentTerms)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${(c.balance || 0) > 0 ? 'text-amber-700' : 'text-gray-700'}`}>
                      {Math.round(c.balance || 0).toLocaleString()} MAD
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="text-gray-300 hover:text-blue-500 transition-colors"
                          aria-label="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeClient(c.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          aria-label="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
          </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
