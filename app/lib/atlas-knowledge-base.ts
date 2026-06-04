/**
 * Phase 17 — Searchable help / knowledge base (static articles).
 */

export type KnowledgeArticle = {
  id: string;
  category: string;
  titleFr: string;
  titleAr: string;
  keywords: string[];
  summaryFr: string;
  summaryAr: string;
  bodyFr: string;
  bodyAr: string;
};

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: 'getting-started',
    category: 'Getting Started',
    titleFr: 'Démarrer avec Zafirix Atlas',
    titleAr: 'البدء مع Zafirix Atlas',
    keywords: ['démarrage', 'premiers pas', 'setup', 'onboarding'],
    summaryFr: 'Créez votre société, configurez la TVA et uploadez votre première facture en 10 minutes.',
    summaryAr: 'أنشئ شركتك، اضبط TVA وارفع أول فاتورة في 10 دقائق.',
    bodyFr: '1. Créez votre société via /setup ou /companies.\n2. Configurez la TVA.\n3. Uploadez un document dans Documents IA.\n4. Consultez l\'Assistant IA pour vos questions.',
    bodyAr: '1. أنشئ شركتك عبر /setup أو /companies.\n2. اضبط TVA.\n3. ارفع وثيقة في Documents IA.\n4. استخدم المساعد الذكي.',
  },
  {
    id: 'first-invoice',
    category: 'Documents IA',
    titleFr: 'Créer votre première facture',
    titleAr: 'إنشاء أول فاتورة',
    keywords: ['facture', 'invoice', 'créer', 'première'],
    summaryFr: 'Ajoutez un client puis créez une facture depuis le module Factures.',
    summaryAr: 'أضف عميلاً ثم أنشئ فاتورة من وحدة الفواتير.',
    bodyFr: 'Allez dans Factures → Nouvelle facture. Renseignez le client, les lignes et validez. Vous pouvez aussi uploader une facture scannée dans Documents IA.',
    bodyAr: 'اذهب إلى الفواتير → فاتورة جديدة. أو ارفع فاتورة مسحوبة في Documents IA.',
  },
  {
    id: 'configure-tva',
    category: 'TVA',
    titleFr: 'Configurer la TVA',
    titleAr: 'إعداد TVA',
    keywords: ['tva', 'taxe', 'configuration', 'déclaration'],
    summaryFr: 'Définissez le régime TVA et les taux dans l\'assistant /setup.',
    summaryAr: 'حدد نظام TVA والمعدلات في معالج /setup.',
    bodyFr: 'Ouvrez /setup étape TVA ou /tva. Choisissez mensuel/trimestriel et vérifiez les taux par défaut (20%, 14%, 10%, 7%).',
    bodyAr: 'افتح /setup خطوة TVA أو /tva. اختر شهري/ربع سنوي وتحقق من المعدلات.',
  },
  {
    id: 'generate-liasse',
    category: 'Liasse',
    titleFr: 'Générer une liasse fiscale',
    titleAr: 'إنشاء الحزمة الضريبية',
    keywords: ['liasse', 'fiscal', 'clôture', 'déclaration'],
    summaryFr: 'Vérifiez la readiness liasse puis lancez la génération.',
    summaryAr: 'تحقق من جاهزية الحزمة ثم ابدأ التوليد.',
    bodyFr: 'Module Liasse → indicateurs de readiness → générer le package. L\'Assistant IA peut expliquer les écarts.',
    bodyAr: 'وحدة Liasse → مؤشرات الجاهزية → توليد الحزمة.',
  },
  {
    id: 'ai-copilot-onboarding',
    category: 'AI Copilot',
    titleFr: 'Questions fréquentes à l\'Assistant IA',
    titleAr: 'أسئلة شائعة للمساعد الذكي',
    keywords: ['ia', 'copilot', 'assistant', 'aide'],
    summaryFr: 'Posez des questions en langage naturel sur facturation, TVA et paie.',
    summaryAr: 'اطرح أسئلة باللغة الطبيعية عن الفوترة وTVA والرواتب.',
    bodyFr: 'Exemples : "Comment créer ma première facture ?", "Comment configurer la TVA ?", "Comment générer une liasse ?"',
    bodyAr: 'أمثلة: "كيف أنشئ أول فاتورة؟"، "كيف أضبط TVA؟"',
  },
  {
    id: 'billing-plans',
    category: 'Billing',
    titleFr: 'Comprendre les plans et quotas',
    titleAr: 'فهم الخطط والحصص',
    keywords: ['billing', 'plan', 'quota', 'trial'],
    summaryFr: 'Consultez /billing pour votre plan, essai et consommation.',
    summaryAr: 'راجع /billing للخطة والتجربة والاستهلاك.',
    bodyFr: 'Le tableau de bord billing affiche les quotas OCR, IA, documents et sociétés. Upgrade via /pricing.',
    bodyAr: 'لوحة billing تعرض حصص OCR والذكاء الاصطناعي والوثائق.',
  },
  {
    id: 'payroll-setup',
    category: 'Payroll',
    titleFr: 'Configurer la paie',
    titleAr: 'إعداد الرواتب',
    keywords: ['paie', 'payroll', 'cnss', 'salaries'],
    summaryFr: 'Ajoutez les employés puis lancez un run de paie.',
    summaryAr: 'أضف الموظفين ثم شغّل مسير الرواتب.',
    bodyFr: 'RH → employés → Paie → Nouveau run. Vérifiez CNSS et IR dans /setup.',
    bodyAr: 'الموارد البشرية → موظفون → Paie → run جديد.',
  },
  {
    id: 'bank-import',
    category: 'Banking',
    titleFr: 'Importer un relevé bancaire',
    titleAr: 'استيراد كشف بنكي',
    keywords: ['banque', 'relevé', 'import', 'bank'],
    summaryFr: 'Uploadez un relevé PDF dans Documents IA puis routez vers Banque.',
    summaryAr: 'ارفع كشف PDF في Documents IA ثم وجّهه إلى Banque.',
    bodyFr: 'Documents IA → upload relevé → Router → Banque. La réconciliation se lance automatiquement.',
    bodyAr: 'Documents IA → رفع → توجيه → Banque.',
  },
];

export function searchKnowledgeBase(query: string, category?: string): KnowledgeArticle[] {
  const q = query.trim().toLowerCase();
  let pool = KNOWLEDGE_ARTICLES;
  if (category) pool = pool.filter((a) => a.category === category);

  if (!q) return pool;

  return pool.filter(
    (a) =>
      a.titleFr.toLowerCase().includes(q) ||
      a.titleAr.includes(q) ||
      a.keywords.some((k) => k.toLowerCase().includes(q)) ||
      a.summaryFr.toLowerCase().includes(q) ||
      a.bodyFr.toLowerCase().includes(q),
  );
}

export function getSuggestedArticles(limit = 5): KnowledgeArticle[] {
  return KNOWLEDGE_ARTICLES.slice(0, limit);
}

export function getKnowledgeCategories(): string[] {
  return [...new Set(KNOWLEDGE_ARTICLES.map((a) => a.category))];
}
