-- ── Hall of Heroes: seed from existing campaign NPCs ─────────────────────────
-- Copies selected NPCs into the global roster.
-- Runs as postgres superuser so RLS is bypassed for the seed.

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
  -- Icewind Dale lore
  '00c85e41-1bd4-42cb-bb7d-ec28b00cbbfa', -- Drizzt Do'Urden
  '16628d60-b62e-4697-9e92-fc1b4bf5fdc5', -- Voss Anderton
  '7d8eec48-d802-413f-ad5b-e908553b294d', -- Hedrun Arnsfirth
  'd66b8eec-ff19-4424-ba99-222f976a1847', -- Vaelish Gant
  'dd2ba109-c40f-491d-a87a-ea73091c7356', -- Bjami
  -- Honor Among Thieves
  'd68ddf5f-1740-41f3-afe5-f56d8f69b5bb', -- Holga Kilgore
  'bbe5d652-3530-4a0b-b694-8670834dcae0', -- Zia (and Kira) Darvis
  '47ca3940-f829-4caf-9850-4cc7f89ff475', -- Marlamin
  '8b854273-cf43-4798-bb69-54a1c7aff6f8', -- Forge Fitzwilliam
  '08b50643-fb6e-4e49-af33-38bdb5f15845'  -- Edgin Darvis
)
on conflict do nothing;

-- ── Fill in public knowledge for well-known characters ────────────────────────
-- Uses COALESCE so existing data is never overwritten.

-- Drizzt Do'Urden (Forgotten Realms icon)
update hall_of_heroes set
  race        = coalesce(race,       'Drow Elf'),
  alignment   = coalesce(alignment,  'Chaotic Good'),
  occupation  = coalesce(occupation, 'Ranger'),
  appearance  = coalesce(appearance, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Slender and lithe with jet-black skin, shoulder-length white hair, and striking lavender eyes. Wears a dark traveling cloak and carries two scimitars — Twinkle and Icingdeath — at his hips."}]}]}'),
  personality = coalesce(personality,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Noble, introspective, and fiercely loyal. Fights constantly against the cruelty of his drow upbringing. Deeply moral, with a quiet intensity and genuine compassion for the downtrodden."}]}]}'),
  backstory   = coalesce(backstory,  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Born in Menzoberranzan, Drizzt rejected the evil ways of drow society and fled to the surface world. After years wandering alone with his magical panther companion Guenhwyvar, he found family among the Companions of the Hall in Icewind Dale. One of the most celebrated rangers in all of Faerûn."}]}]}')
where name = 'Drizzt Do''Urden';

-- Vaelish Gant (Rime of the Frostmaiden)
update hall_of_heroes set
  race        = coalesce(race,       'Human'),
  alignment   = coalesce(alignment,  'Lawful Evil'),
  occupation  = coalesce(occupation, 'Wizard'),
  appearance  = coalesce(appearance, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Smooth-tongued and well-dressed, with the composed air of a man accustomed to authority. His manner suggests someone who has spent years perfecting the appearance of respectability."}]}]}'),
  personality = coalesce(personality,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Cunning and manipulative, hiding ruthless ambition behind a veneer of reasonableness. Uses charm and political savvy to advance his schemes while keeping his hands apparently clean."}]}]}'),
  backstory   = coalesce(backstory,  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"An aspiring member of the Arcane Brotherhood who arrived in Ten-Towns with a scheme to seize political control and use the region as a launchpad for Brotherhood influence. His manipulation of local leaders was eventually exposed and he was imprisoned by the townsfolk."}]}]}')
where name = 'Vaelish Gant';

-- Edgin Darvis (Honor Among Thieves)
update hall_of_heroes set
  race        = coalesce(race,       'Human'),
  alignment   = coalesce(alignment,  'Chaotic Good'),
  occupation  = coalesce(occupation, 'Bard / Former Harper'),
  appearance  = coalesce(appearance, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Roguishly handsome with dark hair and an easy, practised smile. Carries a lute and moves with the confident swagger of someone who has talked his way out of countless dangerous situations."}]}]}'),
  personality = coalesce(personality,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Charming, optimistic, and quick-witted. Driven by deep devotion to his daughter Kira and haunted by the loss of his wife Zia. Leads with his heart even when his head should know better."}]}]}'),
  backstory   = coalesce(backstory,  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A former Harper bard who turned to thieving after his wife Zia was murdered by Red Wizards seeking revenge. Arrested and sent to Revel''s End, he escaped with his companion Holga and set out to reclaim his daughter from his former partner Forge Fitzwilliam, who had seized power in Neverwinter."}]}]}')
where name = 'Edgin Darvis';

-- Holga Kilgore (Honor Among Thieves)
update hall_of_heroes set
  race        = coalesce(race,       'Human'),
  alignment   = coalesce(alignment,  'Chaotic Good'),
  occupation  = coalesce(occupation, 'Barbarian'),
  appearance  = coalesce(appearance, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Tall and powerfully built with braided red hair and a no-nonsense bearing. Dresses for function over form and carries a handaxe with practiced ease."}]}]}'),
  personality = coalesce(personality,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Blunt, fierce, and deeply protective of those she calls family. Uncomfortable with lengthy conversation but unfailingly loyal. Has a surprising soft spot for Edgin''s daughter Kira and an inexplicable fondness for potatoes."}]}]}'),
  backstory   = coalesce(backstory,  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"An exile from the Uthgardt Elk tribe, Holga found purpose as a companion to the bard Edgin Darvis and a surrogate mother figure to his daughter Kira. When Edgin was imprisoned in Revel''s End, she waited loyally for his return. Considered one of the most formidable fighters in Neverwinter''s underworld."}]}]}')
where name = 'Holga';

-- Forge Fitzwilliam (Honor Among Thieves)
update hall_of_heroes set
  race        = coalesce(race,       'Human'),
  alignment   = coalesce(alignment,  'Neutral Evil'),
  occupation  = coalesce(occupation, 'Rogue / Lord of Neverwinter'),
  appearance  = coalesce(appearance, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Impeccably dressed in fine clothing that advertises his newly acquired wealth and status. Preening and polished, with the air of a man who has recently clawed his way into power and intends to stay there."}]}]}'),
  personality = coalesce(personality,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Charismatic, self-serving, and casually treacherous. Betrays allies the moment it becomes convenient. Deeply vain about his title and elevated status as Lord of Neverwinter."}]}]}'),
  backstory   = coalesce(backstory,  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Once a thief and partner to Edgin Darvis, Forge seized his opportunity while Edgin rotted in Revel''s End — allying with the Red Wizard Sofina to ascend to Lord of Neverwinter. He used the city''s arena as a brutal revenue source to fund their shared ambitions until Edgin''s group exposed him."}]}]}')
where name = 'Forge Fitzwilliam';

-- Zia Darvis (Honor Among Thieves) — Edgin's wife, deceased
update hall_of_heroes set
  race        = coalesce(race,       'Human'),
  alignment   = coalesce(alignment,  'Lawful Good'),
  occupation  = coalesce(occupation, 'Harper'),
  status      = 'dead',
  personality = coalesce(personality,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Warm, principled, and devoted to her family. Her memory drives Edgin''s every action and shapes his understanding of what is worth fighting for."}]}]}'),
  backstory   = coalesce(backstory,  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Edgin Darvis''s wife and a fellow Harper. Murdered by Red Wizards when they came to punish Edgin for stealing from them. Later briefly resurrected by the Tablet of Reawakening, she chose to pass on peacefully rather than remain."}]}]}')
where name like 'Zia%';
