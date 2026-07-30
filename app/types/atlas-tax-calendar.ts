/** Tax calendar DB types — deadlines, compliance events, notification preferences. */

import type { FiscalDeadlineCategory, FiscalDeadlineSeverity } from '@/app/types/atlas-fiscal-calendar';

export type TaxDeadlineStatus = 'upcoming' | 'due_soon' | 'overdue' | 'filed' | 'waived';

export type AtlasTaxDeadline = {
  id: string;
  companyId: string | null;
  deadlineKey: string;
  category: FiscalDeadlineCategory;
  labelFr: string;
  labelAr: string;
  dueDate: string;
  href: string;
  externalUrl: string | null;
  periodLabel: string | null;
  status: TaxDeadlineStatus;
  filedAt: string | null;
  daysRemaining: number;
  severity: FiscalDeadlineSeverity;
  syncedAt: string;
};

export type ComplianceEventType =
  | 'reminder_sent'
  | 'deadline_filed'
  | 'deadline_missed'
  | 'alert_email'
  | 'alert_whatsapp'
  | 'alert_in_app'
  | 'sync'
  | 'preference_updated';

export type AtlasComplianceEvent = {
  id: string;
  companyId: string | null;
  deadlineId: string | null;
  deadlineKey: string | null;
  category: string | null;
  eventType: ComplianceEventType;
  channel: string | null;
  title: string;
  body: string | null;
  createdAt: string;
};

export type AtlasNotificationPreferences = {
  id: string;
  companyId: string | null;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  inAppEnabled: boolean;
  alertDays: number[];
  categories: string[];
  accountantEmail: string | null;
  accountantPhone: string | null;
  accountantName: string | null;
  managerEmail: string | null;
  managerPhone: string | null;
  timezone: string;
};

export const DEFAULT_ALERT_DAYS = [21, 14, 7, 3, 1] as const;
export const DEFAULT_FISCAL_CATEGORIES = ['tva', 'is', 'ir', 'cnss', 'acompte_is'] as const;
