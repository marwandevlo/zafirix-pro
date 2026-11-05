/**
 * Business Studio copilot. The conversation can propose assumptions. It never writes them, and it never
 * invents a financial total: every figure in an explanation comes from `computeStudy` / `computeMetrics`.
 * Tax rates are not an editable proposal.
 */

import { computeStudy } from './engine';
import { formatCentsMad, formatNumber, formatPercent } from './i18n';
import { computeMetrics, firstFullYear } from './metrics';
import {
  newExpense, newId, newInvestment, newLoan, newProduct, type InvestmentKind, type LegalForm, type ProjectType, type SectorId, type StudyModel,
} from './model';
import { modelFromTemplate } from './sectors';

export const COPILOT_LIMITS = {
  maxMessageChars: 4000,
  maxHistoryTurns: 12,
  maxStoredMessages: 40,
  maxOutputTokens: 900,
  maxDailyTokens: 60_000,
  rateWindowSec: 600,
  rateMax: 15,
} as const;

export type CopilotLang = 'fr' | 'ar' | 'darija';
export type Provenance = 'confirmed' | 'estimate' | 'suggestion' | 'unknown';
export type AccessLevel = 'owner' | 'edit' | 'read';

export type ChangeOp =
  | { op: 'sector'; sector: SectorId }
  | { op: 'projectType'; projectType: ProjectType }
  | { op: 'legalForm'; legalForm: LegalForm }
  | { op: 'city'; city: string }
  | { op: 'objectives'; text: string }
  | { op: 'description'; text: string }
  | { op: 'productKind'; productId: string; kind: 'one_time' | 'subscription' }
  | { op: 'productPrice'; productId: string; unitPrice: number }
  | { op: 'productVolume'; productId: string; volumeMonth1: number }
  | { op: 'productName'; productId: string; name: string }
  | { op: 'addProduct'; name: string; kind: 'one_time' | 'subscription'; unitPrice: number; volumeMonth1: number }
  | { op: 'addExpense'; name: string; amountMonthly: number }
  | { op: 'expenseToFixed'; expenseId: string }
  | { op: 'addInvestment'; name: string; amountHT: number; kind: InvestmentKind }
  | { op: 'addEquity'; amount: number }
  | { op: 'addLoan'; principal: number; annualRatePct: number | null; termMonths: number | null }
  | { op: 'addStaff'; role: string; grossMonthly: number; headcount: number }
  | { op: 'scenario'; scenarioId: string }
  | { op: 'applyEmptySectorTemplate'; sector: SectorId };

export type ProposedChange = {
  id: string;
  provenance: Provenance;
  label: Tri;
  before: string;
  after: string;
  op: ChangeOp;
};

export type Proposal = { id: string; changes: ProposedChange[] };

export type Contradiction = { id: string; severity: 'warning' | 'info'; text: Tri };
export type CheckItem = { id: string; status: 'confirmed' | 'estimate' | 'missing' | 'unverified'; label: Tri };

export type CopilotTurn = {
  lang: CopilotLang;
  message: string;
  questions: string[];
  proposal: Proposal | null;
  contradictions: Contradiction[];
  completeness: CheckItem[];
};

export type CopilotMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
  clientId?: string;
  proposalId?: string | null;
  provider?: 'anthropic' | 'openai' | 'deterministic';
};

export type CopilotUsage = { day: string; tokens: number };
export type CopilotUndo = { revision: number; model: StudyModel };
export type CopilotThread = {
  messages: CopilotMessage[];
  pending: Proposal | null;
  undo: CopilotUndo | null;
  usage: CopilotUsage;
  threadRevision: number;
};

type Tri = { fr: string; ar: string; darija: string };

const SECTORS: Array<{ id: SectorId; re: RegExp }> = [
  { id: 'real_estate', re: /immobilier|promotion immobili|lot(?:s)?\b|terrain|عقار|عقاري|ترقية عقارية|l3qar|aqar/i },
  { id: 'saas', re: /\bsaas\b|logiciel|abonnement logiciel|برمج/i },
  { id: 'retail', re: /commerce|magasin|boutique|تجارة|hanout/i },
  { id: 'hospitality', re: /h[oô]tel|restaurant|caf[eé]|riad|فندق|مطعم/i },
  { id: 'agriculture', re: /agricol|ferme|فلاحة/i },
  { id: 'manufacturing', re: /industr|usine|صناع/i },
  { id: 'transport', re: /transport|نقل/i },
  { id: 'tourism', re: /tourisme|سياح/i },
  { id: 'services', re: /\bservices?\b|cabinet|خدمات/i },
];

const CITIES = ['Casablanca', 'Rabat', 'Tanger', 'Tétouan', 'Marrakech', 'Fès', 'Agadir', 'Oujda', 'Kénitra', 'Meknès', 'Salé', 'Nador', 'El Jadida', 'Mohammedia', 'Beni Mellal'];

const tri = (fr: string, ar: string, darija: string): Tri => ({ fr, ar, darija });
const say = (lang: CopilotLang, t: Tri) => t[lang];

export function emptyThread(day = today()): CopilotThread {
  return { messages: [], pending: null, undo: null, usage: { day, tokens: 0 }, threadRevision: 0 };
}

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

/** Paid-model budget. The deterministic consultant still answers when this returns false. */
export function withinDailyBudget(usage: CopilotUsage, extraTokens: number, day = today()): boolean {
  const spent = usage.day === day ? usage.tokens : 0;
  return spent + extraTokens <= COPILOT_LIMITS.maxDailyTokens;
}

const rateBuckets = new Map<string, { resetAt: number; count: number }>();

/** Studio-only limit. It does not change the assistant limiter used by the rest of the product. */
export function checkCopilotRate(userId: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const key = `studio-copilot:${userId}`;
  const windowMs = COPILOT_LIMITS.rateWindowSec * 1000;
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { resetAt: now + windowMs, count: 1 });
    return { ok: true };
  }
  if (existing.count >= COPILOT_LIMITS.rateMax) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true };
}

export function addUsage(usage: CopilotUsage, extraTokens: number, day = today()): CopilotUsage {
  const spent = usage.day === day ? usage.tokens : 0;
  return { day, tokens: spent + extraTokens };
}

export function canApplyCopilot(level: AccessLevel): boolean {
  return level === 'owner' || level === 'edit';
}

export function detectLang(text: string, hint?: string): CopilotLang {
  const arabic = /[\u0600-\u06FF]/.test(text);
  const darija = /بغيت|واش|ديال|شحال|فلوس|خصني|عندي|كمل|زيد|bghit|wach|dyal|chhal|flous|khasni|3andi|nqder|nchouf|mdina|projet dyal/i.test(text);
  if (darija) return 'darija';
  if (arabic) return 'ar';
  if (hint === 'ar' || hint === 'fr' || hint === 'darija') return hint;
  return 'fr';
}

export function parseMoney(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/[\s\u00a0\u202f]/g, '');
  if (!t) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''));
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function numbersOf(text: string): Set<string> {
  const compact = text.replace(/[\s\u00a0\u202f]/g, '');
  const out = new Set<string>();
  for (const m of compact.matchAll(/\d{3,}/g)) out.add(m[0].replace(/^0+(?=\d)/, ''));
  return out;
}

/** Rejects a paraphrase that introduces a financial figure absent from the brief and the user text. */
export function assertNoNewNumbers(allowedText: string, candidate: string): boolean {
  const allowed = numbersOf(allowedText);
  for (const n of numbersOf(candidate)) if (!allowed.has(n)) return false;
  return true;
}

function changeId(op: ChangeOp): string {
  const s = JSON.stringify(op);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return `chg_${op.op}_${h.toString(36)}`;
}

function provenanceOf(text: string): Provenance {
  if (/environ|à peu près|approx|environ|تقريبا|presque|autour de|estimation|à confirmer|nchouf|تقريباً/i.test(text)) return 'estimate';
  if (/je propose|je suggère|peut-être|maybe|اقتراح|نقترح/i.test(text)) return 'suggestion';
  if (/inconnu|je ne sais pas|ما نعرفش|ma n3arf|non confirm/i.test(text)) return 'unknown';
  return 'confirmed';
}

function listsEmpty(model: StudyModel): boolean {
  return model.products.length === 0 && model.expenses.length === 0 && model.staff.length === 0 && model.investments.length === 0;
}

function moneyNear(text: string, keyword: RegExp): number | null {
  const re = new RegExp(`(?:${keyword.source})[^\\d]{0,24}(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)(?:\\s*(millions?|مليون))?`, 'i');
  const m = re.exec(text);
  if (!m) return null;
  const n = parseMoney(m[1]);
  if (n == null) return null;
  return /million|مليون/i.test(m[2] ?? '') ? n * 1_000_000 : n;
}

export function extractChanges(model: StudyModel, text: string): ProposedChange[] {
  const provenance = provenanceOf(text);
  const out: ProposedChange[] = [];
  const push = (op: ChangeOp, label: Tri, before: string, after: string, source: Provenance = provenance) => {
    out.push({ id: changeId(op), provenance: source, label, before, after, op });
  };

  const sector = SECTORS.find((s) => s.re.test(text));
  if (sector && sector.id !== model.sector) {
    const explicit = /secteur|activité|قطاع|activité dyal/i.test(text);
    push(
      { op: 'sector', sector: sector.id },
      tri(`Secteur : ${sector.id}`, `القطاع: ${sector.id}`, `l qita3: ${sector.id}`),
      model.sector,
      sector.id,
      explicit ? provenance : 'suggestion',
    );
    if (listsEmpty(model)) {
      push(
        { op: 'applyEmptySectorTemplate', sector: sector.id },
        tri('Canevas du secteur, montants à zéro', 'قالب القطاع، المبالغ صفر', 'canevas dyal l qita3, les montants 0'),
        'vide',
        sector.id,
        'suggestion',
      );
    }
  }

  if (/cr[eé]ation|nouveau projet|إحداث|bda projet/i.test(text) && model.projectType !== 'creation') {
    push({ op: 'projectType', projectType: 'creation' }, tri('Stade : création', 'المرحلة: إحداث', 'l marhala: création'), model.projectType, 'creation');
  } else if (/existant|en activit|قائم|deja khadam/i.test(text) && model.projectType !== 'existing') {
    push({ op: 'projectType', projectType: 'existing' }, tri('Stade : activité existante', 'المرحلة: نشاط قائم', 'l marhala: activité kayna'), model.projectType, 'existing');
  } else if (/extension|توسع/i.test(text) && model.projectType !== 'expansion') {
    push({ op: 'projectType', projectType: 'expansion' }, tri('Stade : extension', 'المرحلة: توسع', 'l marhala: extension'), model.projectType, 'expansion');
  }

  let legal: LegalForm | null = null;
  if (/sarl\s*au|sarlau|associ[eé] unique|شركة ذات مسؤولية محدودة بشريك/i.test(text)) legal = 'sarl_au';
  else if (/\bsarl\b|شركة ذات مسؤولية محدودة/i.test(text)) legal = 'sarl';
  else if (/\bsa\b|soci[eé]t[eé] anonyme|شركة مساهمة/i.test(text)) legal = 'sa';
  else if (/auto[- ]entrepreneur|مقاول ذاتي/i.test(text)) legal = 'auto_entrepreneur';
  if (legal && legal !== model.profile.company.legalForm) {
    push({ op: 'legalForm', legalForm: legal }, tri(`Forme : ${legal}`, `الشكل: ${legal}`, `l forma: ${legal}`), model.profile.company.legalForm || '—', legal);
  }

  const city = CITIES.find((c) => text.toLowerCase().includes(c.toLowerCase()));
  if (city && city !== model.profile.company.city) {
    push({ op: 'city', city }, tri(`Ville : ${city}`, `المدينة: ${city}`, `l mdina: ${city}`), model.profile.company.city || '—', city);
  }

  if (/objectif|but du projet|الهدف|bghit n/i.test(text)) {
    const clip = text.trim().slice(0, 500);
    push({ op: 'objectives', text: clip }, tri('Objectifs (texte du porteur)', 'الأهداف (نص صاحب المشروع)', 'l ahdaf (texte dyal l porteur)'), model.profile.project.objectives || '—', clip);
  }
  if (/description|le projet consiste|المشروع|projet dyal/i.test(text)) {
    const clip = text.trim().slice(0, 800);
    push({ op: 'description', text: clip }, tri('Description (texte du porteur)', 'الوصف (نص صاحب المشروع)', 'description (texte dyal l porteur)'), model.profile.project.description || '—', clip);
  }

  const price = moneyNear(text, /prix|unitaire|ticket|سعر|taman|chiffre d[’']affaires|ca mensuel|\bca\b/);
  const volume = moneyNear(text, /volume|quantit[eé]|unit[eé]s?|lots? par mois|عدد|kam/);
  const sale = /vente de lots|vente de logements|cession|بيع بقع|بيع شقق|one[- ]?shot|une fois/i.test(text);
  const subscription = /abonnement|souscription|اشتراك|abonnement mensuel/i.test(text) && !sale;
  const product = model.products[0];
  const kind = sale ? 'one_time' as const : subscription ? 'subscription' as const : product?.kind ?? (model.sector === 'saas' ? 'subscription' as const : 'one_time' as const);

  if (!product && (price != null || /produit|offre|lots?|service/i.test(text))) {
    push(
      { op: 'addProduct', name: sale ? 'Ventes de lots' : subscription ? 'Abonnement' : 'Offre principale', kind, unitPrice: price ?? 0, volumeMonth1: volume ?? (price != null ? 1 : 0) },
      tri('Nouvelle offre', 'عرض جديد', 'offre jdida'),
      '—',
      `${kind} · ${price ?? 0} · vol ${volume ?? 0}`,
      price == null ? 'unknown' : provenance,
    );
  } else if (product) {
    if (price != null && price !== product.unitPrice) {
      push({ op: 'productPrice', productId: product.id, unitPrice: price }, tri('Prix unitaire', 'سعر الوحدة', 'taman l wehda'), String(product.unitPrice), String(price));
    }
    if (volume != null && volume !== product.volumeMonth1) {
      push({ op: 'productVolume', productId: product.id, volumeMonth1: volume }, tri('Volume du premier mois', 'حجم الشهر الأول', 'volume dyal chhar l louel'), String(product.volumeMonth1), String(volume));
    }
    if ((sale || subscription) && kind !== product.kind) {
      push(
        { op: 'productKind', productId: product.id, kind },
        tri(sale ? 'Modèle commercial : vente' : 'Modèle commercial : abonnement', sale ? 'النموذج: بيع' : 'النموذج: اشتراك', sale ? 'l model: bi3' : 'l model: abonnement'),
        product.kind,
        kind,
        sale ? 'confirmed' : 'suggestion',
      );
    }
  }

  const rent = moneyNear(text, /loyer|كراء|kra/);
  if (rent != null) {
    const ignored = model.expenses.find((e) => e.behavior === 'variable_revenue_pct' && e.pctOfRevenue === 0 && e.amountMonthly > 0);
    if (ignored) {
      push(
        { op: 'expenseToFixed', expenseId: ignored.id },
        tri('Retenir le loyer comme charge fixe', 'اعتماد الكراء كعبء ثابت', 'dir l kra charge thabta'),
        `${ignored.behavior} / ${ignored.pctOfRevenue}%`,
        `fixe ${ignored.amountMonthly}`,
        'suggestion',
      );
    } else if (!model.expenses.some((e) => e.category === 'rent' && e.amountMonthly === rent)) {
      push({ op: 'addExpense', name: 'Loyer', amountMonthly: rent }, tri('Loyer mensuel', 'الكراء الشهري', 'l kra chahri'), '—', String(rent));
    }
  }
  const opex = moneyNear(text, /charges? externes|charges? mensuelles|مصاريف|masarif/);
  if (opex != null) push({ op: 'addExpense', name: 'Charges externes', amountMonthly: opex }, tri('Charges externes mensuelles', 'مصاريف خارجية شهرية', 'masarif chahriya'), '—', String(opex));

  const land = moneyNear(text, /terrain|أرض|ard/);
  if (land != null) push({ op: 'addInvestment', name: 'Terrain', amountHT: land, kind: 'land' }, tri('Terrain HT', 'الأرض دون رسوم', 'l ard HT'), '—', String(land));
  const works = moneyNear(text, /construction|travaux|أشغال|bina/);
  if (works != null) push({ op: 'addInvestment', name: 'Construction', amountHT: works, kind: 'tangible' }, tri('Construction HT', 'البناء دون رسوم', 'l bina HT'), '—', String(works));

  const equity = moneyNear(text, /apport|fonds propres|capital|مساهمة|ras mal/);
  if (equity != null) push({ op: 'addEquity', amount: equity }, tri('Apport', 'مساهمة', 'l apport'), '—', String(equity));

  const principal = moneyNear(text, /pr[eê]t|emprunt|cr[eé]dit bancaire|قرض|pret/);
  if (principal != null && !/pas de pr[eê]t|sans pr[eê]t|aucun pr[eê]t|بلا قرض/i.test(text)) {
    const rate = moneyNear(text, /taux|فائدة|rate/);
    const term = moneyNear(text, /dur[eé]e|mois de cr[eé]dit|أجل|term/);
    push(
      { op: 'addLoan', principal, annualRatePct: rate, termMonths: term },
      tri('Emprunt bancaire', 'قرض بنكي', 'pret banki'),
      '0',
      `${principal} · taux ${rate == null ? 'inconnu' : rate} · durée ${term == null ? 'inconnue' : term}`,
      rate == null ? 'unknown' : provenance,
    );
  }

  const wage = moneyNear(text, /salaire|paie|أجر|salaire brut/);
  if (wage != null) push({ op: 'addStaff', role: 'Équipe', grossMonthly: wage, headcount: 1 }, tri('Salaire brut mensuel', 'أجر شهري خام', 'salaire chahri'), '—', String(wage));

  const scenario = model.scenarios.find((s) => text.toLowerCase().includes(s.name.toLowerCase()) || (s.kind !== 'base' && new RegExp(s.kind, 'i').test(text)));
  if (scenario && /sc[eé]nario|سيناريو/i.test(text) && scenario.id !== model.activeScenarioId) {
    push({ op: 'scenario', scenarioId: scenario.id }, tri(`Scénario actif : ${scenario.name}`, `السيناريو: ${scenario.name}`, `scénario: ${scenario.name}`), model.activeScenarioId, scenario.id, 'confirmed');
  }

  return dedupe(out);
}

export function inspectModel(model: StudyModel): { contradictions: Contradiction[]; suggestions: ProposedChange[] } {
  const contradictions: Contradiction[] = [];
  const suggestions: ProposedChange[] = [];
  const pushS = (op: ChangeOp, label: Tri, before: string, after: string) => {
    suggestions.push({ id: changeId(op), provenance: 'suggestion', label, before, after, op });
  };

  for (const p of model.products) {
    if (model.sector === 'real_estate' && p.kind === 'subscription' && (p.unitPrice > 0 || p.volumeMonth1 > 0)) {
      contradictions.push({
        id: 'real-estate-subscription',
        severity: 'warning',
        text: tri(
          `« ${p.name} » est un abonnement dans une étude immobilière. Chaque mois ajoute de nouveaux abonnés qui continuent de payer : ce n’est pas une vente de lots. Le moteur n’a pas été modifié.`,
          `« ${p.name} » اشتراك داخل دراسة عقارية. كل شهر يضيف مشتركين يستمرون في الدفع، وهذا ليس بيع بقع. لم يُغيّر المحرك.`,
          `« ${p.name} » abonnement f étude 3aqariya. Kola chhar kaytzad chi wahd kaybqa ykhalles. Hadi machi bi3 dyal les lots. L moteur mabdelnach.`,
        ),
      });
      pushS(
        { op: 'productKind', productId: p.id, kind: 'one_time' },
        tri(`Passer « ${p.name} » en vente (non appliqué)`, `تحويل « ${p.name} » إلى بيع (غير مطبق)`, `dowez « ${p.name} » l bi3 (mazal mattebe9ch)`),
        p.kind,
        'one_time',
      );
    }
    if (p.unitPrice > 0 && p.unitCost >= p.unitPrice) {
      contradictions.push({
        id: `margin-${p.id}`,
        severity: 'warning',
        text: tri(
          `Le coût unitaire de « ${p.name} » est supérieur ou égal au prix. Une baisse de volume peut améliorer la VAN parce que la marge est négative. Ce n’est pas une erreur de signe du moteur.`,
          `تكلفة « ${p.name} » تساوي أو تتجاوز السعر. خفض الكمية قد يحسن القيمة الحالية لأن الهامش سالب. ليست هذه خطأ إشارة في المحرك.`,
          `tklfa dyal « ${p.name} » kber men taman. Ila qal l volume, VAN tqder ttel3 7it l marge salba.`,
        ),
      });
    }
  }

  for (const e of model.expenses) {
    if (e.behavior === 'variable_revenue_pct' && e.pctOfRevenue === 0 && e.amountMonthly > 0) {
      contradictions.push({
        id: `expense-ignored-${e.id}`,
        severity: 'warning',
        text: tri(
          `« ${e.name} » a un montant mensuel de ${e.amountMonthly} mais un comportement « % du chiffre d’affaires » à 0 %. Le moteur ignore ce montant. Il n’est pas réintégré automatiquement.`,
          `« ${e.name} » فيه مبلغ شهري ${e.amountMonthly} لكن سلوكه نسبة من رقم المعاملات بـ 0٪. المحرك يتجاهل المبلغ ولا يعيده تلقائياً.`,
          `« ${e.name} » fih ${e.amountMonthly} walakin howa % men CA b 0. L moteur kaytjahlo. Ma kaytzedch bo7do.`,
        ),
      });
      pushS(
        { op: 'expenseToFixed', expenseId: e.id },
        tri(`Retenir « ${e.name} » en charge fixe`, `اعتماد « ${e.name} » عبئاً ثابتاً`, `dir « ${e.name} » charge thabta`),
        e.behavior,
        'fixed',
      );
    }
  }

  const loanText = /pr[eê]t|emprunt|bancaire|قرض/i.test(`${model.profile.project.objectives} ${model.profile.project.description}`);
  const principal = model.financing.loans.reduce((s, l) => s + l.principal, 0);
  if (loanText && principal <= 0) {
    contradictions.push({
      id: 'loan-text-only',
      severity: 'warning',
      text: tri(
        'Le texte parle d’un financement bancaire, mais le principal des emprunts est 0. Aucun échéancier n’est inventé.',
        'النص يذكر تمويلاً بنكياً، لكن أصل القروض 0. لا يُنشأ أي جدول سداد.',
        'l texte kayhdar 3la pret, walakin principal 0. Ma kayn 7ta tableau.',
      ),
    });
  }
  if (model.financing.overdraftRatePct > 0 && principal <= 0) {
    contradictions.push({
      id: 'overdraft-not-dscr',
      severity: 'info',
      text: tri(
        'Un découvert est paramétré sans emprunt contractuel. Ses intérêts restent dans le résultat et la trésorerie. Le DSCR bancaire n’utilise pas ces intérêts comme service de la dette.',
        'يوجد سحب على المكشوف دون قرض تعاقدي. فوائده تبقى في النتيجة والخزينة. نسبة تغطية الدين البنكية لا تحتسبها كخدمة دين.',
        'kayn découvert bla pret. L fawaid kaybqaw f résultat w trésorerie. DSCR ma kay7sebhomch dette.',
      ),
    });
  }
  if (model.sector === 'real_estate' && model.products.some((p) => p.unitPrice > 0) && model.staff.length === 0) {
    contradictions.push({
      id: 'real-estate-staff',
      severity: 'info',
      text: tri(
        'Étude immobilière sans masse salariale. Le manque est signalé, aucun salaire n’est ajouté.',
        'دراسة عقارية بلا أجور. النقص مُشار إليه ولم تُضف أي أجرة.',
        'étude 3aqariya bla salaires. Ma zedna walo.',
      ),
    });
  }
  if (model.sector === 'real_estate' && model.investments.every((i) => i.amountHT <= 0) && model.products.some((p) => p.unitPrice > 0)) {
    contradictions.push({
      id: 'real-estate-works',
      severity: 'info',
      text: tri(
        'Aucune ligne d’investissement n’a de montant. Le terrain et les travaux restent à confirmer. Le moteur ne les estime pas.',
        'لا يوجد مبلغ في الاستثمار. الأرض والأشغال ما زالت بحاجة إلى تأكيد. المحرك لا يقدرها.',
        'ma kayn 7ta montant d investissement. L ard w l achghal mazal khasshom confirmation.',
      ),
    });
  }
  return { contradictions, suggestions };
}

export function completeness(model: StudyModel, pending: Proposal | null = null): CheckItem[] {
  const touched = new Set((pending?.changes ?? []).map((c) => c.op.op));
  const item = (id: string, ok: boolean, pendingHit: boolean, label: Tri, unverified = false): CheckItem => ({
    id,
    status: unverified ? 'unverified' : ok ? 'confirmed' : pendingHit ? 'estimate' : 'missing',
    label,
  });
  const priced = model.products.some((p) => p.unitPrice > 0);
  return [
    item('sector', model.sector !== 'services' || touched.has('sector'), touched.has('sector'), tri('Secteur', 'القطاع', 'l qita3')),
    item('city', Boolean(model.profile.company.city), touched.has('city'), tri('Ville', 'المدينة', 'l mdina')),
    item('legal', Boolean(model.profile.company.legalForm), touched.has('legalForm'), tri('Forme juridique', 'الشكل القانوني', 'l forma')),
    item('stage', model.projectType !== 'creation' || touched.has('projectType'), touched.has('projectType'), tri('Stade du projet', 'مرحلة المشروع', 'l marhala')),
    item('objectives', Boolean(model.profile.project.objectives), touched.has('objectives'), tri('Objectifs', 'الأهداف', 'l ahdaf')),
    item('offer', priced, touched.has('addProduct') || touched.has('productPrice'), tri('Offre et prix', 'العرض والسعر', 'l offre w taman')),
    item('volume', model.products.some((p) => p.volumeMonth1 > 0), touched.has('productVolume') || touched.has('addProduct'), tri('Volume', 'الحجم', 'l volume')),
    item('costs', model.expenses.some((e) => e.amountMonthly > 0 || e.pctOfRevenue > 0), touched.has('addExpense'), tri('Charges', 'الأعباء', 'l masarif')),
    item('payroll', model.staff.some((s) => s.grossMonthly > 0), touched.has('addStaff'), tri('Paie', 'الأجور', 'l paie')),
    item('capex', model.investments.some((i) => i.amountHT > 0), touched.has('addInvestment'), tri('Investissements', 'الاستثمارات', 'l investissements')),
    item('funding', model.financing.equity.some((e) => e.amount > 0) || model.financing.loans.some((l) => l.principal > 0), touched.has('addEquity') || touched.has('addLoan'), tri('Financement', 'التمويل', 'l financement')),
    item('tax', false, false, tri('Fiscalité et marché (non vérifiés)', 'الجباية والسوق (غير مؤكدين)', 'driba w suq (mamakkinch)'), true),
  ];
}

function dedupe(changes: ProposedChange[]): ProposedChange[] {
  const seen = new Set<string>();
  return changes.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

function questionsFor(model: StudyModel, lang: CopilotLang, contradictions: Contradiction[]): string[] {
  const q: Tri[] = [];
  if (!model.profile.company.city) q.push(tri('Dans quelle ville au Maroc le projet est-il situé ?', 'في أي مدينة بالمغرب يقع المشروع؟', 'F ina mdina f l Maghreb ghadi ykoun l projet?'));
  if (model.sector === 'services' && model.products.length === 0) q.push(tri('Quelle est l’activité : immobilier, commerce, services, industrie, logiciel ou autre ?', 'ما النشاط: عقار، تجارة، خدمات، صناعة، برمجيات أم غير ذلك؟', 'Chno l activité: 3aqar, commerce, services, industrie, logiciel wla chi 7aja khra?'));
  if (!model.profile.company.legalForm) q.push(tri('Quelle forme juridique visez-vous (SARL, SARL AU, SA, auto-entrepreneur) ?', 'ما الشكل القانوني المستهدف؟', 'Chno l forma: SARL, SARL AU, SA wla auto-entrepreneur?'));
  if (model.sector === 'real_estate') {
    q.push(tri('Les recettes sont-elles des ventes de lots, des loyers, ou les deux ? Une vente n’est pas un abonnement.', 'هل المداخيل بيع بقع أم كراء أم الاثنان؟ البيع ليس اشتراكاً.', 'L flous men bi3 dyal les lots, men kra, wla bjouj? Bi3 machi abonnement.'));
    if (model.investments.every((i) => i.amountHT <= 0)) q.push(tri('Quel est le coût du terrain et des travaux, si vous le connaissez ?', 'ما كلفة الأرض والأشغال إن كانت معروفة؟', 'Chhal l ard w l achghal ila 3raft?'));
  } else if (model.sector === 'saas') {
    q.push(tri('Quel est le prix mensuel, le nombre de nouveaux clients et le taux de résiliation ?', 'ما السعر الشهري وعدد الزبائن الجدد ونسبة الإلغاء؟', 'Chhal taman chahri, chhal client jdid, w chhal kaylghiw?'));
  } else if (model.products.every((p) => p.unitPrice <= 0)) {
    q.push(tri('Que vendez-vous, à quel prix, et en quelle quantité le premier mois ?', 'ماذا تبيع وبأي سعر وبأي كمية في الشهر الأول؟', 'Chno katbi3, b chhal, w chhal f chhar l louel?'));
  }
  if (contradictions.some((c) => c.id === 'loan-text-only')) q.push(tri('Quel est le montant du prêt, le taux annuel et la durée ? Sans ces trois éléments, aucun échéancier n’est créé.', 'ما مبلغ القرض ونسبته السنوية ومدته؟ بدونها لا يُنشأ جدول.', 'Chhal l pret, chhal l taux, w chhal l durée? Bla had chi ma kayn 7ta tableau.'));
  if (!model.profile.project.objectives) q.push(tri('Quel est l’objectif du projet : banque, investisseur, ou décision interne ?', 'ما هدف المشروع: بنك، مستثمر، أم قرار داخلي؟', 'Chno l hadaf: banka, investisseur, wla décision interne?'));
  return q.slice(0, 2).map((item) => say(lang, item));
}

function hasMoney(model: StudyModel): boolean {
  return model.products.some((p) => p.unitPrice > 0 || p.volumeMonth1 > 0)
    || model.expenses.some((e) => e.amountMonthly > 0)
    || model.investments.some((i) => i.amountHT > 0)
    || model.financing.loans.some((l) => l.principal > 0)
    || model.financing.equity.some((e) => e.amount > 0)
    || model.staff.some((s) => s.grossMonthly > 0);
}

export function explainEngine(model: StudyModel, lang: CopilotLang): string {
  if (!hasMoney(model)) {
    return say(lang, tri(
      'Il n’y a pas encore de prévision chiffrée. Les totaux apparaîtront après confirmation des hypothèses, calculés par le moteur.',
      'لا توجد بعد توقعات رقمية. تظهر المجاميع بعد تأكيد الفرضيات ويحسبها المحرك.',
      'Mazal ma kayn 7ta raqam. L majmou3 ghadi yban men ba3d ma t’akked l hypothèses, w l moteur howa li kay7seb.',
    ));
  }
  let result;
  let metrics;
  try {
    result = computeStudy(model);
    metrics = computeMetrics(model, result);
  } catch {
    return say(lang, tri('Le moteur n’a pas pu calculer cette version.', 'تعذر على المحرك حساب هذه النسخة.', 'L moteur ma qderch y7seb had version.'));
  }
  const year = firstFullYear(metrics);
  const mad = (cents: number | null | undefined) => (cents == null ? 'n/a' : `${formatCentsMad(cents, lang === 'ar' ? 'ar' : 'fr')} MAD`);
  const month = year ? result.calendar.fiscalYears.find((f) => f.label === year.label)?.lastMonth : undefined;
  const bfr = month == null ? null : result.monthly.bfr[month];
  const vat = month == null ? null : result.monthly.vatPayable[month];
  const tax = year?.incomeTax ?? null;
  const dscr = metrics.minDscr.value == null
    ? say(lang, tri('DSCR non calculé : pas de service de dette contractuel (un découvert n’est pas un DSCR bancaire).', 'نسبة تغطية الدين غير محسوبة: لا توجد خدمة دين تعاقدية (السحب على المكشوف ليس DSCR بنكياً).', 'DSCR ma m7soubch: ma kaynch dette contractuelle. Découvert machi DSCR banki.'))
    : `DSCR min ${formatNumber(metrics.minDscr.value, 'fr', 2)}`;
  const irr = metrics.irrProject.value == null ? 'TRI n/a' : `TRI ${formatPercent(metrics.irrProject.value, 'fr')}`;
  const lines = [
    say(lang, tri(
      `Simulation du moteur pour ${year?.label ?? 'l’horizon'} (pas une vérification de marché) :`,
      `محاكاة المحرك لسنة ${year?.label ?? 'الأفق'} (ليست تحققاً من السوق):`,
      `Simulation dyal l moteur l ${year?.label ?? 'l horizon'} (machi vérification dyal suq):`,
    )),
    `${say(lang, tri('Chiffre d’affaires', 'رقم المعاملات', 'CA'))} ${mad(year?.revenue)}`,
    `${say(lang, tri('Résultat net', 'النتيجة الصافية', 'résultat net'))} ${mad(year?.netIncome)}`,
    `${say(lang, tri('IS de l’exercice (règle déjà codée, non certifiée)', 'ضريبة السنة (قاعدة مبرمجة غير معتمدة)', 'IS (règle codée, machi certificat)'))} ${mad(tax)}`,
    `${say(lang, tri('TVA à payer en fin d’exercice (régime saisi, non un avis fiscal)', 'ضريبة القيمة المضافة في نهاية السنة (النظام المسجل وليس رأياً جبائياً)', 'TVA f akhir l 3am (système msajjel, machi avis)'))} ${mad(vat)}`,
    `${say(lang, tri('BFR', 'الاحتياج في رأس المال العامل', 'BFR'))} ${mad(bfr)}`,
    dscr,
    `VAN ${mad(metrics.npv.value)} · ${irr}`,
    `${say(lang, tri('Trésorerie la plus basse', 'أدنى خزينة', 'aqal trésorerie'))} ${mad(metrics.minCash.value)} · ${say(lang, tri('besoin de financement avant financements externes', 'حاجة التمويل قبل التمويلات الخارجية', 'besoin qbel l financements'))} ${mad(metrics.peakFundingNeed.value)}`,
  ];
  return lines.join('\n');
}

export function consult(input: { model: StudyModel; userText: string; history?: CopilotMessage[]; lang?: CopilotLang; proposalId?: string }): CopilotTurn {
  const lang = input.lang ?? detectLang(input.userText);
  const text = input.userText.trim().slice(0, COPILOT_LIMITS.maxMessageChars);
  const extracted = /^(continuer|continue|كمل|زيد|continuer l’entretien|continuer l'entretien)$/i.test(text) ? [] : extractChanges(input.model, text);
  const inspected = inspectModel(input.model);
  const changes = dedupe([...extracted, ...inspected.suggestions]);
  const proposal = changes.length ? { id: input.proposalId ?? `prop_${(input.history?.length ?? 0) + 1}`, changes } : null;
  const items = completeness(input.model, proposal);
  const questions = questionsFor(input.model, lang, inspected.contradictions);
  const understood = extracted.length
    ? extracted.map((c) => `${say(lang, c.label)} — ${c.after} (${c.provenance})`).join('\n')
    : say(lang, tri('Aucun nouvel élément chiffré à enregistrer.', 'لا يوجد عنصر رقمي جديد للتسجيل.', 'Ma kayn 7ta raqam jdid bach nsejlo.'));
  const flags = inspected.contradictions.map((c) => say(lang, c.text)).join('\n');
  const disclaimer = say(lang, tri(
    'Je n’ai pas vérifié les faits, le marché ni la fiscalité. Rien n’est enregistré tant que vous n’appliquez pas une sélection. Les totaux viennent du moteur d’étude.',
    'لم أتحقق من الوقائع ولا من السوق ولا من الجباية. لا يُحفظ شيء حتى تطبق اختياراً. المجاميع من محرك الدراسة.',
    'Ma t2akedt la men l waqi3 la men suq la men driba. Walo matsejjel 7ta ttebe9 chi ikhtiyar. L majmou3 men moteur dyal l étude.',
  ));
  const message = [
    say(lang, tri('Voici ce que je retiens de votre message.', 'هذا ما أحتفظ به من رسالتك.', 'Hada li fhemt men message dyalek.')),
    understood,
    flags,
    explainEngine(input.model, lang),
    questions.length ? `${say(lang, tri('Pour continuer :', 'للمتابعة:', 'Bach nkmlo:'))}\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '',
    disclaimer,
  ].filter(Boolean).join('\n\n');
  return { lang, message, questions, proposal, contradictions: inspected.contradictions, completeness: items };
}

export type ApplyResult = { ok: true; changeIds: string[] } | { ok: false; status: 400 | 403 | 409; code: string };

export function evaluateApply(input: {
  confirm: unknown;
  revision: unknown;
  currentRevision: number;
  changeIds: unknown;
  proposal: Proposal | null;
  access: AccessLevel;
  locked?: boolean;
}): ApplyResult {
  if (!canApplyCopilot(input.access)) return { ok: false, status: 403, code: 'read_only' };
  if (input.locked) return { ok: false, status: 409, code: 'study_locked' };
  if (input.confirm !== true) return { ok: false, status: 400, code: 'confirm_required' };
  if (input.revision !== input.currentRevision) return { ok: false, status: 409, code: 'revision_conflict' };
  if (!input.proposal) return { ok: false, status: 409, code: 'no_pending_proposal' };
  if (!Array.isArray(input.changeIds) || input.changeIds.length === 0 || input.changeIds.some((id) => typeof id !== 'string')) {
    return { ok: false, status: 400, code: 'change_ids_required' };
  }
  const known = new Set(input.proposal.changes.map((c) => c.id));
  if (input.changeIds.some((id) => !known.has(id as string))) return { ok: false, status: 400, code: 'unknown_change' };
  return { ok: true, changeIds: input.changeIds as string[] };
}

export function applyProposal(model: StudyModel, proposal: Proposal, changeIds: readonly string[]): StudyModel {
  const next = structuredClone(model);
  const wanted = new Set(changeIds);
  for (const change of proposal.changes) {
    if (!wanted.has(change.id)) continue;
    applyOp(next, change.op);
  }
  return next;
}

function applyOp(model: StudyModel, op: ChangeOp): void {
  switch (op.op) {
    case 'sector':
      model.sector = op.sector;
      return;
    case 'projectType':
      model.projectType = op.projectType;
      return;
    case 'legalForm':
      model.profile.company.legalForm = op.legalForm;
      return;
    case 'city':
      model.profile.company.city = op.city;
      if (!model.profile.project.location) model.profile.project.location = op.city;
      return;
    case 'objectives':
      model.profile.project.objectives = op.text;
      return;
    case 'description':
      model.profile.project.description = op.text;
      return;
    case 'productKind': {
      const p = model.products.find((x) => x.id === op.productId);
      if (p) p.kind = op.kind;
      return;
    }
    case 'productPrice': {
      const p = model.products.find((x) => x.id === op.productId);
      if (p) p.unitPrice = op.unitPrice;
      return;
    }
    case 'productVolume': {
      const p = model.products.find((x) => x.id === op.productId);
      if (p) p.volumeMonth1 = op.volumeMonth1;
      return;
    }
    case 'productName': {
      const p = model.products.find((x) => x.id === op.productId);
      if (p) p.name = op.name;
      return;
    }
    case 'addProduct':
      model.products.push(newProduct({ name: op.name, kind: op.kind, unitPrice: op.unitPrice, volumeMonth1: op.volumeMonth1 }));
      return;
    case 'addExpense':
      model.expenses.push(newExpense({ name: op.name, category: /loyer/i.test(op.name) ? 'rent' : 'other', amountMonthly: op.amountMonthly, behavior: 'fixed' }));
      return;
    case 'expenseToFixed': {
      const e = model.expenses.find((x) => x.id === op.expenseId);
      if (e) e.behavior = 'fixed';
      return;
    }
    case 'addInvestment':
      model.investments.push(newInvestment({
        name: op.name, kind: op.kind, amountHT: op.amountHT, usefulLifeYears: op.kind === 'land' ? 0 : 25,
        vatRatePct: op.kind === 'land' ? 0 : 20, vatRecoverable: op.kind !== 'land',
      }));
      return;
    case 'addEquity':
      model.financing.equity.push({ id: newId('eq'), name: 'Apport', amount: op.amount, month: 0 });
      return;
    case 'addLoan':
      model.financing.loans.push(newLoan({
        name: 'Emprunt bancaire', principal: op.principal, annualRatePct: op.annualRatePct ?? 0,
        termMonths: op.termMonths ?? 60,
      }));
      return;
    case 'addStaff':
      model.staff.push({ id: newId('stf'), role: op.role, costCenter: '', headcount: op.headcount, grossMonthly: op.grossMonthly, startMonth: 0, endMonth: null, annualRaisePct: 0, dependants: 0 });
      return;
    case 'scenario':
      if (model.scenarios.some((s) => s.id === op.scenarioId)) model.activeScenarioId = op.scenarioId;
      return;
    case 'applyEmptySectorTemplate':
      if (!listsEmpty(model)) return;
      {
        const template = modelFromTemplate(op.sector, { startMonth: model.horizon.startMonth, years: model.horizon.years, projectType: model.projectType });
        model.sector = op.sector;
        model.products = template.products;
        model.expenses = template.expenses;
        model.staff = template.staff;
        model.investments = template.investments;
        model.sectorInputs = template.sectorInputs;
      }
      return;
    default:
      return;
  }
}

export function previewImpact(before: StudyModel, after: StudyModel): {
  revenue: [number, number];
  netIncome: [number, number];
  npv: [number | null, number | null];
  dscr: [number | null, number | null];
} | null {
  try {
    const a = computeMetrics(before, computeStudy(before));
    const b = computeMetrics(after, computeStudy(after));
    const ya = firstFullYear(a);
    const yb = firstFullYear(b);
    return {
      revenue: [ya?.revenue ?? 0, yb?.revenue ?? 0],
      netIncome: [ya?.netIncome ?? 0, yb?.netIncome ?? 0],
      npv: [a.npv.value, b.npv.value],
      dscr: [a.minDscr.value, b.minDscr.value],
    };
  } catch {
    return null;
  }
}

export function appendTurn(thread: CopilotThread, user: { clientId: string; content: string; at: string }, turn: CopilotTurn, provider: CopilotMessage['provider']): { thread: CopilotThread; duplicate: boolean } {
  if (user.clientId && thread.messages.some((m) => m.clientId === user.clientId)) return { thread, duplicate: true };
  const messages: CopilotMessage[] = [
    ...thread.messages,
    { id: `u_${user.clientId || thread.threadRevision}`, role: 'user' as const, content: user.content, at: user.at, clientId: user.clientId },
    { id: `a_${user.clientId || thread.threadRevision}`, role: 'assistant' as const, content: turn.message, at: user.at, proposalId: turn.proposal?.id ?? null, provider },
  ].slice(-COPILOT_LIMITS.maxStoredMessages);
  return {
    duplicate: false,
    thread: { ...thread, messages, pending: turn.proposal, threadRevision: thread.threadRevision + 1 },
  };
}

export function publicThread(thread: CopilotThread) {
  return {
    messages: thread.messages,
    pending: thread.pending,
    canUndo: thread.undo != null,
    undoRevision: thread.undo?.revision ?? null,
    usage: thread.usage,
    threadRevision: thread.threadRevision,
    limits: COPILOT_LIMITS,
  };
}

export function parseThread(raw: unknown): CopilotThread {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = emptyThread(typeof (m.usage as { day?: string } | undefined)?.day === 'string' ? (m.usage as { day: string }).day : today());
  const messages = Array.isArray(m.messages) ? m.messages.filter(isMessage).slice(-COPILOT_LIMITS.maxStoredMessages) : [];
  const pending = isProposal(m.pending) ? m.pending : null;
  const undo = isUndo(m.undo) ? m.undo : null;
  const tokens = Number((m.usage as { tokens?: unknown } | undefined)?.tokens);
  return {
    messages,
    pending,
    undo,
    usage: { day: base.usage.day, tokens: Number.isFinite(tokens) ? tokens : 0 },
    threadRevision: Number.isInteger(m.threadRevision) ? Number(m.threadRevision) : 0,
  };
}

function isMessage(v: unknown): v is CopilotMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as CopilotMessage;
  return (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && typeof m.id === 'string';
}

function isProposal(v: unknown): v is Proposal {
  if (!v || typeof v !== 'object') return false;
  const p = v as Proposal;
  return typeof p.id === 'string' && Array.isArray(p.changes) && p.changes.every((c) => c && typeof c.id === 'string' && c.op && typeof c.op.op === 'string');
}

function isUndo(v: unknown): v is CopilotUndo {
  if (!v || typeof v !== 'object') return false;
  const u = v as CopilotUndo;
  return Number.isInteger(u.revision) && !!u.model && typeof u.model === 'object';
}
