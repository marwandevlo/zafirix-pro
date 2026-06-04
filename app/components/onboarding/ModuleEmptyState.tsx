'use client';

import type { ReactNode } from 'react';
import { EmptyStateCta } from '@/app/components/ui/EmptyStateCta';

export type ModuleEmptyPreset =
  | 'documents'
  | 'invoices'
  | 'accounting'
  | 'tva'
  | 'payroll'
  | 'bank'
  | 'liasse'
  | 'audit'
  | 'billing';

const PRESETS: Record<
  ModuleEmptyPreset,
  {
    titleFr: string;
    titleAr: string;
    descFr: string;
    descAr: string;
    btnFr: string;
    btnAr: string;
    href: string;
    exampleFr: string;
    exampleAr: string;
  }
> = {
  documents: {
    titleFr: 'Aucun document pour le moment',
    titleAr: 'لا توجد وثائق بعد',
    descFr: 'Uploadez factures, relevés ou bulletins — l\'OCR extrait les données automatiquement.',
    descAr: 'ارفع الفواتير والكشوف — OCR يستخرج البيانات تلقائياً.',
    btnFr: 'Uploader un document',
    btnAr: 'رفع وثيقة',
    href: '/documents',
    exampleFr: 'Exemple : facture fournisseur PDF ou photo',
    exampleAr: 'مثال: فاتورة مورد PDF',
  },
  invoices: {
    titleFr: 'Aucune facture enregistrée',
    titleAr: 'لا توجد فواتير',
    descFr: 'Créez votre première facture client ou importez-en une via Documents IA.',
    descAr: 'أنشئ أول فاتورة أو استوردها عبر Documents IA.',
    btnFr: 'Créer une facture',
    btnAr: 'إنشاء فاتورة',
    href: '/factures',
    exampleFr: 'Exemple : facture client SARL — 10 000 MAD HT',
    exampleAr: 'مثال: فاتورة عميل — 10 000 MAD',
  },
  accounting: {
    titleFr: 'Journal vide',
    titleAr: 'دفتر فارغ',
    descFr: 'Les écritures apparaissent après validation des documents ou saisie manuelle.',
    descAr: 'تظهر القيود بعد التحقق من الوثائق أو الإدخال اليدوي.',
    btnFr: 'Voir Documents IA',
    btnAr: 'عرض Documents IA',
    href: '/documents',
    exampleFr: 'Exemple : vente marchandises → compte 7111',
    exampleAr: 'مثال: بيع بضائع → حساب 7111',
  },
  tva: {
    titleFr: 'Aucune période TVA',
    titleAr: 'لا توجد فترة TVA',
    descFr: 'Configurez la TVA dans l\'assistant puis enregistrez vos premières factures.',
    descAr: 'اضبط TVA في المعالج ثم سجّل فواتيرك.',
    btnFr: 'Configurer la TVA',
    btnAr: 'إعداد TVA',
    href: '/setup',
    exampleFr: 'Exemple : régime mensuel, taux 20 %',
    exampleAr: 'مثال: نظام شهري، معدل 20%',
  },
  payroll: {
    titleFr: 'Paie non configurée',
    titleAr: 'الرواتب غير مضبوطة',
    descFr: 'Ajoutez vos employés et lancez un premier run de paie.',
    descAr: 'أضف الموظفين وشغّل أول مسير رواتب.',
    btnFr: 'Configurer la paie',
    btnAr: 'إعداد الرواتب',
    href: '/rh',
    exampleFr: 'Exemple : 3 employés, période mai 2026',
    exampleAr: 'مثال: 3 موظفين، ماي 2026',
  },
  bank: {
    titleFr: 'Aucune opération bancaire',
    titleAr: 'لا توجد عمليات بنكية',
    descFr: 'Importez un relevé via Documents IA puis routez vers Banque.',
    descAr: 'استورد كشفاً عبر Documents IA ثم وجّهه إلى Banque.',
    btnFr: 'Importer un relevé',
    btnAr: 'استيراد كشف',
    href: '/documents',
    exampleFr: 'Exemple : relevé Attijari PDF',
    exampleAr: 'مثال: كشف Attijari PDF',
  },
  liasse: {
    titleFr: 'Liasse non générée',
    titleAr: 'لم تُولَّد الحزمة',
    descFr: 'Vérifiez les indicateurs de readiness puis générez votre package fiscal.',
    descAr: 'تحقق من مؤشرات الجاهزية ثم ولّد الحزمة.',
    btnFr: 'Préparer la liasse',
    btnAr: 'تحضير الحزمة',
    href: '/liasse',
    exampleFr: 'Exemple : exercice 2026, bilan + résultat',
    exampleAr: 'مثال: سنة 2026، ميزانية + نتيجة',
  },
  audit: {
    titleFr: 'Audit en attente de données',
    titleAr: 'التدقيق ينتظر البيانات',
    descFr: 'Uploadez des documents et validez des écritures pour lancer l\'audit IA.',
    descAr: 'ارفع الوثائق وتحقق من القيود لتشغيل التدقيق.',
    btnFr: 'Ouvrir Documents IA',
    btnAr: 'فتح Documents IA',
    href: '/documents',
    exampleFr: 'Exemple : analyse TVA + écarts comptables',
    exampleAr: 'مثال: تحليل TVA + فروقات محاسبية',
  },
  billing: {
    titleFr: 'Usage non disponible',
    titleAr: 'الاستخدام غير متاح',
    descFr: 'Connectez-vous pour voir votre plan, quotas et consommation.',
    descAr: 'سجّل الدخول لعرض خطتك وحصصك.',
    btnFr: 'Voir les tarifs',
    btnAr: 'عرض الأسعار',
    href: '/pricing',
    exampleFr: 'Exemple : plan Trial — 50 documents/mois',
    exampleAr: 'مثال: خطة Trial — 50 وثيقة/شهر',
  },
};

type Props = {
  module: ModuleEmptyPreset;
  lang?: 'fr' | 'ar';
  onPrimary?: () => void;
  children?: ReactNode;
};

export function ModuleEmptyState({ module, lang = 'fr', onPrimary, children }: Props) {
  const p = PRESETS[module];
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);
  return (
    <div className="py-8">
      {children ?? (
        <EmptyStateCta
          lang={lang}
          title={t(p.titleFr, p.titleAr)}
          description={t(p.descFr, p.descAr)}
          primaryLabelFr={p.btnFr}
          primaryLabelAr={p.btnAr}
          href={onPrimary ? undefined : p.href}
          onPrimary={onPrimary}
          exampleFr={p.exampleFr}
          exampleAr={p.exampleAr}
        />
      )}
    </div>
  );
}
