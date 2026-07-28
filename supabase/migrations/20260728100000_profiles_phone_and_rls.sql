-- Onboarding profile completion: optional phone + idempotent RLS for own-row access.

alter table public.profiles add column if not exists phone text;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_update_safe_own" on public.profiles;
create policy "profiles_update_safe_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
