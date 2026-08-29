-- Affiliate earnings dashboard: pending vs paid-out, commission tiers, plan rates.
-- Safe to re-run.

alter table public.atlas_affiliate_balances
  add column if not exists pending_balance numeric(14, 2) not null default 0,
  add column if not exists paid_out numeric(14, 2) not null default 0;

update public.atlas_affiliate_balances
set
  pending_balance = available_balance,
  paid_out = greatest(0, lifetime_earned - available_balance)
where pending_balance = 0 and paid_out = 0;

alter table public.atlas_affiliate_transactions
  add column if not exists commission_tier text;

alter table public.atlas_affiliate_transactions
  drop constraint if exists atlas_affiliate_transactions_status_check;

alter table public.atlas_affiliate_transactions
  add constraint atlas_affiliate_transactions_status_check
  check (status in ('pending', 'credited', 'paid', 'reversed'));

create table if not exists public.atlas_affiliate_tier_config (
  id text not null primary key,
  min_activated integer not null,
  percent numeric(6, 2) not null,
  label_fr text not null,
  label_ar text not null,
  hint_fr text not null default '',
  hint_ar text not null default '',
  sort_order integer not null default 0,
  constraint atlas_affiliate_tier_config_percent_check check (percent >= 0 and percent <= 100),
  constraint atlas_affiliate_tier_config_min_check check (min_activated >= 0)
);

insert into public.atlas_affiliate_tier_config
  (id, min_activated, percent, label_fr, label_ar, hint_fr, hint_ar, sort_order)
values
  ('starter', 0, 20, 'Starter', 'مبتدئ', '0 à 2 filleuls activés', '0–2 إحالات مفعّلة', 10),
  ('bronze', 3, 25, 'Bronze', 'برونزي', '3 à 4 filleuls activés', '3–4 إحالات مفعّلة', 20),
  ('silver', 5, 30, 'Argent', 'فضي', '5 à 9 filleuls activés', '5–9 إحالات مفعّلة', 30),
  ('gold', 10, 35, 'Or', 'ذهبي', '10 à 19 filleuls activés', '10–19 إحالة مفعّلة', 40),
  ('platinum', 20, 40, 'Platine', 'بلاتيني', '20 filleuls activés et plus', '20 إحالة مفعّلة فأكثر', 50)
on conflict (id) do nothing;

create table if not exists public.atlas_affiliate_plan_rates (
  plan_id text not null primary key,
  percent numeric(6, 2) not null,
  constraint atlas_affiliate_plan_rates_percent_check check (percent >= 0 and percent <= 100)
);

insert into public.atlas_affiliate_plan_rates (plan_id, percent)
values
  ('starter', 20),
  ('growth', 25),
  ('pro', 30),
  ('business', 35),
  ('advanced', 40),
  ('enterprise', 40)
on conflict (plan_id) do nothing;

alter table public.atlas_affiliate_tier_config enable row level security;
alter table public.atlas_affiliate_plan_rates enable row level security;

create or replace function public.atlas_credit_affiliate_commission(
  p_referrer uuid,
  p_referred uuid,
  p_referral_id uuid,
  p_source text,
  p_source_ref text,
  p_amount numeric,
  p_percent numeric,
  p_commission numeric,
  p_currency text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (credited boolean, transaction_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
  tier_id text;
begin
  tier_id := nullif(trim(coalesce(p_metadata->>'commission_tier', '')), '');

  insert into public.atlas_affiliate_transactions (
    referrer_user_id,
    referred_user_id,
    referral_id,
    source,
    source_ref,
    payment_amount,
    commission_percent,
    commission_amount,
    currency,
    status,
    metadata,
    commission_tier
  )
  values (
    p_referrer,
    p_referred,
    p_referral_id,
    p_source,
    p_source_ref,
    p_amount,
    p_percent,
    p_commission,
    coalesce(nullif(p_currency, ''), 'MAD'),
    'pending',
    coalesce(p_metadata, '{}'::jsonb),
    tier_id
  )
  on conflict (source, source_ref) do nothing
  returning id into tid;

  if tid is null then
    return query select false, null::uuid;
    return;
  end if;

  insert into public.atlas_affiliate_balances (
    user_id, lifetime_earned, available_balance, pending_balance, paid_out, currency, updated_at
  )
  values (
    p_referrer,
    p_commission,
    p_commission,
    p_commission,
    0,
    coalesce(nullif(p_currency, ''), 'MAD'),
    now()
  )
  on conflict (user_id) do update set
    lifetime_earned = public.atlas_affiliate_balances.lifetime_earned + excluded.lifetime_earned,
    available_balance = public.atlas_affiliate_balances.available_balance + excluded.available_balance,
    pending_balance = public.atlas_affiliate_balances.pending_balance + excluded.pending_balance,
    updated_at = now();

  update public.atlas_referrals
  set
    commission_granted_at = coalesce(commission_granted_at, now()),
    commission_amount = coalesce(commission_amount, 0) + p_commission,
    updated_at = now()
  where id = p_referral_id;

  return query select true, tid;
end;
$$;

revoke all on function public.atlas_credit_affiliate_commission(
  uuid, uuid, uuid, text, text, numeric, numeric, numeric, text, jsonb
) from public, anon, authenticated;
