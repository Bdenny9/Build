-- The raw Zoneomics response is paid third-party data and is only needed server-side (parser checks).
-- Browsers read zoning through lead_view's parsed columns; revoke direct access to `raw`.
revoke select on public.zoning_cache from anon, authenticated;
grant select (pid, zone_code, zone_name, permitted_uses, commercial_permitted, industrial_permitted,
              multi_family_permitted, max_height_ft, max_far, precision, source, fetched_at)
  on public.zoning_cache to anon, authenticated;
