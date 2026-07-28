export type AtlasTvaPeriodType = 'monthly' | 'quarterly';
export type AtlasTvaPeriodStatus = 'pending' | 'declared';

export type AtlasTvaLineItem = {
  id: string;
  kind: 'sale' | 'purchase' | 'accounting';
  reference: string;
  counterparty: string;
  issueDate: string;
  amountHT: number;
  vatAmount: number;
  totalTTC: number;
  vatRate?: number;
  source: 'invoice' | 'supplier_invoice' | 'accounting_entry' | 'tva_suggestion';
};

export type AtlasTvaPeriodCalculation = {
  periodKey: string;
  periodType: AtlasTvaPeriodType;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  tvaCollectee: number;
  tvaDeductible: number;
  tvaNette: number;
  caHT: number;
  achatsHT: number;
  salesCount: number;
  purchasesCount: number;
  accountingTvaAdjustments: number;
  lines: AtlasTvaLineItem[];
};

export type AtlasTvaPeriodRecord = AtlasTvaPeriodCalculation & {
  id: string;
  companyId: string;
  status: AtlasTvaPeriodStatus;
  declarationDueDate: string;
  declaredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AtlasTvaDashboard = {
  companyId: string;
  regimeTVA: string;
  current: AtlasTvaPeriodRecord;
  nextDeclarationDate: string;
  amountDue: number;
  status: AtlasTvaPeriodStatus;
  selectedPeriodKey?: string;
};

export type AtlasTvaHistoryResponse = {
  periods: AtlasTvaPeriodRecord[];
  regimeTVA: string;
};
