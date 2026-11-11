-- Re-derive FAR and height from the stored Zoneomics responses with the tightened rule in lookup-zoning:
-- read only controls.<block>.standard.<key>, and only when it is a plain number ("NA", "STF", free text -> null).
-- Costs no API credits. Safe to re-run.
update public.zoning_cache set
  max_far = case when raw #>> '{data,controls,far_standard,standard,max_far}' ~ '^\s*\d+(\.\d+)?\s*$'
                 then (raw #>> '{data,controls,far_standard,standard,max_far}')::numeric end,
  max_height_ft = case when raw #>> '{data,controls,building_height_standard,standard,max_building_height_ft}' ~ '^\s*\d+(\.\d+)?\s*$'
                 then (raw #>> '{data,controls,building_height_standard,standard,max_building_height_ft}')::numeric end
where raw is not null;
