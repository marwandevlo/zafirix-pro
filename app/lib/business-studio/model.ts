/**
 * Business Studio study model (schema version 1). Plain JSON, stored in `atlas_projects.metadata.model`.
 * Amounts are entered in MAD (decimals allowed) and converted to centimes by the engine.
 * Month positions are 0-based offsets from `horizon.startMonth`.
 */

export const STUDY_SCHEMA_VERSION = 1;
export const STUDY_KIND = 'business_study_v2';
export const STUDY_VERSION_KIND = 'business_study_version';
export const LEGACY_STUDY_KIND = 'etude_faisabilite';
/** Who besides the owner may open a study linked to a company. */
export const SHARING_MODES = ['private', 'company_read', 'company_edit'] as const;
export type Sharing = (typeof SHARING_MODES)[number];

export const MIN_YEARS = 1;
export const MAX_YEARS = 30;

export type StudyStatus = 'draft' | 'under_review' | 'approved' | 'archived';
export const STUDY_STATUSES: readonly StudyStatus[] = ['draft', 'under_review', 'approved', 'archived'];

export type ProjectType =
  | 'creation' | 'existing' | 'expansion' | 'branch' | 'investment' | 'acquisition' | 'restructuring' | 'franchise';
export const PROJECT_TYPES: readonly ProjectType[] = [
  'creation', 'existing', 'expansion', 'branch', 'investment', 'acquisition', 'restructuring', 'franchise',
];

export type SectorId =
  | 'manufacturing' | 'retail' | 'wholesale' | 'ecommerce' | 'saas' | 'startup' | 'services' | 'agriculture'
  | 'real_estate' | 'hospitality' | 'tourism' | 'transport' | 'logistics' | 'franchise' | 'other';
export const SECTORS: readonly SectorId[] = [
  'manufacturing', 'retail', 'wholesale', 'ecommerce', 'saas', 'startup', 'services', 'agriculture',
  'real_estate', 'hospitality', 'tourism', 'transport', 'logistics', 'franchise', 'other',
];

export type LegalForm =
  | '' | 'sarl' | 'sarl_au' | 'sa' | 'sas' | 'snc' | 'scs' | 'gie' | 'cooperative' | 'auto_entrepreneur'
  | 'personne_physique' | 'other';

export type Director = {
  id: string; name: string; position: string; history: string; qualifications: string; experienceYears: number;
};
export type Shareholder = {
  id: string; name: string; ownershipPct: number; contribution: number; commitment: string;
};

export type StudyProfile = {
  company: {
    name: string; tradingName: string; logoDataUrl: string; legalForm: LegalForm; address: string; city: string;
    phone: string; email: string; activity: string; incorporated: boolean; ice: string; rc: string; if: string;
    cnss: string; incorporationDate: string;
  };
  directors: Director[];
  shareholders: Shareholder[];
  project: {
    location: string; objectives: string; description: string; businessModel: string; market: string;
    targetCustomers: string; competition: string;
  };
};

export type Horizon = {
  /** First projected month, YYYY-MM. */
  startMonth: string;
  years: number;
  /** First calendar month of the fiscal year (1 = January). */
  fiscalYearStartMonth: number;
};

export type ExchangeRate = { currency: string; rateToMad: number; annualChangePct: number };

export type Product = {
  id: string; name: string; segment: string; channel: string;
  kind: 'one_time' | 'subscription';
  phase: 'initial' | 'expansion';
  currency: string;
  unitPrice: number;
  priceGrowthPct: number;
  launchMonth: number;
  endMonth: number | null;
  /** One-time: units sold in the first month. Subscription: new subscribers in the first month. */
  volumeMonth1: number;
  /** Annual growth of volume, by year since launch; the last value repeats. */
  volumeGrowthPct: number[];
  seasonality: number[];
  discountPct: number;
  returnsPct: number;
  capacityPerMonth: number | null;
  utilizationPct: number;
  unitCost: number;
  unitCostGrowthPct: number;
  vatRatePct: number;
  purchaseVatRatePct: number;
  churnPctMonthly: number;
  cacPerCustomer: number;
  /** Month offset → overriding volume or price for that month. */
  overrides: Record<string, { volume?: number; price?: number }>;
};

export type ExpenseCategory =
  | 'rent' | 'utilities' | 'marketing' | 'maintenance' | 'insurance' | 'admin' | 'logistics' | 'raw_materials'
  | 'subcontracting' | 'it' | 'travel' | 'fees' | 'telecom' | 'other';
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'rent', 'utilities', 'marketing', 'maintenance', 'insurance', 'admin', 'logistics', 'raw_materials',
  'subcontracting', 'it', 'travel', 'fees', 'telecom', 'other',
];

export type Expense = {
  id: string; name: string; category: ExpenseCategory; costCenter: string;
  behavior: 'fixed' | 'variable_revenue_pct';
  amountMonthly: number;
  pctOfRevenue: number;
  startMonth: number;
  endMonth: number | null;
  growthPct: number;
  indexedOnInflation: boolean;
  vatRatePct: number;
  vatDeductible: boolean;
  paymentDelayDays: number | null;
};

export type StaffLine = {
  id: string; role: string; costCenter: string; headcount: number; grossMonthly: number;
  startMonth: number; endMonth: number | null; annualRaisePct: number; dependants: number;
};

export type InvestmentKind = 'tangible' | 'intangible' | 'land' | 'goodwill' | 'deposit';
export type Investment = {
  id: string; name: string; kind: InvestmentKind; phase: 'initial' | 'expansion';
  amountHT: number; vatRatePct: number; vatRecoverable: boolean; month: number;
  /** CGI art. 103 bis excludes office furniture and equipment and passenger vehicles from the refund. */
  vatRefundEligible: boolean;
  usefulLifeYears: number; method: 'linear' | 'declining'; decliningCoefficient: number;
};

export type Loan = {
  id: string; name: string; kind: 'bank' | 'shareholder';
  principal: number; month: number; annualRatePct: number; termMonths: number; graceMonths: number;
  graceType: 'interest_only' | 'capitalized'; method: 'annuity' | 'constant_principal' | 'bullet'; feesPct: number;
};
export type EquityContribution = { id: string; name: string; amount: number; month: number };
export type Grant = {
  id: string; name: string; kind: 'investment' | 'operating'; amount: number; month: number; amortizationYears: number;
};
export type Lease = {
  id: string; name: string; monthlyRentHT: number; vatRatePct: number; startMonth: number; termMonths: number;
  purchaseOptionHT: number; optionAssetLifeYears: number;
};

export type Financing = {
  equity: EquityContribution[];
  loans: Loan[];
  grants: Grant[];
  leases: Lease[];
  overdraftRatePct: number;
  dividends: {
    payoutPct: number; fromFiscalYearIndex: number; paymentMonthOfFiscalYear: number; withholdingRatePct: number;
    /** 'legal': CGI art. 19-IV-B and 247-XXXVII-C rate at the distribution date; 'custom': withholdingRatePct. */
    withholdingMode: 'legal' | 'custom';
  };
};

export type WorkingCapital = {
  cashSalesPct: number; dsoDays: number; dpoDays: number; inventoryDays: number; badDebtPct: number; minimumCash: number;
};

export type TaxRegime = 'is' | 'ir_professional' | 'auto_entrepreneur';
export type IsCategory = 'standard' | 'industrial' | 'zai_cfc' | 'former_20pct_sector' | 'credit_insurance';

export type LocalTax = {
  id: string; name: string; kind: 'tp' | 'tsc' | 'registration' | 'other';
  base: 'fixed' | 'rental_value' | 'investment' | 'revenue';
  ratePct: number; amount: number; baseAmount: number;
  startFiscalYearIndex: number; exemptYears: number; paymentMonthOfFiscalYear: number; legalBasis: string;
};

export type TaxExemption = {
  id: string; tax: 'is'; label: string; fromFiscalYearIndex: number; toFiscalYearIndex: number;
  reductionPct: number; minimumContributionExempt: boolean; legalBasis: string;
};

export type TaxRuleOverride = {
  id: string; fromFiscalYear: number; isRatePct: number | null; minimumContributionRatePct: number | null; note: string;
};

export type TaxSettings = {
  regime: TaxRegime;
  isCategory: IsCategory;
  vatSubject: boolean;
  vatRegime: 'encaissement' | 'debit';
  vatPeriodicity: 'auto' | 'monthly' | 'quarterly';
  /** CGI art. 103 bis refund of the non-imputable VAT credit on investment goods. */
  vatInvestmentRefund: boolean;
  activityStartMonth: number;
  applyMinimumContributionExemption: boolean;
  minimumContributionRateOverridePct: number | null;
  lossCarryforwardYears: number;
  nonDeductibleByFiscalYear: number[];
  autoEntrepreneurRatePct: number;
  exemptions: TaxExemption[];
  localTaxes: LocalTax[];
  overrides: TaxRuleOverride[];
};

export type OpeningBalance = {
  enabled: boolean;
  cash: number; receivables: number; inventory: number; vatCredit: number;
  fixedAssetsGross: number; accumulatedDepreciation: number; remainingLifeYears: number;
  payables: number; vatPayable: number; socialPayable: number; isPayable: number;
  debtBalance: number; debtAnnualRatePct: number; debtRemainingMonths: number;
  capital: number; reserves: number;
  priorYearIsDue: number;
};

export type Levers = {
  priceFactorPct: number; volumeFactorPct: number; revenueGrowthDeltaPts: number; unitCostFactorPct: number;
  opexFactorPct: number; headcountFactorPct: number; wageFactorPct: number; inflationDeltaPts: number;
  dsoDeltaDays: number; dpoDeltaDays: number; inventoryDeltaDays: number; capexFactorPct: number;
  loanAmountFactorPct: number; interestDeltaPts: number; loanTermDeltaMonths: number;
  isRateOverridePct: number | null; exchangeRateFactorPct: number; capacityFactorPct: number;
  utilizationDeltaPts: number; launchDelayMonths: number; expansionDelayMonths: number;
};

export type Scenario = {
  id: string; name: string; kind: 'base' | 'optimistic' | 'pessimistic' | 'custom'; description: string;
  levers: Levers; parentId: string | null; createdAt: string;
};

export type Risk = {
  id: string; title: string; category: string; likelihood: number; impact: number; mitigation: string; owner: string;
};

export type Narrative = { executiveSummary: string; marketAnalysis: string; conclusion: string };

export type StudyModel = {
  schemaVersion: typeof STUDY_SCHEMA_VERSION;
  projectType: ProjectType;
  sector: SectorId;
  sectorInputs: Record<string, number>;
  profile: StudyProfile;
  horizon: Horizon;
  general: { inflationPct: number; discountRatePct: number; terminalGrowthPct: number | null; exchangeRates: ExchangeRate[] };
  products: Product[];
  expenses: Expense[];
  staff: StaffLine[];
  investments: Investment[];
  financing: Financing;
  workingCapital: WorkingCapital;
  tax: TaxSettings;
  openingBalance: OpeningBalance;
  scenarios: Scenario[];
  activeScenarioId: string;
  risks: Risk[];
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  pestel: { political: string[]; economic: string[]; social: string[]; technological: string[]; environmental: string[]; legal: string[] };
  narrative: Narrative;
};

export const NEUTRAL_LEVERS: Levers = {
  priceFactorPct: 0, volumeFactorPct: 0, revenueGrowthDeltaPts: 0, unitCostFactorPct: 0, opexFactorPct: 0,
  headcountFactorPct: 0, wageFactorPct: 0, inflationDeltaPts: 0, dsoDeltaDays: 0, dpoDeltaDays: 0,
  inventoryDeltaDays: 0, capexFactorPct: 0, loanAmountFactorPct: 0, interestDeltaPts: 0, loanTermDeltaMonths: 0,
  isRateOverridePct: null, exchangeRateFactorPct: 0, capacityFactorPct: 0, utilizationDeltaPts: 0,
  launchDelayMonths: 0, expansionDelayMonths: 0,
};

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}${idCounter.toString(36)}`;
}

export function defaultScenarios(now = new Date().toISOString()): Scenario[] {
  return [
    { id: 'base', name: 'Scénario de base', kind: 'base', description: 'Hypothèses saisies, sans ajustement.', levers: { ...NEUTRAL_LEVERS }, parentId: null, createdAt: now },
    {
      id: 'optimistic', name: 'Scénario optimiste', kind: 'optimistic',
      description: 'Ajustements saisis par l’utilisateur ; valeurs initiales indicatives : volumes +10 %, prix +3 %, charges −3 %.',
      levers: { ...NEUTRAL_LEVERS, volumeFactorPct: 10, priceFactorPct: 3, opexFactorPct: -3 }, parentId: 'base', createdAt: now,
    },
    {
      id: 'pessimistic', name: 'Scénario pessimiste', kind: 'pessimistic',
      description: 'Ajustements saisis par l’utilisateur ; valeurs initiales indicatives : volumes −15 %, prix −5 %, charges +5 %, clients +15 jours.',
      levers: { ...NEUTRAL_LEVERS, volumeFactorPct: -15, priceFactorPct: -5, opexFactorPct: 5, dsoDeltaDays: 15 }, parentId: 'base', createdAt: now,
    },
  ];
}

export function emptyOpeningBalance(): OpeningBalance {
  return {
    enabled: false, cash: 0, receivables: 0, inventory: 0, vatCredit: 0, fixedAssetsGross: 0, accumulatedDepreciation: 0,
    remainingLifeYears: 5, payables: 0, vatPayable: 0, socialPayable: 0, isPayable: 0, debtBalance: 0,
    debtAnnualRatePct: 0, debtRemainingMonths: 0, capital: 0, reserves: 0, priorYearIsDue: 0,
  };
}

export function flatSeasonality(): number[] {
  return Array.from({ length: 12 }, () => 1);
}

export function newProduct(partial: Partial<Product> = {}): Product {
  return {
    id: newId('prd'), name: 'Produit', segment: '', channel: '', kind: 'one_time', phase: 'initial', currency: 'MAD',
    unitPrice: 0, priceGrowthPct: 0, launchMonth: 0, endMonth: null, volumeMonth1: 0, volumeGrowthPct: [0],
    seasonality: flatSeasonality(), discountPct: 0, returnsPct: 0, capacityPerMonth: null, utilizationPct: 100,
    unitCost: 0, unitCostGrowthPct: 0, vatRatePct: 20, purchaseVatRatePct: 20, churnPctMonthly: 0, cacPerCustomer: 0,
    overrides: {}, ...partial,
  };
}

export function newExpense(partial: Partial<Expense> = {}): Expense {
  return {
    id: newId('exp'), name: 'Charge', category: 'other', costCenter: '', behavior: 'fixed', amountMonthly: 0,
    pctOfRevenue: 0, startMonth: 0, endMonth: null, growthPct: 0, indexedOnInflation: true, vatRatePct: 20,
    vatDeductible: true, paymentDelayDays: null, ...partial,
  };
}

export function newStaff(partial: Partial<StaffLine> = {}): StaffLine {
  return {
    id: newId('stf'), role: 'Poste', costCenter: '', headcount: 1, grossMonthly: 0, startMonth: 0, endMonth: null,
    annualRaisePct: 0, dependants: 0, ...partial,
  };
}

export function newInvestment(partial: Partial<Investment> = {}): Investment {
  return {
    id: newId('inv'), name: 'Investissement', kind: 'tangible', phase: 'initial', amountHT: 0, vatRatePct: 20,
    vatRecoverable: true, vatRefundEligible: true, month: 0, usefulLifeYears: 5, method: 'linear', decliningCoefficient: 2, ...partial,
  };
}

export function newLoan(partial: Partial<Loan> = {}): Loan {
  return {
    id: newId('lon'), name: 'Emprunt bancaire', kind: 'bank', principal: 0, month: 0, annualRatePct: 0, termMonths: 60,
    graceMonths: 0, graceType: 'interest_only', method: 'annuity', feesPct: 0, ...partial,
  };
}

export function newRisk(partial: Partial<Risk> = {}): Risk {
  return { id: newId('rsk'), title: '', category: 'commercial', likelihood: 3, impact: 3, mitigation: '', owner: '', ...partial };
}

export function emptyModel(options: { startMonth?: string; years?: number; sector?: SectorId; projectType?: ProjectType } = {}): StudyModel {
  const now = new Date();
  const startMonth = options.startMonth ?? `${now.getFullYear() + (now.getMonth() >= 10 ? 1 : 0)}-${String(now.getMonth() >= 10 ? 1 : now.getMonth() + 2).padStart(2, '0')}`;
  return {
    schemaVersion: STUDY_SCHEMA_VERSION,
    projectType: options.projectType ?? 'creation',
    sector: options.sector ?? 'services',
    sectorInputs: {},
    profile: {
      company: {
        name: '', tradingName: '', logoDataUrl: '', legalForm: '', address: '', city: '', phone: '', email: '', activity: '',
        incorporated: false, ice: '', rc: '', if: '', cnss: '', incorporationDate: '',
      },
      directors: [],
      shareholders: [],
      project: { location: '', objectives: '', description: '', businessModel: '', market: '', targetCustomers: '', competition: '' },
    },
    horizon: { startMonth, years: options.years ?? 5, fiscalYearStartMonth: 1 },
    general: { inflationPct: 0, discountRatePct: 10, terminalGrowthPct: null, exchangeRates: [] },
    products: [],
    expenses: [],
    staff: [],
    investments: [],
    financing: {
      equity: [], loans: [], grants: [], leases: [], overdraftRatePct: 0,
      dividends: { payoutPct: 0, fromFiscalYearIndex: 1, paymentMonthOfFiscalYear: 7, withholdingRatePct: 0, withholdingMode: 'legal' },
    },
    workingCapital: { cashSalesPct: 100, dsoDays: 0, dpoDays: 0, inventoryDays: 0, badDebtPct: 0, minimumCash: 0 },
    tax: {
      regime: 'is', isCategory: 'standard', vatSubject: true, vatRegime: 'encaissement', vatPeriodicity: 'auto', vatInvestmentRefund: false,
      activityStartMonth: 0, applyMinimumContributionExemption: options.projectType === undefined || options.projectType === 'creation',
      minimumContributionRateOverridePct: null, lossCarryforwardYears: 4, nonDeductibleByFiscalYear: [],
      autoEntrepreneurRatePct: 0, exemptions: [], localTaxes: [], overrides: [],
    },
    openingBalance: emptyOpeningBalance(),
    scenarios: defaultScenarios(),
    activeScenarioId: 'base',
    risks: [],
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    pestel: { political: [], economic: [], social: [], technological: [], environmental: [], legal: [] },
    narrative: { executiveSummary: '', marketAnalysis: '', conclusion: '' },
  };
}

// ─── Validation ────────────────────────────────────────────────────────────────────────────────

export type ValidationIssue = { path: string; message: string; severity: 'error' | 'warning' };
export type ValidationResult = { ok: boolean; model: StudyModel; issues: ValidationIssue[] };

const MONTH_RE = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;
const MAX_AMOUNT = 1e12;
const MAX_LIST = 200;

type Ctx = { issues: ValidationIssue[] };

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max);
}

function num(ctx: Ctx, v: unknown, path: string, opts: { min?: number; max?: number; int?: boolean; fallback?: number } = {}): number {
  const fallback = opts.fallback ?? 0;
  if (v === '' || v == null) return fallback;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) {
    ctx.issues.push({ path, message: 'Valeur numérique invalide.', severity: 'error' });
    return fallback;
  }
  const min = opts.min ?? -MAX_AMOUNT;
  const max = opts.max ?? MAX_AMOUNT;
  if (n < min || n > max) {
    ctx.issues.push({ path, message: `Valeur hors limites (${min} à ${max}).`, severity: 'error' });
    return Math.min(max, Math.max(min, opts.int ? Math.round(n) : n));
  }
  return opts.int ? Math.round(n) : n;
}

function nullableNum(ctx: Ctx, v: unknown, path: string, opts: { min?: number; max?: number; int?: boolean } = {}): number | null {
  if (v === '' || v == null) return null;
  return num(ctx, v, path, opts);
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function list<T>(ctx: Ctx, v: unknown, path: string, map: (item: Record<string, unknown>, p: string) => T): T[] {
  if (!Array.isArray(v)) return [];
  if (v.length > MAX_LIST) ctx.issues.push({ path, message: `Au plus ${MAX_LIST} éléments.`, severity: 'error' });
  return v.slice(0, MAX_LIST).map((item, i) => map((item && typeof item === 'object' ? item : {}) as Record<string, unknown>, `${path}[${i}]`));
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.slice(0, 50).map((s) => str(s, 500)).filter((s) => s.trim() !== '') : [];
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function id(v: unknown, prefix: string): string {
  const s = str(v, 64).replace(/[^\w-]/g, '');
  return s || newId(prefix);
}

/** Months beyond the current horizon are kept (the engine ignores them) so shortening a horizon never invalidates a study. */
function monthOffset(ctx: Ctx, v: unknown, path: string): number {
  return num(ctx, v, path, { min: 0, max: MAX_YEARS * 12 - 1, int: true });
}

function levers(ctx: Ctx, v: unknown, path: string): Levers {
  const r = rec(v);
  const pct = (k: keyof Levers, min = -100, max = 500) => num(ctx, r[k], `${path}.${k}`, { min, max });
  return {
    priceFactorPct: pct('priceFactorPct', -100, 500), volumeFactorPct: pct('volumeFactorPct', -100, 1000),
    revenueGrowthDeltaPts: pct('revenueGrowthDeltaPts', -100, 500), unitCostFactorPct: pct('unitCostFactorPct', -100, 500),
    opexFactorPct: pct('opexFactorPct', -100, 500), headcountFactorPct: pct('headcountFactorPct', -100, 500),
    wageFactorPct: pct('wageFactorPct', -100, 500), inflationDeltaPts: pct('inflationDeltaPts', -50, 100),
    dsoDeltaDays: num(ctx, r.dsoDeltaDays, `${path}.dsoDeltaDays`, { min: -365, max: 365, int: true }),
    dpoDeltaDays: num(ctx, r.dpoDeltaDays, `${path}.dpoDeltaDays`, { min: -365, max: 365, int: true }),
    inventoryDeltaDays: num(ctx, r.inventoryDeltaDays, `${path}.inventoryDeltaDays`, { min: -365, max: 365, int: true }),
    capexFactorPct: pct('capexFactorPct'), loanAmountFactorPct: pct('loanAmountFactorPct'),
    interestDeltaPts: pct('interestDeltaPts', -50, 50),
    loanTermDeltaMonths: num(ctx, r.loanTermDeltaMonths, `${path}.loanTermDeltaMonths`, { min: -360, max: 360, int: true }),
    isRateOverridePct: nullableNum(ctx, r.isRateOverridePct, `${path}.isRateOverridePct`, { min: 0, max: 100 }),
    exchangeRateFactorPct: pct('exchangeRateFactorPct', -90, 500), capacityFactorPct: pct('capacityFactorPct'),
    utilizationDeltaPts: pct('utilizationDeltaPts', -100, 100),
    launchDelayMonths: num(ctx, r.launchDelayMonths, `${path}.launchDelayMonths`, { min: -360, max: 360, int: true }),
    expansionDelayMonths: num(ctx, r.expansionDelayMonths, `${path}.expansionDelayMonths`, { min: -360, max: 360, int: true }),
  };
}

/**
 * Server-side validation of a full study model. Unknown fields are dropped, numbers are bounded,
 * and inconsistencies that would make the statements meaningless are reported as errors.
 */
export function validateStudyModel(input: unknown): ValidationResult {
  const ctx: Ctx = { issues: [] };
  const r = rec(input);
  const base = emptyModel();

  const h = rec(r.horizon);
  const startMonth = typeof h.startMonth === 'string' && MONTH_RE.test(h.startMonth) ? h.startMonth : base.horizon.startMonth;
  if (h.startMonth != null && startMonth !== h.startMonth) {
    ctx.issues.push({ path: 'horizon.startMonth', message: 'Mois de début attendu au format AAAA-MM.', severity: 'error' });
  }
  const years = num(ctx, h.years, 'horizon.years', { min: MIN_YEARS, max: MAX_YEARS, int: true, fallback: 5 });
  const horizon: Horizon = {
    startMonth,
    years,
    fiscalYearStartMonth: num(ctx, h.fiscalYearStartMonth, 'horizon.fiscalYearStartMonth', { min: 1, max: 12, int: true, fallback: 1 }),
  };
  const N = years * 12;
  const mo = (v: unknown, p: string) => monthOffset(ctx, v, p);
  const endMo = (v: unknown, p: string) => (v === '' || v == null ? null : mo(v, p));

  const p = rec(r.profile);
  const c = rec(p.company);
  const pr = rec(p.project);
  const rawLogo = typeof c.logoDataUrl === 'string' ? c.logoDataUrl : '';
  const logoFormatOk = rawLogo === '' || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(rawLogo);
  if (rawLogo.length > 400_000) ctx.issues.push({ path: 'profile.company.logoDataUrl', message: 'Logo trop volumineux (300 Ko maximum).', severity: 'error' });
  else if (!logoFormatOk) ctx.issues.push({ path: 'profile.company.logoDataUrl', message: 'Logo : seuls les formats PNG et JPEG (base64) sont acceptés.', severity: 'error' });
  const logo = rawLogo.length > 400_000 || !logoFormatOk ? '' : rawLogo;
  const profile: StudyProfile = {
    company: {
      name: str(c.name, 200), tradingName: str(c.tradingName, 200),
      logoDataUrl: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) ? logo : '',
      legalForm: oneOf<LegalForm>(c.legalForm, ['', 'sarl', 'sarl_au', 'sa', 'sas', 'snc', 'scs', 'gie', 'cooperative', 'auto_entrepreneur', 'personne_physique', 'other'], ''),
      address: str(c.address, 500), city: str(c.city, 120), phone: str(c.phone, 40), email: str(c.email, 200),
      activity: str(c.activity, 500), incorporated: bool(c.incorporated), ice: str(c.ice, 30), rc: str(c.rc, 30),
      if: str(c.if, 30), cnss: str(c.cnss, 30), incorporationDate: str(c.incorporationDate, 10),
    },
    directors: list(ctx, p.directors, 'profile.directors', (d) => ({
      id: id(d.id, 'dir'), name: str(d.name, 200), position: str(d.position, 200), history: str(d.history, 4000),
      qualifications: str(d.qualifications, 4000), experienceYears: num(ctx, d.experienceYears, 'experienceYears', { min: 0, max: 80 }),
    })),
    shareholders: list(ctx, p.shareholders, 'profile.shareholders', (s, sp) => ({
      id: id(s.id, 'sh'), name: str(s.name, 200), ownershipPct: num(ctx, s.ownershipPct, `${sp}.ownershipPct`, { min: 0, max: 100 }),
      contribution: num(ctx, s.contribution, `${sp}.contribution`, { min: 0 }), commitment: str(s.commitment, 1000),
    })),
    project: {
      location: str(pr.location, 300), objectives: str(pr.objectives, 6000), description: str(pr.description, 6000),
      businessModel: str(pr.businessModel, 6000), market: str(pr.market, 6000), targetCustomers: str(pr.targetCustomers, 6000),
      competition: str(pr.competition, 6000),
    },
  };
  if (profile.company.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.company.email)) {
    ctx.issues.push({ path: 'profile.company.email', message: 'Adresse e-mail invalide.', severity: 'warning' });
  }
  if (profile.shareholders.length > 0) {
    const total = profile.shareholders.reduce((s, x) => s + x.ownershipPct, 0);
    if (Math.abs(total - 100) > 0.01) {
      ctx.issues.push({ path: 'profile.shareholders', message: `La somme des participations est ${total.toFixed(2)} % (100 % attendu).`, severity: 'warning' });
    }
  }

  const g = rec(r.general);
  const general = {
    inflationPct: num(ctx, g.inflationPct, 'general.inflationPct', { min: -20, max: 100 }),
    discountRatePct: num(ctx, g.discountRatePct, 'general.discountRatePct', { min: 0, max: 100, fallback: 10 }),
    terminalGrowthPct: nullableNum(ctx, g.terminalGrowthPct, 'general.terminalGrowthPct', { min: -10, max: 20 }),
    exchangeRates: list(ctx, g.exchangeRates, 'general.exchangeRates', (x, xp) => ({
      currency: str(x.currency, 3).toUpperCase().replace(/[^A-Z]/g, ''),
      rateToMad: num(ctx, x.rateToMad, `${xp}.rateToMad`, { min: 0, max: 100000 }),
      annualChangePct: num(ctx, x.annualChangePct, `${xp}.annualChangePct`, { min: -90, max: 500 }),
    })).filter((x) => x.currency.length === 3),
  };
  if (general.terminalGrowthPct != null && general.terminalGrowthPct >= general.discountRatePct) {
    ctx.issues.push({ path: 'general.terminalGrowthPct', message: 'La croissance terminale doit rester inférieure au taux d’actualisation.', severity: 'error' });
  }

  const products = list(ctx, r.products, 'products', (x, xp) => {
    const season = Array.isArray(x.seasonality) && x.seasonality.length === 12
      ? x.seasonality.map((s, i) => num(ctx, s, `${xp}.seasonality[${i}]`, { min: 0, max: 100, fallback: 1 }))
      : flatSeasonality();
    const growth = Array.isArray(x.volumeGrowthPct) && x.volumeGrowthPct.length > 0
      ? x.volumeGrowthPct.slice(0, MAX_YEARS).map((v, i) => num(ctx, v, `${xp}.volumeGrowthPct[${i}]`, { min: -100, max: 1000 }))
      : [num(ctx, x.volumeGrowthPct, `${xp}.volumeGrowthPct`, { min: -100, max: 1000 })];
    const overrides: Product['overrides'] = {};
    for (const [k, ov] of Object.entries(rec(x.overrides)).slice(0, 360)) {
      const m = Number(k);
      if (!Number.isInteger(m) || m < 0 || m >= N) continue;
      const o = rec(ov);
      const volume = nullableNum(ctx, o.volume, `${xp}.overrides.${k}.volume`, { min: 0 });
      const price = nullableNum(ctx, o.price, `${xp}.overrides.${k}.price`, { min: 0 });
      if (volume != null || price != null) overrides[String(m)] = { ...(volume != null ? { volume } : {}), ...(price != null ? { price } : {}) };
    }
    const kind = oneOf(x.kind, ['one_time', 'subscription'] as const, 'one_time');
    return {
      id: id(x.id, 'prd'), name: str(x.name, 200) || 'Produit', segment: str(x.segment, 120), channel: str(x.channel, 120),
      kind, phase: oneOf(x.phase, ['initial', 'expansion'] as const, 'initial'),
      currency: (str(x.currency, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'MAD'),
      unitPrice: num(ctx, x.unitPrice, `${xp}.unitPrice`, { min: 0 }),
      priceGrowthPct: num(ctx, x.priceGrowthPct, `${xp}.priceGrowthPct`, { min: -100, max: 500 }),
      launchMonth: mo(x.launchMonth, `${xp}.launchMonth`), endMonth: endMo(x.endMonth, `${xp}.endMonth`),
      volumeMonth1: num(ctx, x.volumeMonth1, `${xp}.volumeMonth1`, { min: 0, max: 1e9 }),
      volumeGrowthPct: growth, seasonality: season,
      discountPct: num(ctx, x.discountPct, `${xp}.discountPct`, { min: 0, max: 100 }),
      returnsPct: num(ctx, x.returnsPct, `${xp}.returnsPct`, { min: 0, max: 100 }),
      capacityPerMonth: nullableNum(ctx, x.capacityPerMonth, `${xp}.capacityPerMonth`, { min: 0, max: 1e9 }),
      utilizationPct: num(ctx, x.utilizationPct, `${xp}.utilizationPct`, { min: 0, max: 100, fallback: 100 }),
      unitCost: num(ctx, x.unitCost, `${xp}.unitCost`, { min: 0 }),
      unitCostGrowthPct: num(ctx, x.unitCostGrowthPct, `${xp}.unitCostGrowthPct`, { min: -100, max: 500 }),
      vatRatePct: num(ctx, x.vatRatePct, `${xp}.vatRatePct`, { min: 0, max: 100, fallback: 20 }),
      purchaseVatRatePct: num(ctx, x.purchaseVatRatePct, `${xp}.purchaseVatRatePct`, { min: 0, max: 100, fallback: 20 }),
      churnPctMonthly: num(ctx, x.churnPctMonthly, `${xp}.churnPctMonthly`, { min: 0, max: 100 }),
      cacPerCustomer: num(ctx, x.cacPerCustomer, `${xp}.cacPerCustomer`, { min: 0 }),
      overrides,
    };
  });
  for (const pd of products) {
    if (pd.endMonth != null && pd.endMonth < pd.launchMonth) {
      ctx.issues.push({ path: `products.${pd.id}.endMonth`, message: `« ${pd.name} » : fin avant le lancement.`, severity: 'error' });
    }
    if (pd.currency !== 'MAD' && !general.exchangeRates.some((x) => x.currency === pd.currency && x.rateToMad > 0)) {
      ctx.issues.push({ path: `products.${pd.id}.currency`, message: `« ${pd.name} » : aucun taux de change saisi pour ${pd.currency}.`, severity: 'error' });
    }
  }

  const expenses = list(ctx, r.expenses, 'expenses', (x, xp) => ({
    id: id(x.id, 'exp'), name: str(x.name, 200) || 'Charge',
    category: oneOf(x.category, EXPENSE_CATEGORIES, 'other'), costCenter: str(x.costCenter, 120),
    behavior: oneOf(x.behavior, ['fixed', 'variable_revenue_pct'] as const, 'fixed'),
    amountMonthly: num(ctx, x.amountMonthly, `${xp}.amountMonthly`, { min: 0 }),
    pctOfRevenue: num(ctx, x.pctOfRevenue, `${xp}.pctOfRevenue`, { min: 0, max: 100 }),
    startMonth: mo(x.startMonth, `${xp}.startMonth`), endMonth: endMo(x.endMonth, `${xp}.endMonth`),
    growthPct: num(ctx, x.growthPct, `${xp}.growthPct`, { min: -100, max: 500 }),
    indexedOnInflation: bool(x.indexedOnInflation, true),
    vatRatePct: num(ctx, x.vatRatePct, `${xp}.vatRatePct`, { min: 0, max: 100 }),
    vatDeductible: bool(x.vatDeductible, true),
    paymentDelayDays: nullableNum(ctx, x.paymentDelayDays, `${xp}.paymentDelayDays`, { min: 0, max: 365, int: true }),
  }));

  const staff = list(ctx, r.staff, 'staff', (x, xp) => ({
    id: id(x.id, 'stf'), role: str(x.role, 200) || 'Poste', costCenter: str(x.costCenter, 120),
    headcount: num(ctx, x.headcount, `${xp}.headcount`, { min: 0, max: 100000 }),
    grossMonthly: num(ctx, x.grossMonthly, `${xp}.grossMonthly`, { min: 0, max: 10_000_000 }),
    startMonth: mo(x.startMonth, `${xp}.startMonth`), endMonth: endMo(x.endMonth, `${xp}.endMonth`),
    annualRaisePct: num(ctx, x.annualRaisePct, `${xp}.annualRaisePct`, { min: -50, max: 200 }),
    dependants: num(ctx, x.dependants, `${xp}.dependants`, { min: 0, max: 20, int: true }),
  }));

  const investments = list(ctx, r.investments, 'investments', (x, xp) => {
    const kind = oneOf(x.kind, ['tangible', 'intangible', 'land', 'goodwill', 'deposit'] as const, 'tangible');
    return {
      id: id(x.id, 'inv'), name: str(x.name, 200) || 'Investissement', kind,
      phase: oneOf(x.phase, ['initial', 'expansion'] as const, 'initial'),
      amountHT: num(ctx, x.amountHT, `${xp}.amountHT`, { min: 0 }),
      vatRatePct: num(ctx, x.vatRatePct, `${xp}.vatRatePct`, { min: 0, max: 100 }),
      vatRecoverable: bool(x.vatRecoverable, true), vatRefundEligible: bool(x.vatRefundEligible, true), month: mo(x.month, `${xp}.month`),
      usefulLifeYears: num(ctx, x.usefulLifeYears, `${xp}.usefulLifeYears`, { min: kind === 'land' || kind === 'goodwill' || kind === 'deposit' ? 0 : 1, max: 100, int: true, fallback: 5 }),
      method: oneOf(x.method, ['linear', 'declining'] as const, 'linear'),
      decliningCoefficient: num(ctx, x.decliningCoefficient, `${xp}.decliningCoefficient`, { min: 1, max: 5, fallback: 2 }),
    };
  });

  const f = rec(r.financing);
  const dv = rec(f.dividends);
  const financing: Financing = {
    equity: list(ctx, f.equity, 'financing.equity', (x, xp) => ({
      id: id(x.id, 'eq'), name: str(x.name, 200) || 'Apport', amount: num(ctx, x.amount, `${xp}.amount`, { min: 0 }), month: mo(x.month, `${xp}.month`),
    })),
    loans: list(ctx, f.loans, 'financing.loans', (x, xp) => ({
      id: id(x.id, 'lon'), name: str(x.name, 200) || 'Emprunt', kind: oneOf(x.kind, ['bank', 'shareholder'] as const, 'bank'),
      principal: num(ctx, x.principal, `${xp}.principal`, { min: 0 }), month: mo(x.month, `${xp}.month`),
      annualRatePct: num(ctx, x.annualRatePct, `${xp}.annualRatePct`, { min: 0, max: 100 }),
      termMonths: num(ctx, x.termMonths, `${xp}.termMonths`, { min: 1, max: 480, int: true, fallback: 60 }),
      graceMonths: num(ctx, x.graceMonths, `${xp}.graceMonths`, { min: 0, max: 120, int: true }),
      graceType: oneOf(x.graceType, ['interest_only', 'capitalized'] as const, 'interest_only'),
      method: oneOf(x.method, ['annuity', 'constant_principal', 'bullet'] as const, 'annuity'),
      feesPct: num(ctx, x.feesPct, `${xp}.feesPct`, { min: 0, max: 20 }),
    })),
    grants: list(ctx, f.grants, 'financing.grants', (x, xp) => ({
      id: id(x.id, 'grt'), name: str(x.name, 200) || 'Subvention', kind: oneOf(x.kind, ['investment', 'operating'] as const, 'investment'),
      amount: num(ctx, x.amount, `${xp}.amount`, { min: 0 }), month: mo(x.month, `${xp}.month`),
      amortizationYears: x.kind === 'operating'
        ? 0
        : num(ctx, x.amortizationYears, `${xp}.amortizationYears`, { min: 1, max: 50, int: true, fallback: 5 }),
    })),
    leases: list(ctx, f.leases, 'financing.leases', (x, xp) => ({
      id: id(x.id, 'lea'), name: str(x.name, 200) || 'Crédit-bail', monthlyRentHT: num(ctx, x.monthlyRentHT, `${xp}.monthlyRentHT`, { min: 0 }),
      vatRatePct: num(ctx, x.vatRatePct, `${xp}.vatRatePct`, { min: 0, max: 100, fallback: 20 }),
      startMonth: mo(x.startMonth, `${xp}.startMonth`), termMonths: num(ctx, x.termMonths, `${xp}.termMonths`, { min: 1, max: 360, int: true, fallback: 48 }),
      purchaseOptionHT: num(ctx, x.purchaseOptionHT, `${xp}.purchaseOptionHT`, { min: 0 }),
      optionAssetLifeYears: num(ctx, x.optionAssetLifeYears, `${xp}.optionAssetLifeYears`, { min: 1, max: 50, int: true, fallback: 5 }),
    })),
    overdraftRatePct: num(ctx, f.overdraftRatePct, 'financing.overdraftRatePct', { min: 0, max: 50 }),
    dividends: {
      payoutPct: num(ctx, dv.payoutPct, 'financing.dividends.payoutPct', { min: 0, max: 100 }),
      fromFiscalYearIndex: num(ctx, dv.fromFiscalYearIndex, 'financing.dividends.fromFiscalYearIndex', { min: 1, max: 31, int: true, fallback: 1 }),
      paymentMonthOfFiscalYear: num(ctx, dv.paymentMonthOfFiscalYear, 'financing.dividends.paymentMonthOfFiscalYear', { min: 1, max: 12, int: true, fallback: 7 }),
      withholdingRatePct: num(ctx, dv.withholdingRatePct, 'financing.dividends.withholdingRatePct', { min: 0, max: 100 }),
      withholdingMode: oneOf(dv.withholdingMode, ['legal', 'custom'] as const, 'custom'),
    },
  };

  const w = rec(r.workingCapital);
  const workingCapital: WorkingCapital = {
    cashSalesPct: num(ctx, w.cashSalesPct, 'workingCapital.cashSalesPct', { min: 0, max: 100, fallback: 100 }),
    dsoDays: num(ctx, w.dsoDays, 'workingCapital.dsoDays', { min: 0, max: 365, int: true }),
    dpoDays: num(ctx, w.dpoDays, 'workingCapital.dpoDays', { min: 0, max: 365, int: true }),
    inventoryDays: num(ctx, w.inventoryDays, 'workingCapital.inventoryDays', { min: 0, max: 730, int: true }),
    badDebtPct: num(ctx, w.badDebtPct, 'workingCapital.badDebtPct', { min: 0, max: 100 }),
    minimumCash: num(ctx, w.minimumCash, 'workingCapital.minimumCash', { min: 0 }),
  };

  const t = rec(r.tax);
  const tax: TaxSettings = {
    regime: oneOf(t.regime, ['is', 'ir_professional', 'auto_entrepreneur'] as const, 'is'),
    isCategory: oneOf(t.isCategory, ['standard', 'industrial', 'zai_cfc', 'former_20pct_sector', 'credit_insurance'] as const, 'standard'),
    vatSubject: bool(t.vatSubject, true),
    vatRegime: oneOf(t.vatRegime, ['encaissement', 'debit'] as const, 'encaissement'),
    vatPeriodicity: oneOf(t.vatPeriodicity, ['auto', 'monthly', 'quarterly'] as const, 'auto'),
    vatInvestmentRefund: bool(t.vatInvestmentRefund, false),
    activityStartMonth: num(ctx, t.activityStartMonth, 'tax.activityStartMonth', { min: -600, max: N, int: true }),
    applyMinimumContributionExemption: bool(t.applyMinimumContributionExemption, false),
    minimumContributionRateOverridePct: nullableNum(ctx, t.minimumContributionRateOverridePct, 'tax.minimumContributionRateOverridePct', { min: 0, max: 10 }),
    lossCarryforwardYears: num(ctx, t.lossCarryforwardYears, 'tax.lossCarryforwardYears', { min: 0, max: 30, int: true, fallback: 4 }),
    nonDeductibleByFiscalYear: Array.isArray(t.nonDeductibleByFiscalYear)
      ? t.nonDeductibleByFiscalYear.slice(0, MAX_YEARS + 1).map((v, i) => num(ctx, v, `tax.nonDeductibleByFiscalYear[${i}]`))
      : [],
    autoEntrepreneurRatePct: num(ctx, t.autoEntrepreneurRatePct, 'tax.autoEntrepreneurRatePct', { min: 0, max: 50 }),
    exemptions: list(ctx, t.exemptions, 'tax.exemptions', (x, xp) => ({
      id: id(x.id, 'exm'), tax: 'is' as const, label: str(x.label, 200),
      fromFiscalYearIndex: num(ctx, x.fromFiscalYearIndex, `${xp}.fromFiscalYearIndex`, { min: 1, max: 31, int: true, fallback: 1 }),
      toFiscalYearIndex: num(ctx, x.toFiscalYearIndex, `${xp}.toFiscalYearIndex`, { min: 1, max: 31, int: true, fallback: 1 }),
      reductionPct: num(ctx, x.reductionPct, `${xp}.reductionPct`, { min: 0, max: 100 }),
      minimumContributionExempt: bool(x.minimumContributionExempt),
      legalBasis: str(x.legalBasis, 500),
    })),
    localTaxes: list(ctx, t.localTaxes, 'tax.localTaxes', (x, xp) => ({
      id: id(x.id, 'ltx'), name: str(x.name, 200) || 'Taxe', kind: oneOf(x.kind, ['tp', 'tsc', 'registration', 'other'] as const, 'other'),
      base: oneOf(x.base, ['fixed', 'rental_value', 'investment', 'revenue'] as const, 'fixed'),
      ratePct: num(ctx, x.ratePct, `${xp}.ratePct`, { min: 0, max: 100 }), amount: num(ctx, x.amount, `${xp}.amount`, { min: 0 }),
      baseAmount: num(ctx, x.baseAmount, `${xp}.baseAmount`, { min: 0 }),
      startFiscalYearIndex: num(ctx, x.startFiscalYearIndex, `${xp}.startFiscalYearIndex`, { min: 1, max: 31, int: true, fallback: 1 }),
      exemptYears: num(ctx, x.exemptYears, `${xp}.exemptYears`, { min: 0, max: 30, int: true }),
      paymentMonthOfFiscalYear: num(ctx, x.paymentMonthOfFiscalYear, `${xp}.paymentMonthOfFiscalYear`, { min: 1, max: 12, int: true, fallback: 12 }),
      legalBasis: str(x.legalBasis, 500),
    })),
    overrides: list(ctx, t.overrides, 'tax.overrides', (x, xp) => ({
      id: id(x.id, 'ovr'), fromFiscalYear: num(ctx, x.fromFiscalYear, `${xp}.fromFiscalYear`, { min: 1990, max: 2100, int: true, fallback: 2027 }),
      isRatePct: nullableNum(ctx, x.isRatePct, `${xp}.isRatePct`, { min: 0, max: 100 }),
      minimumContributionRatePct: nullableNum(ctx, x.minimumContributionRatePct, `${xp}.minimumContributionRatePct`, { min: 0, max: 10 }),
      note: str(x.note, 500),
    })),
  };
  for (const e of tax.exemptions) {
    if (e.toFiscalYearIndex < e.fromFiscalYearIndex) ctx.issues.push({ path: `tax.exemptions.${e.id}`, message: `Exonération « ${e.label} » : période inversée.`, severity: 'error' });
    if (!e.legalBasis.trim()) ctx.issues.push({ path: `tax.exemptions.${e.id}`, message: `Exonération « ${e.label} » : base légale non renseignée (à valider par un professionnel).`, severity: 'warning' });
  }
  if (tax.regime === 'auto_entrepreneur' && tax.autoEntrepreneurRatePct === 0) {
    ctx.issues.push({ path: 'tax.autoEntrepreneurRatePct', message: 'Régime auto-entrepreneur : saisissez le taux applicable à votre activité (non fourni par l’outil).', severity: 'warning' });
  }

  const o = rec(r.openingBalance);
  const ob = emptyOpeningBalance();
  const openingBalance: OpeningBalance = {
    enabled: bool(o.enabled, false),
    cash: num(ctx, o.cash, 'openingBalance.cash'),
    receivables: num(ctx, o.receivables, 'openingBalance.receivables', { min: 0 }),
    inventory: num(ctx, o.inventory, 'openingBalance.inventory', { min: 0 }),
    vatCredit: num(ctx, o.vatCredit, 'openingBalance.vatCredit', { min: 0 }),
    fixedAssetsGross: num(ctx, o.fixedAssetsGross, 'openingBalance.fixedAssetsGross', { min: 0 }),
    accumulatedDepreciation: num(ctx, o.accumulatedDepreciation, 'openingBalance.accumulatedDepreciation', { min: 0 }),
    remainingLifeYears: num(ctx, o.remainingLifeYears, 'openingBalance.remainingLifeYears', { min: 0, max: 100, int: true, fallback: ob.remainingLifeYears }),
    payables: num(ctx, o.payables, 'openingBalance.payables', { min: 0 }),
    vatPayable: num(ctx, o.vatPayable, 'openingBalance.vatPayable', { min: 0 }),
    socialPayable: num(ctx, o.socialPayable, 'openingBalance.socialPayable', { min: 0 }),
    isPayable: num(ctx, o.isPayable, 'openingBalance.isPayable', { min: 0 }),
    debtBalance: num(ctx, o.debtBalance, 'openingBalance.debtBalance', { min: 0 }),
    debtAnnualRatePct: num(ctx, o.debtAnnualRatePct, 'openingBalance.debtAnnualRatePct', { min: 0, max: 100 }),
    debtRemainingMonths: num(ctx, o.debtRemainingMonths, 'openingBalance.debtRemainingMonths', { min: 0, max: 480, int: true }),
    capital: num(ctx, o.capital, 'openingBalance.capital'),
    reserves: num(ctx, o.reserves, 'openingBalance.reserves'),
    priorYearIsDue: num(ctx, o.priorYearIsDue, 'openingBalance.priorYearIsDue', { min: 0 }),
  };
  if (openingBalance.enabled) {
    const assets = openingBalance.cash + openingBalance.receivables + openingBalance.inventory + openingBalance.vatCredit
      + openingBalance.fixedAssetsGross - openingBalance.accumulatedDepreciation;
    const liabilities = openingBalance.payables + openingBalance.vatPayable + openingBalance.socialPayable + openingBalance.isPayable
      + openingBalance.debtBalance + openingBalance.capital + openingBalance.reserves;
    if (Math.abs(assets - liabilities) >= 0.005) {
      ctx.issues.push({
        path: 'openingBalance',
        message: `Bilan d’ouverture déséquilibré : actif ${assets.toFixed(2)} MAD, passif ${liabilities.toFixed(2)} MAD.`,
        severity: 'error',
      });
    }
    if (openingBalance.accumulatedDepreciation > openingBalance.fixedAssetsGross) {
      ctx.issues.push({ path: 'openingBalance.accumulatedDepreciation', message: 'Amortissements cumulés supérieurs aux immobilisations brutes.', severity: 'error' });
    }
    if (openingBalance.debtBalance > 0 && openingBalance.debtRemainingMonths === 0) {
      ctx.issues.push({ path: 'openingBalance.debtRemainingMonths', message: 'Durée restante de la dette requise.', severity: 'error' });
    }
  }

  const now = new Date().toISOString();
  let scenarios = list(ctx, r.scenarios, 'scenarios', (x, xp) => ({
    id: id(x.id, 'scn'), name: str(x.name, 120) || 'Scénario',
    kind: oneOf(x.kind, ['base', 'optimistic', 'pessimistic', 'custom'] as const, 'custom'),
    description: str(x.description, 2000), levers: levers(ctx, x.levers, `${xp}.levers`),
    parentId: x.parentId == null ? null : str(x.parentId, 64), createdAt: str(x.createdAt, 40) || now,
  }));
  if (!scenarios.some((s) => s.kind === 'base')) scenarios = [defaultScenarios(now)[0], ...scenarios];
  const activeScenarioId = scenarios.some((s) => s.id === r.activeScenarioId) ? String(r.activeScenarioId) : scenarios[0].id;

  const risks = list(ctx, r.risks, 'risks', (x, xp) => ({
    id: id(x.id, 'rsk'), title: str(x.title, 300), category: str(x.category, 80) || 'commercial',
    likelihood: num(ctx, x.likelihood, `${xp}.likelihood`, { min: 1, max: 5, int: true, fallback: 3 }),
    impact: num(ctx, x.impact, `${xp}.impact`, { min: 1, max: 5, int: true, fallback: 3 }),
    mitigation: str(x.mitigation, 2000), owner: str(x.owner, 200),
  }));

  const sw = rec(r.swot);
  const pe = rec(r.pestel);
  const na = rec(r.narrative);
  const sectorInputs: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec(r.sectorInputs)).slice(0, 30)) {
    if (/^[a-zA-Z][\w]{0,40}$/.test(k)) sectorInputs[k] = num(ctx, v, `sectorInputs.${k}`, { min: 0 });
  }

  const model: StudyModel = {
    schemaVersion: STUDY_SCHEMA_VERSION,
    projectType: oneOf(r.projectType, PROJECT_TYPES, 'creation'),
    sector: oneOf(r.sector, SECTORS, 'services'),
    sectorInputs,
    profile, horizon, general, products, expenses, staff, investments, financing, workingCapital, tax, openingBalance,
    scenarios, activeScenarioId, risks,
    swot: { strengths: strings(sw.strengths), weaknesses: strings(sw.weaknesses), opportunities: strings(sw.opportunities), threats: strings(sw.threats) },
    pestel: {
      political: strings(pe.political), economic: strings(pe.economic), social: strings(pe.social),
      technological: strings(pe.technological), environmental: strings(pe.environmental), legal: strings(pe.legal),
    },
    narrative: { executiveSummary: str(na.executiveSummary, 20000), marketAnalysis: str(na.marketAnalysis, 20000), conclusion: str(na.conclusion, 20000) },
  };

  return { ok: !ctx.issues.some((i) => i.severity === 'error'), model, issues: ctx.issues };
}
