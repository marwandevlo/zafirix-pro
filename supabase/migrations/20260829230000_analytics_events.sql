-- First-party page-view traffic log. Service-role inserts only (RLS, no client grants).
-- Safe to re-run.

create table if not exists public.analytics_events (
  id uuid not null default gen_random_uuid() primary key,
  path text not null,
  referrer text,
  user_id uuid references auth.users (id) on delete set null,
  ip_hash text,
  visitor_id text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_path_created_idx
  on public.analytics_events (path, created_at desc);

create index if not exists analytics_events_referrer_created_idx
  on public.analytics_events (referrer, created_at desc)
  where referrer is not null;

create index if not exists analytics_events_visitor_created_idx
  on public.analytics_events (visitor_id, created_at desc)
  where visitor_id is not null;

alter table public.analytics_events enable row level security;

create or replace function public.atlas_admin_traffic_stats(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) as since
  ),
  rows as (
    select e.path, e.referrer, e.visitor_id, e.created_at
    from public.analytics_events e, bounds
    where e.created_at >= bounds.since
  ),
  visitors as (
    select visitor_id, count(*)::int as views
    from rows
    where visitor_id is not null and visitor_id <> ''
    group by visitor_id
  ),
  sources as (
    select coalesce(nullif(referrer, ''), 'direct') as referrer, count(*)::int as views
    from rows
    group by 1
    order by views desc
    limit 20
  ),
  pages as (
    select path, count(*)::int as views
    from rows
    group by path
    order by views desc
    limit 20
  ),
  trend as (
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as views
    from rows
    group by 1
    order by 1
  )
  select jsonb_build_object(
    'pageViews', (select count(*)::int from rows),
    'uniqueVisitors', (select count(*)::int from visitors),
    'bounceRate', case
      when (select count(*) from visitors) = 0 then 0
      else round(
        (select count(*) filter (where views = 1) from visitors)::numeric
        / (select count(*) from visitors)::numeric
        * 100,
        1
      )
    end,
    'sources', coalesce((select jsonb_agg(jsonb_build_object('referrer', referrer, 'views', views)) from sources), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'views', views)) from pages), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'views', views)) from trend), '[]'::jsonb)
  );
$$;

revoke all on function public.atlas_admin_traffic_stats(integer) from public, anon, authenticated;
