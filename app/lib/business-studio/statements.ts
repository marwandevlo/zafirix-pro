/**
 * Financial statements and schedules as data: each line is a signed sum of engine series, so its value,
 * its formula and its provenance come from the same definition (screen, PDF and Excel share it).
 * Arabic labels are working translations of the CGNC terms and should be proofread before publication.
 */

import type { LineKey, StudyResult } from './engine';
import { type Granularity, isFlowKey, periodsOf, type Period } from './metrics';
import type { Cents } from './money';

export type Bilingual = { fr: string; ar: string };

export const KEY_LABELS: Record<LineKey, Bilingual> = {
  revenueGross: { fr: 'Ventes brutes', ar: 'المبيعات الإجمالية' },
  discounts: { fr: 'Remises accordées', ar: 'التخفيضات الممنوحة' },
  returns: { fr: 'Retours', ar: 'المرتجعات' },
  revenue: { fr: 'Chiffre d’affaires net', ar: 'رقم المعاملات الصافي' },
  operatingGrants: { fr: 'Subventions d’exploitation', ar: 'إعانات الاستغلال' },
  purchases: { fr: 'Achats de marchandises et matières', ar: 'مشتريات البضائع والمواد' },
  inventoryVariation: { fr: 'Variation de stocks', ar: 'تغير المخزونات' },
  cogs: { fr: 'Achats consommés', ar: 'المشتريات المستهلكة' },
  externalCharges: { fr: 'Autres charges externes', ar: 'التكاليف الخارجية الأخرى' },
  leaseCharges: { fr: 'Redevances de crédit-bail', ar: 'أقساط الائتمان الإيجاري' },
  cacCharges: { fr: 'Coûts d’acquisition clients', ar: 'تكاليف اكتساب العملاء' },
  localTaxes: { fr: 'Impôts et taxes', ar: 'الضرائب والرسوم' },
  salaries: { fr: 'Salaires bruts', ar: 'الأجور الإجمالية' },
  employerCharges: { fr: 'Charges sociales patronales', ar: 'التكاليف الاجتماعية على المشغل' },
  ebitda: { fr: 'Excédent brut d’exploitation (EBE)', ar: 'الفائض الإجمالي للاستغلال' },
  depreciation: { fr: 'Dotations d’exploitation (amortissements)', ar: 'مخصصات الاستغلال (الاهتلاكات)' },
  ebit: { fr: 'Résultat d’exploitation', ar: 'نتيجة الاستغلال' },
  interest: { fr: 'Intérêts des emprunts', ar: 'فوائد القروض' },
  loanFees: { fr: 'Frais de dossier d’emprunt', ar: 'مصاريف ملفات القروض' },
  overdraftInterest: { fr: 'Intérêts du découvert', ar: 'فوائد السحب على المكشوف' },
  financialCharges: { fr: 'Charges financières', ar: 'التكاليف المالية' },
  financialResult: { fr: 'Résultat financier', ar: 'النتيجة المالية' },
  grantRelease: { fr: 'Reprises sur subventions d’investissement', ar: 'استرجاعات إعانات الاستثمار' },
  badDebts: { fr: 'Créances devenues irrécouvrables', ar: 'ديون أصبحت غير قابلة للتحصيل' },
  nonCurrentResult: { fr: 'Résultat non courant', ar: 'النتيجة غير الجارية' },
  ebt: { fr: 'Résultat avant impôts', ar: 'النتيجة قبل الضرائب' },
  incomeTax: { fr: 'Impôt sur les résultats', ar: 'الضريبة على النتائج' },
  netIncome: { fr: 'Résultat net', ar: 'النتيجة الصافية' },
  variableOpex: { fr: 'Charges variables', ar: 'التكاليف المتغيرة' },
  fixedOpex: { fr: 'Charges fixes externes', ar: 'التكاليف الخارجية الثابتة' },
  capitalizedInterest: { fr: 'Intérêts capitalisés (non décaissés)', ar: 'فوائد مرسملة (غير مدفوعة)' },
  cashInSales: { fr: 'Encaissements clients', ar: 'المتحصلات من العملاء' },
  cashInEquity: { fr: 'Apports en capital', ar: 'المساهمات في رأس المال' },
  cashInLoans: { fr: 'Emprunts reçus', ar: 'القروض المحصلة' },
  cashInGrants: { fr: 'Subventions reçues', ar: 'الإعانات المحصلة' },
  cashInInvestmentGrants: { fr: 'Subventions d’investissement reçues', ar: 'إعانات الاستثمار المحصلة' },
  cashInVatRefund: { fr: 'Remboursement de crédit de TVA (art. 103 bis)', ar: 'استرداد دين الضريبة على القيمة المضافة (المادة 103 مكرر)' },
  cashOutSuppliers: { fr: 'Paiements fournisseurs (achats)', ar: 'المدفوعات للموردين (المشتريات)' },
  cashOutOpex: { fr: 'Paiements des charges externes', ar: 'أداء التكاليف الخارجية' },
  cashOutNetSalaries: { fr: 'Salaires nets versés', ar: 'الأجور الصافية المدفوعة' },
  cashOutSocial: { fr: 'CNSS, AMO et TFP versées', ar: 'المؤداة للضمان الاجتماعي والتأمين الإجباري عن المرض والتكوين المهني' },
  cashOutIrSalarial: { fr: 'IR sur salaires versé', ar: 'الضريبة على الدخل المقتطعة من الأجور المؤداة' },
  cashOutVat: { fr: 'TVA versée à l’État', ar: 'الضريبة على القيمة المضافة المؤداة للدولة' },
  cashOutIncomeTax: { fr: 'IS / IR versé', ar: 'الضريبة على الشركات / على الدخل المؤداة' },
  cashOutLocalTaxes: { fr: 'Impôts locaux versés', ar: 'الضرائب المحلية المؤداة' },
  cashOutCapex: { fr: 'Paiement des investissements', ar: 'أداء الاستثمارات' },
  cashOutPrincipal: { fr: 'Remboursement du capital emprunté', ar: 'سداد أصل القروض' },
  cashOutInterest: { fr: 'Intérêts et frais financiers payés', ar: 'الفوائد والمصاريف المالية المدفوعة' },
  cashOutDividends: { fr: 'Dividendes nets versés', ar: 'الأرباح الصافية الموزعة' },
  cashOutDividendWithholding: { fr: 'Retenue à la source sur dividendes', ar: 'الاقتطاع من المنبع على الأرباح الموزعة' },
  netCashFlow: { fr: 'Variation de trésorerie', ar: 'تغير الخزينة' },
  vatCollectedDue: { fr: 'TVA collectée exigible', ar: 'الضريبة على القيمة المضافة المحصلة المستحقة' },
  vatDeductible: { fr: 'TVA déductible', ar: 'الضريبة على القيمة المضافة القابلة للخصم' },
  vatInvoicedSales: { fr: 'TVA facturée', ar: 'الضريبة على القيمة المضافة المفوترة' },
  irSalarial: { fr: 'IR retenu sur salaires', ar: 'الضريبة على الدخل المقتطعة من الأجور' },
  employeeSocial: { fr: 'Cotisations salariales (CNSS, AMO)', ar: 'اشتراكات الأجراء (الضمان الاجتماعي والتأمين عن المرض)' },
  netSalaries: { fr: 'Salaires nets', ar: 'الأجور الصافية' },
  capexCost: { fr: 'Investissements (coût d’acquisition)', ar: 'الاستثمارات (تكلفة الاقتناء)' },
  capexVat: { fr: 'TVA sur investissements', ar: 'الضريبة على القيمة المضافة على الاستثمارات' },
  dividendsGross: { fr: 'Dividendes bruts', ar: 'الأرباح الإجمالية الموزعة' },
  cfo: { fr: 'Flux de trésorerie d’exploitation', ar: 'التدفقات النقدية من الاستغلال' },
  cfi: { fr: 'Flux de trésorerie d’investissement', ar: 'التدفقات النقدية من الاستثمار' },
  cff: { fr: 'Flux de trésorerie de financement', ar: 'التدفقات النقدية من التمويل' },
  fcff: { fr: 'Flux de trésorerie disponible (FCFF)', ar: 'التدفق النقدي الحر للمؤسسة' },
  fcfe: { fr: 'Flux disponible pour les actionnaires (FCFE)', ar: 'التدفق النقدي الحر للمساهمين' },
  caf: { fr: 'Capacité d’autofinancement (CAF)', ar: 'القدرة على التمويل الذاتي' },
  cashBeforeFinancing: { fr: 'Trésorerie cumulée avant financement', ar: 'الخزينة المتراكمة قبل التمويل' },
  fixedAssetsGross: { fr: 'Immobilisations brutes', ar: 'الأصول الثابتة الإجمالية' },
  accumulatedDepreciation: { fr: 'Amortissements cumulés', ar: 'الاهتلاكات المتراكمة' },
  fixedAssetsNet: { fr: 'Immobilisations nettes', ar: 'الأصول الثابتة الصافية' },
  inventory: { fr: 'Stocks', ar: 'المخزونات' },
  receivables: { fr: 'Clients et comptes rattachés', ar: 'العملاء والحسابات المرتبطة بهم' },
  vatDeductiblePending: { fr: 'TVA déductible en attente de paiement', ar: 'الضريبة القابلة للخصم في انتظار الأداء' },
  vatCreditAsset: { fr: 'Crédit de TVA', ar: 'دين الضريبة على القيمة المضافة' },
  vatRefundReceivable: { fr: 'État – remboursement de TVA demandé', ar: 'الدولة – استرداد الضريبة على القيمة المضافة المطلوب' },
  incomeTaxReceivable: { fr: 'État – excédent d’IS/IR versé', ar: 'الدولة – فائض الضريبة المؤداة' },
  localTaxPrepaid: { fr: 'Impôts locaux payés d’avance', ar: 'ضرائب محلية مؤداة مسبقا' },
  cashAsset: { fr: 'Trésorerie – actif', ar: 'الخزينة – أصول' },
  totalAssets: { fr: 'Total actif', ar: 'مجموع الأصول' },
  capital: { fr: 'Capital social et apports', ar: 'رأس المال الاجتماعي والمساهمات' },
  reserves: { fr: 'Réserves, report à nouveau et résultats', ar: 'الاحتياطيات والمرحل من جديد والنتائج' },
  grantsNet: { fr: 'Subventions d’investissement', ar: 'إعانات الاستثمار' },
  equity: { fr: 'Capitaux propres', ar: 'رؤوس الأموال الذاتية' },
  loans: { fr: 'Dettes de financement', ar: 'ديون التمويل' },
  payables: { fr: 'Fournisseurs et comptes rattachés', ar: 'الموردون والحسابات المرتبطة بهم' },
  vatCollectedPending: { fr: 'TVA facturée non encore exigible', ar: 'الضريبة المفوترة غير المستحقة بعد' },
  vatPayable: { fr: 'État – TVA due', ar: 'الدولة – الضريبة على القيمة المضافة المستحقة' },
  incomeTaxPayable: { fr: 'État – IS/IR dû', ar: 'الدولة – الضريبة على النتائج المستحقة' },
  socialPayable: { fr: 'Organismes sociaux et IR sur salaires', ar: 'الهيئات الاجتماعية والضريبة على الأجور' },
  localTaxPayable: { fr: 'Impôts locaux à payer', ar: 'الضرائب المحلية المستحقة' },
  overdraft: { fr: 'Trésorerie – passif (découvert)', ar: 'الخزينة – خصوم (سحب على المكشوف)' },
  totalLiabilitiesAndEquity: { fr: 'Total passif', ar: 'مجموع الخصوم' },
  balanceDiff: { fr: 'Écart actif − passif (contrôle)', ar: 'الفرق بين الأصول والخصوم (مراقبة)' },
  cash: { fr: 'Trésorerie nette de clôture', ar: 'صافي الخزينة عند الإقفال' },
  bfr: { fr: 'Besoin en fonds de roulement', ar: 'الاحتياج من رأس المال العامل' },
  netDebt: { fr: 'Dette nette', ar: 'صافي المديونية' },
  currentDebtPortion: { fr: 'Part à moins d’un an des emprunts', ar: 'الجزء المستحق خلال سنة من القروض' },
  subscribers: { fr: 'Abonnés actifs', ar: 'المشتركون النشطون' },
  headcount: { fr: 'Effectif', ar: 'عدد المستخدمين' },
};

export const COUNT_KEYS: ReadonlySet<LineKey> = new Set<LineKey>(['subscribers', 'headcount']);

export type LineStyle = 'section' | 'line' | 'detail' | 'subtotal' | 'total';
export type Term = readonly [LineKey, 1 | -1];
export type LineDef = { id: string; label: Bilingual; style: LineStyle; terms: readonly Term[]; note?: Bilingual };

const L = (key: LineKey, style: LineStyle = 'line', sign: 1 | -1 = 1): LineDef => ({ id: key, label: KEY_LABELS[key], style, terms: [[key, sign]] });
const S = (id: string, fr: string, ar: string, style: LineStyle, terms: readonly Term[], note?: Bilingual): LineDef => ({ id, label: { fr, ar }, style, terms, note });
const H = (id: string, fr: string, ar: string): LineDef => ({ id, label: { fr, ar }, style: 'section', terms: [] });

export type StatementId =
  | 'cpc' | 'sig' | 'bilan_actif' | 'bilan_passif' | 'tft' | 'tresorerie' | 'financement' | 'bfr'
  | 'tva' | 'is' | 'paie' | 'dette' | 'investissements';

export const STATEMENTS: Record<StatementId, { title: Bilingual; lines: readonly LineDef[] }> = {
  cpc: {
    title: { fr: 'Compte de produits et charges (CPC) prévisionnel', ar: 'حساب العائدات والتكاليف التوقعي' },
    lines: [
      H('h1', 'Produits d’exploitation', 'عائدات الاستغلال'),
      L('revenueGross', 'detail'), L('discounts', 'detail', -1), L('returns', 'detail', -1),
      L('revenue'), L('operatingGrants'),
      S('opIncome', 'Total produits d’exploitation', 'مجموع عائدات الاستغلال', 'subtotal', [['revenue', 1], ['operatingGrants', 1]]),
      H('h2', 'Charges d’exploitation', 'تكاليف الاستغلال'),
      L('purchases', 'detail'), L('inventoryVariation', 'detail'), L('cogs'),
      L('externalCharges'), L('leaseCharges', 'detail'), L('cacCharges', 'detail'),
      L('localTaxes'), L('salaries'), L('employerCharges'),
      S('staffCosts', 'Charges de personnel', 'تكاليف المستخدمين', 'line', [['salaries', 1], ['employerCharges', 1]]),
      L('depreciation'),
      S('opCharges', 'Total charges d’exploitation', 'مجموع تكاليف الاستغلال', 'subtotal',
        [['cogs', 1], ['externalCharges', 1], ['localTaxes', 1], ['salaries', 1], ['employerCharges', 1], ['depreciation', 1]]),
      L('ebit', 'subtotal'),
      H('h3', 'Résultat financier', 'النتيجة المالية'),
      L('interest', 'detail'), L('loanFees', 'detail'), L('overdraftInterest', 'detail'), L('financialCharges'),
      L('financialResult', 'subtotal'),
      S('currentResult', 'Résultat courant', 'النتيجة الجارية', 'subtotal', [['ebit', 1], ['financialResult', 1]]),
      H('h4', 'Résultat non courant', 'النتيجة غير الجارية'),
      L('grantRelease'), L('badDebts', 'line', -1), L('nonCurrentResult', 'subtotal'),
      L('ebt', 'subtotal'), L('incomeTax', 'line', -1), L('netIncome', 'total'),
    ],
  },
  sig: {
    title: { fr: 'Soldes intermédiaires de gestion', ar: 'الأرصدة الوسيطة للتسيير' },
    lines: [
      L('revenue'),
      S('grossMargin', 'Marge brute', 'الهامش الإجمالي', 'subtotal', [['revenue', 1], ['cogs', -1]]),
      S('valueAdded', 'Valeur ajoutée', 'القيمة المضافة', 'subtotal', [['revenue', 1], ['cogs', -1], ['externalCharges', -1]]),
      L('ebitda', 'subtotal'), L('ebit', 'subtotal'),
      S('currentResult', 'Résultat courant avant impôts', 'النتيجة الجارية قبل الضرائب', 'subtotal', [['ebit', 1], ['financialResult', 1]]),
      L('netIncome', 'total'),
      L('caf', 'total'),
    ],
  },
  bilan_actif: {
    title: { fr: 'Bilan prévisionnel – Actif', ar: 'الميزانية التوقعية – الأصول' },
    lines: [
      H('h1', 'Actif immobilisé', 'الأصول الثابتة'),
      L('fixedAssetsGross', 'detail'), L('accumulatedDepreciation', 'detail', -1), L('fixedAssetsNet'),
      H('h2', 'Actif circulant', 'الأصول المتداولة'),
      L('inventory'), L('receivables'),
      S('stateVatAsset', 'État – TVA récupérable', 'الدولة – الضريبة على القيمة المضافة القابلة للاسترجاع', 'line', [['vatDeductiblePending', 1], ['vatCreditAsset', 1], ['vatRefundReceivable', 1]]),
      L('vatDeductiblePending', 'detail'), L('vatCreditAsset', 'detail'), L('vatRefundReceivable', 'detail'),
      L('incomeTaxReceivable'), L('localTaxPrepaid'),
      H('h3', 'Trésorerie', 'الخزينة'),
      L('cashAsset'),
      L('totalAssets', 'total'),
    ],
  },
  bilan_passif: {
    title: { fr: 'Bilan prévisionnel – Passif', ar: 'الميزانية التوقعية – الخصوم' },
    lines: [
      H('h1', 'Financement permanent', 'التمويل الدائم'),
      L('capital', 'detail'), L('reserves', 'detail'), L('grantsNet', 'detail'), L('equity', 'subtotal'), L('loans'),
      S('permanent', 'Total financement permanent', 'مجموع التمويل الدائم', 'subtotal', [['equity', 1], ['loans', 1]]),
      H('h2', 'Passif circulant', 'الخصوم المتداولة'),
      L('payables'),
      S('stateVatLiability', 'État – TVA facturée et due', 'الدولة – الضريبة المفوترة والمستحقة', 'line', [['vatCollectedPending', 1], ['vatPayable', 1]]),
      L('vatCollectedPending', 'detail'), L('vatPayable', 'detail'),
      L('incomeTaxPayable'), L('socialPayable'), L('localTaxPayable'),
      H('h3', 'Trésorerie', 'الخزينة'),
      L('overdraft'),
      L('totalLiabilitiesAndEquity', 'total'),
      L('balanceDiff', 'detail'),
    ],
  },
  tft: {
    title: { fr: 'Tableau des flux de trésorerie', ar: 'جدول التدفقات النقدية' },
    lines: [
      L('netIncome', 'detail'), L('depreciation', 'detail'), L('grantRelease', 'detail', -1),
      L('caf', 'subtotal'),
      L('capitalizedInterest', 'line'),
      S('dBfr', 'Variation du BFR (augmentation en négatif)', 'تغير الاحتياج من رأس المال العامل', 'line',
        [['cfo', 1], ['caf', -1], ['capitalizedInterest', -1]]),
      L('cfo', 'subtotal'),
      L('capexCost', 'line', -1), L('cfi', 'subtotal'),
      L('cashInEquity'), L('cashInLoans'), L('cashInInvestmentGrants'), L('cashOutPrincipal', 'line', -1), L('dividendsGross', 'line', -1),
      L('cff', 'subtotal'),
      L('netCashFlow', 'total'),
      L('cash', 'total'),
    ],
  },
  tresorerie: {
    title: { fr: 'Plan de trésorerie', ar: 'مخطط الخزينة' },
    lines: [
      H('h1', 'Encaissements', 'المتحصلات'),
      L('cashInSales'), L('cashInEquity'), L('cashInLoans'), L('cashInGrants'), L('cashInVatRefund'),
      S('inflows', 'Total encaissements', 'مجموع المتحصلات', 'subtotal', [['cashInSales', 1], ['cashInEquity', 1], ['cashInLoans', 1], ['cashInGrants', 1], ['cashInVatRefund', 1]]),
      H('h2', 'Décaissements', 'المدفوعات'),
      L('cashOutSuppliers'), L('cashOutOpex'), L('cashOutNetSalaries'), L('cashOutSocial'), L('cashOutIrSalarial'),
      L('cashOutVat'), L('cashOutIncomeTax'), L('cashOutLocalTaxes'), L('cashOutCapex'), L('cashOutPrincipal'),
      L('cashOutInterest'), L('cashOutDividends'), L('cashOutDividendWithholding'),
      S('outflows', 'Total décaissements', 'مجموع المدفوعات', 'subtotal', [
        ['cashOutSuppliers', 1], ['cashOutOpex', 1], ['cashOutNetSalaries', 1], ['cashOutSocial', 1], ['cashOutIrSalarial', 1],
        ['cashOutVat', 1], ['cashOutIncomeTax', 1], ['cashOutLocalTaxes', 1], ['cashOutCapex', 1], ['cashOutPrincipal', 1],
        ['cashOutInterest', 1], ['cashOutDividends', 1], ['cashOutDividendWithholding', 1],
      ]),
      L('netCashFlow', 'subtotal'),
      L('cash', 'total'),
    ],
  },
  financement: {
    title: { fr: 'Plan de financement', ar: 'مخطط التمويل' },
    lines: [
      H('h1', 'Ressources', 'الموارد'),
      L('caf'), L('cashInEquity'), L('cashInLoans'), L('capitalizedInterest'), L('cashInInvestmentGrants'),
      S('resources', 'Total ressources', 'مجموع الموارد', 'subtotal', [['caf', 1], ['cashInEquity', 1], ['cashInLoans', 1], ['capitalizedInterest', 1], ['cashInInvestmentGrants', 1]]),
      H('h2', 'Emplois', 'الاستعمالات'),
      L('capexCost'),
      S('dBfrUse', 'Augmentation du BFR', 'زيادة الاحتياج من رأس المال العامل', 'line', [
        ['caf', 1], ['cashInEquity', 1], ['cashInLoans', 1], ['capitalizedInterest', 1], ['cashInInvestmentGrants', 1],
        ['capexCost', -1], ['cashOutPrincipal', -1], ['dividendsGross', -1], ['netCashFlow', -1],
      ]),
      L('cashOutPrincipal'), L('dividendsGross'),
      S('uses', 'Total emplois', 'مجموع الاستعمالات', 'subtotal', [
        ['caf', 1], ['cashInEquity', 1], ['cashInLoans', 1], ['capitalizedInterest', 1], ['cashInInvestmentGrants', 1], ['netCashFlow', -1],
      ]),
      S('surplus', 'Excédent (déficit) de ressources', 'فائض (عجز) الموارد', 'total', [['netCashFlow', 1]]),
      L('cash', 'total'),
    ],
  },
  bfr: {
    title: { fr: 'Besoin en fonds de roulement', ar: 'الاحتياج من رأس المال العامل' },
    lines: [
      L('inventory'), L('receivables'), L('vatDeductiblePending'), L('vatCreditAsset'), L('vatRefundReceivable'), L('incomeTaxReceivable'), L('localTaxPrepaid'),
      S('wcAssets', 'Emplois d’exploitation', 'استعمالات الاستغلال', 'subtotal', [
        ['inventory', 1], ['receivables', 1], ['vatDeductiblePending', 1], ['vatCreditAsset', 1], ['vatRefundReceivable', 1], ['incomeTaxReceivable', 1], ['localTaxPrepaid', 1],
      ]),
      L('payables'), L('vatCollectedPending'), L('vatPayable'), L('incomeTaxPayable'), L('socialPayable'), L('localTaxPayable'),
      S('wcLiabilities', 'Ressources d’exploitation', 'موارد الاستغلال', 'subtotal', [
        ['payables', 1], ['vatCollectedPending', 1], ['vatPayable', 1], ['incomeTaxPayable', 1], ['socialPayable', 1], ['localTaxPayable', 1],
      ]),
      L('bfr', 'total'),
    ],
  },
  tva: {
    title: { fr: 'TVA', ar: 'الضريبة على القيمة المضافة' },
    lines: [
      L('vatInvoicedSales'), L('vatCollectedDue'), L('vatDeductible'), L('capexVat', 'detail'),
      S('vatNetPeriod', 'TVA nette du mois (collectée − déductible)', 'صافي الضريبة للشهر', 'subtotal', [['vatCollectedDue', 1], ['vatDeductible', -1]]),
      L('cashOutVat'), L('vatPayable'), L('vatCreditAsset'), L('cashInVatRefund'), L('vatRefundReceivable'),
      L('vatCollectedPending', 'detail'), L('vatDeductiblePending', 'detail'),
    ],
  },
  is: {
    title: { fr: 'Impôt sur les résultats', ar: 'الضريبة على النتائج' },
    lines: [L('ebt'), L('incomeTax'), L('cashOutIncomeTax'), L('incomeTaxPayable'), L('incomeTaxReceivable')],
  },
  paie: {
    title: { fr: 'Masse salariale', ar: 'كتلة الأجور' },
    lines: [
      L('headcount'), L('salaries'), L('employerCharges'),
      S('payrollCost', 'Coût total employeur', 'التكلفة الإجمالية على المشغل', 'subtotal', [['salaries', 1], ['employerCharges', 1]]),
      L('employeeSocial', 'detail'), L('irSalarial', 'detail'), L('netSalaries'),
      L('cashOutNetSalaries'), L('cashOutSocial'), L('cashOutIrSalarial'), L('socialPayable'),
    ],
  },
  dette: {
    title: { fr: 'Endettement', ar: 'المديونية' },
    lines: [
      L('cashInLoans'), L('interest'), L('capitalizedInterest'), L('loanFees'), L('cashOutPrincipal'),
      S('debtService', 'Service de la dette', 'خدمة الدين', 'subtotal', [['cashOutPrincipal', 1], ['cashOutInterest', 1]]),
      L('loans'), L('currentDebtPortion'), L('overdraft'), L('overdraftInterest'), L('netDebt'),
    ],
  },
  investissements: {
    title: { fr: 'Investissements et amortissements', ar: 'الاستثمارات والاهتلاكات' },
    lines: [L('capexCost'), L('capexVat'), L('cashOutCapex'), L('depreciation'), L('fixedAssetsGross'), L('accumulatedDepreciation'), L('fixedAssetsNet')],
  },
};

/** A line mixing flows and balances cannot be aggregated consistently; the test suite asserts none does. */
export function lineIsFlow(def: LineDef): boolean | null {
  if (def.terms.length === 0) return null;
  const kinds = new Set(def.terms.map(([k]) => isFlowKey(k)));
  return kinds.size === 1 ? [...kinds][0] : null;
}

export function lineMonthly(r: StudyResult, def: LineDef): Cents[] {
  const out = new Array<number>(r.calendar.months).fill(0);
  for (const [k, sign] of def.terms) {
    const s = r.monthly[k];
    for (let m = 0; m < out.length; m += 1) out[m] += sign * s[m];
  }
  return out;
}

export function formulaOf(def: LineDef, lang: 'fr' | 'ar' = 'fr'): string {
  if (def.terms.length === 1 && def.terms[0][1] === 1 && def.terms[0][0] === def.id) return '';
  return def.terms.map(([k, s], i) => `${i === 0 ? (s < 0 ? '− ' : '') : s < 0 ? ' − ' : ' + '}${KEY_LABELS[k][lang]}`).join('');
}

export type StatementRow = { def: LineDef; values: (number | null)[]; isCount: boolean; isFlow: boolean | null; formula: string };
export type StatementTable = { id: StatementId; title: Bilingual; periods: Period[]; rows: StatementRow[] };

export function statementTable(r: StudyResult, id: StatementId, g: Granularity, lang: 'fr' | 'ar' = 'fr'): StatementTable {
  const st = STATEMENTS[id];
  const periods = periodsOf(r, g);
  const rows = st.lines.map((def): StatementRow => {
    const isFlow = lineIsFlow(def);
    const isCount = def.terms.length === 1 && COUNT_KEYS.has(def.terms[0][0]);
    if (def.terms.length === 0) return { def, values: periods.map(() => null), isCount, isFlow, formula: '' };
    const monthly = lineMonthly(r, def);
    const values = periods.map((p) => (isFlow ? p.months.reduce((t, m) => t + monthly[m], 0) : monthly[p.months[p.months.length - 1]]));
    return { def, values, isCount, isFlow, formula: formulaOf(def, lang) };
  });
  return { id, title: st.title, periods, rows };
}
