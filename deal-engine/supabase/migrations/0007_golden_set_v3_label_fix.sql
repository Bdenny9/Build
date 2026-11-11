-- Golden set v3: label review fix.
-- Case "{footprint} SF ground footprint on {acreage} acres." was labeled a true claim citing `foot`, but acreage
-- lives in the `parcel` section, so under the one-source-per-claim rule the judge was right to flag it.
-- Replace it with a claim that is true for its cited section. Runs compare only within one golden set.
update public.golden_cases
set inject_claims = '[{"text":"{footprint} SF ground footprint; the number of stories is not recorded.","source":"foot","detail":"Footprint and story note"}]'::jsonb,
    note = 'Footprint with the story caveat (v3: was a two-source claim, mislabeled true)'
where case_type = 'true_claims' and note = 'Two facts in one claim';
