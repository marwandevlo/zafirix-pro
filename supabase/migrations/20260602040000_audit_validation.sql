-- Phase 9 — Audit, Validation & Traceability
-- Adds atlas_audit_logs table and upgrades validation_status to include 'reviewed'.
-- Idempotent.

-- ── atlas_audit_logs ──────────────────────────────────────────────────────────

create table if not exists public.atlas_audit_logs (
  id                  uuid        primary key default gen_random_uuid(),
  entity_type         text        not null,
  entity_id           text        not null,
  source_document_id  uuid,
  action              text        not null,
  old_values          jsonb,
  new_values          jsonb,
  performed_by        uuid        references auth.users (id) on delete set null,
  company_id          uuid        references public.atlas_companies (id) on delete set null,
  metadata            jsonb,
  created_at          timestamptz not null default now(),
  constraint atlas_audit_logs_action_check
    check (action in (
      'created','corrected','reviewed','validated','rejected',
      'propagated','routed','archived','deleted','restored'
    ))
);

create index if not exists atlas_audit_logs_entity_idx
  on public.atlas_audit_logs (entity_type, entity_id, created_at desc);
create index if not exists atlas_audit_logs_source_idx
  on public.atlas_audit_logs (source_document_id, created_at desc)
  where source_document_id is not null;
create index if not exists atlas_audit_logs_company_idx
  on public.atlas_audit_logs (company_id, created_at desc)
  where company_id is not null;

alter table public.atlas_audit_logs enable row level security;

drop policy if exists "audit_logs_select_own" on public.atlas_audit_logs;
create policy "audit_logs_select_own"
  on public.atlas_audit_logs for select
  using (auth.uid() = performed_by);

drop policy if exists "audit_logs_service_all" on public.atlas_audit_logs;
create policy "audit_logs_service_all"
  on public.atlas_audit_logs for all
  using (true);

-- ── Upgrade validation_status on all tables to support 'reviewed' ─────────────
-- Drop and recreate check constraints to add the new status.

-- atlas_supplier_invoices
alter table public.atlas_supplier_invoices
  drop constraint if exists atlas_supplier_invoices_validation_status_check;
alter table public.atlas_supplier_invoices
  add constraint atlas_supplier_invoices_validation_status_check
    check (validation_status in ('draft','needs_review','reviewed','validated','rejected','archived'));

-- atlas_invoices (if constraint exists)
alter table public.atlas_invoices
  drop constraint if exists atlas_invoices_validation_status_check;
alter table public.atlas_invoices
  add constraint atlas_invoices_validation_status_check
    check (validation_status in ('draft','needs_review','reviewed','validated','rejected','archived'));

-- zafirix_routing_records
alter table public.zafirix_routing_records
  drop constraint if exists zafirix_routing_records_validation_check;
alter table public.zafirix_routing_records
  add constraint zafirix_routing_records_validation_check
    check (validation_status in ('draft','needs_review','reviewed','validated','rejected','archived'));

-- atlas_accounting_entries — add validation_status column if missing
alter table public.atlas_accounting_entries
  add column if not exists validation_status text not null default 'draft';

alter table public.atlas_accounting_entries
  drop constraint if exists atlas_accounting_entries_validation_status_check;
alter table public.atlas_accounting_entries
  add constraint atlas_accounting_entries_validation_status_check
    check (validation_status in ('draft','needs_review','reviewed','validated','rejected','archived'));

-- zafirix_tva_suggestions — extend validation_status options (column is validation_status, not status)
alter table public.zafirix_tva_suggestions
  drop constraint if exists zafirix_tva_suggestions_status_check;
alter table public.zafirix_tva_suggestions
  drop constraint if exists zafirix_tva_suggestions_validation_status_check;

update public.zafirix_tva_suggestions
set validation_status = 'pending'
where validation_status not in (
  'pending', 'reviewed', 'validated', 'rejected', 'archived', 'included_in_declaration'
);

alter table public.zafirix_tva_suggestions
  add constraint zafirix_tva_suggestions_validation_status_check
    check (validation_status in (
      'pending', 'reviewed', 'validated', 'rejected', 'archived', 'included_in_declaration'
    ));

-- ── Useful views ──────────────────────────────────────────────────────────────

-- validation_queue: draft/reviewed counts per module per company
create or replace view public.validation_queue_summary as
  select
    company_id,
    target_module,
    count(*) filter (where validation_status = 'draft')    as draft_count,
    count(*) filter (where validation_status = 'reviewed') as reviewed_count,
    count(*) filter (where validation_status = 'validated') as validated_count,
    count(*) filter (where validation_status = 'rejected') as rejected_count
  from public.zafirix_routing_records
  group by company_id, target_module;
