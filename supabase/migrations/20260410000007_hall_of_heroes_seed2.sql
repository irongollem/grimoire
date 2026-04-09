-- ── Hall of Heroes: seed additional NPCs ─────────────────────────────────────

insert into hall_of_heroes (
  user_id, name, race, alignment, age, occupation,
  appearance, personality, backstory, notes,
  status, relationship,
  portrait_url, card_art_url, portrait_focal_point,
  disguise_name, disguise_portrait_url, disguise_portrait_focal_point, is_revealed,
  tags, stat_block, setting
)
select
  user_id, name, race, alignment, age, occupation,
  appearance, personality, backstory, notes,
  status, relationship,
  portrait_url, card_art_url, portrait_focal_point,
  disguise_name, disguise_portrait_url, disguise_portrait_focal_point, is_revealed,
  tags, stat_block, 'faerun'
from npcs
where id in (
  '61646a31-ae37-499c-b13f-c27eaa3a08a6', -- Jarnathan       (Honor Among Thieves)
  'f3574f79-3634-4392-88c8-524b14cb8400', -- Jil Torbo
  'c869a29e-9fb6-4716-88f1-2ec0e8e094ab'  -- Kriv Norixius
)
on conflict do nothing;

-- ── Lore fills ────────────────────────────────────────────────────────────────

-- Jarnathan (Honor Among Thieves — Aarakocra council member)
update hall_of_heroes set
  race        = 'Aarakocra',
  alignment   = 'Lawful Neutral',
  occupation  = 'Council Member',
  appearance  = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A tall, dignified Aarakocra with sharp amber eyes and neatly preened feathers. Wears formal council robes and carries himself with the composed authority expected of his office."}]}]}',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Solemn, duty-bound, and deeply unimpressed by adventurers. Holds his council duties in high regard and considers himself several stations above being dragged into other people''s schemes."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A respected Aarakocra member of the Harpers'' council in Neverwinter. Jarnathan''s great misfortune was being in the wrong council chamber at the wrong time when Edgin Darvis''s group needed a volunteer for a dangerous magical ritual. He was not, in any sense of the word, a volunteer. He survived the ordeal, but has strong feelings about it."}]}]}'
where name ilike 'Jarnathan%';

-- Marlamin (Honor Among Thieves — minor crew member, partner of Holga)
update hall_of_heroes set
  occupation  = 'Thief',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Scrappy and street-smart, more comfortable in the shadows than in the spotlight. Loyal to those who''ve earned it."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A minor member of Edgin and Holga''s thieving crew during their early days of crime. Present for the heist that eventually led to Edgin''s imprisonment, though his own fate after that night is less well documented."}]}]}'
where name ilike 'Marlamin%';
