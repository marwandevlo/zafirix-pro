/** Moroccan statutory fiscal deadlines — Zafirix Pro fiscal calendar. */

export type FiscalDeadlineSeverity = 'red' | 'orange' | 'green';

export type FiscalDeadlineCategory =
  | 'tva'
  | 'is'
  | 'ir'
  | 'cnss'
  | 'depot_legal'
  | 'patente'
  | 'acompte_is';

export type FiscalDeadline = {
  id: string;
  category: FiscalDeadlineCategory;
  labelFr: string;
  labelAr: string;
  dueDate: string;
  daysRemaining: number;
  severity: FiscalDeadlineSeverity;
  href: string;
  externalUrl?: string;
  periodLabel?: string;
};

export type FiscalDeadlineRadar = {
  companyId: string | null;
  fiscalYear: number;
  generatedAt: string;
  deadlines: FiscalDeadline[];
  counts: { red: number; orange: number; green: number; total: number };
};
