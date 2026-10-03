import type { SupabaseClient, User } from '@supabase/supabase-js';
import { placeholderCompanyName } from '@/app/lib/atlas-activation';

function metaString(meta: Record<string, unknown> | undefined, key: string): string {
  const value = meta?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Email confirmation does not run the browser signup insert.
 * Create the same placeholder company and mark it active when the user has none.
 */
export async function ensureSignupPlaceholderCompany(
  admin: SupabaseClient,
  user: User,
): Promise<{ created: boolean }> {
  const { data, error } = await admin
    .from('atlas_companies')
    .select('id, is_active')
    .eq('user_id', user.id);

  if (error) {
    console.warn('[auth/callback] company lookup failed', error.message);
    return { created: false };
  }

  const rows = data ?? [];
  const active = rows.find((row) => row.is_active);
  if (active?.id) return { created: false };

  if (rows.length > 0 && rows[0]?.id) {
    const targetId = String(rows[0].id);
    const now = new Date().toISOString();
    const { error: offError } = await admin
      .from('atlas_companies')
      .update({ is_active: false, updated_at: now })
      .eq('user_id', user.id);
    if (offError) {
      console.warn('[auth/callback] deactivate companies failed', offError.message);
      return { created: false };
    }
    const { error: onError } = await admin
      .from('atlas_companies')
      .update({ is_active: true, updated_at: now })
      .eq('id', targetId)
      .eq('user_id', user.id);
    if (onError) console.warn('[auth/callback] activate company failed', onError.message);
    return { created: false };
  }

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = metaString(meta, 'full_name') || metaString(meta, 'name');
  const name = placeholderCompanyName(fullName, metaString(meta, 'company_name'));
  const legalForm = metaString(meta, 'company_type').slice(0, 40) || 'SARL';
  const ice = metaString(meta, 'ice');
  const city = metaString(meta, 'city');
  const phone = metaString(meta, 'phone');
  const email = user.email?.trim() ?? '';
  const now = new Date().toISOString();

  const { error: insertError } = await admin.from('atlas_companies').insert({
    user_id: user.id,
    name,
    legal_form: legalForm,
    legal_name: name,
    trade_name: name,
    ice: ice || null,
    if_fiscal: null,
    rc: null,
    address: null,
    city: city || null,
    country: 'MA',
    phone: phone || null,
    email: email || null,
    status: 'active',
    is_active: true,
    company_json: {
      raisonSociale: name,
      formeJuridique: legalForm,
      if_fiscal: '',
      ice,
      rc: '',
      cnss: '',
      adresse: '',
      ville: city,
      telephone: phone,
      email,
      activite: '',
      regimeTVA: 'mensuel',
      actif: true,
      balance: 0,
      paymentTerms: { kind: 'preset', days: 30 },
    },
    updated_at: now,
  });

  if (insertError) {
    console.warn('[auth/callback] placeholder company insert failed', insertError.message);
    return { created: false };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('company_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!String(profile?.company_name ?? '').trim()) {
    const { error: profileError } = await admin
      .from('profiles')
      .update({ company_name: name, updated_at: now })
      .eq('id', user.id);
    if (profileError) console.warn('[auth/callback] profile company_name update failed', profileError.message);
  }

  return { created: true };
}
