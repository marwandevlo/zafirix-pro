-- HR & Labor Law Compliance: contracts, documents, attendance, compliance tracking.

create extension if not exists "pgcrypto";

-- ── Employment contracts (Code du travail Maroc 65-99) ────────────────────────
create table if not exists public.zafirix_employment_contracts (
  id                  uuid          primary key default gen_random_uuid(),
  user_id             uuid          not null references auth.users (id) on delete cascade,
  company_id          uuid          references public.atlas_companies (id) on delete cascade,
  employee_id         uuid          not null references public.atlas_employees (id) on delete cascade,
  contract_type       text          not null default 'cdi',
  reference_number    text,
  start_date          date          not null,
  end_date            date,
  trial_period_end    date,
  weekly_hours        numeric(5,2)  not null default 44,
  gross_salary_mad    numeric(14,2) not null default 0,
  work_location       text,
  job_title           text,
  notice_period_days  integer       not null default 30,
  status              text          not null default 'active',
  legal_basis         text          not null default 'Code du travail marocain (Loi 65-99)',
  signed_at           date,
  terminated_at       date,
  termination_reason  text,
  metadata            jsonb         not null default '{}'::jsonb,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  constraint zafirix_employment_contracts_type_check
    check (contract_type in ('cdi','cdd','stage','interim','apprenticeship')),
  constraint zafirix_employment_contracts_status_check
    check (status in ('draft','active','expired','terminated'))
);

create index if not exists zafirix_employment_contracts_employee_idx
  on public.zafirix_employment_contracts (employee_id, start_date desc);

create index if not exists zafirix_employment_contracts_company_idx
  on public.zafirix_employment_contracts (company_id, status);

-- ── Staff documents ───────────────────────────────────────────────────────────
create table if not exists public.zafirix_employee_documents (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      uuid        references public.atlas_companies (id) on delete cascade,
  employee_id     uuid        not null references public.atlas_employees (id) on delete cascade,
  document_type   text        not null default 'other',
  title           text        not null,
  file_name       text,
  file_url        text,
  issued_at       date,
  expires_at      date,
  status          text        not null default 'valid',
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint zafirix_employee_documents_type_check
    check (document_type in (
      'cin','cnss_card','diploma','medical_certificate','work_permit',
      'contract_signed','payslip','disciplinary','other'
    )),
  constraint zafirix_employee_documents_status_check
    check (status in ('valid','expiring','expired','missing'))
);

create index if not exists zafirix_employee_documents_employee_idx
  on public.zafirix_employee_documents (employee_id, expires_at);

-- ── Attendance ────────────────────────────────────────────────────────────────
create table if not exists public.zafirix_employee_attendance (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  company_id       uuid        references public.atlas_companies (id) on delete cascade,
  employee_id      uuid        not null references public.atlas_employees (id) on delete cascade,
  attendance_date  date        not null,
  status           text        not null default 'present',
  check_in         time,
  check_out        time,
  hours_worked     numeric(5,2),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint zafirix_employee_attendance_status_check
    check (status in ('present','absent','late','remote','leave_paid','leave_unpaid','holiday')),
  constraint zafirix_employee_attendance_unique_day
    unique (employee_id, attendance_date)
);

create index if not exists zafirix_employee_attendance_company_date_idx
  on public.zafirix_employee_attendance (company_id, attendance_date desc);

-- ── Legal compliance tracking ─────────────────────────────────────────────────
create table if not exists public.zafirix_hr_compliance_items (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  company_id          uuid        references public.atlas_companies (id) on delete cascade,
  employee_id         uuid        references public.atlas_employees (id) on delete cascade,
  category            text        not null default 'document',
  title               text        not null,
  description         text,
  legal_basis         text,
  due_date            date,
  completed_at        date,
  status              text        not null default 'pending',
  priority            text        not null default 'normal',
  linked_document_id  uuid        references public.zafirix_employee_documents (id) on delete set null,
  linked_contract_id  uuid        references public.zafirix_employment_contracts (id) on delete set null,
  metadata            jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint zafirix_hr_compliance_items_category_check
    check (category in ('cnss','medical','contract','training','safety','document','payroll','other')),
  constraint zafirix_hr_compliance_items_status_check
    check (status in ('pending','compliant','overdue','waived')),
  constraint zafirix_hr_compliance_items_priority_check
    check (priority in ('low','normal','high','critical'))
);

create index if not exists zafirix_hr_compliance_items_company_idx
  on public.zafirix_hr_compliance_items (company_id, status, due_date);

create index if not exists zafirix_hr_compliance_items_employee_idx
  on public.zafirix_hr_compliance_items (employee_id, due_date)
  where employee_id is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'zafirix_employment_contracts',
    'zafirix_employee_documents',
    'zafirix_employee_attendance',
    'zafirix_hr_compliance_items'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists "%s_select_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_insert_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_update_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_delete_own" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s_service_role_all" on public.%I', tbl, tbl);

    if tbl in ('zafirix_employment_contracts', 'zafirix_employee_documents', 'zafirix_employee_attendance') then
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated
         using (exists (select 1 from public.atlas_employees e where e.id = employee_id and e.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated
         with check (exists (select 1 from public.atlas_employees e where e.id = employee_id and e.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_update_own" on public.%I for update to authenticated
         using (exists (select 1 from public.atlas_employees e where e.id = employee_id and e.user_id = auth.uid()))
         with check (exists (select 1 from public.atlas_employees e where e.id = employee_id and e.user_id = auth.uid()))',
        tbl, tbl
      );
      execute format(
        'create policy "%s_delete_own" on public.%I for delete to authenticated
         using (exists (select 1 from public.atlas_employees e where e.id = employee_id and e.user_id = auth.uid()))',
        tbl, tbl
      );
    else
      execute format(
        'create policy "%s_select_own" on public.%I for select to authenticated using (auth.uid() = user_id)',
        tbl, tbl
      );
      execute format(
        'create policy "%s_insert_own" on public.%I for insert to authenticated with check (auth.uid() = user_id)',
        tbl, tbl
      );
      execute format(
        'create policy "%s_update_own" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        tbl, tbl
      );
      execute format(
        'create policy "%s_delete_own" on public.%I for delete to authenticated using (auth.uid() = user_id)',
        tbl, tbl
      );
    end if;

    execute format(
      'create policy "%s_service_role_all" on public.%I for all to service_role using (true) with check (true)',
      tbl, tbl
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
  end loop;
end $$;

notify pgrst, 'reload schema';
