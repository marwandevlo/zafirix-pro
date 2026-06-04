/**
 * Phase 17 — Product tour steps and persistence.
 */

export type TourStepId =
  | 'dashboard'
  | 'documents'
  | 'invoices'
  | 'ai_copilot'
  | 'tva'
  | 'liasse';

export type TourStep = {
  id: TourStepId;
  target: string;
  titleFr: string;
  titleAr: string;
  bodyFr: string;
  bodyAr: string;
  href?: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    target: '[data-tour="dashboard"]',
    titleFr: 'Tableau de bord',
    titleAr: 'لوحة التحكم',
    bodyFr: 'Vue d\'ensemble : KPIs, échéances fiscales et actions recommandées.',
    bodyAr: 'نظرة عامة: مؤشرات ومواعيد وإجراءات مقترحة.',
  },
  {
    id: 'documents',
    target: '[data-tour="documents"]',
    titleFr: 'Documents IA',
    titleAr: 'وثائق ذكية',
    bodyFr: 'Uploadez factures, relevés et bulletins — OCR et routage automatique.',
    bodyAr: 'ارفع الفواتير والكشوف — OCR وتوجيه تلقائي.',
    href: '/documents',
  },
  {
    id: 'invoices',
    target: '[data-tour="invoices"]',
    titleFr: 'Factures',
    titleAr: 'الفواتير',
    bodyFr: 'Créez et suivez vos factures clients et fournisseurs.',
    bodyAr: 'أنشئ وتابع فواتير العملاء والموردين.',
    href: '/factures',
  },
  {
    id: 'ai_copilot',
    target: '[data-tour="assistant"]',
    titleFr: 'Assistant IA',
    titleAr: 'المساعد الذكي',
    bodyFr: 'Posez vos questions comptables et fiscales en français.',
    bodyAr: 'اطرح أسئلتك المحاسبية والضريبية.',
    href: '/assistant',
  },
  {
    id: 'tva',
    target: '[data-tour="tva"]',
    titleFr: 'TVA',
    titleAr: 'TVA',
    bodyFr: 'Déclarations et suivi TVA marocaine.',
    bodyAr: 'تصاريح ومتابعة TVA.',
    href: '/tva',
  },
  {
    id: 'liasse',
    target: '[data-tour="liasse"]',
    titleFr: 'Liasse fiscale',
    titleAr: 'الحزمة الضريبية',
    bodyFr: 'Préparez votre liasse et package d\'audit.',
    bodyAr: 'جهّز حزمتك الضريبية.',
    href: '/liasse',
  },
];

const TOUR_DONE_KEY = 'atlas_guided_tour_completed_v1';

export function isTourCompleted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTourCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOUR_DONE_KEY, '1');
    window.dispatchEvent(new Event('atlas-tour-updated'));
  } catch {
    /* ignore */
  }
}

export function resetTour(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TOUR_DONE_KEY);
    window.dispatchEvent(new Event('atlas-tour-updated'));
  } catch {
    /* ignore */
  }
}
