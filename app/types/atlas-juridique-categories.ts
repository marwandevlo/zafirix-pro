/** Dynamic Juridique catalog — Moroccan legal categories & document types. */

export type JuridiqueFieldDef = {
  key: string;
  labelFr: string;
  labelAr: string;
};

export type JuridiqueDocumentType = {
  id: string;
  categoryId: string;
  slug: string;
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
  isSystem: boolean;
};

export type JuridiqueCategory = {
  id: string;
  slug: string;
  labelFr: string;
  labelAr: string;
  descriptionFr: string | null;
  descriptionAr: string | null;
  uploadPromptFr: string | null;
  uploadPromptAr: string | null;
  icon: string;
  sortOrder: number;
  isSystem: boolean;
  isActive: boolean;
  documentTypesFilter: string[];
  tags: string[];
  documentTypes: JuridiqueDocumentType[];
};

export type JuridiqueCatalog = {
  categories: JuridiqueCategory[];
  source: 'database' | 'defaults';
};

export type JuridiqueUiLocale = 'fr' | 'ar';

export function juridiqueLabel(
  locale: JuridiqueUiLocale,
  fr: string | null | undefined,
  ar: string | null | undefined,
): string {
  if (locale === 'ar' && ar?.trim()) return ar.trim();
  return (fr ?? ar ?? '').trim();
}
