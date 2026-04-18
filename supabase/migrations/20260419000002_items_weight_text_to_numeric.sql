-- Migration: items_weight_text_to_numeric
-- Convert items.weight from text ("3 lb.") to numeric, stripping unit suffixes

alter table items
  alter column weight type numeric
  using case
    when weight is null then null
    when weight ~ '\d' then (regexp_match(weight, '(\d+(?:\.\d+)?)'))[1]::numeric
    else null
  end;
