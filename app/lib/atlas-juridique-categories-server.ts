import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  JuridiqueCatalog,
  JuridiqueCategory,
  JuridiqueDocumentType,
  JuridiqueFieldDef,
} from '@/app/types/atlas-juridique-categories';

type DbCategoryRow = {
  id: string;
  slug: string;
  label_fr: string;
  label_ar: string;
  description_fr: string | null;
  description_ar: string | null;
  upload_prompt_fr: string | null;
  upload_prompt_ar: string | null;
  icon: string;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  document_types_filter: string[] | null;
  tags: string[] | null;
};

type DbDocTypeRow = {
  id: string;
  category_id: string;
  slug: string;
  label_fr: string;
  label_ar: string;
  description_fr: string | null;
  description_ar: string | null;
  upload_prompt_fr: string | null;
  upload_prompt_ar: string | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  fields: unknown;
  moroccan_ref: string | null;
  is_system: boolean;
};

function parseFields(raw: unknown): JuridiqueFieldDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const key = String(r.key ?? '').trim();
      if (!key) return null;
      return {
        key,
        labelFr: String(r.labelFr ?? r.label_fr ?? key),
        labelAr: String(r.labelAr ?? r.label_ar ?? key),
      };
    })
    .filter((x): x is JuridiqueFieldDef => x !== null);
}

function mapDocType(row: DbDocTypeRow): JuridiqueDocumentType {
  return {
    id: row.id,
    categoryId: row.category_id,
    slug: row.slug,
    labelFr: row.label_fr,
    labelAr: row.label_ar,
    descriptionFr: row.description_fr,
    descriptionAr: row.description_ar,
    uploadPromptFr: row.upload_prompt_fr,
    uploadPromptAr: row.upload_prompt_ar,
    isRequired: row.is_required,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    fields: parseFields(row.fields),
    moroccanRef: row.moroccan_ref,
    isSystem: row.is_system,
  };
}

function mapCategory(row: DbCategoryRow, docTypes: JuridiqueDocumentType[]): JuridiqueCategory {
  return {
    id: row.id,
    slug: row.slug,
    labelFr: row.label_fr,
    labelAr: row.label_ar,
    descriptionFr: row.description_fr,
    descriptionAr: row.description_ar,
    uploadPromptFr: row.upload_prompt_fr,
    uploadPromptAr: row.upload_prompt_ar,
    icon: row.icon,
    sortOrder: row.sort_order,
    isSystem: row.is_system,
    isActive: row.is_active,
    documentTypesFilter: row.document_types_filter ?? [],
    tags: row.tags ?? [],
    documentTypes: docTypes.filter((d) => d.categoryId === row.id).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** Fallback catalog when DB tables are missing or empty. */
export const DEFAULT_MOROCCAN_JURIDIQUE_CATALOG: JuridiqueCategory[] = [
  {
    id: 'default-registre_commerce',
    slug: 'registre_commerce',
    labelFr: 'Registre de Commerce (RC)',
    labelAr: 'السجل التجاري',
    descriptionFr: 'Immatriculation, extrait RC, Kbis, certificat négatif',
    descriptionAr: 'التسجيل في السجل التجاري، مقتطف RC، شهادة سلبية',
    uploadPromptFr: 'Déposez votre extrait RC, Kbis ou certificat négatif (Tribunal de Commerce).',
    uploadPromptAr: 'ارفع مقتطف السجل التجاري أو Kbis أو الشهادة السلبية.',
    icon: 'landmark',
    sortOrder: 10,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['juridique', 'legal_contract', 'company_statutes'],
    tags: ['rc', 'kbis', 'registre', 'commerce'],
    documentTypes: [
      {
        id: 'default-extrait_rc',
        categoryId: 'default-registre_commerce',
        slug: 'extrait_rc',
        labelFr: 'Extrait RC / Kbis',
        labelAr: 'مقتطف السجل التجاري',
        descriptionFr: 'Extrait du registre de commerce',
        descriptionAr: 'مقتطف من السجل التجاري',
        uploadPromptFr: null,
        uploadPromptAr: null,
        isRequired: true,
        isActive: true,
        sortOrder: 10,
        fields: [],
        moroccanRef: 'RC',
        isSystem: true,
      },
    ],
  },
  {
    id: 'default-patente',
    slug: 'patente',
    labelFr: 'Patente',
    labelAr: 'الضريبة المهنية',
    descriptionFr: 'Taxe professionnelle, quittance patente communale',
    descriptionAr: 'الضريبة المهنية ووصولات الأداء',
    uploadPromptFr: 'Téléversez votre quittance ou attestation de patente (commune).',
    uploadPromptAr: 'ارفع وصل أو شهادة الضريبة المهنية (الجماعة).',
    icon: 'receipt',
    sortOrder: 20,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['tax_declaration', 'juridique'],
    tags: ['patente', 'commune'],
    documentTypes: [],
  },
  {
    id: 'default-identifiant_fiscal',
    slug: 'identifiant_fiscal',
    labelFr: 'Identifiant Fiscal (IF)',
    labelAr: 'المعرف الضريبي',
    descriptionFr: 'Attestation IF, inscription DGI',
    descriptionAr: 'شهادة المعرف الضريبي وتسجيل DGI',
    uploadPromptFr: 'Déposez votre attestation d’identifiant fiscal (DGI).',
    uploadPromptAr: 'ارفع شهادة المعرف الضريبي (DGI).',
    icon: 'file-text',
    sortOrder: 30,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['tax_declaration', 'juridique'],
    tags: ['if', 'dgi', 'fiscal'],
    documentTypes: [],
  },
  {
    id: 'default-ice',
    slug: 'ice',
    labelFr: 'ICE',
    labelAr: 'المعرف الموحد للمقاولة',
    descriptionFr: 'Identifiant Commun de l’Entreprise',
    descriptionAr: 'المعرف الموحد للمقاولة',
    uploadPromptFr: 'Téléversez l’attestation ICE (15 chiffres).',
    uploadPromptAr: 'ارفع شهادة ICE (15 رقمًا).',
    icon: 'hash',
    sortOrder: 40,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['juridique'],
    tags: ['ice'],
    documentTypes: [],
  },
  {
    id: 'default-statuts_societe',
    slug: 'statuts_societe',
    labelFr: 'Statuts de Société',
    labelAr: 'النظام الأساسي للشركة',
    descriptionFr: 'Statuts constitutifs, avenants, pactes d’associés',
    descriptionAr: 'النظام الأساسي، التعديلات، اتفاقيات الشركاء',
    uploadPromptFr: 'Déposez les statuts ou avenants aux statuts (SARL, SA…).',
    uploadPromptAr: 'ارفع النظام الأساسي أو تعديلاته.',
    icon: 'scroll',
    sortOrder: 50,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['company_statutes', 'juridique'],
    tags: ['statuts', 'avenant'],
    documentTypes: [
      {
        id: 'default-avenant_statuts',
        categoryId: 'default-statuts_societe',
        slug: 'avenant_statuts',
        labelFr: 'Avenant aux statuts',
        labelAr: 'تعديل النظام الأساسي',
        descriptionFr: 'Modification partielle des statuts',
        descriptionAr: 'تعديل جزئي للنظام الأساسي',
        uploadPromptFr: null,
        uploadPromptAr: null,
        isRequired: false,
        isActive: true,
        sortOrder: 20,
        fields: [
          { key: 'article_modifie', labelFr: 'Article modifié', labelAr: 'المادة المعدلة' },
          { key: 'nouveau_texte', labelFr: 'Nouveau texte', labelAr: 'النص الجديد' },
        ],
        moroccanRef: 'Statuts',
        isSystem: true,
      },
    ],
  },
  {
    id: 'default-proces_verbaux',
    slug: 'proces_verbaux',
    labelFr: 'Procès-Verbaux (PV)',
    labelAr: 'محاضر الجمعيات',
    descriptionFr: 'PV AGO, AGE, décisions unanimes',
    descriptionAr: 'محاضر الجمعية العادية والاستثنائية',
    uploadPromptFr: 'Déposez les PV d’assemblées générales ordinaires ou extraordinaires.',
    uploadPromptAr: 'ارفع محاضر الجمعية العامة العادية أو الاستثنائية.',
    icon: 'gavel',
    sortOrder: 60,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['juridique', 'legal_contract'],
    tags: ['pv', 'ago', 'age'],
    documentTypes: [
      {
        id: 'default-pv_ago',
        categoryId: 'default-proces_verbaux',
        slug: 'pv_ago',
        labelFr: 'PV Assemblée Générale Ordinaire',
        labelAr: 'محضر الجمعية العامة العادية',
        descriptionFr: 'PV AGO annuelle',
        descriptionAr: 'محضر الجمعية العامة العادية السنوية',
        uploadPromptFr: null,
        uploadPromptAr: null,
        isRequired: false,
        isActive: true,
        sortOrder: 10,
        fields: [
          { key: 'date_age', labelFr: "Date de l'assemblée", labelAr: 'تاريخ الجمعية' },
          { key: 'exercice', labelFr: 'Exercice comptable', labelAr: 'السنة المالية' },
        ],
        moroccanRef: 'PV',
        isSystem: true,
      },
    ],
  },
  {
    id: 'default-contrats',
    slug: 'contrats',
    labelFr: 'Contrats',
    labelAr: 'العقود',
    descriptionFr: 'Baux, prestations, domiciliation, NDA',
    descriptionAr: 'عقود الكراء، الخدمات، domiciliation، السرية',
    uploadPromptFr: 'Téléversez vos contrats signés.',
    uploadPromptAr: 'ارفع العقود الموقعة.',
    icon: 'file-signature',
    sortOrder: 70,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['legal_contract', 'juridique'],
    tags: ['contrat', 'bail'],
    documentTypes: [
      {
        id: 'default-contrat_bail',
        categoryId: 'default-contrats',
        slug: 'contrat_bail',
        labelFr: 'Contrat de bail commercial',
        labelAr: 'عقد كراء تجاري',
        descriptionFr: 'Location de local commercial',
        descriptionAr: 'كراء محل تجاري',
        uploadPromptFr: null,
        uploadPromptAr: null,
        isRequired: false,
        isActive: true,
        sortOrder: 10,
        fields: [
          { key: 'bailleur', labelFr: 'Bailleur', labelAr: 'المكري' },
          { key: 'locataire', labelFr: 'Locataire', labelAr: 'المكتري' },
        ],
        moroccanRef: 'Contrat',
        isSystem: true,
      },
    ],
  },
  {
    id: 'default-conventions',
    slug: 'conventions',
    labelFr: 'Conventions',
    labelAr: 'الاتفاقيات',
    descriptionFr: 'Conventions de gestion, pactes, accords',
    descriptionAr: 'اتفاقيات الإدارة والشركاء',
    uploadPromptFr: 'Déposez conventions entre associés ou avec des tiers.',
    uploadPromptAr: 'ارفع الاتفاقيات بين الشركاء أو مع الغير.',
    icon: 'handshake',
    sortOrder: 80,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['legal_contract', 'juridique'],
    tags: ['convention', 'pacte'],
    documentTypes: [],
  },
  {
    id: 'default-fichiers_fiscaux',
    slug: 'fichiers_fiscaux',
    labelFr: 'Fichiers fiscaux (DGI)',
    labelAr: 'الملفات الضريبية',
    descriptionFr: 'Liasse fiscale, déclarations TVA/IS/IR',
    descriptionAr: 'الحزمة الضريبية وتصريحات DGI',
    uploadPromptFr: 'Déposez liasse ou déclarations fiscales DGI.',
    uploadPromptAr: 'ارفع الحزمة الضريبية أو التصريحات.',
    icon: 'receipt',
    sortOrder: 90,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['tax_declaration', 'vat_declaration', 'accounting_document'],
    tags: ['tva', 'is', 'dgi'],
    documentTypes: [],
  },
  {
    id: 'default-registres_legaux',
    slug: 'registres_legaux',
    labelFr: 'Registres légaux',
    labelAr: 'السجلات القانونية',
    descriptionFr: 'Registre des associés, mouvements de titres',
    descriptionAr: 'سجل الشركاء وحركة الحصص',
    uploadPromptFr: 'Déposez registre des associés ou mouvements de parts.',
    uploadPromptAr: 'ارفع سجل الشركاء أو حركة الحصص.',
    icon: 'book',
    sortOrder: 100,
    isSystem: true,
    isActive: true,
    documentTypesFilter: ['legal_contract', 'juridique'],
    tags: ['registre', 'associes'],
    documentTypes: [],
  },
];

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || (message.includes('atlas_juridique') && message.includes('does not exist'));
}

export async function loadJuridiqueCatalog(
  admin: SupabaseClient,
  options?: { includeInactive?: boolean },
): Promise<JuridiqueCatalog> {
  const includeInactive = options?.includeInactive ?? false;

  let catQuery = admin.from('atlas_juridique_categories').select('*').order('sort_order', { ascending: true });
  if (!includeInactive) catQuery = catQuery.eq('is_active', true);

  const { data: catRows, error: catErr } = await catQuery;
  if (catErr) {
    if (isMissingTableError(catErr)) {
      return { categories: DEFAULT_MOROCCAN_JURIDIQUE_CATALOG, source: 'defaults' };
    }
    throw catErr;
  }

  if (!catRows?.length) {
    return { categories: DEFAULT_MOROCCAN_JURIDIQUE_CATALOG, source: 'defaults' };
  }

  let docQuery = admin.from('atlas_juridique_document_types').select('*').order('sort_order', { ascending: true });
  if (!includeInactive) docQuery = docQuery.eq('is_active', true);

  const { data: docRows, error: docErr } = await docQuery;
  if (docErr && !isMissingTableError(docErr)) throw docErr;

  const docTypes = (docRows ?? []).map((row) => mapDocType(row as DbDocTypeRow));
  const categories = (catRows as DbCategoryRow[]).map((row) => mapCategory(row, docTypes));

  return { categories, source: 'database' };
}

export function categoriesToVaultFolders(categories: JuridiqueCategory[]) {
  return categories
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      id: c.slug,
      labelFr: c.labelFr,
      labelAr: c.labelAr,
      descriptionFr: c.descriptionFr ?? '',
      icon: c.icon,
      documentTypes: c.documentTypesFilter,
      tags: c.tags,
    }));
}

export function slugifyJuridique(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export async function createJuridiqueCategory(
  admin: SupabaseClient,
  input: {
    slug?: string;
    labelFr: string;
    labelAr: string;
    descriptionFr?: string;
    descriptionAr?: string;
    uploadPromptFr?: string;
    uploadPromptAr?: string;
    icon?: string;
    sortOrder?: number;
    documentTypesFilter?: string[];
    tags?: string[];
  },
): Promise<JuridiqueCategory> {
  const slug = slugifyJuridique(input.slug ?? input.labelFr);
  const { count } = await admin.from('atlas_juridique_categories').select('id', { count: 'exact', head: true });
  const sortOrder = input.sortOrder ?? ((typeof count === 'number' ? count : 0) + 1) * 10;

  const { data, error } = await admin
    .from('atlas_juridique_categories')
    .insert({
      slug,
      label_fr: input.labelFr.trim(),
      label_ar: input.labelAr.trim(),
      description_fr: input.descriptionFr?.trim() ?? null,
      description_ar: input.descriptionAr?.trim() ?? null,
      upload_prompt_fr: input.uploadPromptFr?.trim() ?? null,
      upload_prompt_ar: input.uploadPromptAr?.trim() ?? null,
      icon: input.icon?.trim() || 'folder',
      sort_order: sortOrder,
      is_system: false,
      is_active: true,
      document_types_filter: input.documentTypesFilter ?? ['juridique'],
      tags: input.tags ?? [],
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('insert_failed');
  return mapCategory(data as DbCategoryRow, []);
}

export async function updateJuridiqueCategory(
  admin: SupabaseClient,
  id: string,
  patch: Partial<{
    labelFr: string;
    labelAr: string;
    descriptionFr: string | null;
    descriptionAr: string | null;
    uploadPromptFr: string | null;
    uploadPromptAr: string | null;
    icon: string;
    sortOrder: number;
    isActive: boolean;
    documentTypesFilter: string[];
    tags: string[];
  }>,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.labelFr !== undefined) row.label_fr = patch.labelFr;
  if (patch.labelAr !== undefined) row.label_ar = patch.labelAr;
  if (patch.descriptionFr !== undefined) row.description_fr = patch.descriptionFr;
  if (patch.descriptionAr !== undefined) row.description_ar = patch.descriptionAr;
  if (patch.uploadPromptFr !== undefined) row.upload_prompt_fr = patch.uploadPromptFr;
  if (patch.uploadPromptAr !== undefined) row.upload_prompt_ar = patch.uploadPromptAr;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.documentTypesFilter !== undefined) row.document_types_filter = patch.documentTypesFilter;
  if (patch.tags !== undefined) row.tags = patch.tags;

  const { error } = await admin.from('atlas_juridique_categories').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteJuridiqueCategory(admin: SupabaseClient, id: string): Promise<void> {
  const { data } = await admin.from('atlas_juridique_categories').select('is_system').eq('id', id).maybeSingle();
  if ((data as { is_system?: boolean } | null)?.is_system) {
    throw new Error('system_category_protected');
  }
  const { error } = await admin.from('atlas_juridique_categories').delete().eq('id', id);
  if (error) throw error;
}

export async function createJuridiqueDocumentType(
  admin: SupabaseClient,
  input: {
    categoryId: string;
    slug?: string;
    labelFr: string;
    labelAr: string;
    descriptionFr?: string;
    descriptionAr?: string;
    uploadPromptFr?: string;
    uploadPromptAr?: string;
    isRequired?: boolean;
    sortOrder?: number;
    fields?: JuridiqueFieldDef[];
    moroccanRef?: string;
  },
): Promise<JuridiqueDocumentType> {
  const slug = slugifyJuridique(input.slug ?? input.labelFr);
  const { data, error } = await admin
    .from('atlas_juridique_document_types')
    .insert({
      category_id: input.categoryId,
      slug,
      label_fr: input.labelFr.trim(),
      label_ar: input.labelAr.trim(),
      description_fr: input.descriptionFr?.trim() ?? null,
      description_ar: input.descriptionAr?.trim() ?? null,
      upload_prompt_fr: input.uploadPromptFr?.trim() ?? null,
      upload_prompt_ar: input.uploadPromptAr?.trim() ?? null,
      is_required: input.isRequired ?? false,
      sort_order: input.sortOrder ?? 10,
      fields: input.fields ?? [],
      moroccan_ref: input.moroccanRef?.trim() ?? null,
      is_system: false,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('insert_failed');
  return mapDocType(data as DbDocTypeRow);
}

export async function updateJuridiqueDocumentType(
  admin: SupabaseClient,
  id: string,
  patch: Partial<{
    labelFr: string;
    labelAr: string;
    descriptionFr: string | null;
    descriptionAr: string | null;
    uploadPromptFr: string | null;
    uploadPromptAr: string | null;
    isRequired: boolean;
    isActive: boolean;
    sortOrder: number;
    fields: JuridiqueFieldDef[];
    moroccanRef: string | null;
  }>,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.labelFr !== undefined) row.label_fr = patch.labelFr;
  if (patch.labelAr !== undefined) row.label_ar = patch.labelAr;
  if (patch.descriptionFr !== undefined) row.description_fr = patch.descriptionFr;
  if (patch.descriptionAr !== undefined) row.description_ar = patch.descriptionAr;
  if (patch.uploadPromptFr !== undefined) row.upload_prompt_fr = patch.uploadPromptFr;
  if (patch.uploadPromptAr !== undefined) row.upload_prompt_ar = patch.uploadPromptAr;
  if (patch.isRequired !== undefined) row.is_required = patch.isRequired;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.fields !== undefined) row.fields = patch.fields;
  if (patch.moroccanRef !== undefined) row.moroccan_ref = patch.moroccanRef;

  const { error } = await admin.from('atlas_juridique_document_types').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteJuridiqueDocumentType(admin: SupabaseClient, id: string): Promise<void> {
  const { data } = await admin.from('atlas_juridique_document_types').select('is_system').eq('id', id).maybeSingle();
  if ((data as { is_system?: boolean } | null)?.is_system) {
    throw new Error('system_document_type_protected');
  }
  const { error } = await admin.from('atlas_juridique_document_types').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderJuridiqueCategories(admin: SupabaseClient, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    if (!id) continue;
    await admin
      .from('atlas_juridique_categories')
      .update({ sort_order: (i + 1) * 10, updated_at: new Date().toISOString() })
      .eq('id', id);
  }
}
