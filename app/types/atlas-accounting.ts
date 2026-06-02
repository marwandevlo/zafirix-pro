/**
 * Accounting line (journal) — aligned with comptabilité UI; persisted as JSON in Supabase.
 */
export type AtlasAccountingEntry = {
  id: number;
  date: string;
  libelle: string;
  compte: string;
  debit: number;
  credit: number;
  /** Traceability: DB row ID (uuid) — distinct from the JSON id field */
  rowId?: string;
  /** Set when this entry was created from Documents IA */
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  validationStatus?: string | null;
};
