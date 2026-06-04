-- Phase 15: SaaS billing foundation (plans, workspace subscriptions, features, usage)

-- 1. Subscription plans
create table if not exists public.atlas_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  monthly_price numeric(12,2) not null default 0,
  yearly_price numeric(12,2) not null default 0,
  currency text not null default 'MAD',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_plans_code on public.atlas_subscription_plans (code);
create index if not exists idx_subscription_plans_active on public.atlas_subscription_plans (active);

-- 2. Plan features (null limit_value = unlimited)
create table if not exists public.atlas_plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.atlas_subscription_plans (id) on delete cascade,
  feature_code text not null,
  limit_value int,
  created_at timestamptz not null default now(),
  unique (plan_id, feature_code)
);

create index if not exists idx_plan_features_plan on public.atlas_plan_features (plan_id);
create index if not exists idx_plan_features_code on public.atlas_plan_features (feature_code);

-- 3. Workspace subscriptions
create table if not exists public.atlas_workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces (id) on delete cascade,
  plan_id uuid not null references public.atlas_subscription_plans (id) on delete restrict,
  status text not null default 'trial' check (status in ('trial', 'active', 'suspended', 'cancelled', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_subscriptions_workspace on public.atlas_workspace_subscriptions (workspace_id);
create index if not exists idx_workspace_subscriptions_plan on public.atlas_workspace_subscriptions (plan_id);
create index if not exists idx_workspace_subscriptions_status on public.atlas_workspace_subscriptions (status);

-- 4. Usage events
create table if not exists public.atlas_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces (id) on delete cascade,
  company_id uuid references public.atlas_companies (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  feature_code text not null,
  quantity int not null default 1 check (quantity > 0),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_events_workspace on public.atlas_usage_events (workspace_id);
create index if not exists idx_usage_events_company on public.atlas_usage_events (company_id);
create index if not exists idx_usage_events_user on public.atlas_usage_events (user_id);
create index if not exists idx_usage_events_feature on public.atlas_usage_events (feature_code);
create index if not exists idx_usage_events_created on public.atlas_usage_events (workspace_id, feature_code, created_at);

-- 5. Seed plans
insert into public.atlas_subscription_plans (code, name, description, monthly_price, yearly_price, currency, active)
values
  ('FREE', 'Free', 'Découverte avec limites de base.', 0, 0, 'MAD', true),
  ('STARTER', 'Starter', 'Pour indépendants et petites structures.', 450, 4500, 'MAD', true),
  ('PRO', 'Pro', 'Volume confortable et collaboration.', 1200, 12000, 'MAD', true),
  ('CABINET', 'Cabinet', 'Multi-sociétés pour cabinets comptables.', 2600, 26000, 'MAD', true),
  ('ENTERPRISE', 'Enterprise', 'Limites sur mesure et fair usage.', 12000, 120000, 'MAD', true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  active = excluded.active;

-- 6. Seed plan features
insert into public.atlas_plan_features (plan_id, feature_code, limit_value)
select p.id, f.feature_code, f.limit_value
from public.atlas_subscription_plans p
inner join (
  values
    ('FREE', 'documents_per_month', 100),
    ('FREE', 'ai_requests_limit', 20),
    ('FREE', 'companies_limit', 1),
    ('FREE', 'ocr_limit', 50),
    ('FREE', 'users_limit', 1),
    ('FREE', 'storage_limit_gb', 1),
    ('FREE', 'bank_accounts_limit', 1),
    ('FREE', 'payroll_limit', 5),
    ('STARTER', 'documents_per_month', 1000),
    ('STARTER', 'ai_requests_limit', 500),
    ('STARTER', 'companies_limit', 3),
    ('STARTER', 'ocr_limit', 500),
    ('STARTER', 'users_limit', 3),
    ('STARTER', 'storage_limit_gb', 10),
    ('STARTER', 'bank_accounts_limit', 3),
    ('STARTER', 'payroll_limit', 50),
    ('PRO', 'documents_per_month', 5000),
    ('PRO', 'ai_requests_limit', 2000),
    ('PRO', 'companies_limit', 10),
    ('PRO', 'ocr_limit', 2000),
    ('PRO', 'users_limit', 10),
    ('PRO', 'storage_limit_gb', 50),
    ('PRO', 'bank_accounts_limit', 10),
    ('PRO', 'payroll_limit', 200),
    ('CABINET', 'documents_per_month', 10000),
    ('CABINET', 'ai_requests_limit', 5000),
    ('CABINET', 'companies_limit', 50),
    ('CABINET', 'ocr_limit', 5000),
    ('CABINET', 'users_limit', 25),
    ('CABINET', 'storage_limit_gb', 200),
    ('CABINET', 'bank_accounts_limit', 50),
    ('CABINET', 'payroll_limit', 1000),
    ('ENTERPRISE', 'documents_per_month', null),
    ('ENTERPRISE', 'ai_requests_limit', null),
    ('ENTERPRISE', 'companies_limit', null),
    ('ENTERPRISE', 'ocr_limit', null),
    ('ENTERPRISE', 'users_limit', null),
    ('ENTERPRISE', 'storage_limit_gb', null),
    ('ENTERPRISE', 'bank_accounts_limit', null),
    ('ENTERPRISE', 'payroll_limit', null)
) as f(plan_code, feature_code, limit_value) on p.code = f.plan_code
on conflict (plan_id, feature_code) do update set limit_value = excluded.limit_value;

-- 7. RLS
alter table public.atlas_subscription_plans enable row level security;
alter table public.atlas_plan_features enable row level security;
alter table public.atlas_workspace_subscriptions enable row level security;
alter table public.atlas_usage_events enable row level security;

drop policy if exists "subscription_plans_read" on public.atlas_subscription_plans;
create policy "subscription_plans_read" on public.atlas_subscription_plans
  for select using (auth.uid() is not null and active = true);

drop policy if exists "plan_features_read" on public.atlas_plan_features;
create policy "plan_features_read" on public.atlas_plan_features
  for select using (auth.uid() is not null);

drop policy if exists "workspace_subscriptions_owner" on public.atlas_workspace_subscriptions;
create policy "workspace_subscriptions_owner" on public.atlas_workspace_subscriptions
  for all
  using (
    exists (
      select 1 from public.atlas_workspaces w
      where w.id = atlas_workspace_subscriptions.workspace_id and w.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.atlas_workspaces w
      where w.id = atlas_workspace_subscriptions.workspace_id and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists "workspace_subscriptions_member" on public.atlas_workspace_subscriptions;
create policy "workspace_subscriptions_member" on public.atlas_workspace_subscriptions
  for select using (
    exists (
      select 1 from public.atlas_user_roles ur
      where ur.workspace_id = atlas_workspace_subscriptions.workspace_id and ur.user_id = auth.uid()
    )
  );

drop policy if exists "usage_events_workspace" on public.atlas_usage_events;
create policy "usage_events_workspace" on public.atlas_usage_events
  for all
  using (
    exists (
      select 1 from public.atlas_workspaces w
      where w.id = atlas_usage_events.workspace_id
        and (w.owner_user_id = auth.uid() or exists (
          select 1 from public.atlas_user_roles ur
          where ur.workspace_id = w.id and ur.user_id = auth.uid()
        ))
    )
  )
  with check (
    exists (
      select 1 from public.atlas_workspaces w
      where w.id = atlas_usage_events.workspace_id
        and (w.owner_user_id = auth.uid() or exists (
          select 1 from public.atlas_user_roles ur
          where ur.workspace_id = w.id and ur.user_id = auth.uid()
        ))
    )
  );
