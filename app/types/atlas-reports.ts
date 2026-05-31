export type AtlasReportPeriodPreset = 'month' | 'quarter' | 'year' | 'custom';

export type AtlasReportType =
  | 'commercial'
  | 'comptable'
  | 'fiscal'
  | 'fournisseurs'
  | 'clients'
  | 'tva'
  | 'is'
  | 'cnss'
  | 'bilan';

export const ATLAS_REPORT_TYPES: AtlasReportType[] = [
  'commercial',
  'comptable',
  'fiscal',
  'fournisseurs',
  'clients',
  'tva',
  'is',
  'cnss',
  'bilan',
];

export type AtlasReportPeriod = {
  preset: AtlasReportPeriodPreset;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
};

export type AtlasReportsKpis = {
  chiffreAffaires: number;
  facturesEmises: number;
  facturesImpayees: number;
  facturesImpayeesMontant: number;
  depensesFournisseurs: number;
  tvaNette: number;
  encaissements: number;
};

export type AtlasMonthlyEvolutionPoint = {
  monthKey: string;
  label: string;
  ca: number;
  depenses: number;
  encaissements: number;
};

export type AtlasReportsDashboard = {
  companyId: string;
  companyName: string;
  period: AtlasReportPeriod;
  generatedAt: string;
  kpis: AtlasReportsKpis;
  monthlyEvolution: AtlasMonthlyEvolutionPoint[];
};

export type AtlasReportTableSection = {
  title: string;
  headers: string[];
  rows: string[][];
};

export type AtlasReportPayload = {
  type: AtlasReportType;
  companyId: string;
  companyName: string;
  generatedAt: string;
  period: AtlasReportPeriod;
  sections: AtlasReportTableSection[];
  summary?: Record<string, number | string>;
};
