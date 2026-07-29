import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CorporateVaultFolder,
  CorporateVaultFolderId,
  VaultDocumentItem,
  VaultSearchResult,
} from '@/app/types/atlas-corporate-vault';
import { asRecord } from '@/app/lib/atlas-json';

export const CORPORATE_VAULT_FOLDERS: CorporateVaultFolder[] = [
  {
    id: 'statuts_kbis',
    labelFr: 'Statuts & Kbis',
    labelAr: 'النظام الأساسي & Kbis',
    descriptionFr: 'Statuts, extrait RC, Kbis, certificat négatif',
    icon: 'scroll',
    documentTypes: ['company_statutes', 'legal_contract', 'juridique'],
    tags: ['statuts', 'kbis', 'rc', 'extrait'],
  },
  {
    id: 'proces_verbaux',
    labelFr: 'Procès-verbaux (AGO/AGE)',
    labelAr: 'محاضر الجمعيات',
    descriptionFr: 'PV assemblées ordinaires et extraordinaires',
    icon: 'gavel',
    documentTypes: ['juridique', 'legal_contract'],
    tags: ['pv', 'ago', 'age', 'assemblee'],
  },
  {
    id: 'contrats_bail',
    labelFr: 'Contrats de bail',
    labelAr: 'عقود الكراء',
    descriptionFr: 'Baux commerciaux, domiciliation, locations',
    icon: 'building',
    documentTypes: ['legal_contract', 'juridique'],
    tags: ['bail', 'domiciliation', 'location'],
  },
  {
    id: 'fichiers_fiscaux',
    labelFr: 'Fichiers fiscaux',
    labelAr: 'الملفات الضريبية',
    descriptionFr: 'TVA, IS, IR, liasse, attestations DGI',
    icon: 'receipt',
    documentTypes: ['tax_declaration', 'vat_declaration', 'accounting_document'],
    tags: ['tva', 'is', 'ir', '9421', 'dgi', 'liasse'],
  },
  {
    id: 'registres_legaux',
    labelFr: 'Registres légaux',
    labelAr: 'السجلات القانونية',
    descriptionFr: 'Registre associés, mouvements titres, décisions',
    icon: 'book',
    documentTypes: ['legal_contract', 'accounting_document', 'juridique'],
    tags: ['registre', 'associes', 'mouvements', 'decisions'],
  },
];

function inferFolder(
  docType: string,
  title: string,
  metadata: Record<string, unknown>,
  tags: string[],
): CorporateVaultFolderId {
  const vaultFolder = metadata.vaultFolder;
  if (typeof vaultFolder === 'string' && CORPORATE_VAULT_FOLDERS.some((f) => f.id === vaultFolder)) {
    return vaultFolder as CorporateVaultFolderId;
  }

  const hay = `${docType} ${title} ${tags.join(' ')}`.toLowerCase();

  for (const folder of CORPORATE_VAULT_FOLDERS) {
    if (folder.documentTypes.includes(docType)) {
      if (folder.tags.some((tag) => hay.includes(tag))) return folder.id;
    }
  }
  if (hay.includes('pv') || hay.includes('ago') || hay.includes('age')) return 'proces_verbaux';
  if (hay.includes('bail') || hay.includes('domicil')) return 'contrats_bail';
  if (hay.includes('tva') || hay.includes('is') || hay.includes('9421') || hay.includes('fiscal')) return 'fichiers_fiscaux';
  if (hay.includes('statut') || hay.includes('kbis')) return 'statuts_kbis';
  return 'registres_legaux';
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
): Promise<VaultSearchResult> {
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
    const folderId = inferFolder(docType, title, metadata, tags);
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
    folders: CORPORATE_VAULT_FOLDERS,
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
