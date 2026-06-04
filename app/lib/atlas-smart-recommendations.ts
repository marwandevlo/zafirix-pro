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

  if (!signals.hasCompany) {
    recs.push({
      id: 'create_company',
      titleFr: 'Créez votre société',
      titleAr: 'أنشئ شركتك',
      descriptionFr: 'Commencez par renseigner ICE, RC et IF.',
      descriptionAr: 'ابدأ بإدخال ICE وRC وIF.',
      href: '/setup',
      priority: 100,
    });
  }

  if (signals.hasCompany && !signals.tvaConfigured) {
    recs.push({
      id: 'configure_tva',
      titleFr: 'Configurez la TVA',
      titleAr: 'اضبط TVA',
      descriptionFr: 'Définissez votre régime et vos taux de TVA.',
      descriptionAr: 'حدد نظام ومعدلات TVA.',
      href: '/setup',
      priority: 90,
    });
  }

  if (!signals.hasDocument) {
    recs.push({
      id: 'upload_invoice',
      titleFr: 'Uploadez votre première facture',
      titleAr: 'ارفع أول فاتورة',
      descriptionFr: 'Documents IA extrait automatiquement les données.',
      descriptionAr: 'Documents IA يستخرج البيانات تلقائياً.',
      href: '/documents',
      priority: 80,
    });
  }

  if (!signals.hasInvoice) {
    recs.push({
      id: 'first_invoice',
      titleFr: 'Créez une facture',
      titleAr: 'أنشئ فاتورة',
      descriptionFr: 'Module Factures — client, lignes, validation.',
      descriptionAr: 'وحدة الفواتير — عميل وبنود.',
      href: '/factures',
      priority: 75,
    });
  }

  if (!signals.wizardCompleted) {
    recs.push({
      id: 'complete_setup',
      titleFr: 'Terminez l\'assistant de configuration',
      titleAr: 'أكمل معالج الإعداد',
      descriptionFr: '7 étapes pour une mise en route complète.',
      descriptionAr: '7 خطوات للإعداد الكامل.',
      href: '/setup',
      priority: 70,
    });
  }

  if (signals.hasCompany && !signals.hasPayrollRun) {
    recs.push({
      id: 'payroll_setup',
      titleFr: 'Configurez la paie',
      titleAr: 'اضبط الرواتب',
      descriptionFr: 'Ajoutez vos employés et lancez un premier run.',
      descriptionAr: 'أضف الموظفين وشغّل أول run.',
      href: '/rh',
      priority: 60,
    });
  }

  if (signals.hasCompany && signals.tvaConfigured && signals.hasDocument) {
    recs.push({
      id: 'generate_liasse',
      titleFr: 'Préparez votre liasse fiscale',
      titleAr: 'جهّز الحزمة الضريبية',
      descriptionFr: 'Vérifiez la readiness puis générez le package.',
      descriptionAr: 'تحقق من الجاهزية ثم ولّد الحزمة.',
      href: '/liasse',
      priority: 50,
    });
  }

  return recs.sort((a, b) => b.priority - a.priority).slice(0, 4);
}
