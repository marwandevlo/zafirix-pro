/** CEO AI Executive Briefing — aggregated metrics and multilingual reports. */

import type { AtlasMonthlyEvolutionPoint, AtlasReportPeriod } from '@/app/types/atlas-reports';

export type BriefingLanguage = 'fr' | 'en' | 'ar' | 'darija';

export type ExecutiveBriefingMetrics = {
  turnover: number;
  turnoverLabel: string;
  collections: number;
  supplierExpenses: number;
  netCashFlow: number;
  bankBalance: number;
  outstandingDebt: number;
  overdueInvoices: number;
  overdueAmount: number;
  tvaNet: number;
  invoicesIssued: number;
  unpaidInvoices: number;
  highRiskClients: number;
  activeDebtCases: number;
  grossMarginPct: number | null;
};

export type ExecutiveBriefingPayload = {
  companyId: string;
  companyName: string;
  period: AtlasReportPeriod;
  generatedAt: string;
  metrics: ExecutiveBriefingMetrics;
  monthlyTrend: AtlasMonthlyEvolutionPoint[];
  risks: string[];
  highlights: string[];
};

export type ExecutiveBriefingReport = ExecutiveBriefingPayload & {
  language: BriefingLanguage;
  narrative: string;
  recommendations: string[];
  provider?: string;
};

export const BRIEFING_LANGUAGE_LABELS: Record<BriefingLanguage, string> = {
  fr: 'Français',
  en: 'English',
  ar: 'العربية الفصحى',
  darija: 'الدارجة المغربية',
};

export const BRIEFING_LANGUAGE_PROMPTS: Record<BriefingLanguage, string> = {
  fr: 'Rédige en français professionnel, ton dirigeant (CEO), concis et actionnable.',
  en: 'Write in professional English for a CEO audience. Be concise and action-oriented.',
  ar: 'اكتب بالعربية الفصحى بأسلوب تنفيذي رسمي، موجز وعملي.',
  darija: 'كتب بالدارجة المغربية (لهجة م business/pro)، بأسلوب مفهوم للمدير العام، مختصر وعملي.',
};
