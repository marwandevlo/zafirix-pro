'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FolderPlus, Loader2, Plus, Scale, Trash2 } from 'lucide-react';
import AdminShell from '@/app/admin/_components/AdminShell';
import { supabase } from '@/app/lib/supabase';
import type { JuridiqueCategory, JuridiqueDocumentType } from '@/app/types/atlas-juridique-categories';
import { juridiqueLabel } from '@/app/types/atlas-juridique-categories';

async function adminFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  return fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export default function JuridiqueAdminClient() {
  const [catalog, setCatalog] = useState<JuridiqueCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newCat, setNewCat] = useState({ labelFr: '', labelAr: '', descriptionFr: '', descriptionAr: '' });
  const [newDocType, setNewDocType] = useState<Record<string, { labelFr: string; labelAr: string; isRequired: boolean }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/juridique/catalog');
      const json = (await res.json()) as { catalog?: JuridiqueCategory[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Erreur chargement');
      setCatalog(json.catalog ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const moveCategory = async (index: number, direction: -1 | 1) => {
    const next = [...catalog];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setCatalog(next);
    const res = await adminFetch('/api/admin/juridique/catalog', {
      method: 'POST',
      body: JSON.stringify({ action: 'reorder', orderedCategoryIds: next.map((c) => c.id) }),
    });
    if (!res.ok) void load();
  };

  const createCategory = async () => {
    if (!newCat.labelFr.trim() || !newCat.labelAr.trim()) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/juridique/catalog', {
        method: 'POST',
        body: JSON.stringify({ category: newCat }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Création échouée');
      setNewCat({ labelFr: '', labelAr: '', descriptionFr: '', descriptionAr: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const patchCategory = async (categoryId: string, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/juridique/catalog', {
        method: 'PATCH',
        body: JSON.stringify({ categoryId, patch }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Mise à jour échouée');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!confirm('Supprimer cette section juridique ?')) return;
    const res = await adminFetch(`/api/admin/juridique/catalog?categoryId=${encodeURIComponent(categoryId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Suppression impossible');
      return;
    }
    await load();
  };

  const createDocType = async (categoryId: string) => {
    const draft = newDocType[categoryId];
    if (!draft?.labelFr.trim() || !draft.labelAr.trim()) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/juridique/catalog', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_document_type',
          documentType: { categoryId, ...draft },
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Création type échouée');
      }
      setNewDocType((prev) => ({ ...prev, [categoryId]: { labelFr: '', labelAr: '', isRequired: false } }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const patchDocType = async (documentTypeId: string, patch: Record<string, unknown>) => {
    const res = await adminFetch('/api/admin/juridique/catalog', {
      method: 'PATCH',
      body: JSON.stringify({ documentTypeId, patch }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Mise à jour type échouée');
      return;
    }
    await load();
  };

  const deleteDocType = async (documentTypeId: string) => {
    if (!confirm('Supprimer ce type de document ?')) return;
    const res = await adminFetch(
      `/api/admin/juridique/catalog?documentTypeId=${encodeURIComponent(documentTypeId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Suppression impossible');
      return;
    }
    await load();
  };

  return (
    <AdminShell title="Admin · Juridique">
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1B2A4A]/10 flex items-center justify-center text-[#1B2A4A]">
              <Scale size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Catalogue Juridique · Morocco compliance</p>
              <p className="text-xs text-gray-500 mt-1">
                Sections RC, Patente, IF, ICE, Statuts, PV, Contrats, Conventions — FR/AR · types requis/optionnels
              </p>
            </div>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
        ) : null}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FolderPlus size={16} /> Nouvelle section / dossier
          </p>
          <div className="mt-4 grid md:grid-cols-2 gap-3">
            <input
              value={newCat.labelFr}
              onChange={(e) => setNewCat((p) => ({ ...p, labelFr: e.target.value }))}
              placeholder="Libellé FR (ex. Registre de Commerce)"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              value={newCat.labelAr}
              onChange={(e) => setNewCat((p) => ({ ...p, labelAr: e.target.value }))}
              placeholder="Libellé AR (ex. السجل التجاري)"
              dir="rtl"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              value={newCat.descriptionFr}
              onChange={(e) => setNewCat((p) => ({ ...p, descriptionFr: e.target.value }))}
              placeholder="Description FR"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              value={newCat.descriptionAr}
              onChange={(e) => setNewCat((p) => ({ ...p, descriptionAr: e.target.value }))}
              placeholder="Description AR"
              dir="rtl"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm md:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void createCategory()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1B2A4A] text-white text-sm font-semibold disabled:opacity-50"
          >
            <Plus size={14} /> Ajouter la section
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Sections juridiques ({catalog.length})</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-16 text-gray-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {catalog.map((cat, index) => {
                const expanded = expandedId === cat.id;
                const draft = newDocType[cat.id] ?? { labelFr: '', labelAr: '', isRequired: false };
                return (
                  <div key={cat.id} className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-1 pt-1">
                        <button type="button" onClick={() => void moveCategory(index, -1)} className="text-gray-400 hover:text-gray-700">
                          <ChevronUp size={14} />
                        </button>
                        <button type="button" onClick={() => void moveCategory(index, 1)} className="text-gray-400 hover:text-gray-700">
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">{cat.labelFr}</p>
                          <span className="text-xs text-gray-400 font-mono">{cat.slug}</span>
                          {cat.isSystem ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                              Système
                            </span>
                          ) : null}
                          {!cat.isActive ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Inactif</span>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5" dir="rtl">
                          {cat.labelAr}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{cat.descriptionFr}</p>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : cat.id)}
                          className="mt-2 text-xs font-semibold text-[#1B2A4A] hover:underline"
                        >
                          {expanded ? 'Masquer les types' : `Gérer les types (${cat.documentTypes.length})`}
                        </button>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void patchCategory(cat.id, { isActive: !cat.isActive })
                          }
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          {cat.isActive ? 'Désactiver' : 'Activer'}
                        </button>
                        {!cat.isSystem ? (
                          <button
                            type="button"
                            onClick={() => void deleteCategory(cat.id)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                            aria-label="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-4 ml-8 space-y-3 border-l-2 border-amber-100 pl-4">
                        {cat.documentTypes.map((dt: JuridiqueDocumentType) => (
                          <div key={dt.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                            <div className="flex-1 min-w-[200px]">
                              <p className="text-sm font-medium text-gray-800">{dt.labelFr}</p>
                              <p className="text-xs text-gray-500" dir="rtl">
                                {dt.labelAr}
                              </p>
                              {dt.moroccanRef ? (
                                <p className="text-[10px] text-amber-700 mt-0.5">Réf. MA: {dt.moroccanRef}</p>
                              ) : null}
                            </div>
                            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={dt.isRequired}
                                onChange={(e) => void patchDocType(dt.id, { isRequired: e.target.checked })}
                              />
                              Requis
                            </label>
                            {!dt.isSystem ? (
                              <button
                                type="button"
                                onClick={() => void deleteDocType(dt.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 size={12} />
                              </button>
                            ) : null}
                          </div>
                        ))}

                        <div className="pt-2 grid md:grid-cols-3 gap-2 items-end">
                          <input
                            value={draft.labelFr}
                            onChange={(e) =>
                              setNewDocType((p) => ({
                                ...p,
                                [cat.id]: { ...draft, labelFr: e.target.value },
                              }))
                            }
                            placeholder="Type FR"
                            className="rounded-lg border px-3 py-2 text-xs"
                          />
                          <input
                            value={draft.labelAr}
                            onChange={(e) =>
                              setNewDocType((p) => ({
                                ...p,
                                [cat.id]: { ...draft, labelAr: e.target.value },
                              }))
                            }
                            placeholder="Type AR"
                            dir="rtl"
                            className="rounded-lg border px-3 py-2 text-xs"
                          />
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void createDocType(cat.id)}
                            className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold"
                          >
                            <Plus size={12} /> Type
                          </button>
                        </div>
                        {cat.uploadPromptFr ? (
                          <p className="text-[11px] text-gray-500">
                            Upload FR: {cat.uploadPromptFr} · AR: {cat.uploadPromptAr ?? '—'}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 px-1">
          Aperçu libellé bilingue: {juridiqueLabel('fr', catalog[0]?.labelFr, catalog[0]?.labelAr)} /{' '}
          {juridiqueLabel('ar', catalog[0]?.labelFr, catalog[0]?.labelAr)}
        </p>
      </div>
    </AdminShell>
  );
}
