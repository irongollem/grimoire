-- Migration: sync_srd_spell_art_includes_srd_spell_art_table
-- Update sync function to also pull from srd_spell_art (canonical rows), not just srd_art_defaults

create or replace function sync_srd_spell_art_to_shared_table()
returns integer
language plpgsql
security definer
as $$
declare
  updated_count integer := 0;
  batch_count   integer;
begin
  if not is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  -- Legacy path: art uploaded to the spells table (open5e_import) and published to srd_art_defaults
  update srd_spells ss
  set image_url         = sad.image_url,
      image_focal_point = sad.image_focal_point,
      updated_at        = now()
  from srd_art_defaults sad
  where sad.content_type = 'spell'
    and sad.srd_slug     = lower(ss.name)
    and sad.image_url    is not null;

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  -- New path: art uploaded directly via the srd_spell_art table (canonical rows only)
  update srd_spells ss
  set image_url         = ssa.image_url,
      image_focal_point = ssa.portrait_focal_point,
      updated_at        = now()
  from srd_spell_art ssa
  where ssa.srd_id       = ss.id
    and ssa.is_canonical = true
    and ssa.image_url    is not null;

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  return updated_count;
end;
$$;
