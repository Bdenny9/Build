-- Backing for the edge functions: rate limits, lead picking, outreach cache, approval enforcement, evals.

-- ---------- Rate limits (service role only: RLS on, no policies) ----------
create table public.fn_usage (
  user_id uuid not null,              -- 00000000-... is the global counter
  fn text not null,
  day date not null default current_date,
  n int not null default 0,
  primary key (user_id, fn, day)
);
alter table public.fn_usage enable row level security;

create function public.bump_usage(p_user uuid, p_fn text, p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  insert into public.fn_usage as u (user_id, fn, day, n) values (p_user, p_fn, current_date, 1)
  on conflict (user_id, fn, day) do update set n = u.n + 1
  returning n into v;
  return v <= p_limit;
end $$;

-- ---------- Lead serving ----------
-- Unseen candidates, strongest cheap signals first (long hold, absentee, estimated maturity window), then random.
create function public.pick_unseen_leads(p_user uuid, p_count int) returns table (pid text)
language sql volatile security definer set search_path = '' as $$
  select p.pid from public.parcels p
  where p.is_lead_candidate
    and not exists (select 1 from public.served_leads s where s.user_id = p_user and s.pid = p.pid)
  order by
    (case when p.sale_date <= p.data_as_of - interval '7 years' then 2 else 0 end)
    + (case when upper(p.mail_state) <> 'SC' then 1 else 0 end)
    + (case when p.sale_date + interval '10 years' between p.data_as_of - interval '18 months' and p.data_as_of + interval '18 months' then 2 else 0 end)
    desc,
    random()
  limit least(greatest(p_count, 1), 10);
$$;

create function public.remaining_leads(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.parcels p
  where p.is_lead_candidate and not exists (select 1 from public.served_leads s where s.user_id = p_user and s.pid = p.pid);
$$;

-- ---------- Outreach drafts (written by draft-outreach, readable by owner) ----------
create table public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pid text not null references public.parcels(pid),
  body text not null,
  prompt_version text not null,
  checks jsonb,
  created_at timestamptz not null default now()
);
create index on public.outreach_drafts (user_id, pid);
create index on public.outreach_drafts (pid);
alter table public.outreach_drafts enable row level security;
create policy "own rows" on public.outreach_drafts for select using (user_id = (select auth.uid()));

-- ---------- Assets: server-written, approval enforced here ----------
alter table public.assets add column plant_errors boolean not null default false;
alter table public.assets add column code_checks jsonb;
create index on public.assets (user_id, pid, kind, plant_errors, prompt_version, created_at desc);

-- Approval is the only write a visitor makes to an asset, and only when every code check and the judge pass.
create function public.approve_asset(p_asset_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare a public.assets; ts timestamptz;
begin
  select * into a from public.assets where id = p_asset_id and user_id = auth.uid();
  if not found then raise exception 'No such asset' using errcode = 'P0002'; end if;
  if a.code_checks is null or jsonb_typeof(a.code_checks) <> 'array' or jsonb_array_length(a.code_checks) = 0
     or exists (select 1 from jsonb_array_elements(a.code_checks) c where (c->>'pass')::boolean is not true) then
    raise exception 'Blocked: a code check failed' using errcode = 'P0001';
  end if;
  if a.judge is null or (a.judge->'result'->>'pass')::boolean is not true then
    raise exception 'Blocked: the judge has not passed this copy' using errcode = 'P0001';
  end if;
  update public.assets set approved_at = coalesce(approved_at, now()) where id = p_asset_id returning approved_at into ts;
  return ts;
end $$;

-- ---------- Evals ----------
create table public.golden_cases (
  id serial primary key,
  pid text not null references public.parcels(pid),
  kind text not null check (kind in ('description','highlights','mailer','email')),
  case_type text not null check (case_type in ('clean','planted','injected')),
  inject_claims jsonb,          -- hand-written overstatements for 'injected' cases (Claim[])
  note text
);
create index on public.golden_cases (pid);

create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  prompt_version text not null,
  model text not null,
  run_at timestamptz not null default now(),
  cases int not null,
  metrics jsonb not null,
  results jsonb not null
);
alter table public.golden_cases enable row level security;
alter table public.eval_runs enable row level security;
create policy "read evals" on public.golden_cases for select using (true);
create policy "read evals" on public.eval_runs for select using (true);

-- Golden set: six real lead candidates, one per common type.
with one_per_type as (
  select distinct on (class_code) pid, class_code
  from public.parcels
  where is_lead_candidate and footprint_sf >= 2000 and acreage > 0 and class_code in ('200','500','530','630','650','700')
  order by class_code, pid
),
picks as (select pid, row_number() over (order by class_code) as n from one_per_type),
traps(n, claims, note) as (values
  (1, '[{"text":"The building was fully renovated in 2024.","source":"foot","detail":"Footprint record"}]'::jsonb, 'Condition not in record'),
  (2, '[{"text":"Zoning allows any commercial use by right.","source":"zoning","detail":"Zoning record"}]'::jsonb, 'Overstates or invents zoning'),
  (3, '[{"text":"Recent sales show the property is worth well over its last sale price.","source":"comps","detail":"Comps median"}]'::jsonb, 'Value claim from comps'),
  (4, '[{"text":"Its flood zone means the site never floods.","source":"fema","detail":"Flood zone"}]'::jsonb, 'Inflates flood zone'),
  (5, '[{"text":"Minutes from downtown and the airport.","source":"parcel","detail":"Address"}]'::jsonb, 'Location advantage not in record'),
  (6, '[{"text":"Offers over 20,000 SF of rentable space.","source":"foot","detail":"Footprint"}]'::jsonb, 'Footprint stated as rentable area')
)
insert into public.golden_cases (pid, kind, case_type, inject_claims, note)
select pid, 'description', 'clean', null::jsonb, 'Clean description' from picks
union all
select pid, 'highlights', 'clean', null, 'Clean highlights' from picks where n <= 4
union all
select p.pid, 'description', 'injected', t.claims, t.note from picks p join traps t using (n)
union all
select pid, 'description', 'planted', null, 'Demo trap claims' from picks where n <= 2;

-- ---------- Grants ----------
-- Visitors read their assets and served leads; only the edge functions (service role) write them.
revoke insert, update, delete on public.assets from authenticated;
revoke insert, update, delete on public.served_leads from authenticated;
grant select on public.outreach_drafts to authenticated;
grant select on public.golden_cases, public.eval_runs to anon, authenticated;

revoke execute on function public.bump_usage(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.pick_unseen_leads(uuid, int) from public, anon, authenticated;
revoke execute on function public.remaining_leads(uuid) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, text, int), public.pick_unseen_leads(uuid, int), public.remaining_leads(uuid) to service_role;
revoke execute on function public.approve_asset(uuid) from public, anon;
grant execute on function public.approve_asset(uuid) to authenticated;
