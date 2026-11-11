-- Multi-parcel deeds record the full deal price on every parcel. Treat parcels that share
-- (sale_date, sale_price, owner1) as one sale: sum their footprints, cite the nearest parcel.
create or replace function public.get_comps(p_pid text, p_limit int default 6)
returns table (pid text, address text, sale_date date, sale_price numeric, footprint_sf numeric)
language sql stable security invoker set search_path = '' as $$
  with s as (select * from public.parcels where pid = p_pid),
  c as (
    select c.*, (c.lat - s.lat)^2 + (c.lng - s.lng)^2 as d2
    from s join public.parcels c on c.class_code = s.class_code and c.pid <> s.pid
    where c.sale_price >= 10000 and c.footprint_sf > 0
      and c.sale_date >= (s.data_as_of - interval '3 years')
      and not (c.sale_date = s.sale_date and c.sale_price = s.sale_price and c.owner1 = s.owner1)  -- subject's own deed
  ),
  deeds as (
    select (array_agg(pid order by d2))[1] as pid, (array_agg(address order by d2))[1] as address,
           sale_date, sale_price, sum(footprint_sf) as footprint_sf, min(d2) as d2
    from c group by sale_date, sale_price, owner1
  )
  select pid, address, sale_date, sale_price, footprint_sf from deeds order by d2 limit p_limit;
$$;

-- RLS: evaluate auth.uid() once per statement, not per row.
alter policy "own rows" on public.served_leads using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on public.lead_status  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on public.activities   using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on public.listings     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on public.assets       using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on public.deals        using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Foreign-key indexes
create index on public.activities (user_id, pid);
create index on public.activities (pid);
create index on public.assets (user_id, pid);
create index on public.assets (pid);
create index on public.deals (user_id);
create index on public.deals (pid);
create index on public.lead_status (pid);
create index on public.listings (pid);
create index on public.served_leads (pid);
create index on public.simulated_signals (pid);
