/** HR & Labor Law Compliance — contracts, documents, attendance, compliance. */

export type ContractType = 'cdi' | 'cdd' | 'stage' | 'interim' | 'apprenticeship';

export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

export type EmployeeDocumentType =
  | 'cin'
  | 'cnss_card'
  | 'diploma'
  | 'medical_certificate'
  | 'work_permit'
  | 'contract_signed'
  | 'payslip'
  | 'disciplinary'
  | 'other';

export type DocumentStatus = 'valid' | 'expiring' | 'expired' | 'missing';

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'remote'
  | 'leave_paid'
  | 'leave_unpaid'
  | 'holiday';

export type ComplianceCategory =
  | 'cnss'
  | 'medical'
  | 'contract'
  | 'training'
  | 'safety'
  | 'document'
  | 'payroll'
  | 'other';

export type ComplianceStatus = 'pending' | 'compliant' | 'overdue' | 'waived';

export type CompliancePriority = 'low' | 'normal' | 'high' | 'critical';

export type AtlasEmployeeProfile = {
  id: string;
  companyId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  department: string | null;
  cin: string | null;
  cnssMatricule: string | null;
  grossSalaryMad: number;
  hireDate: string | null;
  status: string;
  activeContract: AtlasEmploymentContract | null;
  documentCount: number;
  complianceOverdue: number;
};

export type AtlasEmploymentContract = {
  id: string;
  employeeId: string;
  employeeName?: string;
  contractType: ContractType;
  referenceNumber: string | null;
  startDate: string;
  endDate: string | null;
  trialPeriodEnd: string | null;
  weeklyHours: number;
  grossSalaryMad: number;
  workLocation: string | null;
  jobTitle: string | null;
  noticePeriodDays: number;
  status: ContractStatus;
  legalBasis: string;
  signedAt: string | null;
  daysUntilEnd: number | null;
  daysUntilTrialEnd: number | null;
};

export type AtlasEmployeeDocument = {
  id: string;
  employeeId: string;
  employeeName?: string;
  documentType: EmployeeDocumentType;
  title: string;
  fileName: string | null;
  fileUrl: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: DocumentStatus;
  daysUntilExpiry: number | null;
};

export type AtlasEmployeeAttendance = {
  id: string;
  employeeId: string;
  employeeName?: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number | null;
  notes: string | null;
};

export type AtlasHrComplianceItem = {
  id: string;
  employeeId: string | null;
  employeeName?: string | null;
  category: ComplianceCategory;
  title: string;
  description: string | null;
  legalBasis: string | null;
  dueDate: string | null;
  completedAt: string | null;
  status: ComplianceStatus;
  priority: CompliancePriority;
  daysUntilDue: number | null;
};

export type HrComplianceDashboard = {
  employees: AtlasEmployeeProfile[];
  contracts: AtlasEmploymentContract[];
  documents: AtlasEmployeeDocument[];
  attendance: AtlasEmployeeAttendance[];
  complianceItems: AtlasHrComplianceItem[];
  summary: HrComplianceSummary;
};

export type HrComplianceSummary = {
  totalEmployees: number;
  activeContracts: number;
  expiringContracts: number;
  documentsExpiring: number;
  overdueCompliance: number;
  attendanceTodayPresent: number;
  attendanceTodayTotal: number;
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  cdi: 'CDI',
  cdd: 'CDD',
  stage: 'Stage',
  interim: 'Intérim',
  apprenticeship: 'Apprentissage',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  expired: 'Expiré',
  terminated: 'Résilié',
};

export const DOCUMENT_TYPE_LABELS: Record<EmployeeDocumentType, string> = {
  cin: 'CIN',
  cnss_card: 'Carte CNSS',
  diploma: 'Diplôme',
  medical_certificate: 'Certificat médical',
  work_permit: 'Permis de travail',
  contract_signed: 'Contrat signé',
  payslip: 'Bulletin de paie',
  disciplinary: 'Disciplinaire',
  other: 'Autre',
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent: 'Absent',
  late: 'Retard',
  remote: 'Télétravail',
  leave_paid: 'Congé payé',
  leave_unpaid: 'Congé sans solde',
  holiday: 'Férié',
};

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  cnss: 'CNSS / AMO',
  medical: 'Visite médicale',
  contract: 'Contrat de travail',
  training: 'Formation',
  safety: 'Sécurité au travail',
  document: 'Document obligatoire',
  payroll: 'Paie / déclarations',
  other: 'Autre',
};

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  pending: 'En attente',
  compliant: 'Conforme',
  overdue: 'En retard',
  waived: 'Dispensé',
};

export const DEFAULT_COMPLIANCE_TEMPLATES: Array<{
  category: ComplianceCategory;
  title: string;
  legalBasis: string;
  priority: CompliancePriority;
}> = [
  { category: 'cnss', title: 'Affiliation CNSS employé', legalBasis: 'Art. 12 Code de la CNSS', priority: 'critical' },
  { category: 'medical', title: 'Visite médicale d\'embauche', legalBasis: 'Art. 193 Code du travail', priority: 'high' },
  { category: 'contract', title: 'Contrat de travail signé', legalBasis: 'Art. 15 Code du travail (Loi 65-99)', priority: 'critical' },
  { category: 'document', title: 'Copie CIN en dossier', legalBasis: 'Obligation employeur — identification', priority: 'normal' },
  { category: 'payroll', title: 'Bulletin de paie mensuel', legalBasis: 'Art. 67 Code du travail', priority: 'high' },
  { category: 'safety', title: 'Formation sécurité au poste', legalBasis: 'Art. 190-191 Code du travail', priority: 'normal' },
];
