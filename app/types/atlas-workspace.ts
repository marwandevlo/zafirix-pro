export type WorkspaceType = 'single_company' | 'accounting_firm' | 'enterprise_group';

export type AtlasWorkspace = {
  id: string;
  name: string;
  workspaceType: WorkspaceType;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type AtlasRoleSlug =
  | 'super_admin'
  | 'owner'
  | 'manager'
  | 'accountant'
  | 'payroll_manager'
  | 'auditor'
  | 'viewer';

export type AtlasUserRole = {
  id: string;
  userId: string;
  workspaceId: string | null;
  companyId: string | null;
  roleSlug: AtlasRoleSlug;
  createdAt: string;
};

export type CompanyStatus = 'active' | 'inactive' | 'archived';

export type HealthBand = 'healthy' | 'attention' | 'critical';

export type CabinetClientRow = {
  id: string;
  workspaceId: string;
  companyId: string;
  clientLabel: string;
  contactName: string | null;
  contactEmail: string | null;
  healthScore: number;
  readinessScore: number;
  healthBand: HealthBand;
  alertCount: number;
  companyName?: string;
};

export type CompanyHealthResult = {
  companyId: string;
  score: number;
  band: HealthBand;
  readinessScore: number;
  alertCount: number;
  validationBacklog: number;
  unreconciledBank: number;
  tvaIssues: number;
  payrollIssues: number;
  factors: Record<string, number>;
};

export type ConsolidatedDashboard = {
  companyCount: number;
  totalInvoices: number;
  totalTvaAlerts: number;
  totalPayrollDrafts: number;
  totalAlerts: number;
  avgReadiness: number;
  avgHealth: number;
  companies: Array<{
    companyId: string;
    name: string;
    readiness: number;
    health: number;
    alerts: number;
  }>;
};
