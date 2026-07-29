'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Building2, FileText, Gavel, Loader2, Receipt, ScrollText, Search, Tag } from 'lucide-react';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import type { CorporateVaultFolder, CorporateVaultFolderId, VaultDocumentItem } from '@/app/types/atlas-corporate-vault';

const FOLDER_ICONS: Record<CorporateVaultFolderId, typeof FileText> = {
  statuts_kbis: ScrollText,
  proces_verbaux: Gavel,
  contrats_bail: Building2,
  fichiers_fiscaux: Receipt,
  registres_legaux: BookOpen,
};

export function CorporateVaultPanel() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [folders, setFolders] = useState<CorporateVaultFolder[]>([]);
  const [documents, setDocuments] = useState<VaultDocumentItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<CorporateVaultFolderId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cid = companyId ?? (await getActiveCompanyDbRowId());
      setCompanyId(cid);
      if (!cid) return;

      const params = new URLSearchParams({ companyId: cid, q: query });
      if (activeFolder !== 'all') params.set('folder', activeFolder);
      const res = await fetch(`/api/vault/documents?${params}`, { credentials: 'include' });
      const data = (await res.json()) as {
        vault?: { folders: CorporateVaultFolder[]; documents: VaultDocumentItem[] };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Erreur coffre-fort');
      setFolders(data.vault?.folders ?? []);
      setDocuments(data.vault?.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [companyId, query, activeFolder]);

  useEffect(() => {
    void load();
  }, [load]);

  const folderCounts = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.folderId] = (acc[d.folderId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-56 border-r bg-gray-50 p-3 space-y-1 shrink-0 overflow-y-auto">
        <p className="text-xs font-semibold text-gray-500 px-2 mb-2">Coffre-fort · الخزنة</p>
        <button
          type="button"
          onClick={() => setActiveFolder('all')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs ${activeFolder === 'all' ? 'bg-white shadow text-[#1B2A4A] font-medium' : 'text-gray-500 hover:bg-white/70'}`}
        >
          Tous les dossiers
        </button>
        {folders.map((f) => {
          const Icon = FOLDER_ICONS[f.id];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFolder(f.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${activeFolder === f.id ? 'bg-white shadow text-[#1B2A4A] font-medium' : 'text-gray-500 hover:bg-white/70'}`}
            >
              <Icon size={12} />
              <span className="flex-1 truncate">{f.labelFr}</span>
              <span className="text-[10px] opacity-60">{folderCounts[f.id] ?? 0}</span>
            </button>
          );
        })}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b bg-white">
          <h2 className="font-bold text-gray-800">Coffre-fort numérique</h2>
          <p className="text-xs text-gray-400">Dossiers légaux & fiscaux standardisés · recherche intelligente</p>
          <div className="mt-3 relative max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (PV, bail, TVA, statuts…)"
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!companyId && (
            <p className="text-sm text-amber-800 bg-amber-50 border rounded-xl px-4 py-3">Sélectionnez une société active.</p>
          )}
          {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
          {loading && (
            <div className="flex justify-center py-12 text-gray-400">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {!loading && documents.length === 0 && (
            <p className="text-sm text-gray-500">Aucun document dans ce dossier. Importez via Documents IA ou Juridique.</p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {documents.map((doc) => {
              const folder = folders.find((f) => f.id === doc.folderId);
              const Icon = FOLDER_ICONS[doc.folderId];
              return (
                <div key={doc.id} className="border rounded-xl p-4 bg-white hover:border-amber-300 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#1B2A4A]/10 flex items-center justify-center shrink-0">
                      <Icon size={16} className="text-[#1B2A4A]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.title}</p>
                      <p className="text-xs text-gray-400">{folder?.labelFr ?? doc.folderId}</p>
                      <p className="text-[10px] text-gray-300 mt-1">{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</p>
                      {doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {doc.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              <Tag size={8} /> {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
