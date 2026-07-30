-- Auditor guest pass RBAC: roles, permissions, access audit trail.

create extension if not exists "pgcrypto";

alter table public.zafirix_auditor_passes
  add column if not exists auditor_role text not null default 'external_auditor',
  add column if not exists permissions text[] not null default '{}',
  add column if not exists auditor_email text,
  add column if not exists auditor_firm text,
  add column if not exists last_access_at timestamptz,
  add column if not exists last_access_ip text;

alter table public.zafirix_auditor_passes
  drop constraint if exists zafirix_auditor_passes_role_check;
alter table public.zafirix_auditor_passes
  add constraint zafirix_auditor_passes_role_check
    check (auditor_role in ('external_auditor','expert_comptable'));

-- ── Access audit log (read-only actions by guest passes) ──────────────────────
create table if not exists public.zafirix_auditor_access_log (
  id           uuid        primary key default gen_random_uuid(),
  pass_id      uuid        not null references public.zafirix_auditor_passes (id) on delete cascade,
  company_id   uuid        references public.atlas_companies (id) on delete set null,
  action       text        not null,
  resource     text,
  ip_address   text,
  user_agent   text,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint zafirix_auditor_access_log_action_check
    check (action in (
      'portal_view','view_journal','view_ledger','view_invoices',
      'view_payments','view_bank','view_contracts','export_verification','token_invalid'
    ))
);

create index if not exists zafirix_auditor_access_log_pass_idx
  on public.zafirix_auditor_access_log (pass_id, created_at desc);

create index if not exists zafirix_auditor_access_log_company_idx
  on public.zafirix_auditor_access_log (company_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.zafirix_auditor_access_log enable row level security;

drop policy if exists "zafirix_auditor_access_log_select_own" on public.zafirix_auditor_access_log;
create policy "zafirix_auditor_access_log_select_own"
  on public.zafirix_auditor_access_log for select to authenticated
  using (
    exists (
      select 1 from public.zafirix_auditor_passes p
      where p.id = pass_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "zafirix_auditor_access_log_service_all" on public.zafirix_auditor_access_log;
create policy "zafirix_auditor_access_log_service_all"
  on public.zafirix_auditor_access_log for all to service_role
  using (true) with check (true);

grant select on public.zafirix_auditor_access_log to authenticated;
grant all on public.zafirix_auditor_access_log to service_role;

notify pgrst, 'reload schema';
