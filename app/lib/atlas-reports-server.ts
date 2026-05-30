import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AtlasMonthlyEvolutionPoint,
  AtlasReportPayload,
  AtlasReportPeriod,
  AtlasReportPeriodPreset,
  AtlasReportsDashboard,
  AtlasReportsKpis,
  AtlasReportTableSection,
  AtlasReportType,
} from '@/app/types/atlas-reports';
import { asRecord } from '@/app/lib/atlas-json';
import { computeTvaPeriod } from '@/app/lib/atlas-tva-server';

const MONTH_NAMES = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

function inRange(dateYmd: string, start: string, end: string): boolean {
  return dateYmd >= start && dateYmd <= end;
}

export function resolveReportPeriod(
  preset: AtlasReportPeriodPreset,
  ref = new Date(),
  customFrom?: string,
  customTo?: string,
): AtlasReportPeriod {
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;

  if (preset === 'custom' && customFrom && customTo) {
    return {
      preset,
      periodStart: customFrom,
      periodEnd: customTo,
      periodLabel: `${customFrom} → ${customTo}`,
    };
  }

  if (preset === 'quarter') {
    const q = Math.ceil(m / 3);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const last = lastDayOfMonth(y, endMonth);
    return {
      preset: 'quarter',
      periodStart: `${y}-${pad2(startMonth)}-01`,
      periodEnd: `${y}-${pad2(endMonth)}-${pad2(last)}`,
      periodLabel: `T${q} ${y}`,
    };
  }

  if (preset === 'year') {
    return {
      preset: 'year',
      periodStart: `${y}-01-01`,
      periodEnd: `${y}-12-31`,
      periodLabel: `Exercice ${y}`,
    };
  }

  const last = lastDayOfMonth(y, m);
  return {
    preset: 'month',
    periodStart: `${y}-${pad2(m)}-01`,
    periodEnd: `${y}-${pad2(m)}-${pad2(last)}`,
    periodLabel: `${MONTH_NAMES[m - 1]} ${y}`,
  };
}

async function loadCompanyMeta(
  db: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ name: string } | null> {
  const { data, error } = await db
    .from('atlas_companies')
    .select('name, company_json')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const json = asRecord((data as { company_json: unknown }).company_json);
  const name = String((data as { name: string }).name || json?.raisonSociale || '').trim();
  return { name: name || 'Société' };
}

type InvoiceRow = {
  id: string;
  number: string;
  client_name: string;
  issue_date: string;
  status: string;
  amount_ht: number | string | null;
  vat_amount: number | string | null;
  total_ttc: number | string | null;
};

type SupplierRow = {
  id: string;
  supplier_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  amount_ht: number | string | null;
  vat_amount: number | string | null;
  amount_ttc: number | string | null;
  status: string;
};

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  paid_amount: number | string | null;
  amount: number | string | null;
  paid_at: string | null;
  created_at: string;
};

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  balance_mad: number | string | null;
};

type AccountingRow = {
  id: string;
  entry_json: unknown;
  entry_date: string | null;
};

type TvaPeriodRow = {
  period_key: string;
  period_type: string;
  period_start: string;
  period_end: string;
  tva_collectee: number | string;
  tva_deductible: number | string;
  tva_nette: number | string;
  status: string;
};

async function loadCompanyData(
  db: SupabaseClient,
  companyId: string,
  periodStart: string,
  periodEnd: string,
) {
  const [invRes, supRes, payRes, cliRes, accRes, tvaRes] = await Promise.all([
    db.from('atlas_invoices').select('*').eq('company_id', companyId),
    db.from('atlas_supplier_invoices').select('*').eq('company_id', companyId),
    db.from('atlas_payments').select('*').eq('company_id', companyId),
    db.from('atlas_clients').select('*').eq('company_id', companyId),
    db
      .from('atlas_accounting_entries')
      .select('*')
      .eq('company_id', companyId)
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd),
    db
      .from('atlas_tva_periods')
      .select('*')
      .eq('company_id', companyId)
      .gte('period_end', periodStart)
      .lte('period_start', periodEnd),
  ]);

  if (invRes.error) throw new Error(invRes.error.message);
  if (supRes.error) throw new Error(supRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (cliRes.error) throw new Error(cliRes.error.message);
  if (accRes.error) throw new Error(accRes.error.message);
  // tva periods table may not exist yet — tolerate
  const tvaPeriods = tvaRes.error ? [] : ((tvaRes.data ?? []) as TvaPeriodRow[]);

  return {
    invoices: (invRes.data ?? []) as InvoiceRow[],
    suppliers: (supRes.data ?? []) as SupplierRow[],
    payments: (payRes.data ?? []) as PaymentRow[],
    clients: (cliRes.data ?? []) as ClientRow[],
    accounting: (accRes.data ?? []) as AccountingRow[],
    tvaPeriods,
  };
}

function paymentAmount(row: PaymentRow): number {
  if (row.paid_amount != null) return Number(row.paid_amount);
  if (row.amount != null) return Number(row.amount);
  return 0;
}

function paidForInvoice(invoiceId: string, payments: PaymentRow[]): number {
  return payments
    .filter((p) => String(p.invoice_id) === invoiceId)
    .reduce((s, p) => s + paymentAmount(p), 0);
}

function buildMonthlyEvolution(
  periodStart: string,
  periodEnd: string,
  invoices: InvoiceRow[],
  suppliers: SupplierRow[],
  payments: PaymentRow[],
): AtlasMonthlyEvolutionPoint[] {
  const start = new Date(`${periodStart}T12:00:00`);
  const end = new Date(`${periodEnd}T12:00:00`);
  const points: AtlasMonthlyEvolutionPoint[] = [];

  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const monthStart = `${y}-${pad2(m)}-01`;
    const monthEnd = `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`;

    const ca = invoices
      .filter((i) => String(i.status) !== 'cancelled' && inRange(String(i.issue_date), monthStart, monthEnd))
      .reduce((s, i) => s + Number(i.amount_ht ?? 0), 0);

    const depenses = suppliers
      .filter((s) => s.invoice_date && inRange(String(s.invoice_date), monthStart, monthEnd))
      .reduce((sum, s) => sum + Number(s.amount_ht ?? 0), 0);

    const encaissements = payments
      .filter((p) => {
        const d = p.paid_at ? String(p.paid_at).slice(0, 10) : String(p.created_at).slice(0, 10);
        return inRange(d, monthStart, monthEnd);
      })
      .reduce((sum, p) => sum + paymentAmount(p), 0);

    points.push({
      monthKey: `${y}-${pad2(m)}`,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      ca: roundMad(ca),
      depenses: roundMad(depenses),
      encaissements: roundMad(encaissements),
    });

    cursor = new Date(y, m, 1);
  }

  return points;
}

async function computeKpis(
  db: SupabaseClient,
  companyId: string,
  period: AtlasReportPeriod,
  data: Awaited<ReturnType<typeof loadCompanyData>>,
): Promise<AtlasReportsKpis> {
  const { invoices, suppliers, payments } = data;
  const { periodStart, periodEnd } = period;

  const periodInvoices = invoices.filter(
    (i) => String(i.status) !== 'cancelled' && inRange(String(i.issue_date), periodStart, periodEnd),
  );

  const chiffreAffaires = periodInvoices.reduce((s, i) => s + Number(i.amount_ht ?? 0), 0);
  const facturesEmises = periodInvoices.length;

  let facturesImpayees = 0;
  let facturesImpayeesMontant = 0;
  for (const inv of periodInvoices) {
    if (String(inv.status) === 'paid') continue;
    const total = Number(inv.total_ttc ?? 0);
    const paid = paidForInvoice(String(inv.id), payments);
    const reste = Math.max(0, total - paid);
    if (reste > 0.01) {
      facturesImpayees += 1;
      facturesImpayeesMontant += reste;
    }
  }

  const depensesFournisseurs = suppliers
    .filter((s) => s.invoice_date && inRange(String(s.invoice_date), periodStart, periodEnd))
    .reduce((sum, s) => sum + Number(s.amount_ht ?? 0), 0);

  const encaissements = payments
    .filter((p) => {
      const d = p.paid_at ? String(p.paid_at).slice(0, 10) : String(p.created_at).slice(0, 10);
      return inRange(d, periodStart, periodEnd);
    })
    .reduce((sum, p) => sum + paymentAmount(p), 0);

  let tvaNette = 0;
  if (data.tvaPeriods.length > 0) {
    tvaNette = data.tvaPeriods.reduce((s, p) => s + Number(p.tva_nette ?? 0), 0);
  } else {
    try {
      const monthKey = periodStart.slice(0, 7);
      const calc = await computeTvaPeriod(db, companyId, monthKey, 'monthly');
      tvaNette = calc.tvaNette;
    } catch {
      tvaNette =
        periodInvoices.reduce((s, i) => s + Number(i.vat_amount ?? 0), 0) -
        suppliers
          .filter((s) => s.invoice_date && inRange(String(s.invoice_date), periodStart, periodEnd))
          .reduce((sum, s) => sum + Number(s.vat_amount ?? 0), 0);
    }
  }

  return {
    chiffreAffaires: roundMad(chiffreAffaires),
    facturesEmises,
    facturesImpayees,
    facturesImpayeesMontant: roundMad(facturesImpayeesMontant),
    depensesFournisseurs: roundMad(depensesFournisseurs),
    tvaNette: roundMad(tvaNette),
    encaissements: roundMad(encaissements),
  };
}

export async function getReportsDashboard(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  period: AtlasReportPeriod,
): Promise<AtlasReportsDashboard> {
  const meta = await loadCompanyMeta(db, userId, companyId);
  if (!meta) throw new Error('company_not_found');

  const data = await loadCompanyData(db, companyId, period.periodStart, period.periodEnd);
  const kpis = await computeKpis(db, companyId, period, data);
  const monthlyEvolution = buildMonthlyEvolution(
    period.periodStart,
    period.periodEnd,
    data.invoices,
    data.suppliers,
    data.payments,
  );

  return {
    companyId,
    companyName: meta.name,
    period,
    generatedAt: new Date().toISOString(),
    kpis,
    monthlyEvolution,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildCommercialReport(
  dashboard: AtlasReportsDashboard,
  data: Awaited<ReturnType<typeof loadCompanyData>>,
  period: AtlasReportPeriod,
): AtlasReportPayload {
  const periodInvoices = data.invoices.filter(
    (i) => String(i.status) !== 'cancelled' && inRange(String(i.issue_date), period.periodStart, period.periodEnd),
  );

  const invoiceRows = periodInvoices.map((i) => [
    String(i.number),
    String(i.client_name),
    String(i.issue_date),
    String(i.status),
    fmt(Number(i.amount_ht ?? 0)),
    fmt(Number(i.vat_amount ?? 0)),
    fmt(Number(i.total_ttc ?? 0)),
  ]);

  const evolutionRows = dashboard.monthlyEvolution.map((p) => [
    p.label,
    fmt(p.ca),
    fmt(p.depenses),
    fmt(p.encaissements),
  ]);

  const sections: AtlasReportTableSection[] = [
    {
      title: 'Indicateurs clés',
      headers: ['Indicateur', 'Valeur'],
      rows: [
        ["Chiffre d'affaires HT", `${fmt(dashboard.kpis.chiffreAffaires)} MAD`],
        ['Factures émises', String(dashboard.kpis.facturesEmises)],
        ['Factures impayées', String(dashboard.kpis.facturesImpayees)],
        ['Montant impayé', `${fmt(dashboard.kpis.facturesImpayeesMontant)} MAD`],
        ['Encaissements', `${fmt(dashboard.kpis.encaissements)} MAD`],
      ],
    },
    {
      title: 'Factures émises',
      headers: ['N°', 'Client', 'Date', 'Statut', 'HT', 'TVA', 'TTC'],
      rows: invoiceRows.length ? invoiceRows : [['—', 'Aucune facture', '', '', '', '', '']],
    },
    {
      title: 'Évolution mensuelle',
      headers: ['Mois', 'CA HT', 'Dépenses', 'Encaissements'],
      rows: evolutionRows.length ? evolutionRows : [['—', '0,00', '0,00', '0,00']],
    },
  ];

  return {
    type: 'commercial',
    companyId: dashboard.companyId,
    companyName: dashboard.companyName,
    generatedAt: dashboard.generatedAt,
    period,
    sections,
  };
}

function buildComptableReport(
  dashboard: AtlasReportsDashboard,
  data: Awaited<ReturnType<typeof loadCompanyData>>,
  period: AtlasReportPeriod,
): AtlasReportPayload {
  const byAccount = new Map<string, { debit: number; credit: number; libelle: string }>();

  for (const row of data.accounting) {
    const entry = asRecord(row.entry_json);
    if (!entry) continue;
    const compte = String(entry.compte ?? '—');
    const debit = Number(entry.debit ?? 0);
    const credit = Number(entry.credit ?? 0);
    const prev = byAccount.get(compte) ?? { debit: 0, credit: 0, libelle: String(entry.libelle ?? '') };
    byAccount.set(compte, {
      debit: prev.debit + debit,
      credit: prev.credit + credit,
      libelle: prev.libelle || String(entry.libelle ?? ''),
    });
  }

  const rows = [...byAccount.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([compte, v]) => [compte, v.libelle.slice(0, 40), fmt(v.debit), fmt(v.credit), fmt(v.debit - v.credit)]);

  return {
    type: 'comptable',
    companyId: dashboard.companyId,
    companyName: dashboard.companyName,
    generatedAt: dashboard.generatedAt,
    period,
    sections: [
      {
        title: 'Journal par compte',
        headers: ['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde'],
        rows: rows.length ? rows : [['—', 'Aucune écriture', '0,00', '0,00', '0,00']],
      },
    ],
  };
}

function buildFiscalReport(dashboard: AtlasReportsDashboard, period: AtlasReportPeriod): AtlasReportPayload {
  return {
    type: 'fiscal',
    companyId: dashboard.companyId,
    companyName: dashboard.companyName,
    generatedAt: dashboard.generatedAt,
    period,
    sections: [
      {
        title: 'Synthèse fiscale',
        headers: ['Poste', 'Montant (MAD)'],
        rows: [
          ["Chiffre d'affaires HT", fmt(dashboard.kpis.chiffreAffaires)],
          ['Dépenses fournisseurs HT', fmt(dashboard.kpis.depensesFournisseurs)],
          ['TVA nette', fmt(dashboard.kpis.tvaNette)],
          ['Encaissements', fmt(dashboard.kpis.encaissements)],
          ['Factures impayées (montant)', fmt(dashboard.kpis.facturesImpayeesMontant)],
        ],
      },
    ],
  };
}

function buildFournisseursReport(
  dashboard: AtlasReportsDashboard,
  data: Awaited<ReturnType<typeof loadCompanyData>>,
  period: AtlasReportPeriod,
): AtlasReportPayload {
  const periodSuppliers = data.suppliers.filter(
    (s) => s.invoice_date && inRange(String(s.invoice_date), period.periodStart, period.periodEnd),
  );

  const bySupplier = new Map<string, { ht: number; tva: number; ttc: number; count: number }>();
  for (const s of periodSuppliers) {
    const name = String(s.supplier_name || 'Fournisseur');
    const prev = bySupplier.get(name) ?? { ht: 0, tva: 0, ttc: 0, count: 0 };
    bySupplier.set(name, {
      ht: prev.ht + Number(s.amount_ht ?? 0),
      tva: prev.tva + Number(s.vat_amount ?? 0),
      ttc: prev.ttc + Number(s.amount_ttc ?? 0),
      count: prev.count + 1,
    });
  }

  const rows = [...bySupplier.entries()]
    .sort((a, b) => b[1].ht - a[1].ht)
    .map(([name, v]) => [name, String(v.count), fmt(v.ht), fmt(v.tva), fmt(v.ttc)]);

  const detailRows = periodSuppliers.map((s) => [
    String(s.invoice_number ?? s.id.slice(0, 8)),
    String(s.supplier_name),
    String(s.invoice_date ?? ''),
    String(s.status),
    fmt(Number(s.amount_ht ?? 0)),
    fmt(Number(s.vat_amount ?? 0)),
    fmt(Number(s.amount_ttc ?? 0)),
  ]);

  return {
    type: 'fournisseurs',
    companyId: dashboard.companyId,
    companyName: dashboard.companyName,
    generatedAt: dashboard.generatedAt,
    period,
    sections: [
      {
        title: 'Par fournisseur',
        headers: ['Fournisseur', 'Factures', 'HT', 'TVA', 'TTC'],
        rows: rows.length ? rows : [['—', '0', '0,00', '0,00', '0,00']],
      },
      {
        title: 'Détail factures achats',
        headers: ['N°', 'Fournisseur', 'Date', 'Statut', 'HT', 'TVA', 'TTC'],
        rows: detailRows.length ? detailRows : [['—', 'Aucune facture', '', '', '', '', '']],
      },
    ],
  };
}

function buildClientsReport(
  dashboard: AtlasReportsDashboard,
  data: Awaited<ReturnType<typeof loadCompanyData>>,
  period: AtlasReportPeriod,
): AtlasReportPayload {
  const periodInvoices = data.invoices.filter(
    (i) => String(i.status) !== 'cancelled' && inRange(String(i.issue_date), period.periodStart, period.periodEnd),
  );

  const byClient = new Map<string, { ht: number; ttc: number; count: number }>();
  for (const i of periodInvoices) {
    const name = String(i.client_name || 'Client');
    const prev = byClient.get(name) ?? { ht: 0, ttc: 0, count: 0 };
    byClient.set(name, {
      ht: prev.ht + Number(i.amount_ht ?? 0),
      ttc: prev.ttc + Number(i.total_ttc ?? 0),
      count: prev.count + 1,
    });
  }

  const activityRows = [...byClient.entries()]
    .sort((a, b) => b[1].ht - a[1].ht)
    .map(([name, v]) => [name, String(v.count), fmt(v.ht), fmt(v.ttc)]);

  const registryRows = data.clients.map((c) => [
    String(c.name),
    c.email ?? '',
    c.city ?? '',
    fmt(Number(c.balance_mad ?? 0)),
  ]);

  return {
    type: 'clients',
    companyId: dashboard.companyId,
    companyName: dashboard.companyName,
    generatedAt: dashboard.generatedAt,
    period,
    sections: [
      {
        title: 'Activité clients (période)',
        headers: ['Client', 'Factures', 'CA HT', 'TTC'],
        rows: activityRows.length ? activityRows : [['—', '0', '0,00', '0,00']],
      },
      {
        title: 'Répertoire clients',
        headers: ['Nom', 'Email', 'Ville', 'Solde MAD'],
        rows: registryRows.length ? registryRows : [['—', '', '', '0,00']],
      },
    ],
  };
}

function buildTvaReport(
  dashboard: AtlasReportsDashboard,
  data: Awaited<ReturnType<typeof loadCompanyData>>,
  period: AtlasReportPeriod,
): AtlasReportPayload {
  const rows =
    data.tvaPeriods.length > 0
      ? data.tvaPeriods.map((p) => [
          String(p.period_key),
          String(p.period_start),
          String(p.period_end),
          fmt(Number(p.tva_collectee)),
          fmt(Number(p.tva_deductible)),
          fmt(Number(p.tva_nette)),
          String(p.status),
        ])
      : [
          [
            period.periodLabel,
            period.periodStart,
            period.periodEnd,
            '—',
            '—',
            fmt(dashboard.kpis.tvaNette),
            'calculé',
          ],
        ];

  return {
    type: 'tva',
    companyId: dashboard.companyId,
    companyName: dashboard.companyName,
    generatedAt: dashboard.generatedAt,
    period,
    sections: [
      {
        title: 'Périodes TVA',
        headers: ['Période', 'Début', 'Fin', 'Collectée', 'Déductible', 'Nette', 'Statut'],
        rows,
      },
      {
        title: 'Résumé période sélectionnée',
        headers: ['Indicateur', 'Montant (MAD)'],
        rows: [['TVA nette', fmt(dashboard.kpis.tvaNette)]],
      },
    ],
  };
}

export async function getReportByType(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  type: AtlasReportType,
  period: AtlasReportPeriod,
): Promise<AtlasReportPayload> {
  const dashboard = await getReportsDashboard(db, userId, companyId, period);
  const data = await loadCompanyData(db, companyId, period.periodStart, period.periodEnd);

  switch (type) {
    case 'commercial':
      return buildCommercialReport(dashboard, data, period);
    case 'comptable':
      return buildComptableReport(dashboard, data, period);
    case 'fiscal':
      return buildFiscalReport(dashboard, period);
    case 'fournisseurs':
      return buildFournisseursReport(dashboard, data, period);
    case 'clients':
      return buildClientsReport(dashboard, data, period);
    case 'tva':
      return buildTvaReport(dashboard, data, period);
    default:
      throw new Error('unknown_report_type');
  }
}

export function parseReportPeriodParams(searchParams: URLSearchParams): AtlasReportPeriod {
  const preset = (searchParams.get('preset') ?? 'month') as AtlasReportPeriodPreset;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  const valid: AtlasReportPeriodPreset[] = ['month', 'quarter', 'year', 'custom'];
  const p = valid.includes(preset) ? preset : 'month';
  return resolveReportPeriod(p, new Date(), from, to);
}

export function parseReportType(v: string | null): AtlasReportType | null {
  const types: AtlasReportType[] = ['commercial', 'comptable', 'fiscal', 'fournisseurs', 'clients', 'tva'];
  return types.includes(v as AtlasReportType) ? (v as AtlasReportType) : null;
}
