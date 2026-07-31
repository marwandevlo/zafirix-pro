/**
 * Purge transactional data for a company while keeping the atlas_companies profile row.
 */

import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { requireOwnedCompany } from '@/app/lib/atlas-entity-ownership';
import { logAtlasServerEvent } from '@/app/lib/atlas-server-log';
import { requireSupabaseUser } from '@/app/lib/atlas-supabase-guard';
import { supabase } from '@/app/lib/supabase';

/** Core tables cleared by company_id (+ user_id when supported). Order: dependents first. */
const CORE_COMPANY_TABLES = [
  'atlas_payments',
  'atlas_invoices',
  'atlas_supplier_invoices',
  'atlas_accounting_entries',
  'atlas_documents',
  'atlas_clients',
  'atlas_employees',
  'atlas_projects',
  'atlas_links',
  'atlas_tva_periods',
  'zafirix_tva_suggestions',
  'atlas_entity_events',
] as const;

/** Optional enterprise modules — skipped silently if table missing. */
const OPTIONAL_COMPANY_TABLES = [
  'zafirix_bank_transactions',
  'zafirix_delivery_orders',
  'zafirix_inventory_movements',
  'zafirix_petty_cash_vouchers',
  'zafirix_petty_cash_funds',
  'zafirix_commission_entries',
  'zafirix_fixed_assets',
  'zafirix_hr_contracts',
  'zafirix_correspondence',
  'zafirix_notification_queue',
  'zafirix_tax_whatif_scenarios',
  'zafirix_client_feedback_requests',
  'zafirix_debt_collection_cases',
] as const;

async function deleteCompanyRows(
  table: string,
  companyId: string,
  userId: string,
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  let { error } = await supabase
    .from(table)
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', userId);

  if (error?.message?.includes('column') && error.message.includes('user_id')) {
    ({ error } = await supabase.from(table).delete().eq('company_id', companyId));
  }

  if (error) {
    if (
      error.message.includes('does not exist') ||
      error.message.includes('Could not find the table') ||
      error.code === '42P01'
    ) {
      return { ok: true, skipped: true };
    }
    return { ok: false, error: `${table}: ${error.message}` };
  }

  return { ok: true };
}

async function resetCompanyBalance(companyId: string, userId: string): Promise<void> {
  const { data } = await supabase
    .from('atlas_companies')
    .select('company_json')
    .eq('id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  const existing =
    data?.company_json && typeof data.company_json === 'object'
      ? (data.company_json as Record<string, unknown>)
      : {};

  await supabase
    .from('atlas_companies')
    .update({
      company_json: { ...existing, balance: 0 },
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId)
    .eq('user_id', userId);
}

export async function clearAtlasCompanyDataServer(
  companyId: string,
): Promise<{ ok: true; clearedTables: string[] } | { ok: false; error: string }> {
  if (!isAtlasSupabaseDataEnabled()) {
    return { ok: false, error: 'supabase_required' };
  }

  const auth = await requireSupabaseUser();
  if (!auth.ok) return { ok: false, error: 'auth_required' };

  const owned = await requireOwnedCompany(companyId);
  if (!owned.ok) return { ok: false, error: owned.error };

  const clearedTables: string[] = [];

  for (const table of CORE_COMPANY_TABLES) {
    const result = await deleteCompanyRows(table, companyId, auth.userId);
    if (!result.ok) {
      logAtlasServerEvent('atlas_companies', 'error', 'clear_data_failed', {
        companyId,
        table,
        message: result.error,
      });
      return { ok: false, error: result.error };
    }
    if (!result.skipped) clearedTables.push(table);
  }

  for (const table of OPTIONAL_COMPANY_TABLES) {
    const result = await deleteCompanyRows(table, companyId, auth.userId);
    if (result.ok && !result.skipped) clearedTables.push(table);
  }

  await resetCompanyBalance(companyId, auth.userId);

  logAtlasServerEvent('atlas_companies', 'info', 'company_data_cleared', {
    companyId,
    tables: clearedTables.length,
  });

  return { ok: true, clearedTables };
}
