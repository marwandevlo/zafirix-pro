-- Platform routing registry: central duplicate-prevention + traceability table.
-- Also adds zafirix_legal_documents for legal contract routing.
-- Idempotent.

-- ── zafirix_routing_records ───────────────────────────────────────────────────
-- One row per (document_id, module, entity_type) routing action.
-- Unique constraint prevents duplicate downstream records per document.

create table if not exists public.zafirix_routing_records (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  company_id          uuid        references public.atlas_companies (id) on delete set null,
  source_document_id  uuid        not null,
  source_document_type text       not null default 'unknown',
  target_module       text        not null,
  target_entity_type  text        not null,
  target_entity_id    text,
  routing_status      text        not null default 'completed',
  generated_by        text        not null default 'documents_ia',
  extraction_confidence numeric(4,3),
  validation_status   text        not null default 'draft',
  user_verified       boolean     not null default false,
  payload             jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint zafirix_routing_records_status_check
    check (routing_status in ('pending','completed','failed','skipped')),
  constraint zafirix_routing_records_validation_check
    check (validation_status in ('draft','needs_review','validated','rejected','archived'))
);

-- Unique guard: same document cannot be routed to same module+entity_type twice
create unique index if not exists zafirix_routing_records_dedup_idx
  on public.zafirix_routing_records (source_document_id, target_module, target_entity_type)
  where routing_status = 'completed';

create index if not exists zafirix_routing_records_doc_idx
  on public.zafirix_routing_records (source_document_id, created_at desc);
create index if not exists zafirix_routing_records_module_idx
  on public.zafirix_routing_records (company_id, target_module, created_at desc);

alter table public.zafirix_routing_records enable row level security;

drop policy if exists "routing_records_select_own" on public.zafirix_routing_records;
create policy "routing_records_select_own"
  on public.zafirix_routing_records for select
  using (auth.uid() = user_id);

drop policy if exists "routing_records_service_all" on public.zafirix_routing_records;
create policy "routing_records_service_all"
  on public.zafirix_routing_records for all
  using (true);

-- ── zafirix_legal_documents ───────────────────────────────────────────────────
-- Legal contracts, company statutes, and legal notices routed from Documents IA.

create table if not exists public.zafirix_legal_documents (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  company_id          uuid        references public.atlas_companies (id) on delete set null,
  source_document_id  uuid        not null,
  document_type       text        not null,
  title               text,
  parties             text[],
  effective_date      date,
  expiry_date         date,
  obligations         text,
  renewal_alert_days  integer     default 30,
  alert_sent          boolean     default false,
  generated_by        text        not null default 'documents_ia',
  validation_status   text        not null default 'draft',
  raw_extraction      jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint zafirix_legal_documents_type_check
    check (document_type in ('legal_contract','company_statutes','legal_notice','hr_document','other'))
);

create index if not exists zafirix_legal_documents_company_idx
  on public.zafirix_legal_documents (company_id, created_at desc);
create index if not exists zafirix_legal_documents_source_idx
  on public.zafirix_legal_documents (source_document_id);
create index if not exists zafirix_legal_documents_expiry_idx
  on public.zafirix_legal_documents (expiry_date)
  where expiry_date is not null and alert_sent = false;

alter table public.zafirix_legal_documents enable row level security;

drop policy if exists "legal_docs_select_own" on public.zafirix_legal_documents;
create policy "legal_docs_select_own"
  on public.zafirix_legal_documents for select
  using (auth.uid() = user_id);

drop policy if exists "legal_docs_service_all" on public.zafirix_legal_documents;
create policy "legal_docs_service_all"
  on public.zafirix_legal_documents for all
  using (true);

-- ── Traceability columns (add to existing tables) ─────────────────────────────

-- atlas_invoices (sales invoices): add source_document_id column for traceability
alter table public.atlas_invoices
  add column if not exists source_document_id uuid,
  add column if not exists source_document_type text,
  add column if not exists generated_by text,
  add column if not exists validation_status text default 'draft',
  add column if not exists extraction_confidence numeric(4,3);

create index if not exists atlas_invoices_source_idx
  on public.atlas_invoices (source_document_id)
  where source_document_id is not null;
