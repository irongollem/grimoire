-- Innate, feat, and item spells can use a different ability or a fixed item DC
-- from the character's class spellcasting. Persist that grant-level rule so
-- every casting surface can announce the correct attack and save values.
alter table public.character_spells
  add column if not exists casting_ability text,
  add column if not exists fixed_save_dc integer,
  add column if not exists fixed_attack_bonus integer,
  add constraint character_spells_casting_ability_check
    check (casting_ability is null or casting_ability in ('int', 'wis', 'cha')),
  add constraint character_spells_fixed_save_dc_check
    check (fixed_save_dc is null or fixed_save_dc between 1 and 40),
  add constraint character_spells_fixed_attack_bonus_check
    check (fixed_attack_bonus is null or fixed_attack_bonus between -10 and 30);
