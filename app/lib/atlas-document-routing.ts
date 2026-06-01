/**
 * Documents IA — routing engine.
 *
 * Maps document types to suggested destination modules and
 * handles the "send to module" action (creates supplier invoice,
 * TVA suggestion, etc.).
 */

import type { AtlasDocumentType } from '@/app/types/atlas-document';

export type DocumentRouteSuggestion = {
  module: string;
  label: string;
  icon: string;
  description: string;
  action: 'send_to_supplier_invoices' | 'send_to_sales_invoices' | 'send_to_bank' | 'send_to_rh' | 'send_to_legal' | 'send_to_tva' | 'send_to_tax' | 'view_only';
};

const ROUTING_MAP: Record<AtlasDocumentType, DocumentRouteSuggestion[]> = {
  purchase_invoice: [
    { module: 'comptabilite', label: 'Comptabilité', icon: '📒', description: 'Générer une écriture comptable', action: 'send_to_supplier_invoices' },
    { module: 'tva', label: 'TVA déductible', icon: '🧾', description: 'Créer une suggestion TVA déductible', action: 'send_to_tva' },
    { module: 'fournisseurs', label: 'Charges fournisseurs', icon: '🏢', description: 'Ajouter aux factures fournisseurs', action: 'send_to_supplier_invoices' },
  ],
  sales_invoice: [
    { module: 'facturation', label: 'Facturation', icon: '📄', description: 'Ajouter aux factures clients', action: 'send_to_sales_invoices' },
    { module: 'comptabilite', label: 'Comptabilité', icon: '📒', description: 'Générer une écriture comptable', action: 'send_to_supplier_invoices' },
    { module: 'tva', label: 'TVA collectée', icon: '🧾', description: 'Créer une suggestion TVA collectée', action: 'send_to_tva' },
  ],
  receipt: [
    { module: 'comptabilite', label: 'Comptabilité', icon: '📒', description: 'Enregistrer une dépense', action: 'send_to_supplier_invoices' },
  ],
  bank_statement: [
    { module: 'banque', label: 'Banque', icon: '🏦', description: 'Importer les transactions bancaires', action: 'send_to_bank' },
    { module: 'comptabilite', label: 'Rapprochement', icon: '📒', description: 'Rapprochement bancaire', action: 'view_only' },
  ],
  payroll_slip: [
    { module: 'rh', label: 'RH', icon: '👥', description: 'Ajouter au dossier RH', action: 'send_to_rh' },
    { module: 'cnss', label: 'CNSS', icon: '🔒', description: 'Traiter la déclaration CNSS', action: 'view_only' },
  ],
  cnss_document: [
    { module: 'rh', label: 'CNSS', icon: '🔒', description: 'Enregistrer la déclaration CNSS', action: 'view_only' },
  ],
  tax_declaration: [
    { module: 'fiscalite', label: 'Fiscalité', icon: '📊', description: 'Enregistrer la déclaration fiscale', action: 'send_to_tax' },
  ],
  vat_declaration: [
    { module: 'tva', label: 'TVA', icon: '🧾', description: 'Enregistrer la déclaration TVA', action: 'send_to_tva' },
  ],
  legal_contract: [
    { module: 'juridique', label: 'Juridique', icon: '⚖️', description: 'Archiver dans les contrats', action: 'send_to_legal' },
  ],
  company_statutes: [
    { module: 'juridique', label: 'Juridique', icon: '⚖️', description: 'Archiver les statuts', action: 'send_to_legal' },
  ],
  legal_notice: [
    { module: 'juridique', label: 'Juridique', icon: '⚖️', description: 'Archiver l\'avis légal', action: 'send_to_legal' },
  ],
  hr_document: [
    { module: 'rh', label: 'RH', icon: '👥', description: 'Ajouter au dossier RH', action: 'send_to_rh' },
  ],
  accounting_document: [
    { module: 'comptabilite', label: 'Comptabilité', icon: '📒', description: 'Enregistrer en comptabilité', action: 'view_only' },
  ],
  unknown: [],
};

export function getRoutingSuggestions(documentType: AtlasDocumentType): DocumentRouteSuggestion[] {
  return ROUTING_MAP[documentType] ?? [];
}

export function documentTypeLabel(type: AtlasDocumentType): string {
  const labels: Record<AtlasDocumentType, string> = {
    purchase_invoice: 'Facture d\'achat',
    sales_invoice: 'Facture de vente',
    receipt: 'Reçu / Ticket',
    bank_statement: 'Relevé bancaire',
    payroll_slip: 'Bulletin de paie',
    cnss_document: 'Document CNSS',
    tax_declaration: 'Déclaration fiscale',
    vat_declaration: 'Déclaration TVA',
    legal_contract: 'Contrat',
    company_statutes: 'Statuts',
    legal_notice: 'Avis légal',
    hr_document: 'Document RH',
    accounting_document: 'Document comptable',
    unknown: 'Type inconnu',
  };
  return labels[type] ?? type;
}

export function confidenceColor(score: number): string {
  if (score >= 0.85) return 'text-green-600 bg-green-50';
  if (score >= 0.60) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

export function confidenceLabel(score: number): string {
  if (score >= 0.85) return 'Élevée';
  if (score >= 0.60) return 'Moyenne';
  return 'Faible';
}
