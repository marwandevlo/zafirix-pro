/**
 * Server helpers for Auto-entrepreneur & Personne physique modules.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AeActivityType,
  AeComplianceStatus,
  AeDashboardPayload,
  AeQuarterSummary,
  AtlasAeQuarterlyDeclaration,
  AtlasAeTurnoverEntry,
  AtlasIndividualProfile,
  AtlasPpLedgerEntry,
  IndividualProfileType,
  PpDashboardPayload,
  PpTaxRegime,
} from '@/app/types/atlas-individual-tax';
import {
  AE_ACTIVITY_CEILINGS,
  AE_INDICATIVE_TAX_RATE,
} from '@/app/types/atlas-individual-tax';

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

export function currentFiscalYear(d = new Date()): number {
  return d.getFullYear();
}

export function currentQuarter(d = new Date()): 1 | 2 | 3 | 4 {
  return (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

export function quarterFromDate(isoDate: string): 1 | 2 | 3 | 4 {
  const m = new Date(`${isoDate}T12:00:00`).getMonth();
  return (Math.floor(m / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Déclaration trimestrielle AE — fin du mois suivant le trimestre. */
export function aeDeclarationDueDate(fiscalYear: number, quarter: 1 | 2 | 3 | 4): string {
  const map: Record<1 | 2 | 3 | 4, { yearOffset: number; month: number; day: number }> = {
    1: { yearOffset: 0, month: 4, day: 30 },
    2: { yearOffset: 0, month: 7, day: 31 },
    3: { yearOffset: 0, month: 10, day: 31 },
    4: { yearOffset: 1, month: 1, day: 31 },
  };
  const due = map[quarter];
  const y = fiscalYear + due.yearOffset;
  return `${y}-${String(due.month).padStart(2, '0')}-${String(due.day).padStart(2, '0')}`;
}

export const AE_QUARTER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'T1 · Jan–Mars',
  2: 'T2 · Avr–Juin',
  3: 'T3 · Juil–Sept',
  4: 'T4 · Oct–Déc',
};

/**
 * IR annuel indicatif (barème progressif CGI — à valider par expert-comptable).
 * Tranches annuelles approximatives.
 */
export function calculateAnnualMoroccanIR(beneficeNet: number): number {
  const base = Math.max(0, beneficeNet);
  let tax = 0;
  let remaining = base;

  const brackets: Array<{ upTo: number; rate: number }> = [
    { upTo: 40_000, rate: 0 },
    { upTo: 60_000, rate: 0.1 },
    { upTo: 80_000, rate: 0.2 },
    { upTo: 100_000, rate: 0.3 },
    { upTo: 180_000, rate: 0.34 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ];

  let lower = 0;
  for (const b of brackets) {
    const span = Math.min(remaining, b.upTo - lower);
    if (span <= 0) break;
    tax += span * b.rate;
    remaining -= span;
    lower = b.upTo;
    if (remaining <= 0) break;
  }
  return roundMad(tax);
}

export function rowToIndividualProfile(row: Record<string, unknown>): AtlasIndividualProfile {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    profileType: row.profile_type as IndividualProfileType,
    activityType: (row.activity_type as AeActivityType) ?? 'services',
    annualCeilingMad: Number(row.annual_ceiling_mad ?? AE_ACTIVITY_CEILINGS.services),
    taxRegime: (row.tax_regime as PpTaxRegime) ?? 'rnr',
    fiscalYear: Number(row.fiscal_year),
    displayName: (row.display_name as string | null) ?? null,
    iceOrIf: (row.ice_or_if as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function rowToAeTurnover(row: Record<string, unknown>): AtlasAeTurnoverEntry {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    entryDate: String(row.entry_date).slice(0, 10),
    amountMad: Number(row.amount_mad ?? 0),
    label: String(row.label ?? ''),
    clientName: (row.client_name as string | null) ?? null,
    invoiceRef: (row.invoice_ref as string | null) ?? null,
    quarter: Number(row.quarter) as 1 | 2 | 3 | 4,
    fiscalYear: Number(row.fiscal_year),
    createdAt: String(row.created_at ?? ''),
  };
}

export function rowToAeDeclaration(row: Record<string, unknown>): AtlasAeQuarterlyDeclaration {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    fiscalYear: Number(row.fiscal_year),
    quarter: Number(row.quarter) as 1 | 2 | 3 | 4,
    declaredCaMad: Number(row.declared_ca_mad ?? 0),
    taxDueMad: Number(row.tax_due_mad ?? 0),
    status: row.status as AtlasAeQuarterlyDeclaration['status'],
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
    declaredAt: (row.declared_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

export function rowToPpLedger(row: Record<string, unknown>): AtlasPpLedgerEntry {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    entryType: row.entry_type as AtlasPpLedgerEntry['entryType'],
    entryDate: String(row.entry_date).slice(0, 10),
    amountMad: Number(row.amount_mad ?? 0),
    category: String(row.category ?? 'divers'),
    label: String(row.label ?? ''),
    deductible: row.deductible !== false,
    fiscalYear: Number(row.fiscal_year),
    documentRef: (row.document_ref as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function ensureIndividualProfile(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    profileType: IndividualProfileType;
    fiscalYear: number;
    activityType?: AeActivityType;
    taxRegime?: PpTaxRegime;
    displayName?: string | null;
  },
): Promise<AtlasIndividualProfile> {
  const activityType = input.activityType ?? 'services';
  const ceiling = AE_ACTIVITY_CEILINGS[activityType];

  const { data: existing } = await admin
    .from('zafirix_individual_profiles')
    .select('*')
    .eq('user_id', input.userId)
    .eq('company_id', input.companyId)
    .eq('profile_type', input.profileType)
    .eq('fiscal_year', input.fiscalYear)
    .maybeSingle();

  if (existing) {
    return rowToIndividualProfile(existing as Record<string, unknown>);
  }

  const { data, error } = await admin
    .from('zafirix_individual_profiles')
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      profile_type: input.profileType,
      activity_type: activityType,
      annual_ceiling_mad: ceiling,
      tax_regime: input.taxRegime ?? 'rnr',
      fiscal_year: input.fiscalYear,
      display_name: input.displayName ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToIndividualProfile(data as Record<string, unknown>);
}

function computeAeCompliance(params: {
  annualCa: number;
  ceiling: number;
  quarters: AeQuarterSummary[];
  today: Date;
}): { status: AeComplianceStatus; label: string } {
  const usage = params.ceiling > 0 ? params.annualCa / params.ceiling : 0;
  const todayIso = params.today.toISOString().slice(0, 10);

  const hasLateDecl = params.quarters.some((q) => {
    const st = q.declaration?.status;
    if (st === 'declared' || st === 'paid' || st === 'exempt') return false;
    return q.dueDate < todayIso;
  });

  if (usage > 1) {
    return {
      status: 'depassement',
      label: 'Dépassement du plafond légal — risque de sortie du régime auto-entrepreneur',
    };
  }
  if (hasLateDecl) {
    return {
      status: 'declarations_en_retard',
      label: 'Déclaration(s) trimestrielle(s) en retard — à régulariser sur le portail officiel',
    };
  }
  if (usage >= 0.8) {
    return {
      status: 'attention',
      label: 'Attention : plus de 80 % du plafond annuel consommé',
    };
  }
  return {
    status: 'conforme',
    label: 'Conformité provisoire — déclarations et plafond sous contrôle',
  };
}

export async function buildAeDashboard(
  admin: SupabaseClient,
  input: { userId: string; companyId: string; fiscalYear?: number },
): Promise<AeDashboardPayload> {
  const fiscalYear = input.fiscalYear ?? currentFiscalYear();
  const profile = await ensureIndividualProfile(admin, {
    userId: input.userId,
    companyId: input.companyId,
    profileType: 'auto_entrepreneur',
    fiscalYear,
  });

  const [{ data: entriesRaw, error: entriesErr }, { data: declsRaw, error: declsErr }] = await Promise.all([
    admin
      .from('zafirix_ae_turnover_entries')
      .select('id, company_id, entry_date, amount_mad, label, client_name, invoice_ref, quarter, fiscal_year, created_at')
      .eq('user_id', input.userId)
      .eq('company_id', input.companyId)
      .eq('fiscal_year', fiscalYear)
      .order('entry_date', { ascending: false })
      .limit(200),
    admin
      .from('zafirix_ae_quarterly_declarations')
      .select('*')
      .eq('user_id', input.userId)
      .eq('company_id', input.companyId)
      .eq('fiscal_year', fiscalYear),
  ]);

  if (entriesErr) throw new Error(entriesErr.message);
  if (declsErr) throw new Error(declsErr.message);

  const entries = (entriesRaw ?? []).map((r) => rowToAeTurnover(r as Record<string, unknown>));
  const decls = (declsRaw ?? []).map((r) => rowToAeDeclaration(r as Record<string, unknown>));
  const declByQ = new Map(decls.map((d) => [d.quarter, d]));

  const cq = currentQuarter();
  const annualCaMad = roundMad(entries.reduce((s, e) => s + e.amountMad, 0));
  const ceiling = profile.annualCeilingMad || AE_ACTIVITY_CEILINGS[profile.activityType];
  const rate = AE_INDICATIVE_TAX_RATE[profile.activityType];

  const quarters: AeQuarterSummary[] = ([1, 2, 3, 4] as const).map((q) => {
    const qEntries = entries.filter((e) => e.quarter === q);
    return {
      quarter: q,
      caMad: roundMad(qEntries.reduce((s, e) => s + e.amountMad, 0)),
      invoiceCount: qEntries.length,
      declaration: declByQ.get(q) ?? null,
      dueDate: aeDeclarationDueDate(fiscalYear, q),
      label: AE_QUARTER_LABELS[q],
    };
  });

  const { status, label } = computeAeCompliance({
    annualCa: annualCaMad,
    ceiling,
    quarters,
    today: new Date(),
  });

  return {
    profile,
    fiscalYear,
    annualCaMad,
    annualCeilingMad: ceiling,
    ceilingUsagePct: ceiling > 0 ? roundMad((annualCaMad / ceiling) * 100) : 0,
    remainingCeilingMad: roundMad(Math.max(0, ceiling - annualCaMad)),
    invoiceCount: entries.length,
    currentQuarterCaMad: quarters.find((q) => q.quarter === cq)?.caMad ?? 0,
    currentQuarter: cq,
    quarters,
    complianceStatus: status,
    complianceLabel: label,
    indicativeTaxRatePct: rate * 100,
    indicativeAnnualTaxMad: roundMad(annualCaMad * rate),
    entries,
  };
}

export async function buildPpDashboard(
  admin: SupabaseClient,
  input: { userId: string; companyId: string; fiscalYear?: number },
): Promise<PpDashboardPayload> {
  const fiscalYear = input.fiscalYear ?? currentFiscalYear();
  const profile = await ensureIndividualProfile(admin, {
    userId: input.userId,
    companyId: input.companyId,
    profileType: 'personne_physique',
    fiscalYear,
  });

  const { data, error } = await admin
    .from('zafirix_pp_ledger_entries')
    .select('id, company_id, entry_type, entry_date, amount_mad, category, label, deductible, fiscal_year, document_ref, created_at')
    .eq('user_id', input.userId)
    .eq('company_id', input.companyId)
    .eq('fiscal_year', fiscalYear)
    .order('entry_date', { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);

  const entries = (data ?? []).map((r) => rowToPpLedger(r as Record<string, unknown>));
  const revenues = entries.filter((e) => e.entryType === 'revenue');
  const expenses = entries.filter((e) => e.entryType === 'expense');

  const chiffreAffairesMad = roundMad(revenues.reduce((s, e) => s + e.amountMad, 0));
  const chargesDeductiblesMad = roundMad(
    expenses.filter((e) => e.deductible).reduce((s, e) => s + e.amountMad, 0),
  );
  const chargesNonDeductiblesMad = roundMad(
    expenses.filter((e) => !e.deductible).reduce((s, e) => s + e.amountMad, 0),
  );
  const beneficeNetImposableMad = roundMad(chiffreAffairesMad - chargesDeductiblesMad);
  const indicativeIrMad = calculateAnnualMoroccanIR(beneficeNetImposableMad);
  const indicativeEffectiveRatePct =
    beneficeNetImposableMad > 0
      ? roundMad((indicativeIrMad / beneficeNetImposableMad) * 100)
      : 0;

  return {
    profile,
    fiscalYear,
    regime: profile.taxRegime,
    chiffreAffairesMad,
    chargesDeductiblesMad,
    chargesNonDeductiblesMad,
    beneficeNetImposableMad,
    indicativeIrMad,
    indicativeEffectiveRatePct,
    revenueCount: revenues.length,
    expenseCount: expenses.length,
    entries,
  };
}
