/** Commissions & brokerage management types. */

export type CommissionBasis = 'invoice_issued' | 'payment_collected';
export type CommissionRateType = 'percent' | 'fixed';
export type CommissionEntryStatus = 'pending' | 'approved' | 'paid' | 'cancelled';
export type SalesAgentType = 'sales' | 'broker' | 'partner';

export type AtlasBrokerTier = {
  id: string;
  companyId: string | null;
  name: string;
  code: string;
  minSalesMad: number;
  minCollectedMad: number;
  commissionRate: number;
  bonusRate: number;
  sortOrder: number;
  isActive: boolean;
};

export type AtlasSalesAgent = {
  id: string;
  companyId: string | null;
  tierId: string | null;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  agentType: SalesAgentType;
  isActive: boolean;
  tierName?: string;
  tierCode?: string;
};

export type AtlasCommissionRule = {
  id: string;
  companyId: string | null;
  agentId: string | null;
  name: string;
  basis: CommissionBasis;
  rateType: CommissionRateType;
  rateValue: number;
  minAmount: number;
  maxCommission: number | null;
  isActive: boolean;
  priority: number;
};

export type AtlasCommissionEntry = {
  id: string;
  agentId: string;
  agentName?: string;
  ruleId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  basis: CommissionBasis;
  baseAmount: number;
  ratePct: number;
  commissionAmount: number;
  tierBonus: number;
  status: CommissionEntryStatus;
  calculatedAt: string;
  paidAt: string | null;
  invoiceNumber?: string | null;
  clientName?: string | null;
};

export type AgentPerformance = {
  agentId: string;
  agentName: string;
  agentCode: string;
  tierName: string | null;
  totalSales: number;
  totalCollected: number;
  commissionEarned: number;
  commissionPending: number;
  commissionPaid: number;
  invoiceCount: number;
};

export type CommissionsDashboard = {
  agents: AtlasSalesAgent[];
  tiers: AtlasBrokerTier[];
  rules: AtlasCommissionRule[];
  entries: AtlasCommissionEntry[];
  performance: AgentPerformance[];
  stats: {
    totalPending: number;
    totalApproved: number;
    totalPaid: number;
    activeAgents: number;
    entriesCount: number;
  };
};

export const BASIS_LABELS: Record<CommissionBasis, string> = {
  invoice_issued: 'Sur facturation (CA)',
  payment_collected: 'Sur encaissement',
};

export const STATUS_LABELS: Record<CommissionEntryStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  paid: 'Payé',
  cancelled: 'Annulé',
};

export const AGENT_TYPE_LABELS: Record<SalesAgentType, string> = {
  sales: 'Commercial',
  broker: 'Courtier',
  partner: 'Partenaire',
};

export const DEFAULT_TIERS: Omit<AtlasBrokerTier, 'id' | 'companyId'>[] = [
  { name: 'Bronze', code: 'bronze', minSalesMad: 0, minCollectedMad: 0, commissionRate: 3, bonusRate: 0, sortOrder: 1, isActive: true },
  { name: 'Silver', code: 'silver', minSalesMad: 50000, minCollectedMad: 40000, commissionRate: 5, bonusRate: 0.5, sortOrder: 2, isActive: true },
  { name: 'Gold', code: 'gold', minSalesMad: 150000, minCollectedMad: 120000, commissionRate: 7, bonusRate: 1, sortOrder: 3, isActive: true },
  { name: 'Platinum', code: 'platinum', minSalesMad: 500000, minCollectedMad: 400000, commissionRate: 10, bonusRate: 2, sortOrder: 4, isActive: true },
];
