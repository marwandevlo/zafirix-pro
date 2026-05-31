export type AtlasEmployee = {
  id: string;
  companyId?: string | null;

  fullName: string;
  email?: string;
  phone?: string;
  roleTitle?: string;
  status: string;

  cin?: string;
  cnssMatricule?: string;
  grossSalaryMad?: number;
  hireDate?: string;

  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
};
