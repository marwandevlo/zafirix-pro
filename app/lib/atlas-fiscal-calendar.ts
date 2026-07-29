import type {
  FiscalDeadline,
  FiscalDeadlineCategory,
  FiscalDeadlineRadar,
  FiscalDeadlineSeverity,
} from '@/app/types/atlas-fiscal-calendar';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function severityForDays(days: number): FiscalDeadlineSeverity {
  if (days <= 7) return 'red';
  if (days <= 21) return 'orange';
  return 'green';
}

type DeadlineSpec = {
  id: string;
  category: FiscalDeadlineCategory;
  labelFr: string;
  labelAr: string;
  dueDate: string;
  href: string;
  externalUrl?: string;
  periodLabel?: string;
};

function nextOccurrence(year: number, month: number, day: number, ref: Date): string {
  let candidate = new Date(year, month - 1, day);
  if (candidate < ref) {
    candidate = new Date(year + 1, month - 1, day);
  }
  return ymd(candidate.getFullYear(), candidate.getMonth() + 1, candidate.getDate());
}

/** Build Moroccan statutory deadlines relative to reference date. */
export function buildMoroccanFiscalDeadlines(
  ref: Date = new Date(),
  companyId: string | null = null,
): FiscalDeadlineRadar {
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;

  const specs: DeadlineSpec[] = [];

  // TVA mensuelle — 20 du mois suivant
  const tvaMonth = m === 12 ? 1 : m + 1;
  const tvaYear = m === 12 ? y + 1 : y;
  specs.push({
    id: `tva_${tvaYear}_${tvaMonth}`,
    category: 'tva',
    labelFr: `Déclaration TVA — ${pad(tvaMonth)}/${tvaYear}`,
    labelAr: `تصريح TVA — ${pad(tvaMonth)}/${tvaYear}`,
    dueDate: ymd(tvaYear, tvaMonth, 20),
    href: '/tva',
    externalUrl: 'https://www.tax.gov.ma',
    periodLabel: `${pad(m)}/${y}`,
  });

  // CNSS — 25 du mois (indicatif)
  specs.push({
    id: `cnss_${tvaYear}_${tvaMonth}`,
    category: 'cnss',
    labelFr: `Virement CNSS / AMO — ${pad(tvaMonth)}/${tvaYear}`,
    labelAr: `تحويل CNSS — ${pad(tvaMonth)}/${tvaYear}`,
    dueDate: ymd(tvaYear, tvaMonth, 25),
    href: '/ir',
    externalUrl: 'https://www.cnss.ma',
  });

  // IS — déclaration annuelle 31 mars (exercice N-1)
  specs.push({
    id: `is_declaration_${y}`,
    category: 'is',
    labelFr: `Déclaration IS exercice ${y - 1}`,
    labelAr: `تصريح IS للسنة ${y - 1}`,
    dueDate: nextOccurrence(y, 3, 31, ref),
    href: '/is',
    externalUrl: 'https://www.tax.gov.ma',
    periodLabel: String(y - 1),
  });

  // Acomptes IS — T1–T4
  for (const [trim, month, day] of [
    ['1', 3, 31],
    ['2', 6, 30],
    ['3', 9, 30],
    ['4', 12, 31],
  ] as const) {
    specs.push({
      id: `acompte_is_${y}_t${trim}`,
      category: 'acompte_is',
      labelFr: `Acompte provisionnel IS — T${trim} ${y}`,
      labelAr: `دفعة IS — T${trim} ${y}`,
      dueDate: nextOccurrence(y, month, day, ref),
      href: '/is',
      externalUrl: 'https://www.tax.gov.ma',
    });
  }

  // État 9421 / IR annuel — 31 mars (indicatif SIMPL-IR)
  specs.push({
    id: `etat9421_${y}`,
    category: 'ir',
    labelFr: `État 9421 — traitements & salaires ${y - 1}`,
    labelAr: `الوضعية 9421 — ${y - 1}`,
    dueDate: nextOccurrence(y, 3, 31, ref),
    href: '/ir',
    externalUrl: 'https://www.tax.gov.ma',
    periodLabel: String(y - 1),
  });

  // Dépôt légal — 30 juin (6 mois après clôture 31/12)
  specs.push({
    id: `depot_legal_${y}`,
    category: 'depot_legal',
    labelFr: `Dépôt légal des comptes — exercice ${y - 1}`,
    labelAr: `إيداع الحسابات القانونية — ${y - 1}`,
    dueDate: nextOccurrence(y, 6, 30, ref),
    href: '/juridique',
    periodLabel: String(y - 1),
  });

  // Patente — 31 janvier
  specs.push({
    id: `patente_${y}`,
    category: 'patente',
    labelFr: `Taxe professionnelle (Patente) — ${y}`,
    labelAr: `الضريبة المهنية — ${y}`,
    dueDate: nextOccurrence(y, 1, 31, ref),
    href: '/settings/company',
  });

  const deadlines: FiscalDeadline[] = specs
    .map((s) => {
      const due = new Date(`${s.dueDate}T12:00:00`);
      const daysRemaining = daysBetween(ref, due);
      return {
        ...s,
        daysRemaining,
        severity: severityForDays(daysRemaining),
      };
    })
    .filter((d) => d.daysRemaining >= -30)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const counts = deadlines.reduce(
    (acc, d) => {
      acc[d.severity] += 1;
      acc.total += 1;
      return acc;
    },
    { red: 0, orange: 0, green: 0, total: 0 },
  );

  return {
    companyId,
    fiscalYear: y,
    generatedAt: ref.toISOString(),
    deadlines,
    counts,
  };
}

export function categoryLabelFr(category: FiscalDeadlineCategory): string {
  const map: Record<FiscalDeadlineCategory, string> = {
    tva: 'TVA',
    is: 'IS',
    ir: 'IR / 9421',
    cnss: 'CNSS',
    depot_legal: 'Dépôt légal',
    patente: 'Patente',
    acompte_is: 'Acompte IS',
  };
  return map[category];
}
