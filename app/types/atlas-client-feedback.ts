/** Client Feedback Score — satisfaction, NPS, comments. */

export type FeedbackSourceType = 'invoice' | 'project' | 'manual';

export type FeedbackRequestStatus = 'pending' | 'sent' | 'opened' | 'completed' | 'expired';

export type FeedbackChannel = 'link' | 'whatsapp' | 'email' | 'manual';

export type AtlasFeedbackRequest = {
  id: string;
  companyId: string | null;
  sourceType: FeedbackSourceType;
  invoiceId: string | null;
  projectId: string | null;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  subjectLabel: string;
  status: FeedbackRequestStatus;
  channel: FeedbackChannel;
  token: string;
  shareUrl: string | null;
  sentAt: string | null;
  openedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  response: AtlasFeedbackResponse | null;
};

export type AtlasFeedbackResponse = {
  id: string;
  requestId: string;
  satisfactionScore: number;
  npsScore: number;
  comment: string | null;
  respondentName: string | null;
  submittedAt: string;
  npsCategory: 'promoter' | 'passive' | 'detractor';
};

export type FeedbackTrendPoint = {
  month: string;
  responseCount: number;
  avgSatisfaction: number | null;
  nps: number | null;
};

export type FeedbackDashboardSummary = {
  totalRequests: number;
  completed: number;
  pending: number;
  responseRate: number;
  avgSatisfaction: number | null;
  nps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
};

export type FeedbackDashboard = {
  requests: AtlasFeedbackRequest[];
  summary: FeedbackDashboardSummary;
  trends: FeedbackTrendPoint[];
};

export type PublicFeedbackForm = {
  subjectLabel: string;
  companyName: string | null;
  clientName: string | null;
  alreadySubmitted: boolean;
  expiresAt: string | null;
};

export const SOURCE_TYPE_LABELS: Record<FeedbackSourceType, string> = {
  invoice: 'Facture',
  project: 'Projet',
  manual: 'Manuel',
};

export const REQUEST_STATUS_LABELS: Record<FeedbackRequestStatus, string> = {
  pending: 'En attente',
  sent: 'Envoyé',
  opened: 'Ouvert',
  completed: 'Répondu',
  expired: 'Expiré',
};

export const CHANNEL_LABELS: Record<FeedbackChannel, string> = {
  link: 'Lien',
  whatsapp: 'WhatsApp',
  email: 'Email',
  manual: 'Manuel',
};

export function npsCategory(score: number): 'promoter' | 'passive' | 'detractor' {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

export function computeNps(scores: number[]): number | null {
  if (scores.length === 0) return null;
  let promoters = 0;
  let detractors = 0;
  for (const s of scores) {
    const cat = npsCategory(s);
    if (cat === 'promoter') promoters++;
    else if (cat === 'detractor') detractors++;
  }
  return Math.round(((promoters - detractors) / scores.length) * 100);
}
