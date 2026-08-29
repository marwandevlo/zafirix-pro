-- Affiliate cash commissions credited when a referred user pays (Paddle or manual).
-- Service-role only (no authenticated policies). Safe to re-run.

create table if not exists public.atlas_affiliate_balances (
  user_id uuid not null primary key references auth.users (id) on delete cascade,
  lifetime_earned numeric(14, 2) not null default 0,
  available_balance numeric(14, 2) not null default 0,
  currency text not null default 'MAD',
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_affiliate_transactions (
  id uuid not null default gen_random_uuid() primary key,
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  referred_user_id uuid references auth.users (id) on delete set null,
  referral_id uuid references public.atlas_referrals (id) on delete set null,
  source text not null,
  source_ref text not null,
  payment_amount numeric(14, 2) not null,
  commission_percent numeric(6, 2) not null,
  commission_amount numeric(14, 2) not null,
  currency text not null default 'MAD',
  status text not null default 'credited',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint atlas_affiliate_transactions_source_check check (source in ('paddle', 'manual')),
  constraint atlas_affiliate_transactions_status_check check (status in ('credited', 'reversed'))
);

create unique index if not exists atlas_affiliate_transactions_source_ref_key
  on public.atlas_affiliate_transactions (source, source_ref);

create index if not exists atlas_affiliate_transactions_referrer_idx
  on public.atlas_affiliate_transactions (referrer_user_id, created_at desc);

alter table public.atlas_referrals
  add column if not exists commission_granted_at timestamptz,
  add column if not exists commission_amount numeric(14, 2);

alter table public.atlas_affiliate_balances enable row level security;
alter table public.atlas_affiliate_transactions enable row level security;

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
begin
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
    metadata
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
    'credited',
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source, source_ref) do nothing
  returning id into tid;

  if tid is null then
    return query select false, null::uuid;
    return;
  end if;

  insert into public.atlas_affiliate_balances (user_id, lifetime_earned, available_balance, currency, updated_at)
  values (
    p_referrer,
    p_commission,
    p_commission,
    coalesce(nullif(p_currency, ''), 'MAD'),
    now()
  )
  on conflict (user_id) do update set
    lifetime_earned = public.atlas_affiliate_balances.lifetime_earned + excluded.lifetime_earned,
    available_balance = public.atlas_affiliate_balances.available_balance + excluded.available_balance,
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
