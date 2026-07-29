/** Fiscal compliance pre-check — DGI risk scanner. */

export type ComplianceFindingSeverity = 'critical' | 'warning' | 'info';

export type ComplianceFinding = {
  id: string;
  severity: ComplianceFindingSeverity;
  category: 'tva' | 'is' | 'charges' | 'comptabilite' | 'juridique' | 'paie';
  titleFr: string;
  titleAr: string;
  descriptionFr: string;
  descriptionAr: string;
  recommendationFr: string;
  recommendationAr: string;
  href?: string;
  metric?: string;
};

export type FiscalComplianceScanResult = {
  companyId: string;
  fiscalYear: number;
  score: number;
  riskScore: number;
  band: 'healthy' | 'attention' | 'critical';
  findings: ComplianceFinding[];
  scannedAt: string;
  formulaVersion: string;
};
