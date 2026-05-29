-- Sprint 2 (ZAFIRIX PRO): billing integrity — additive only, no data deletion.
-- 1) Align subscriptions.plan CHECK with atlas / Paddle catalog ids (avoids webhook upsert failures).
-- 2) Index for entitlement resolution by user + status + end date.

do $body$
declare cname text;
begin
  for cname in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public' and t.relname = 'subscriptions' and c.contype = 'c'
      and c.conname = 'subscriptions_plan_check'
  loop
    execute format('alter table public.subscriptions drop constraint if exists %I', cname);
  end loop;
end
$body$;

alter table public.subscriptions add constraint subscriptions_plan_check
  check (
    plan in (
      'starter',
      'growth',
      'pro',
      'business',
      'advanced',
      'enterprise',
      'cabinet'
    )
  );

create index if not exists atlas_subscriptions_user_status_end_idx
  on public.atlas_subscriptions (user_id, status, end_date desc);
