/**
 * Phase 17 — Context-aware dashboard recommendations.
 */

import type { ChecklistSignals } from '@/app/lib/atlas-onboarding-engine';

export type SmartRecommendation = {
  id: string;
  titleFr: string;
  titleAr: string;
  descriptionFr: string;
  descriptionAr: string;
  href: string;
  priority: number;
};

export function buildSmartRecommendations(signals: ChecklistSignals): SmartRecommendation[] {
  const recs: SmartRecommendation[] = [];

  if (!signals.hasInvoice) {
    recs.push({
      id: 'first_invoice',
      titleFr: 'Créer ma première facture',
      titleAr: 'إنشاء أول فاتورة',
      descriptionFr: 'Client, montant HT, et c’est enregistré.',
      descriptionAr: 'عميل ومبلغ دون ضريبة، ثم يُحفظ.',
      href: '/factures?welcome=1',
      priority: 100,
    });
  }

  if (!signals.hasClient) {
    recs.push({
      id: 'first_client',
      titleFr: 'Ajouter un client',
      titleAr: 'إضافة عميل',
      descriptionFr: 'Enregistrez un client pour les prochaines factures.',
      descriptionAr: 'سجّل عميلاً للفواتير القادمة.',
      href: '/clients',
      priority: 80,
    });
  }

  if (!signals.companyCustomized) {
    recs.push({
      id: 'customize_company',
      titleFr: 'Personnaliser les informations de mon entreprise',
      titleAr: 'تخصيص معلومات الشركة',
      descriptionFr: 'Optionnel : ICE, adresse et coordonnées, quand vous voulez.',
      descriptionAr: 'اختياري: ICE والعنوان وبيانات الاتصال.',
      href: '/companies',
      priority: 40,
    });
  }

  return recs.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
