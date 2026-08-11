-- Zafirixpro: company-scoped subscriptions + monthly usage meters + pay-as-you-go add-ons.
-- Plans: INDEPENDANT | PERSONNE_PHYSIQUE | PME | ULTIMATE

create table if not exists public.zafirix_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null
    check (plan_code in ('INDEPENDANT', 'PERSONNE_PHYSIQUE', 'PME', 'ULTIMATE')),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'suspended', 'cancelled', 'expired')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'yearly')),
  started_at timestamptz not null default now(),
  current_period_start date not null default (date_trunc('month', now())::date),
  current_period_end date not null default ((date_trunc('month', now()) + interval '1 month')::date),
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists zafirix_subscriptions_active_company_uidx
  on public.zafirix_subscriptions (company_id)
  where status in ('trial', 'active');

create index if not exists zafirix_subscriptions_owner_idx
  on public.zafirix_subscriptions (owner_user_id);

create index if not exists zafirix_subscriptions_plan_idx
  on public.zafirix_subscriptions (plan_code, status);

create table if not exists public.zafirix_usage_meters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  period_ym text not null check (period_ym ~ '^\d{4}-\d{2}$'),
  meter_code text not null
    check (meter_code in ('invoices', 'shipments', 'ai_requests', 'documents', 'ocr')),
  used_qty integer not null default 0 check (used_qty >= 0),
  included_limit integer, -- null = unlimited
  addon_bonus_qty integer not null default 0 check (addon_bonus_qty >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, period_ym, meter_code)
);

create index if not exists zafirix_usage_meters_company_period_idx
  on public.zafirix_usage_meters (company_id, period_ym);

create table if not exists public.zafirix_addon_packs (
  code text primary key,
  name_fr text not null,
  description_fr text not null default '',
  meter_code text not null
    check (meter_code in ('invoices', 'shipments', 'ai_requests', 'documents', 'ocr')),
  quantity integer not null check (quantity > 0),
  price_mad numeric(12, 2) not null check (price_mad >= 0),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.zafirix_addon_purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.atlas_companies (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  pack_code text not null references public.zafirix_addon_packs (code) on delete restrict,
  period_ym text not null,
  quantity_granted integer not null check (quantity_granted > 0),
  price_mad numeric(12, 2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'expired')),
  payment_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index if not exists zafirix_addon_purchases_company_idx
  on public.zafirix_addon_purchases (company_id, period_ym, status);

-- Plan limit catalog (null = unlimited)
create table if not exists public.zafirix_plan_limits (
  plan_code text not null
    check (plan_code in ('INDEPENDANT', 'PERSONNE_PHYSIQUE', 'PME', 'ULTIMATE')),
  meter_code text not null
    check (meter_code in ('invoices', 'shipments', 'ai_requests', 'documents', 'ocr')),
  limit_value integer,
  primary key (plan_code, meter_code)
);

insert into public.zafirix_plan_limits (plan_code, meter_code, limit_value) values
  ('INDEPENDANT', 'invoices', 40),
  ('INDEPENDANT', 'shipments', 25),
  ('INDEPENDANT', 'ai_requests', 80),
  ('INDEPENDANT', 'documents', 200),
  ('INDEPENDANT', 'ocr', 80),
  ('PERSONNE_PHYSIQUE', 'invoices', 60),
  ('PERSONNE_PHYSIQUE', 'shipments', 15),
  ('PERSONNE_PHYSIQUE', 'ai_requests', 120),
  ('PERSONNE_PHYSIQUE', 'documents', 300),
  ('PERSONNE_PHYSIQUE', 'ocr', 100),
  ('PME', 'invoices', 500),
  ('PME', 'shipments', 250),
  ('PME', 'ai_requests', 1500),
  ('PME', 'documents', 5000),
  ('PME', 'ocr', 2000),
  ('ULTIMATE', 'invoices', null),
  ('ULTIMATE', 'shipments', null),
  ('ULTIMATE', 'ai_requests', null),
  ('ULTIMATE', 'documents', null),
  ('ULTIMATE', 'ocr', null)
on conflict (plan_code, meter_code) do update set limit_value = excluded.limit_value;

insert into public.zafirix_addon_packs (code, name_fr, description_fr, meter_code, quantity, price_mad, sort_order) values
  ('invoice_pack_50', 'Pack factures +50', '50 factures supplémentaires pour le mois en cours.', 'invoices', 50, 99, 10),
  ('invoice_pack_200', 'Pack factures +200', '200 factures supplémentaires pour le mois en cours.', 'invoices', 200, 299, 20),
  ('shipment_pack_25', 'Pack expéditions +25', '25 BL / envois supplémentaires ce mois-ci.', 'shipments', 25, 149, 30),
  ('shipment_pack_100', 'Pack expéditions +100', '100 BL / envois supplémentaires ce mois-ci.', 'shipments', 100, 449, 40),
  ('ai_pack_100', 'Pack IA +100', '100 requêtes IA supplémentaires ce mois-ci.', 'ai_requests', 100, 79, 50),
  ('ai_pack_500', 'Pack IA +500', '500 requêtes IA supplémentaires ce mois-ci.', 'ai_requests', 500, 249, 60)
on conflict (code) do update set
  name_fr = excluded.name_fr,
  description_fr = excluded.description_fr,
  meter_code = excluded.meter_code,
  quantity = excluded.quantity,
  price_mad = excluded.price_mad,
  active = true,
  sort_order = excluded.sort_order;

-- Helpers
create or replace function public.zafirix_current_period_ym()
returns text
language sql
stable
as $$
  select to_char(timezone('utc', now()), 'YYYY-MM');
$$;

create or replace function public.zafirix_plan_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'INDEPENDANT' then 'Indépendant'
    when 'PERSONNE_PHYSIQUE' then 'Personne Physique'
    when 'PME' then 'PME'
    when 'ULTIMATE' then 'Ultimate'
    else coalesce(p_code, 'Indépendant')
  end;
$$;

create or replace function public.zafirix_ensure_subscription(p_company_id uuid, p_user_id uuid)
returns public.zafirix_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.zafirix_subscriptions;
  v_owner uuid;
begin
  if p_company_id is null or p_user_id is null then
    raise exception 'company_and_user_required';
  end if;

  select user_id into v_owner from public.atlas_companies where id = p_company_id;
  if v_owner is null then
    raise exception 'company_not_found';
  end if;
  if v_owner <> p_user_id then
    -- allow if caller owns company; service role passes owner id
    null;
  end if;

  select * into v_sub
  from public.zafirix_subscriptions
  where company_id = p_company_id
    and status in ('trial', 'active')
  order by created_at desc
  limit 1;

  if found then
    return v_sub;
  end if;

  insert into public.zafirix_subscriptions (
    company_id, owner_user_id, plan_code, status, trial_ends_at
  ) values (
    p_company_id,
    coalesce(v_owner, p_user_id),
    'INDEPENDANT',
    'trial',
    now() + interval '14 days'
  )
  returning * into v_sub;

  return v_sub;
end;
$$;

create or replace function public.zafirix_ensure_meter_row(
  p_company_id uuid,
  p_meter text,
  p_period_ym text default null
)
returns public.zafirix_usage_meters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := coalesce(p_period_ym, public.zafirix_current_period_ym());
  v_sub public.zafirix_subscriptions;
  v_limit integer;
  v_row public.zafirix_usage_meters;
  v_owner uuid;
begin
  select user_id into v_owner from public.atlas_companies where id = p_company_id;
  if v_owner is null then
    raise exception 'company_not_found';
  end if;

  v_sub := public.zafirix_ensure_subscription(p_company_id, v_owner);

  select limit_value into v_limit
  from public.zafirix_plan_limits
  where plan_code = v_sub.plan_code
    and meter_code = p_meter;

  insert into public.zafirix_usage_meters (
    company_id, period_ym, meter_code, used_qty, included_limit, addon_bonus_qty
  ) values (
    p_company_id, v_period, p_meter, 0, v_limit, 0
  )
  on conflict (company_id, period_ym, meter_code) do update
    set included_limit = coalesce(public.zafirix_usage_meters.included_limit, excluded.included_limit),
        updated_at = now()
  returning * into v_row;

  -- Refresh addon bonus from active purchases this period
  update public.zafirix_usage_meters m
  set addon_bonus_qty = coalesce((
        select sum(p.quantity_granted)::integer
        from public.zafirix_addon_purchases p
        where p.company_id = p_company_id
          and p.period_ym = v_period
          and p.status = 'active'
          and p.pack_code in (
            select code from public.zafirix_addon_packs where meter_code = p_meter
          )
      ), 0),
      updated_at = now()
  where m.id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.zafirix_check_usage(
  p_company_id uuid,
  p_meter text,
  p_qty integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.zafirix_usage_meters;
  v_sub public.zafirix_subscriptions;
  v_owner uuid;
  v_effective integer;
  v_remaining integer;
  v_allowed boolean;
begin
  if coalesce(p_qty, 0) < 1 then
    p_qty := 1;
  end if;

  select user_id into v_owner from public.atlas_companies where id = p_company_id;
  if v_owner is null then
    return jsonb_build_object('allowed', false, 'code', 'company_not_found');
  end if;

  v_sub := public.zafirix_ensure_subscription(p_company_id, v_owner);

  if v_sub.status = 'trial' and v_sub.trial_ends_at is not null and v_sub.trial_ends_at < now() then
    return jsonb_build_object(
      'allowed', false,
      'code', 'trial_expired',
      'plan_code', v_sub.plan_code,
      'message_fr', 'Votre essai a expiré. Passez à une offre supérieure ou achetez un pack.'
    );
  end if;

  v_row := public.zafirix_ensure_meter_row(p_company_id, p_meter);

  if v_row.included_limit is null then
    return jsonb_build_object(
      'allowed', true,
      'unlimited', true,
      'used', v_row.used_qty,
      'limit', null,
      'addon_bonus', v_row.addon_bonus_qty,
      'remaining', null,
      'plan_code', v_sub.plan_code,
      'period_ym', v_row.period_ym
    );
  end if;

  v_effective := v_row.included_limit + coalesce(v_row.addon_bonus_qty, 0);
  v_remaining := greatest(0, v_effective - v_row.used_qty);
  v_allowed := v_remaining >= p_qty;

  return jsonb_build_object(
    'allowed', v_allowed,
    'unlimited', false,
    'used', v_row.used_qty,
    'limit', v_effective,
    'included_limit', v_row.included_limit,
    'addon_bonus', v_row.addon_bonus_qty,
    'remaining', v_remaining,
    'plan_code', v_sub.plan_code,
    'period_ym', v_row.period_ym,
    'code', case when v_allowed then 'ok' else 'quota_exceeded' end,
    'message_fr', case
      when v_allowed then null
      else format(
        'Quota %s atteint (%s/%s). Achetez un pack ou passez à un forfait supérieur.',
        p_meter, v_row.used_qty, v_effective
      )
    end
  );
end;
$$;

create or replace function public.zafirix_consume_usage(
  p_company_id uuid,
  p_meter text,
  p_qty integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb;
  v_row public.zafirix_usage_meters;
begin
  v_check := public.zafirix_check_usage(p_company_id, p_meter, p_qty);
  if not coalesce((v_check->>'allowed')::boolean, false) then
    return v_check;
  end if;

  update public.zafirix_usage_meters
  set used_qty = used_qty + greatest(p_qty, 1),
      updated_at = now()
  where company_id = p_company_id
    and period_ym = public.zafirix_current_period_ym()
    and meter_code = p_meter
  returning * into v_row;

  return jsonb_build_object(
    'allowed', true,
    'ok', true,
    'used', v_row.used_qty,
    'limit', case
      when v_row.included_limit is null then null
      else v_row.included_limit + coalesce(v_row.addon_bonus_qty, 0)
    end,
    'remaining', case
      when v_row.included_limit is null then null
      else greatest(0, v_row.included_limit + coalesce(v_row.addon_bonus_qty, 0) - v_row.used_qty)
    end,
    'plan_code', v_check->>'plan_code',
    'period_ym', v_row.period_ym,
    'code', 'ok'
  );
end;
$$;

create or replace function public.zafirix_activate_addon_purchase(p_purchase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.zafirix_addon_purchases;
  v_pack public.zafirix_addon_packs;
  v_meter public.zafirix_usage_meters;
begin
  select * into v_p from public.zafirix_addon_purchases where id = p_purchase_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_p.status = 'active' then
    return jsonb_build_object('ok', true, 'code', 'already_active');
  end if;

  select * into v_pack from public.zafirix_addon_packs where code = v_p.pack_code;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'pack_not_found');
  end if;

  update public.zafirix_addon_purchases
  set status = 'active', activated_at = now()
  where id = p_purchase_id;

  -- ensure_meter_row recomputes addon_bonus_qty from active purchases (source of truth).
  v_meter := public.zafirix_ensure_meter_row(v_p.company_id, v_pack.meter_code, v_p.period_ym);

  return jsonb_build_object(
    'ok', true,
    'code', 'activated',
    'meter', v_pack.meter_code,
    'bonus', v_p.quantity_granted,
    'addon_bonus_total', v_meter.addon_bonus_qty
  );
end;
$$;

-- Soft guard triggers (raise on hard overage). Service role inserts still go through these.
create or replace function public.zafirix_trg_guard_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if TG_OP = 'INSERT' and NEW.company_id is not null then
    v := public.zafirix_consume_usage(NEW.company_id, 'invoices', 1);
    if not coalesce((v->>'allowed')::boolean, false) then
      raise exception 'zafirix_quota_exceeded: %', coalesce(v->>'message_fr', 'Quota factures atteint');
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists zafirix_guard_invoice_bi on public.atlas_invoices;
create trigger zafirix_guard_invoice_bi
  before insert on public.atlas_invoices
  for each row execute function public.zafirix_trg_guard_invoice();

create or replace function public.zafirix_trg_guard_shipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if TG_OP = 'INSERT' and NEW.company_id is not null then
    v := public.zafirix_consume_usage(NEW.company_id, 'shipments', 1);
    if not coalesce((v->>'allowed')::boolean, false) then
      raise exception 'zafirix_quota_exceeded: %', coalesce(v->>'message_fr', 'Quota expéditions atteint');
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists zafirix_guard_shipment_bi on public.zafirix_deliveries;
do $$
begin
  if to_regclass('public.zafirix_deliveries') is not null then
    execute $t$
      create trigger zafirix_guard_shipment_bi
        before insert on public.zafirix_deliveries
        for each row execute function public.zafirix_trg_guard_shipment()
    $t$;
  end if;
end $$;

-- RLS
alter table public.zafirix_subscriptions enable row level security;
alter table public.zafirix_usage_meters enable row level security;
alter table public.zafirix_addon_packs enable row level security;
alter table public.zafirix_addon_purchases enable row level security;
alter table public.zafirix_plan_limits enable row level security;

drop policy if exists zafirix_subscriptions_owner_select on public.zafirix_subscriptions;
create policy zafirix_subscriptions_owner_select on public.zafirix_subscriptions
  for select using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from public.atlas_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

drop policy if exists zafirix_usage_meters_owner_select on public.zafirix_usage_meters;
create policy zafirix_usage_meters_owner_select on public.zafirix_usage_meters
  for select using (
    exists (
      select 1 from public.atlas_companies c
      where c.id = company_id and c.user_id = auth.uid()
    )
  );

drop policy if exists zafirix_addon_packs_read on public.zafirix_addon_packs;
create policy zafirix_addon_packs_read on public.zafirix_addon_packs
  for select using (auth.uid() is not null and active = true);

drop policy if exists zafirix_plan_limits_read on public.zafirix_plan_limits;
create policy zafirix_plan_limits_read on public.zafirix_plan_limits
  for select using (auth.uid() is not null);

drop policy if exists zafirix_addon_purchases_owner on public.zafirix_addon_purchases;
create policy zafirix_addon_purchases_owner on public.zafirix_addon_purchases
  for all using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

grant select on public.zafirix_subscriptions to authenticated;
grant select on public.zafirix_usage_meters to authenticated;
grant select on public.zafirix_addon_packs to authenticated;
grant select on public.zafirix_plan_limits to authenticated;
grant select, insert on public.zafirix_addon_purchases to authenticated;

grant execute on function public.zafirix_ensure_subscription(uuid, uuid) to authenticated, service_role;
grant execute on function public.zafirix_ensure_meter_row(uuid, text, text) to authenticated, service_role;
grant execute on function public.zafirix_check_usage(uuid, text, integer) to authenticated, service_role;
grant execute on function public.zafirix_consume_usage(uuid, text, integer) to authenticated, service_role;
grant execute on function public.zafirix_activate_addon_purchase(uuid) to service_role;
grant execute on function public.zafirix_current_period_ym() to authenticated, service_role;
grant execute on function public.zafirix_plan_label(text) to authenticated, service_role;
