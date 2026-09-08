import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CorporateVaultFolder,
  CorporateVaultFolderId,
  VaultDocumentItem,
  VaultSearchResult,
} from '@/app/types/atlas-corporate-vault';
import { asRecord } from '@/app/lib/atlas-json';
import {
  categoriesToVaultFolders,
  DEFAULT_MOROCCAN_JURIDIQUE_CATALOG,
  loadJuridiqueCatalog,
} from '@/app/lib/atlas-juridique-categories-server';

/** @deprecated Use dynamic catalog from loadVaultFolders() */
export const CORPORATE_VAULT_FOLDERS: CorporateVaultFolder[] = categoriesToVaultFolders(
  DEFAULT_MOROCCAN_JURIDIQUE_CATALOG,
);

export async function loadVaultFolders(admin: SupabaseClient): Promise<CorporateVaultFolder[]> {
  try {
    const catalog = await loadJuridiqueCatalog(admin);
    return categoriesToVaultFolders(catalog.categories);
  } catch {
    return CORPORATE_VAULT_FOLDERS;
  }
}

function inferFolder(
  docType: string,
  title: string,
  metadata: Record<string, unknown>,
  tags: string[],
  folders: CorporateVaultFolder[],
): CorporateVaultFolderId {
  const vaultFolder = metadata.vaultFolder;
  if (typeof vaultFolder === 'string' && folders.some((f) => f.id === vaultFolder)) {
    return vaultFolder;
  }

  const hay = `${docType} ${title} ${tags.join(' ')}`.toLowerCase();

  for (const folder of folders) {
    if (folder.documentTypes.includes(docType)) {
      if (folder.tags.some((tag) => hay.includes(tag))) return folder.id;
    }
  }
  if (hay.includes('pv') || hay.includes('ago') || hay.includes('age')) {
    const pv = folders.find((f) => f.id === 'proces_verbaux');
    if (pv) return pv.id;
  }
  if (hay.includes('bail') || hay.includes('domicil')) {
    const c = folders.find((f) => f.id === 'contrats' || f.id === 'contrats_bail');
    if (c) return c.id;
  }
  if (hay.includes('tva') || hay.includes('is') || hay.includes('9421') || hay.includes('fiscal')) {
    const f = folders.find((f) => f.id === 'fichiers_fiscaux');
    if (f) return f.id;
  }
  if (hay.includes('statut') || hay.includes('kbis') || hay.includes('rc')) {
    const s = folders.find((f) => f.id === 'statuts_societe' || f.id === 'registre_commerce' || f.id === 'statuts_kbis');
    if (s) return s.id;
  }
  if (hay.includes('patente')) {
    const p = folders.find((f) => f.id === 'patente');
    if (p) return p.id;
  }
  if (hay.includes(' ice') || hay.startsWith('ice')) {
    const ice = folders.find((f) => f.id === 'ice');
    if (ice) return ice.id;
  }
  const fallback = folders.find((f) => f.id === 'registres_legaux') ?? folders[folders.length - 1];
  return fallback?.id ?? 'registres_legaux';
}

function extractTags(metadata: Record<string, unknown>, title: string): string[] {
  const raw = metadata.vaultTags ?? metadata.tags;
  const fromMeta = Array.isArray(raw) ? raw.map(String) : [];
  const auto = title
    .toLowerCase()
    .split(/[\s,_-]+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
  return [...new Set([...fromMeta, ...auto])];
}

export async function searchCorporateVault(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  query: string,
  folderFilter?: CorporateVaultFolderId,
  foldersOverride?: CorporateVaultFolder[],
): Promise<VaultSearchResult> {
  const folders = foldersOverride ?? (await loadVaultFolders(db));
  let q = db
    .from('atlas_documents')
    .select('id, title, filename, type, mime_type, metadata, created_at, company_id, processing_status, extracted_text')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(200);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const needle = query.trim().toLowerCase();
  const items: VaultDocumentItem[] = [];

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const metadata = asRecord(r.metadata) ?? {};
    const title = String(r.title ?? r.filename ?? 'Document');
    const docType = String(r.type ?? 'generic');
    const tags = extractTags(metadata, title);
    const folderId = inferFolder(docType, title, metadata, tags, folders);
    if (folderFilter && folderId !== folderFilter) continue;

    const searchText = [
      title,
      String(r.filename ?? ''),
      String(r.extracted_text ?? '').slice(0, 500),
      tags.join(' '),
      docType,
    ]
      .join(' ')
      .toLowerCase();

    if (needle && !searchText.includes(needle)) continue;

    items.push({
      id: String(r.id),
      title,
      filename: r.filename == null ? undefined : String(r.filename),
      folderId,
      tags,
      mimeType: r.mime_type == null ? undefined : String(r.mime_type),
      createdAt: String(r.created_at ?? new Date().toISOString()),
      companyId: r.company_id == null ? null : String(r.company_id),
      processingStatus: r.processing_status == null ? undefined : String(r.processing_status),
      searchText,
    });
  }

  return {
    companyId,
    folders,
    documents: items,
    total: items.length,
    query,
  };
}

export async function tagVaultDocument(
  db: SupabaseClient,
  userId: string,
  documentId: string,
  updates: { vaultFolder?: CorporateVaultFolderId; vaultTags?: string[] },
): Promise<void> {
  const { data, error } = await db
    .from('atlas_documents')
    .select('metadata')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('document_not_found');

  const metadata = asRecord((data as { metadata: unknown }).metadata) ?? {};
  if (updates.vaultFolder) metadata.vaultFolder = updates.vaultFolder;
  if (updates.vaultTags) metadata.vaultTags = updates.vaultTags;

  const { error: upErr } = await db
    .from('atlas_documents')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('user_id', userId);
  if (upErr) throw new Error(upErr.message);
}
