/**
 * Commissions & brokerage — rules, tiers, automated calculation from invoices/payments.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentPerformance,
  AtlasBrokerTier,
  AtlasCommissionEntry,
  AtlasCommissionRule,
  AtlasSalesAgent,
  CommissionBasis,
  CommissionsDashboard,
} from '@/app/types/atlas-commissions';
import { DEFAULT_TIERS } from '@/app/types/atlas-commissions';

export { BASIS_LABELS, STATUS_LABELS, AGENT_TYPE_LABELS } from '@/app/types/atlas-commissions';

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}

export function rowToTier(row: Record<string, unknown>): AtlasBrokerTier {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    name: String(row.name ?? ''),
    code: String(row.code ?? ''),
    minSalesMad: Number(row.min_sales_mad ?? 0),
    minCollectedMad: Number(row.min_collected_mad ?? 0),
    commissionRate: Number(row.commission_rate ?? 0),
    bonusRate: Number(row.bonus_rate ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active ?? true),
  };
}

export function rowToAgent(row: Record<string, unknown>): AtlasSalesAgent {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    tierId: (row.tier_id as string | null) ?? null,
    name: String(row.name ?? ''),
    code: String(row.code ?? ''),
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    agentType: row.agent_type as AtlasSalesAgent['agentType'],
    isActive: Boolean(row.is_active ?? true),
    tierName: (row.tier_name as string | undefined) ?? undefined,
    tierCode: (row.tier_code as string | undefined) ?? undefined,
  };
}

export function rowToRule(row: Record<string, unknown>): AtlasCommissionRule {
  return {
    id: String(row.id),
    companyId: (row.company_id as string | null) ?? null,
    agentId: (row.agent_id as string | null) ?? null,
    name: String(row.name ?? ''),
    basis: row.basis as CommissionBasis,
    rateType: row.rate_type as AtlasCommissionRule['rateType'],
    rateValue: Number(row.rate_value ?? 0),
    minAmount: Number(row.min_amount ?? 0),
    maxCommission: row.max_commission != null ? Number(row.max_commission) : null,
    isActive: Boolean(row.is_active ?? true),
    priority: Number(row.priority ?? 0),
  };
}

export function rowToEntry(row: Record<string, unknown>): AtlasCommissionEntry {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    agentName: (row.agent_name as string | undefined) ?? undefined,
    ruleId: (row.rule_id as string | null) ?? null,
    invoiceId: (row.invoice_id as string | null) ?? null,
    paymentId: (row.payment_id as string | null) ?? null,
    basis: row.basis as CommissionBasis,
    baseAmount: Number(row.base_amount ?? 0),
    ratePct: Number(row.rate_pct ?? 0),
    commissionAmount: Number(row.commission_amount ?? 0),
    tierBonus: Number(row.tier_bonus ?? 0),
    status: row.status as AtlasCommissionEntry['status'],
    calculatedAt: String(row.calculated_at ?? row.created_at ?? ''),
    paidAt: (row.paid_at as string | null) ?? null,
    invoiceNumber: (row.invoice_number as string | undefined) ?? undefined,
    clientName: (row.client_name as string | undefined) ?? undefined,
  };
}

export async function seedDefaultTiers(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<number> {
  const { count } = await admin
    .from('zafirix_broker_tiers')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if ((count ?? 0) > 0) return 0;

  let created = 0;
  for (const t of DEFAULT_TIERS) {
    const { error } = await admin.from('zafirix_broker_tiers').insert({
      user_id: userId,
      company_id: companyId,
      name: t.name,
      code: t.code,
      min_sales_mad: t.minSalesMad,
      min_collected_mad: t.minCollectedMad,
      commission_rate: t.commissionRate,
      bonus_rate: t.bonusRate,
      sort_order: t.sortOrder,
    });
    if (!error) created++;
  }
  return created;
}

export async function seedDefaultRules(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<void> {
  const { count } = await admin
    .from('zafirix_commission_rules')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if ((count ?? 0) > 0) return;

  await admin.from('zafirix_commission_rules').insert([
    {
      user_id: userId,
      company_id: companyId,
      name: 'Commission sur encaissement',
      basis: 'payment_collected',
      rate_type: 'percent',
      rate_value: 5,
      priority: 10,
    },
    {
      user_id: userId,
      company_id: companyId,
      name: 'Commission sur facturation',
      basis: 'invoice_issued',
      rate_type: 'percent',
      rate_value: 3,
      priority: 5,
    },
  ]);
}

function resolveApplicableRule(
  rules: AtlasCommissionRule[],
  agentId: string,
  basis: CommissionBasis,
): AtlasCommissionRule | null {
  const active = rules.filter((r) => r.isActive && r.basis === basis);
  const agentRule = active.find((r) => r.agentId === agentId);
  if (agentRule) return agentRule;
  const global = active.filter((r) => !r.agentId).sort((a, b) => b.priority - a.priority);
  return global[0] ?? null;
}

function computeCommissionAmount(
  baseAmount: number,
  rule: AtlasCommissionRule,
  tierRate: number,
  tierBonusRate: number,
): { commission: number; ratePct: number; tierBonus: number } {
  const effectiveRate = rule.rateType === 'percent' ? rule.rateValue + tierRate : 0;
  let commission =
    rule.rateType === 'percent'
      ? baseAmount * (effectiveRate / 100)
      : rule.rateValue;

  const tierBonus = rule.rateType === 'percent' ? baseAmount * (tierBonusRate / 100) : 0;
  commission += tierBonus;

  if (rule.maxCommission != null && commission > rule.maxCommission) {
    commission = rule.maxCommission;
  }

  return {
    commission: roundMad(Math.max(0, commission)),
    ratePct: effectiveRate,
    tierBonus: roundMad(tierBonus),
  };
}

function tierForTotals(
  tiers: AtlasBrokerTier[],
  sales: number,
  collected: number,
): AtlasBrokerTier | null {
  const active = tiers.filter((t) => t.isActive).sort((a, b) => b.sortOrder - a.sortOrder);
  for (const t of active) {
    if (sales >= t.minSalesMad && collected >= t.minCollectedMad) return t;
  }
  return active[active.length - 1] ?? null;
}

/** Recalculate commissions from invoice assignments + payments. */
export async function syncCommissionEntries(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<{ created: number; updated: number }> {
  await seedDefaultTiers(admin, userId, companyId);
  await seedDefaultRules(admin, userId, companyId);

  const [{ data: assignments }, { data: rulesRaw }, { data: tiersRaw }, { data: agentsRaw }] =
    await Promise.all([
      admin
        .from('zafirix_invoice_agent_assignments')
        .select('*')
        .eq('company_id', companyId)
        .eq('user_id', userId),
      admin
        .from('zafirix_commission_rules')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true),
      admin.from('zafirix_broker_tiers').select('*').eq('company_id', companyId),
      admin.from('zafirix_sales_agents').select('*').eq('company_id', companyId).eq('is_active', true),
    ]);

  const rules = (rulesRaw ?? []).map((r) => rowToRule(r as Record<string, unknown>));
  const tiers = (tiersRaw ?? []).map((r) => rowToTier(r as Record<string, unknown>));
  const agents = new Map(
    (agentsRaw ?? []).map((a) => [String(a.id), rowToAgent(a as Record<string, unknown>)]),
  );

  let created = 0;
  let updated = 0;

  for (const asn of assignments ?? []) {
    const agentId = String(asn.agent_id);
    const agent = agents.get(agentId);
    if (!agent) continue;

    const invoiceId = String(asn.invoice_id);
    const splitPct = Number(asn.split_pct ?? 100) / 100;

    const { data: invoice } = await admin
      .from('atlas_invoices')
      .select('id, number, client_name, total_ttc, amount_ht, status, issue_date')
      .eq('id', invoiceId)
      .single();

    if (!invoice) continue;

    const agentTotals = await computeAgentTotals(admin, companyId, agentId);
    const tier = tierForTotals(tiers, agentTotals.sales, agentTotals.collected);
    const tierRate = tier?.commissionRate ?? 0;
    const tierBonusRate = tier?.bonusRate ?? 0;

    const invoiceBase = roundMad(Number(invoice.total_ttc ?? invoice.amount_ht ?? 0) * splitPct);

    const issueRule = resolveApplicableRule(rules, agentId, 'invoice_issued');
    if (issueRule && invoiceBase >= issueRule.minAmount) {
      const { commission, ratePct, tierBonus } = computeCommissionAmount(
        invoiceBase,
        issueRule,
        tierRate,
        tierBonusRate,
      );

      const result = await upsertCommissionEntry(admin, {
        userId,
        companyId,
        agentId,
        ruleId: issueRule.id,
        invoiceId,
        paymentId: null,
        basis: 'invoice_issued',
        baseAmount: invoiceBase,
        ratePct,
        commissionAmount: commission,
        tierBonus,
        metadata: { invoiceNumber: invoice.number, clientName: invoice.client_name },
      });
      if (result === 'created') created++;
      else if (result === 'updated') updated++;
    }

    const { data: payments } = await admin
      .from('atlas_payments')
      .select('id, paid_amount, amount, paid_at, status')
      .eq('invoice_id', invoiceId)
      .in('status', ['paid', 'completed', 'confirmed']);

    const collectRule = resolveApplicableRule(rules, agentId, 'payment_collected');
    if (!collectRule) continue;

    for (const pay of payments ?? []) {
      const payBase = roundMad(Number(pay.paid_amount ?? pay.amount ?? 0) * splitPct);
      if (payBase < collectRule.minAmount) continue;

      const { commission, ratePct, tierBonus } = computeCommissionAmount(
        payBase,
        collectRule,
        tierRate,
        tierBonusRate,
      );

      const result = await upsertCommissionEntry(admin, {
        userId,
        companyId,
        agentId,
        ruleId: collectRule.id,
        invoiceId,
        paymentId: String(pay.id),
        basis: 'payment_collected',
        baseAmount: payBase,
        ratePct,
        commissionAmount: commission,
        tierBonus,
        metadata: { invoiceNumber: invoice.number, clientName: invoice.client_name },
      });
      if (result === 'created') created++;
      else if (result === 'updated') updated++;
    }
  }

  return { created, updated };
}

async function upsertCommissionEntry(
  admin: SupabaseClient,
  input: {
    userId: string;
    companyId: string;
    agentId: string;
    ruleId: string;
    invoiceId: string;
    paymentId: string | null;
    basis: CommissionBasis;
    baseAmount: number;
    ratePct: number;
    commissionAmount: number;
    tierBonus: number;
    metadata: Record<string, unknown>;
  },
): Promise<'created' | 'updated' | 'skipped'> {
  const { data: existing } = await admin
    .from('zafirix_commission_entries')
    .select('id, status, commission_amount')
    .eq('agent_id', input.agentId)
    .eq('invoice_id', input.invoiceId)
    .eq('basis', input.basis)
    .eq('payment_id', input.paymentId)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (existing?.status === 'paid') return 'skipped';

  const row = {
    user_id: input.userId,
    company_id: input.companyId,
    agent_id: input.agentId,
    rule_id: input.ruleId,
    invoice_id: input.invoiceId,
    payment_id: input.paymentId,
    basis: input.basis,
    base_amount: input.baseAmount,
    rate_pct: input.ratePct,
    commission_amount: input.commissionAmount,
    tier_bonus: input.tierBonus,
    metadata: input.metadata,
    calculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    if (Number(existing.commission_amount) === input.commissionAmount) return 'skipped';
    await admin.from('zafirix_commission_entries').update(row).eq('id', existing.id);
    return 'updated';
  }

  const { error } = await admin.from('zafirix_commission_entries').insert(row);
  return error ? 'skipped' : 'created';
}

async function computeAgentTotals(
  admin: SupabaseClient,
  companyId: string,
  agentId: string,
): Promise<{ sales: number; collected: number }> {
  const { data: assignments } = await admin
    .from('zafirix_invoice_agent_assignments')
    .select('invoice_id, split_pct')
    .eq('company_id', companyId)
    .eq('agent_id', agentId);

  let sales = 0;
  let collected = 0;

  for (const asn of assignments ?? []) {
    const split = Number(asn.split_pct ?? 100) / 100;
    const { data: inv } = await admin
      .from('atlas_invoices')
      .select('total_ttc, amount_ht')
      .eq('id', asn.invoice_id)
      .maybeSingle();
    if (inv) sales += Number(inv.total_ttc ?? inv.amount_ht ?? 0) * split;

    const { data: pays } = await admin
      .from('atlas_payments')
      .select('paid_amount, amount')
      .eq('invoice_id', asn.invoice_id)
      .in('status', ['paid', 'completed', 'confirmed']);
    for (const p of pays ?? []) {
      collected += Number(p.paid_amount ?? p.amount ?? 0) * split;
    }
  }

  return { sales: roundMad(sales), collected: roundMad(collected) };
}

export async function buildCommissionsDashboard(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  opts?: { sync?: boolean },
): Promise<CommissionsDashboard> {
  if (opts?.sync !== false) {
    await syncCommissionEntries(admin, userId, companyId);
  }

  const [{ data: tierRows }, { data: agentRows }, { data: ruleRows }, { data: entryRows }] =
    await Promise.all([
      admin.from('zafirix_broker_tiers').select('*').eq('company_id', companyId).order('sort_order'),
      admin
        .from('zafirix_sales_agents')
        .select('*, zafirix_broker_tiers(name, code)')
        .eq('company_id', companyId)
        .order('name'),
      admin.from('zafirix_commission_rules').select('*').eq('company_id', companyId).order('priority', { ascending: false }),
      admin
        .from('zafirix_commission_entries')
        .select('*')
        .eq('company_id', companyId)
        .order('calculated_at', { ascending: false })
        .limit(200),
    ]);

  const tiers = (tierRows ?? []).map((r) => rowToTier(r as Record<string, unknown>));
  const agents = (agentRows ?? []).map((r) => {
    const tier = (r as { zafirix_broker_tiers?: { name: string; code: string } }).zafirix_broker_tiers;
    return rowToAgent({
      ...(r as Record<string, unknown>),
      tier_name: tier?.name,
      tier_code: tier?.code,
    });
  });
  const rules = (ruleRows ?? []).map((r) => rowToRule(r as Record<string, unknown>));

  const entries: AtlasCommissionEntry[] = [];
  for (const row of entryRows ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const agent = agents.find((a) => a.id === String(row.agent_id));
    entries.push(
      rowToEntry({
        ...(row as Record<string, unknown>),
        agent_name: agent?.name,
        invoice_number: meta.invoiceNumber,
        client_name: meta.clientName,
      }),
    );
  }

  const performance: AgentPerformance[] = [];
  for (const agent of agents.filter((a) => a.isActive)) {
    const totals = await computeAgentTotals(admin, companyId, agent.id);
    const agentEntries = entries.filter((e) => e.agentId === agent.id);
    performance.push({
      agentId: agent.id,
      agentName: agent.name,
      agentCode: agent.code,
      tierName: agent.tierName ?? null,
      totalSales: totals.sales,
      totalCollected: totals.collected,
      commissionEarned: roundMad(agentEntries.reduce((s, e) => s + e.commissionAmount + e.tierBonus, 0)),
      commissionPending: roundMad(
        agentEntries.filter((e) => e.status === 'pending').reduce((s, e) => s + e.commissionAmount + e.tierBonus, 0),
      ),
      commissionPaid: roundMad(
        agentEntries.filter((e) => e.status === 'paid').reduce((s, e) => s + e.commissionAmount + e.tierBonus, 0),
      ),
      invoiceCount: agentEntries.filter((e) => e.basis === 'invoice_issued').length,
    });
  }

  performance.sort((a, b) => b.commissionEarned - a.commissionEarned);

  const stats = {
    totalPending: roundMad(entries.filter((e) => e.status === 'pending').reduce((s, e) => s + e.commissionAmount + e.tierBonus, 0)),
    totalApproved: roundMad(entries.filter((e) => e.status === 'approved').reduce((s, e) => s + e.commissionAmount + e.tierBonus, 0)),
    totalPaid: roundMad(entries.filter((e) => e.status === 'paid').reduce((s, e) => s + e.commissionAmount + e.tierBonus, 0)),
    activeAgents: agents.filter((a) => a.isActive).length,
    entriesCount: entries.length,
  };

  return { agents, tiers, rules, entries, performance, stats };
}

export async function createSalesAgent(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  input: { name: string; code: string; email?: string; phone?: string; tierId?: string; agentType?: string },
): Promise<AtlasSalesAgent> {
  const { data, error } = await admin
    .from('zafirix_sales_agents')
    .insert({
      user_id: userId,
      company_id: companyId,
      name: input.name,
      code: input.code,
      email: input.email ?? null,
      phone: input.phone ?? null,
      tier_id: input.tierId ?? null,
      agent_type: input.agentType ?? 'sales',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'agent_create_failed');
  return rowToAgent(data as Record<string, unknown>);
}

export async function assignAgentToInvoice(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  invoiceId: string,
  agentId: string,
  splitPct = 100,
): Promise<void> {
  await admin.from('zafirix_invoice_agent_assignments').upsert(
    {
      user_id: userId,
      company_id: companyId,
      invoice_id: invoiceId,
      agent_id: agentId,
      split_pct: splitPct,
    },
    { onConflict: 'invoice_id,agent_id' },
  );
}

export async function updateCommissionEntryStatus(
  admin: SupabaseClient,
  userId: string,
  entryId: string,
  status: 'approved' | 'paid' | 'cancelled',
): Promise<boolean> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'paid') patch.paid_at = new Date().toISOString();

  const { error } = await admin
    .from('zafirix_commission_entries')
    .update(patch)
    .eq('id', entryId)
    .eq('user_id', userId);

  return !error;
}
