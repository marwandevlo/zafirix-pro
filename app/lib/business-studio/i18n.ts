/**
 * French / Arabic strings shared by the Business Studio screens and reports.
 * Arabic wording should be proofread by a native professional before external distribution.
 */

import { LAST_VERIFIED_FISCAL_YEAR, RULE_STATUS_LABEL, type RuleStatus } from './tax-rules';

export type Lang = 'fr' | 'ar';
export type Bi = { fr: string; ar: string };

export const RULE_STATUS_BI: Record<RuleStatus | 'override', Bi> = {
  verified_official: { fr: RULE_STATUS_LABEL.verified_official, ar: 'مقروء في النص الرسمي (المدونة العامة للضرائب 2026) — غير مراجع من طرف خبير' },
  verified_regulator: { fr: RULE_STATUS_LABEL.verified_regulator, ar: 'مصدر رسمي لهيئة التقنين — المراسيم غير مطلع عليها' },
  convention: { fr: RULE_STATUS_LABEL.convention, ar: 'اصطلاح حسابي للبرنامج — يجب التحقق منه من طرف مهني' },
  assumed_unchanged: { fr: RULE_STATUS_LABEL.assumed_unchanged, ar: `افتراض: استمرار قاعدة ${LAST_VERIFIED_FISCAL_YEAR} — لم يتم إدماج أي قانون مالية لاحق` },
  user_defined: { fr: RULE_STATUS_LABEL.user_defined, ar: 'قيمة أدخلها المستخدم — يجب التحقق منها من طرف مهني' },
  not_covered: { fr: RULE_STATUS_LABEL.not_covered, ar: 'غير مشمول بالبرنامج — يحدد مع مهني' },
  override: { fr: 'Taux saisi par l’utilisateur — à valider par un professionnel', ar: 'سعر أدخله المستخدم — يجب التحقق منه من طرف مهني' },
};

export const STR = {
  appTitle: { fr: 'Étude de projet — Business Studio', ar: 'دراسة المشروع — استوديو الأعمال' },
  studies: { fr: 'Études', ar: 'الدراسات' },
  newStudy: { fr: 'Nouvelle étude', ar: 'دراسة جديدة' },
  legacyStudies: { fr: 'Études de l’assistant (ancien module)', ar: 'دراسات المساعد (الوحدة القديمة)' },
  openAssistant: { fr: 'Ouvrir l’assistant conversationnel', ar: 'فتح المساعد الحواري' },
  import: { fr: 'Importer', ar: 'استيراد' },
  open: { fr: 'Ouvrir', ar: 'فتح' },
  duplicate: { fr: 'Dupliquer', ar: 'نسخ' },
  archive: { fr: 'Archiver', ar: 'أرشفة' },
  restore: { fr: 'Restaurer', ar: 'استعادة' },
  submit: { fr: 'Soumettre en revue', ar: 'إرسال للمراجعة' },
  approve: { fr: 'Approuver', ar: 'اعتماد' },
  reopen: { fr: 'Rouvrir en brouillon', ar: 'إعادة فتح كمسودة' },
  compare: { fr: 'Comparer', ar: 'مقارنة' },
  save: { fr: 'Enregistrer', ar: 'حفظ' },
  saving: { fr: 'Enregistrement…', ar: 'جارٍ الحفظ…' },
  saved: { fr: 'Enregistré', ar: 'تم الحفظ' },
  unsaved: { fr: 'Modifications non enregistrées', ar: 'تعديلات غير محفوظة' },
  conflict: { fr: 'Cette étude a été modifiée ailleurs. Rechargez pour récupérer la dernière version (vos modifications locales seront perdues).', ar: 'تم تعديل هذه الدراسة في مكان آخر. أعد التحميل للحصول على آخر نسخة (ستفقد تعديلاتك المحلية).' },
  reload: { fr: 'Recharger', ar: 'إعادة التحميل' },
  locked: { fr: 'Étude verrouillée (approuvée ou archivée) : lecture seule.', ar: 'دراسة مقفلة (معتمدة أو مؤرشفة): قراءة فقط.' },
  loading: { fr: 'Chargement…', ar: 'جارٍ التحميل…' },
  preview: { fr: 'Aperçu', ar: 'معاينة' },
  none: { fr: 'Aucun élément.', ar: 'لا توجد عناصر.' },
  add: { fr: 'Ajouter', ar: 'إضافة' },
  remove: { fr: 'Supprimer', ar: 'حذف' },
  name: { fr: 'Nom', ar: 'الاسم' },
  status: { fr: 'Statut', ar: 'الحالة' },
  sector: { fr: 'Secteur', ar: 'القطاع' },
  projectType: { fr: 'Type de projet', ar: 'نوع المشروع' },
  horizon: { fr: 'Horizon', ar: 'الأفق الزمني' },
  years: { fr: 'ans', ar: 'سنوات' },
  startMonth: { fr: 'Premier mois', ar: 'الشهر الأول' },
  fiscalYearStart: { fr: 'Début d’exercice (mois)', ar: 'بداية السنة المالية (شهر)' },
  updatedAt: { fr: 'Modifiée le', ar: 'آخر تعديل' },
  company: { fr: 'Société', ar: 'الشركة' },
  scenario: { fr: 'Scénario', ar: 'السيناريو' },
  month: { fr: 'Mois', ar: 'شهر' },
  quarter: { fr: 'Trimestre', ar: 'فصل' },
  year: { fr: 'Exercice', ar: 'السنة المالية' },
  monthly: { fr: 'Mensuel', ar: 'شهري' },
  quarterly: { fr: 'Trimestriel', ar: 'فصلي' },
  annual: { fr: 'Annuel', ar: 'سنوي' },
  total: { fr: 'Total', ar: 'المجموع' },
  partial: { fr: 'exercice partiel', ar: 'سنة مالية جزئية' },
  mad: { fr: 'MAD', ar: 'درهم' },
  amountsInMad: { fr: 'Montants en MAD', ar: 'المبالغ بالدرهم' },
  inMad: { fr: '(en MAD)', ar: '(بالدرهم)' },
  inThousandsMad: { fr: '(en milliers de MAD)', ar: '(بآلاف الدراهم)' },
  notAvailable: { fr: 'n.d.', ar: 'غ.م.' },

  st_draft: { fr: 'Brouillon', ar: 'مسودة' },
  st_under_review: { fr: 'En revue', ar: 'قيد المراجعة' },
  st_approved: { fr: 'Approuvée', ar: 'معتمدة' },
  st_approved_self: { fr: 'Approuvée par son auteur (auto-validation, non indépendante)', ar: 'معتمدة من طرف معدّها (اعتماد ذاتي غير مستقل)' },
  st_approved_independent: { fr: 'Approuvée par un autre membre (validation indépendante)', ar: 'معتمدة من طرف عضو آخر (اعتماد مستقل)' },
  approveSelf: { fr: 'Approuver (auto-validation)', ar: 'اعتماد ذاتي' },
  sharing: { fr: 'Partage', ar: 'المشاركة' },
  share_private: { fr: 'Privée (moi seul)', ar: 'خاصة (أنا فقط)' },
  share_company_read: { fr: 'Membres de l’entreprise : lecture', ar: 'أعضاء المقاولة: قراءة' },
  share_company_edit: { fr: 'Membres de l’entreprise : modification (comptable et plus)', ar: 'أعضاء المقاولة: تعديل (محاسب فما فوق)' },
  sharedReadOnly: { fr: 'Étude partagée par son auteur en lecture seule pour votre rôle.', ar: 'دراسة شاركها معدّها للقراءة فقط بالنسبة لدورك.' },
  sharedEdit: { fr: 'Étude d’un autre membre, partagée en modification.', ar: 'دراسة عضو آخر، مشاركة للتعديل.' },
  selfApprovalWarning: { fr: 'Cette approbation a été donnée par l’auteur de l’étude : ce n’est pas une validation indépendante.', ar: 'هذا الاعتماد صادر عن معدّ الدراسة: ليس اعتماداً مستقلاً.' },
  err_read_only: { fr: 'Accès en lecture seule.', ar: 'ولوج للقراءة فقط.' },
  err_owner_only: { fr: 'Action réservée à l’auteur de l’étude.', ar: 'إجراء مخصص لمعدّ الدراسة.' },
  err_approval_forbidden: { fr: 'Votre rôle ne permet pas d’approuver (auditeur ou plus requis).', ar: 'دورك لا يسمح بالاعتماد (مدقق فما فوق).' },
  err_approver_must_differ: { fr: 'La personne qui a soumis l’étude ne peut pas l’approuver.', ar: 'لا يمكن لمن قدّم الدراسة أن يعتمدها.' },
  st_archived: { fr: 'Archivée', ar: 'مؤرشفة' },
  st_legacy: { fr: 'Ancien module', ar: 'الوحدة القديمة' },

  tab_dashboard: { fr: 'Tableau de bord', ar: 'لوحة القيادة' },
  tab_profile: { fr: 'Profil', ar: 'الملف التعريفي' },
  tab_assumptions: { fr: 'Hypothèses', ar: 'الفرضيات' },
  tab_statements: { fr: 'États financiers', ar: 'القوائم المالية' },
  tab_tax: { fr: 'Fiscalité', ar: 'الجبايات' },
  tab_simulator: { fr: 'Simulateur', ar: 'المحاكي' },
  tab_scenarios: { fr: 'Scénarios et sensibilité', ar: 'السيناريوهات والحساسية' },
  tab_risks: { fr: 'Risques et analyse', ar: 'المخاطر والتحليل' },
  tab_actuals: { fr: 'Réel vs prévisionnel', ar: 'الفعلي مقابل التوقعي' },
  tab_reports: { fr: 'Rapports', ar: 'التقارير' },
  tab_versions: { fr: 'Versions et audit', ar: 'النسخ والتدقيق' },

  as_general: { fr: 'Général', ar: 'عام' },
  as_products: { fr: 'Produits et revenus', ar: 'المنتجات والإيرادات' },
  as_expenses: { fr: 'Charges', ar: 'التكاليف' },
  as_staff: { fr: 'Personnel', ar: 'المستخدمون' },
  as_investments: { fr: 'Investissements', ar: 'الاستثمارات' },
  as_financing: { fr: 'Financement', ar: 'التمويل' },
  as_wc: { fr: 'BFR et trésorerie', ar: 'الاحتياج من رأس المال العامل والخزينة' },
  as_tax: { fr: 'Paramètres fiscaux', ar: 'المعطيات الجبائية' },
  as_opening: { fr: 'Bilan d’ouverture', ar: 'الميزانية الافتتاحية' },
  as_sector: { fr: 'Module sectoriel', ar: 'الوحدة القطاعية' },

  checksOk: { fr: 'Contrôles de cohérence : bilan équilibré, flux rapprochés', ar: 'مراقبة الاتساق: ميزانية متوازنة وتدفقات متطابقة' },
  checksKo: { fr: 'Contrôles de cohérence en échec : résultats inutilisables', ar: 'فشل مراقبة الاتساق: النتائج غير قابلة للاستعمال' },
  validationErrors: { fr: 'Erreurs de saisie à corriger avant enregistrement', ar: 'أخطاء إدخال يجب تصحيحها قبل الحفظ' },
  emptyData: { fr: 'Aucune donnée calculée : saisissez des hypothèses (produits, charges, investissements…) pour alimenter ce graphique.', ar: 'لا توجد بيانات محسوبة: أدخل الفرضيات لتغذية هذا الرسم.' },

  kpi_revenue: { fr: 'Chiffre d’affaires cumulé', ar: 'رقم المعاملات المتراكم' },
  kpi_ebitda: { fr: 'EBE cumulé', ar: 'الفائض الإجمالي للاستغلال المتراكم' },
  kpi_netIncome: { fr: 'Résultat net cumulé', ar: 'النتيجة الصافية المتراكمة' },
  kpi_caf: { fr: 'CAF cumulée', ar: 'القدرة على التمويل الذاتي المتراكمة' },
  kpi_cashEnd: { fr: 'Trésorerie finale', ar: 'الخزينة النهائية' },
  kpi_minCash: { fr: 'Trésorerie minimale', ar: 'أدنى خزينة' },
  kpi_peak: { fr: 'Besoin de financement maximal', ar: 'أقصى حاجة للتمويل' },
  kpi_npv: { fr: 'VAN', ar: 'القيمة الحالية الصافية' },
  kpi_irr: { fr: 'TRI projet', ar: 'معدل العائد الداخلي للمشروع' },
  kpi_irrEquity: { fr: 'TRI actionnaires', ar: 'معدل العائد الداخلي للمساهمين' },
  kpi_irrEquityBook: { fr: 'TRI actionnaires (sortie comptable)', ar: 'معدل العائد للمساهمين (خروج محاسبي)' },
  kpi_payback: { fr: 'Délai de récupération', ar: 'مدة الاسترداد' },
  kpi_roi: { fr: 'ROI', ar: 'العائد على الاستثمار' },
  kpi_dscr: { fr: 'DSCR minimal', ar: 'أدنى نسبة تغطية خدمة الدين' },
  kpi_breakEven: { fr: 'Point mort (1er exercice complet)', ar: 'عتبة المردودية (أول سنة مالية كاملة)' },
  kpi_grossMargin: { fr: 'Taux de marge brute (dernier exercice)', ar: 'نسبة الهامش الإجمالي (آخر سنة)' },
  kpi_capex: { fr: 'Investissements totaux', ar: 'مجموع الاستثمارات' },
  kpi_headcount: { fr: 'Effectif en fin d’horizon', ar: 'عدد المستخدمين في نهاية الأفق' },

  rep_full: { fr: 'Étude de projet complète', ar: 'دراسة المشروع الكاملة' },
  rep_bank: { fr: 'Dossier de financement bancaire', ar: 'ملف التمويل البنكي' },
  rep_investor: { fr: 'Synthèse investisseurs', ar: 'ملخص للمستثمرين' },
  rep_financials: { fr: 'États financiers prévisionnels', ar: 'القوائم المالية التوقعية' },
  rep_tax: { fr: 'Rapport fiscal prévisionnel', ar: 'التقرير الجبائي التوقعي' },
  rep_scenarios: { fr: 'Scénarios, sensibilité et stress tests', ar: 'السيناريوهات والحساسية واختبارات الضغط' },
  rep_actuals: { fr: 'Suivi réel vs prévisionnel', ar: 'تتبع الفعلي مقابل التوقعي' },
  toc: { fr: 'Sommaire', ar: 'الفهرس' },
  page: { fr: 'Page', ar: 'صفحة' },
  generatedOn: { fr: 'Généré le', ar: 'أُنشئ بتاريخ' },
  engine: { fr: 'Moteur de calcul', ar: 'محرك الحساب' },
  rules: { fr: 'Référentiel fiscal', ar: 'المرجع الجبائي' },
  revision: { fr: 'Révision', ar: 'المراجعة' },
  forecastNotice: {
    fr: 'Document prévisionnel établi à partir des hypothèses saisies par l’utilisateur. Il ne constitue ni une comptabilité, ni une déclaration fiscale, ni un avis juridique ou fiscal. Les règles fiscales sont versionnées et sourcées ; les règles marquées « à valider » doivent être revues par un professionnel.',
    ar: 'وثيقة توقعية مبنية على الفرضيات التي أدخلها المستخدم. لا تشكل محاسبة ولا تصريحاً جبائياً ولا استشارة قانونية أو جبائية. القواعد الجبائية مؤرخة وموثقة المصدر، والقواعد الموسومة «للتحقق» يجب أن يراجعها مهني.',
  },
  arabicFrenchOnly: {
    fr: '',
    ar: 'ملاحظة: النصوص التحليلية ومراجع القواعد الجبائية متوفرة بالفرنسية فقط وتُعرض كما هي.',
  },
} as const satisfies Record<string, Bi>;

export type StrKey = keyof typeof STR;

export function tr(key: StrKey, lang: Lang): string {
  return STR[key][lang];
}

export const SECTOR_LABEL: Record<string, Bi> = {
  manufacturing: { fr: 'Industrie / fabrication', ar: 'الصناعة / التصنيع' },
  retail: { fr: 'Commerce de détail', ar: 'تجارة التقسيط' },
  wholesale: { fr: 'Commerce de gros / distribution', ar: 'تجارة الجملة / التوزيع' },
  ecommerce: { fr: 'E-commerce', ar: 'التجارة الإلكترونية' },
  saas: { fr: 'SaaS / logiciel', ar: 'البرمجيات كخدمة' },
  startup: { fr: 'Startup innovante', ar: 'مقاولة ناشئة مبتكرة' },
  services: { fr: 'Services', ar: 'الخدمات' },
  agriculture: { fr: 'Agriculture', ar: 'الفلاحة' },
  real_estate: { fr: 'Immobilier', ar: 'العقار' },
  hospitality: { fr: 'Hôtellerie / restauration', ar: 'الفندقة / المطاعم' },
  tourism: { fr: 'Tourisme', ar: 'السياحة' },
  transport: { fr: 'Transport', ar: 'النقل' },
  logistics: { fr: 'Logistique', ar: 'اللوجستيك' },
  franchise: { fr: 'Franchise', ar: 'الامتياز التجاري' },
  other: { fr: 'Autre', ar: 'أخرى' },
};

export const PROJECT_TYPE_LABEL: Record<string, Bi> = {
  creation: { fr: 'Création', ar: 'إحداث' },
  existing: { fr: 'Entreprise existante', ar: 'مقاولة قائمة' },
  expansion: { fr: 'Extension', ar: 'توسعة' },
  branch: { fr: 'Nouvelle succursale', ar: 'فرع جديد' },
  investment: { fr: 'Projet d’investissement', ar: 'مشروع استثماري' },
  acquisition: { fr: 'Acquisition', ar: 'استحواذ' },
  restructuring: { fr: 'Restructuration', ar: 'إعادة الهيكلة' },
  franchise: { fr: 'Franchise', ar: 'امتياز تجاري' },
};

const nf = (digits: number, grouping: string) => (v: number) => {
  const neg = v < 0;
  const [int, dec] = Math.abs(v).toFixed(digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
  return `${neg ? '-' : ''}${grouped}${dec ? (grouping === ',' ? '.' : ',') + dec : ''}`;
};

/**
 * Number formatting per language. Arabic uses Latin digits with comma grouping and a dot decimal separator so
 * numbers keep their order inside right-to-left text (space-grouped digits are reordered by the bidi algorithm).
 */
export function formatNumber(v: number, lang: Lang, digits = 0): string {
  return nf(digits, lang === 'ar' ? ',' : '\u00a0')(v);
}

export function formatCentsMad(cents: number, lang: Lang, digits = 0): string {
  return formatNumber(cents / 100, lang, digits);
}

export function formatPercent(v: number | null, lang: Lang, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return STR.notAvailable[lang];
  // No space before % in Arabic: a separated sign is moved away from its number by the bidi algorithm.
  return lang === 'ar' ? `${formatNumber(v, lang, digits)}%` : `${formatNumber(v, lang, digits)} %`;
}

const DEFAULT_SCENARIO_AR: Record<string, string> = {
  'Scénario de base': 'السيناريو الأساسي',
  'Scénario optimiste': 'السيناريو المتفائل',
  'Scénario pessimiste': 'السيناريو المتشائم',
  'Hypothèses saisies, sans ajustement.': 'الفرضيات المُدخلة دون تعديل.',
  'Ajustements saisis par l’utilisateur ; valeurs initiales indicatives : volumes +10 %, prix +3 %, charges −3 %.':
    'تعديلات يدخلها المستخدم؛ القيم الأولية الإرشادية: الأحجام +10%، الأسعار +3%، التكاليف −3%.',
  'Ajustements saisis par l’utilisateur ; valeurs initiales indicatives : volumes −15 %, prix −5 %, charges +5 %, clients +15 jours.':
    'تعديلات يدخلها المستخدم؛ القيم الأولية الإرشادية: الأحجام −15%، الأسعار −5%، التكاليف +5%، أجل الزبناء +15 يوماً.',
};

/** Default scenario names and descriptions are stored in French; unchanged ones are shown in Arabic. User text is kept as typed. */
export function scenarioText(text: string, lang: Lang): string {
  return lang === 'ar' ? DEFAULT_SCENARIO_AR[text] ?? text : text;
}

/** YYYY-MM label, written YYYY/MM in Arabic so bidi keeps the order. */
export function monthLabel(label: string, lang: Lang): string {
  return lang === 'ar' ? label.replace('-', '/') : label;
}
