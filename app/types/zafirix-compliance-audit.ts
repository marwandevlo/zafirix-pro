/**
 * Moroccan accounting audit & compliance findings (Expert-Comptable Virtuel).
 */

export type ComplianceSeverity = 'critical' | 'warning' | 'info';

export type ComplianceCheckCode =
  | 'company_ice_missing'
  | 'company_ice_invalid'
  | 'company_cnss_missing'
  | 'invoice_vat_rate_invalid'
  | 'invoice_amount_mismatch'
  | 'invoice_client_ice_invalid'
  | 'supplier_ice_missing'
  | 'supplier_ice_invalid'
  | 'accounting_unbalanced'
  | 'ae_ceiling_near'
  | 'ae_ceiling_exceeded'
  | 'tva_period_gap';

export type MoroccoComplianceFinding = {
  id: string;
  code: ComplianceCheckCode;
  severity: ComplianceSeverity;
  titleFr: string;
  titleAr: string;
  messageFr: string;
  messageAr: string;
  recommendationFr: string;
  recommendationAr: string;
  entityType?: 'company' | 'invoice' | 'supplier_invoice' | 'accounting' | 'ae_profile';
  entityId?: string | null;
  entityLabel?: string | null;
  meta?: Record<string, unknown>;
};

export type MoroccoComplianceAuditResult = {
  companyId: string;
  scannedAt: string;
  score: number;
  band: 'healthy' | 'attention' | 'critical';
  counts: {
    critical: number;
    warning: number;
    info: number;
    invoicesScanned: number;
    supplierInvoicesScanned: number;
    accountingEntriesScanned: number;
  };
  findings: MoroccoComplianceFinding[];
  summaryFr: string;
  summaryAr: string;
};
