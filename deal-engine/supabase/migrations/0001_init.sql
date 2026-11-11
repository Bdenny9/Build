-- Charleston Deal Engine: one-time snapshot tables + per-visitor workflow tables.
-- Reference tables are read-only to the browser. Workflow tables are private per user via RLS.
-- Visitors are anonymous Supabase users (enable Anonymous sign-ins).

-- ---------- Reference snapshot (loaded once by scripts, service role only) ----------
create table public.parcels (
  pid text primary key,
  address text not null,
  area text,
  class_code text not null check (class_code in ('200','304','500','530','580','630','650','700')),
  footprint_sf numeric not null default 0,          -- sum of layer 61 areas for this PID
  footprint_change_pct numeric not null default 0,  -- layer 61 percent change
  acreage numeric,
  owner1 text,
  mail_city text,
  mail_state text,
  sale_price numeric,
  sale_date date,
  flood_zone text,
  jurisdiction text,
  other_parcels int not null default 0,
  lat double precision,
  lng double precision,
  is_lead_candidate boolean not null default false,  -- excludes institutional owners, nominal sales
  data_as_of date not null default current_date
);
create index on public.parcels (class_code, sale_date);

create table public.zoning_cache (
  pid text primary key references public.parcels(pid),
  zone_code text, zone_name text, permitted_uses text[],
  commercial_permitted boolean, industrial_permitted boolean, multi_family_permitted boolean,
  max_height_ft numeric, max_far numeric,
  precision text not null check (precision in ('parcel','jurisdiction_default','none')),
  source text not null,
  raw jsonb,
  fetched_at timestamptz not null default now()
);

create table public.simulated_signals (
  id bigserial primary key,
  pid text not null references public.parcels(pid),
  body text not null
);

create table public.rates_10y (
  month date primary key,   -- first of month, FRED DGS10 monthly average
  rate_pct numeric not null
);

-- ---------- Per-visitor workflow ----------
create table public.served_leads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid text not null references public.parcels(pid),
  served_at timestamptz not null default now(),
  primary key (user_id, pid)
);
create table public.lead_status (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid text not null references public.parcels(pid),
  status text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, pid)
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid text not null references public.parcels(pid),
  kind text not null check (kind in ('Call','Email','Note','Status')),
  body text not null,
  created_at timestamptz not null default now()
);
create table public.listings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid text not null references public.parcels(pid),
  created_at timestamptz not null default now(),
  primary key (user_id, pid)
);
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid text not null references public.parcels(pid),
  kind text not null check (kind in ('description','highlights','mailer','email')),
  claims jsonb not null,
  prompt_version text not null,
  judge jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid text not null references public.parcels(pid),
  price numeric not null, close_date date not null,
  commission_pct numeric not null, broker_split_pct numeric not null, co_broker boolean not null,
  net_to_broker numeric not null,
  created_at timestamptz not null default now()
);

-- ---------- Views (security_invoker so RLS applies) ----------
create view public.lead_view with (security_invoker = true) as
select p.*, z.zone_code, z.zone_name, z.permitted_uses, z.commercial_permitted, z.industrial_permitted,
       z.multi_family_permitted, z.max_height_ft, z.max_far, z.precision as zoning_precision, z.source as zoning_source,
       (select array_agg(s.body order by s.id) from public.simulated_signals s where s.pid = p.pid) as simulated
from public.parcels p left join public.zoning_cache z on z.pid = p.pid;

create view public.deal_view with (security_invoker = true) as
select d.id, d.pid, p.address, p.class_code as type_label, d.price, d.close_date, d.net_to_broker
from public.deals d join public.parcels p on p.pid = d.pid;

-- Comps: same class, real sale in the 3 years before the snapshot date, nearest first.
create function public.get_comps(p_pid text, p_limit int default 6)
returns table (pid text, address text, sale_date date, sale_price numeric, footprint_sf numeric)
language sql stable security invoker set search_path = '' as $$
  select c.pid, c.address, c.sale_date, c.sale_price, c.footprint_sf
  from public.parcels s
  join public.parcels c on c.class_code = s.class_code and c.pid <> s.pid
  where s.pid = p_pid
    and c.sale_price >= 10000
    and c.footprint_sf > 0
    and c.sale_date >= (s.data_as_of - interval '3 years')
  order by (c.lat - s.lat)^2 + (c.lng - s.lng)^2
  limit p_limit;
$$;

-- ---------- RLS ----------
alter table public.parcels enable row level security;
alter table public.zoning_cache enable row level security;
alter table public.simulated_signals enable row level security;
alter table public.rates_10y enable row level security;
create policy "read reference" on public.parcels for select using (true);
create policy "read reference" on public.zoning_cache for select using (true);
create policy "read reference" on public.simulated_signals for select using (true);
create policy "read reference" on public.rates_10y for select using (true);

alter table public.served_leads enable row level security;
alter table public.lead_status enable row level security;
alter table public.activities enable row level security;
alter table public.listings enable row level security;
alter table public.assets enable row level security;
alter table public.deals enable row level security;
create policy "own rows" on public.served_leads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.lead_status for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.activities for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.listings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.assets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.deals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
