-- Default grants give anon/authenticated every privilege, including TRUNCATE, which RLS does not cover.
-- Grant only what the app uses. Visitors sign in anonymously, so they run as `authenticated`.
revoke all on all tables in schema public from anon, authenticated;

-- Reference snapshot: read-only. Written by the service role during the data load.
grant select on public.parcels, public.zoning_cache, public.simulated_signals, public.rates_10y, public.lead_view
  to anon, authenticated;

-- Per-visitor workflow: RLS limits every row to its owner.
grant select, insert, update, delete on public.served_leads, public.lead_status, public.activities,
  public.listings, public.assets, public.deals to authenticated;
grant select on public.deal_view to authenticated;
