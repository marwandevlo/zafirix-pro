-- Freemium monthly counters + Free vs Pro plan limits.
-- Free: 15 invoices/quotes, 30 COD/shipments, 5 AI OCR scans, 1 team member.

create table if not exists public.atlas_workspace_usage_cycles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces (id) on delete cascade,
  period_ym text not null check (period_ym ~ '^\d{4}-\d{2}$'),
  current_month_invoices integer not null default 0 check (current_month_invoices >= 0),
  current_month_cod integer not null default 0 check (current_month_cod >= 0),
  current_month_ai_scans integer not null default 0 check (current_month_ai_scans >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, period_ym)
);

create index if not exists atlas_workspace_usage_cycles_ws_idx
  on public.atlas_workspace_usage_cycles (workspace_id, period_ym desc);

alter table public.atlas_workspace_usage_cycles enable row level security;

drop policy if exists atlas_workspace_usage_cycles_owner_select on public.atlas_workspace_usage_cycles;
create policy atlas_workspace_usage_cycles_owner_select
  on public.atlas_workspace_usage_cycles
  for select
  using (
    exists (
      select 1 from public.atlas_workspaces w
      where w.id = workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

grant select on public.atlas_workspace_usage_cycles to authenticated;

-- Workspace plan snapshot (free vs pro) for org-level reads.
alter table public.atlas_workspaces
  add column if not exists subscription_plan text not null default 'free';

update public.atlas_workspaces w
set subscription_plan = case
  when exists (
    select 1
    from public.atlas_workspace_subscriptions s
    join public.atlas_subscription_plans p on p.id = s.plan_id
    where s.workspace_id = w.id
      and s.status in ('trial', 'active')
      and p.code <> 'FREE'
  ) then 'pro'
  else 'free'
end;

-- Catalog: Free limits requested for the freemium model.
insert into public.atlas_plan_features (plan_id, feature_code, limit_value)
select p.id, f.feature_code, f.limit_value
from public.atlas_subscription_plans p
inner join (
  values
    ('FREE', 'invoices_quotes_per_month', 15),
    ('FREE', 'cod_shipments_per_month', 30),
    ('FREE', 'ocr_limit', 5),
    ('FREE', 'users_limit', 1),
    ('STARTER', 'invoices_quotes_per_month', null),
    ('STARTER', 'cod_shipments_per_month', null),
    ('PRO', 'invoices_quotes_per_month', null),
    ('PRO', 'cod_shipments_per_month', null),
    ('PRO', 'ocr_limit', null),
    ('CABINET', 'invoices_quotes_per_month', null),
    ('CABINET', 'cod_shipments_per_month', null),
    ('ENTERPRISE', 'invoices_quotes_per_month', null),
    ('ENTERPRISE', 'cod_shipments_per_month', null)
) as f(plan_code, feature_code, limit_value) on p.code = f.plan_code
on conflict (plan_id, feature_code) do update set limit_value = excluded.limit_value;

update public.atlas_plan_features pf
set limit_value = 5
from public.atlas_subscription_plans p
where pf.plan_id = p.id
  and p.code = 'FREE'
  and pf.feature_code = 'ocr_limit';

update public.atlas_plan_features pf
set limit_value = 1
from public.atlas_subscription_plans p
where pf.plan_id = p.id
  and p.code = 'FREE'
  and pf.feature_code = 'users_limit';

create or replace function public.atlas_freemium_current_period_ym()
returns text
language sql
stable
as $$
  select to_char(timezone('utc', now()), 'YYYY-MM');
$$;

create or replace function public.atlas_freemium_ensure_cycle(p_workspace_id uuid)
returns public.atlas_workspace_usage_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := public.atlas_freemium_current_period_ym();
  v_row public.atlas_workspace_usage_cycles;
begin
  insert into public.atlas_workspace_usage_cycles (workspace_id, period_ym)
  values (p_workspace_id, v_period)
  on conflict (workspace_id, period_ym) do update
    set updated_at = public.atlas_workspace_usage_cycles.updated_at
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.atlas_freemium_check(
  p_workspace_id uuid,
  p_meter text,
  p_qty integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.atlas_workspace_usage_cycles;
  v_plan text := 'FREE';
  v_paid boolean := false;
  v_used integer := 0;
  v_limit integer := null;
  v_qty integer := greatest(coalesce(p_qty, 1), 1);
begin
  if p_workspace_id is null then
    return jsonb_build_object('allowed', false, 'code', 'workspace_required');
  end if;

  select p.code into v_plan
  from public.atlas_workspace_subscriptions s
  join public.atlas_subscription_plans p on p.id = s.plan_id
  where s.workspace_id = p_workspace_id
    and s.status in ('trial', 'active')
  order by case when s.status = 'active' then 0 else 1 end, s.created_at desc
  limit 1;

  v_plan := coalesce(v_plan, 'FREE');
  v_paid := v_plan <> 'FREE';

  v_row := public.atlas_freemium_ensure_cycle(p_workspace_id);

  if p_meter = 'invoices' then
    v_used := v_row.current_month_invoices;
    v_limit := 15;
  elsif p_meter = 'cod' then
    v_used := v_row.current_month_cod;
    v_limit := 30;
  elsif p_meter = 'ai_scans' then
    v_used := v_row.current_month_ai_scans;
    v_limit := 5;
  elsif p_meter = 'team' then
    v_used := 1;
    v_limit := 1;
  else
    return jsonb_build_object('allowed', false, 'code', 'unknown_meter');
  end if;

  if v_paid then
    return jsonb_build_object(
      'allowed', true,
      'unlimited', true,
      'plan', 'pro',
      'plan_code', v_plan,
      'meter', p_meter,
      'used', v_used,
      'limit', null,
      'remaining', null,
      'period_ym', v_row.period_ym,
      'code', 'ok'
    );
  end if;

  return jsonb_build_object(
    'allowed', (v_used + v_qty) <= v_limit,
    'unlimited', false,
    'plan', 'free',
    'plan_code', v_plan,
    'meter', p_meter,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_used),
    'period_ym', v_row.period_ym,
    'code', case when (v_used + v_qty) <= v_limit then 'ok' else 'quota_exceeded' end,
    'message_fr', case
      when (v_used + v_qty) <= v_limit then null
      else 'Limite du forfait Gratuit atteinte. Passez à Pro pour continuer.'
    end
  );
end;
$$;

create or replace function public.atlas_freemium_consume(
  p_workspace_id uuid,
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
  v_qty integer := greatest(coalesce(p_qty, 1), 1);
  v_row public.atlas_workspace_usage_cycles;
begin
  v_check := public.atlas_freemium_check(p_workspace_id, p_meter, v_qty);
  if not coalesce((v_check->>'allowed')::boolean, false) then
    return v_check;
  end if;

  if coalesce((v_check->>'unlimited')::boolean, false) then
    update public.atlas_workspaces
    set subscription_plan = 'pro'
    where id = p_workspace_id and subscription_plan <> 'pro';
    return v_check;
  end if;

  if p_meter = 'invoices' then
    update public.atlas_workspace_usage_cycles
    set current_month_invoices = current_month_invoices + v_qty,
        updated_at = now()
    where workspace_id = p_workspace_id
      and period_ym = public.atlas_freemium_current_period_ym()
    returning * into v_row;
  elsif p_meter = 'cod' then
    update public.atlas_workspace_usage_cycles
    set current_month_cod = current_month_cod + v_qty,
        updated_at = now()
    where workspace_id = p_workspace_id
      and period_ym = public.atlas_freemium_current_period_ym()
    returning * into v_row;
  elsif p_meter = 'ai_scans' then
    update public.atlas_workspace_usage_cycles
    set current_month_ai_scans = current_month_ai_scans + v_qty,
        updated_at = now()
    where workspace_id = p_workspace_id
      and period_ym = public.atlas_freemium_current_period_ym()
    returning * into v_row;
  else
    return v_check;
  end if;

  update public.atlas_workspaces
  set subscription_plan = 'free'
  where id = p_workspace_id and subscription_plan <> 'free';

  return jsonb_build_object(
    'allowed', true,
    'unlimited', false,
    'plan', 'free',
    'plan_code', v_check->>'plan_code',
    'meter', p_meter,
    'used', case
      when p_meter = 'invoices' then v_row.current_month_invoices
      when p_meter = 'cod' then v_row.current_month_cod
      else v_row.current_month_ai_scans
    end,
    'limit', (v_check->>'limit')::int,
    'remaining', greatest(
      0,
      (v_check->>'limit')::int - case
        when p_meter = 'invoices' then v_row.current_month_invoices
        when p_meter = 'cod' then v_row.current_month_cod
        else v_row.current_month_ai_scans
      end
    ),
    'period_ym', v_row.period_ym,
    'code', 'ok'
  );
end;
$$;

grant execute on function public.atlas_freemium_current_period_ym() to authenticated, service_role;
grant execute on function public.atlas_freemium_ensure_cycle(uuid) to authenticated, service_role;
grant execute on function public.atlas_freemium_check(uuid, text, integer) to authenticated, service_role;
grant execute on function public.atlas_freemium_consume(uuid, text, integer) to authenticated, service_role;
