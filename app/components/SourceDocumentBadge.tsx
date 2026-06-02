'use client';

import { FileText, ExternalLink } from 'lucide-react';

type SourceDocumentBadgeProps = {
  sourceDocumentId: string | null | undefined;
  sourceDocumentType?: string | null;
  /** compact: small inline badge. full: row with "Voir document source" link */
  variant?: 'compact' | 'full';
  className?: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_invoice: "Facture d'achat",
  sales_invoice: 'Facture de vente',
  receipt: 'Reçu',
  bank_statement: 'Relevé bancaire',
  payroll_slip: 'Bulletin de paie',
  legal_contract: 'Contrat',
  company_statutes: 'Statuts',
  hr_document: 'Document RH',
  accounting_document: 'Document comptable',
  cnss_document: 'Document CNSS',
  tax_declaration: 'Déclaration fiscale',
  vat_declaration: 'Déclaration TVA',
  legal_notice: 'Avis légal',
  unknown: 'Document',
};

function typeLabel(type: string | null | undefined): string {
  if (!type) return 'Document source';
  return DOC_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

/**
 * Reusable badge/link component shown on downstream records
 * (invoices, accounting entries, RH records, etc.) that were
 * created from a Documents IA upload.
 *
 * Links to /documents?highlight=<sourceDocumentId>
 */
export function SourceDocumentBadge({
  sourceDocumentId,
  sourceDocumentType,
  variant = 'compact',
  className = '',
}: SourceDocumentBadgeProps) {
  if (!sourceDocumentId) return null;

  const href = `/documents?highlight=${sourceDocumentId}`;
  const label = typeLabel(sourceDocumentType);

  if (variant === 'compact') {
    return (
      <a
        href={href}
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:text-blue-700 transition-colors font-medium ${className}`}
        title={`Voir le document source : ${label}`}
      >
        <FileText size={11} />
        Source IA
      </a>
    );
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl ${className}`}>
      <div className="p-1.5 bg-blue-100 rounded-lg shrink-0">
        <FileText size={16} className="text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-800">Généré par Documents IA</p>
        <p className="text-xs text-blue-600">{label} · #{sourceDocumentId.slice(0, 12)}…</p>
      </div>
      <a
        href={href}
        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-100 transition-colors"
      >
        Voir document source
        <ExternalLink size={11} />
      </a>
    </div>
  );
}

export default SourceDocumentBadge;
