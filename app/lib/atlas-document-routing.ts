/**
 * Documents IA — routing engine.
 *
 * Maps document types to destination modules with full routing actions,
 * required fields, and description labels.
 *
 * Each document type may route to multiple modules.
 * Routing is non-destructive: drafts only, never final records.
 */

import type { AtlasDocumentType } from '@/app/types/atlas-document';

export type RoutingAction =
  | 'send_to_supplier_invoices'
  | 'send_to_sales_invoices'
  | 'send_to_bank'
  | 'send_to_rh'
  | 'send_to_legal'
  | 'send_to_tva'
  | 'send_to_tax'
  | 'view_only';

export type DocumentRouteSuggestion = {
  module: string;
  label: string;
  icon: string;
  description: string;
  action: RoutingAction;
  /** Module route (href) to open after routing */
  href: string;
  /** Display priority — lower = shown first */
  priority: number;
};

const ROUTING_MAP: Record<AtlasDocumentType, DocumentRouteSuggestion[]> = {
  purchase_invoice: [
    {
      module: 'supplier_invoices',
      label: 'Facture fournisseur',
      icon: '🧾',
      description: 'Créer une facture fournisseur (brouillon)',
      action: 'send_to_supplier_invoices',
      href: '/comptabilite',
      priority: 1,
    },
    {
      module: 'comptabilite',
      label: 'Comptabilité',
      icon: '📒',
      description: 'Générer les écritures comptables (Débit charges + TVA / Crédit fournisseur)',
      action: 'send_to_supplier_invoices',
      href: '/comptabilite',
      priority: 2,
    },
    {
      module: 'tva',
      label: 'TVA déductible',
      icon: '🔢',
      description: 'Créer une suggestion TVA déductible liée à la période',
      action: 'send_to_tva',
      href: '/tva',
      priority: 3,
    },
    {
      module: 'rapports',
      label: 'Rapports Charges',
      icon: '📊',
      description: 'Inclure dans les rapports de charges (brouillon)',
      action: 'view_only',
      href: '/rapports',
      priority: 4,
    },
  ],

  sales_invoice: [
    {
      module: 'factures',
      label: 'Facture client',
      icon: '📄',
      description: 'Créer une facture client (brouillon)',
      action: 'send_to_sales_invoices',
      href: '/factures',
      priority: 1,
    },
    {
      module: 'comptabilite',
      label: 'Comptabilité',
      icon: '📒',
      description: 'Générer les écritures comptables (Débit client / Crédit produits + TVA collectée)',
      action: 'send_to_supplier_invoices',
      href: '/comptabilite',
      priority: 2,
    },
    {
      module: 'tva',
      label: 'TVA collectée',
      icon: '🔢',
      description: 'Créer une suggestion TVA collectée liée à la période',
      action: 'send_to_tva',
      href: '/tva',
      priority: 3,
    },
    {
      module: 'rapports',
      label: "Chiffre d'affaires",
      icon: '📊',
      description: "Inclure dans les rapports de chiffre d'affaires",
      action: 'view_only',
      href: '/rapports',
      priority: 4,
    },
  ],

  receipt: [
    {
      module: 'supplier_invoices',
      label: 'Note de frais',
      icon: '🧾',
      description: 'Créer une note de frais (brouillon)',
      action: 'send_to_supplier_invoices',
      href: '/comptabilite',
      priority: 1,
    },
    {
      module: 'comptabilite',
      label: 'Comptabilité',
      icon: '📒',
      description: 'Enregistrer la dépense en brouillon',
      action: 'send_to_supplier_invoices',
      href: '/comptabilite',
      priority: 2,
    },
  ],

  bank_statement: [
    {
      module: 'banque',
      label: 'Relevé bancaire',
      icon: '🏦',
      description: 'Enregistrer le relevé bancaire et créer des brouillons de transactions',
      action: 'send_to_bank',
      href: '/rapports',
      priority: 1,
    },
    {
      module: 'comptabilite',
      label: 'Rapprochement bancaire',
      icon: '📒',
      description: 'Préparer le rapprochement bancaire',
      action: 'view_only',
      href: '/comptabilite',
      priority: 2,
    },
    {
      module: 'rapports',
      label: 'Rapports trésorerie',
      icon: '📊',
      description: 'Mettre à jour les rapports de trésorerie',
      action: 'view_only',
      href: '/rapports',
      priority: 3,
    },
  ],

  payroll_slip: [
    {
      module: 'rh',
      label: 'Ressources Humaines',
      icon: '👤',
      description: 'Ajouter au dossier RH du salarié',
      action: 'send_to_rh',
      href: '/rh',
      priority: 1,
    },
    {
      module: 'cnss',
      label: 'CNSS',
      icon: '🏛',
      description: 'Extraire les cotisations CNSS pour déclaration',
      action: 'view_only',
      href: '/rh',
      priority: 2,
    },
    {
      module: 'rapports',
      label: 'Rapports RH',
      icon: '📊',
      description: 'Inclure dans les rapports de masse salariale',
      action: 'view_only',
      href: '/rapports',
      priority: 3,
    },
  ],

  cnss_document: [
    {
      module: 'rh',
      label: 'CNSS',
      icon: '🏛',
      description: 'Enregistrer la déclaration CNSS',
      action: 'send_to_rh',
      href: '/rh',
      priority: 1,
    },
  ],

  tax_declaration: [
    {
      module: 'fiscalite',
      label: 'Fiscalité',
      icon: '📋',
      description: 'Enregistrer la déclaration fiscale',
      action: 'send_to_tax',
      href: '/rapports',
      priority: 1,
    },
    {
      module: 'rapports',
      label: 'Rapports fiscaux',
      icon: '📊',
      description: 'Inclure dans les rapports fiscaux',
      action: 'view_only',
      href: '/rapports',
      priority: 2,
    },
  ],

  vat_declaration: [
    {
      module: 'tva',
      label: 'Déclaration TVA',
      icon: '🔢',
      description: 'Enregistrer la déclaration TVA',
      action: 'send_to_tva',
      href: '/tva',
      priority: 1,
    },
  ],

  legal_contract: [
    {
      module: 'juridique',
      label: 'Juridique',
      icon: '⚖️',
      description: 'Archiver le contrat avec parties, dates et obligations',
      action: 'send_to_legal',
      href: '/juridique',
      priority: 1,
    },
  ],

  company_statutes: [
    {
      module: 'juridique',
      label: 'Documents société',
      icon: '⚖️',
      description: 'Archiver les statuts de la société',
      action: 'send_to_legal',
      href: '/juridique',
      priority: 1,
    },
  ],

  legal_notice: [
    {
      module: 'juridique',
      label: 'Juridique',
      icon: '⚖️',
      description: "Archiver l'avis légal",
      action: 'send_to_legal',
      href: '/juridique',
      priority: 1,
    },
  ],

  hr_document: [
    {
      module: 'rh',
      label: 'Ressources Humaines',
      icon: '👤',
      description: 'Ajouter au dossier RH',
      action: 'send_to_rh',
      href: '/rh',
      priority: 1,
    },
  ],

  accounting_document: [
    {
      module: 'comptabilite',
      label: 'Comptabilité',
      icon: '📒',
      description: 'Enregistrer en comptabilité (brouillon)',
      action: 'view_only',
      href: '/comptabilite',
      priority: 1,
    },
  ],

  unknown: [],
};

// ── Public helpers ────────────────────────────────────────────────────────────

export function getRoutingSuggestions(documentType: AtlasDocumentType): DocumentRouteSuggestion[] {
  return (ROUTING_MAP[documentType] ?? []).sort((a, b) => a.priority - b.priority);
}

export function getRoutingModules(documentType: AtlasDocumentType): string[] {
  return getRoutingSuggestions(documentType).map(s => s.module);
}

export function documentTypeLabel(type: AtlasDocumentType): string {
  const labels: Record<AtlasDocumentType, string> = {
    purchase_invoice: "Facture d'achat",
    sales_invoice: 'Facture de vente',
    receipt: 'Reçu / Ticket',
    bank_statement: 'Relevé bancaire',
    payroll_slip: 'Bulletin de paie',
    cnss_document: 'Document CNSS',
    tax_declaration: 'Déclaration fiscale',
    vat_declaration: 'Déclaration TVA',
    legal_contract: 'Contrat',
    company_statutes: 'Statuts de société',
    legal_notice: 'Avis légal',
    hr_document: 'Document RH',
    accounting_document: 'Document comptable',
    unknown: 'Type inconnu',
  };
  return labels[type] ?? type.replace(/_/g, ' ');
}

export function confidenceColor(score: number): string {
  if (score >= 0.85) return 'text-green-600 bg-green-50';
  if (score >= 0.60) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

export function confidenceLabel(score: number): string {
  if (score >= 0.90) return 'Elevée';
  if (score >= 0.70) return 'Moyenne';
  return 'Faible';
}

/** Returns true if confidence is high enough to auto-suggest routing */
export function isConfidentEnoughToRoute(confidence: number): boolean {
  return confidence >= 0.90;
}

/** Modules that require confidence >= 0.90 before routing */
export const STRICT_CONFIDENCE_MODULES = new Set(['comptabilite', 'tva', 'supplier_invoices', 'factures']);
