-- Admin-granted plan / quota overrides.
-- Lets platform admins grant complimentary access, extend trials, or assign
-- paid tiers without the expired-trial gate blocking document AI / OCR.

-- ---------------------------------------------------------------------------
-- Workspace subscriptions
-- ---------------------------------------------------------------------------
alter table public.atlas_workspace_subscriptions
  add column if not exists admin_override boolean not null default false;

alter table public.atlas_workspace_subscriptions
  add column if not exists admin_override_until timestamptz;

alter table public.atlas_workspace_subscriptions
  add column if not exists admin_override_note text;

alter table public.atlas_workspace_subscriptions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_workspace_subscriptions_admin_override
  on public.atlas_workspace_subscriptions (admin_override)
  where admin_override = true;

-- ---------------------------------------------------------------------------
-- Company (Zafirix) subscriptions
-- ---------------------------------------------------------------------------
alter table public.zafirix_subscriptions
  add column if not exists admin_override boolean not null default false;

alter table public.zafirix_subscriptions
  add column if not exists admin_override_until timestamptz;

alter table public.zafirix_subscriptions
  add column if not exists admin_override_note text;

create index if not exists idx_zafirix_subscriptions_admin_override
  on public.zafirix_subscriptions (admin_override)
  where admin_override = true;

-- Denormalized flag on profiles for admin list + fast entitlement checks.
alter table public.profiles
  add column if not exists admin_entitlement_override boolean not null default false;

-- ---------------------------------------------------------------------------
-- Skip expired-trial blocks when an admin override (or paid profile plan)
-- is in effect. zafirix_consume_usage calls this function.
-- ---------------------------------------------------------------------------
create or replace function public.zafirix_subscription_skips_trial_expiry(p_sub public.zafirix_subscriptions)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_until timestamptz;
  v_plan text;
  v_status text;
begin
  if p_sub.status = 'active' then
    return true;
  end if;

  if coalesce(p_sub.admin_override, false)
     or coalesce((p_sub.metadata->>'admin_override')::boolean, false) then
    v_until := p_sub.admin_override_until;
    if v_until is null and (p_sub.metadata->>'admin_override_until') is not null then
      begin
        v_until := (p_sub.metadata->>'admin_override_until')::timestamptz;
      exception when others then
        v_until := null;
      end;
    end if;
    if v_until is null or v_until > now() then
      return true;
    end if;
  end if;

  select lower(coalesce(plan, 'free')), lower(coalesce(status, 'active'))
    into v_plan, v_status
    from public.profiles
    where id = p_sub.owner_user_id;

  if coalesce(v_status, 'active') not in ('suspended', 'banned')
     and (
       v_plan in ('pro', 'vip', 'enterprise')
       or exists (
         select 1
         from public.profiles p
         where p.id = p_sub.owner_user_id
           and coalesce(p.admin_entitlement_override, false) = true
       )
     ) then
    return true;
  end if;

  return false;
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

  if v_sub.status = 'trial'
     and v_sub.trial_ends_at is not null
     and v_sub.trial_ends_at < now()
     and not public.zafirix_subscription_skips_trial_expiry(v_sub) then
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
