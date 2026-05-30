export type AtlasPayrollRunStatus = 'draft' | 'validated';

export type AtlasPayrollRun = {
  id: string;
  companyId: string;
  periodYear: number;
  periodMonth: number;
  status: AtlasPayrollRunStatus;
  totalGross: number;
  totalCnssEmployee: number;
  totalAmoEmployee: number;
  totalIr: number;
  totalNet: number;
  formulaVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type AtlasSalary = {
  id: string;
  companyId: string;
  payrollRunId: string;
  employeeId: string;
  employeeName?: string;
  grossSalary: number;
  cnssEmployee: number;
  amoEmployee: number;
  irAmount: number;
  netSalary: number;
  cnssEmployer: number;
  amoEmployer: number;
  createdAt: string;
  updatedAt: string;
};

export type AtlasIrSnapshot = {
  id: string;
  companyId: string;
  payrollRunId: string | null;
  periodYear: number;
  periodMonth: number;
  totalIr: number;
  totalGross: number;
  employeeCount: number;
  formulaVersion: string;
  disclaimer: string;
  snapshotJson: Record<string, unknown>;
  createdAt: string;
};

export type AtlasIsDraftStatus = 'draft' | 'validated';

export type AtlasIsDraft = {
  id: string;
  companyId: string;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  revenueHT: number;
  supplierExpensesHT: number;
  payrollTotal: number;
  accountingCharges: number;
  taxableResult: number;
  estimatedIS: number;
  minimalContribution: number;
  isDue: number;
  status: AtlasIsDraftStatus;
  formulaVersion: string;
  sourcesJson: Record<string, unknown>;
  disclaimer: string;
  createdAt: string;
  updatedAt: string;
};
