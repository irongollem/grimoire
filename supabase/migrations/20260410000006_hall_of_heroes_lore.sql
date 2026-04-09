-- ── Hall of Heroes: fill public-knowledge lore ───────────────────────────────
-- Corrects the seed migration which used COALESCE (only fills SQL NULL).
-- Empty strings / empty Tiptap docs are now overwritten directly.
-- Uses ILIKE for name matching to handle capitalisation differences.

-- Drizzt Do'Urden (Forgotten Realms icon)
update hall_of_heroes set
  race        = 'Drow Elf',
  alignment   = 'Chaotic Good',
  occupation  = 'Ranger',
  appearance  = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Slender and lithe with jet-black skin, shoulder-length white hair, and striking lavender eyes. Wears a dark travelling cloak and carries two scimitars — Twinkle and Icingdeath — at his hips."}]}]}',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Noble, introspective, and fiercely loyal. Fights constantly against the cruelty of his drow upbringing. Deeply moral, with a quiet intensity and genuine compassion for the downtrodden."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Born in Menzoberranzan, Drizzt rejected the evil ways of drow society and fled to the surface world. After years wandering alone with his magical panther companion Guenhwyvar, he found family among the Companions of the Hall in Icewind Dale. One of the most celebrated rangers in all of Faerûn."}]}]}'
where name ilike 'Drizzt%';

-- Vaelish Gant (Rime of the Frostmaiden)
update hall_of_heroes set
  race        = 'Human',
  alignment   = 'Lawful Evil',
  occupation  = 'Wizard',
  appearance  = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Smooth-tongued and well-dressed, with the composed air of a man accustomed to authority. His manner suggests someone who has spent years perfecting the appearance of respectability."}]}]}',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Cunning and manipulative, hiding ruthless ambition behind a veneer of reasonableness. Uses charm and political savvy to advance his schemes while keeping his hands apparently clean."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"An aspiring member of the Arcane Brotherhood who arrived in Ten-Towns with a scheme to seize political control and use the region as a launchpad for Brotherhood influence. His manipulation of local leaders was eventually exposed and he was imprisoned by the townsfolk."}]}]}'
where name ilike 'Vaelish%';

-- Edgin Darvis (Honor Among Thieves)
update hall_of_heroes set
  race        = 'Human',
  alignment   = 'Chaotic Good',
  occupation  = 'Bard / Former Harper',
  appearance  = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Roguishly handsome with dark hair and an easy, practised smile. Carries a lute and moves with the confident swagger of someone who has talked his way out of countless dangerous situations."}]}]}',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Charming, optimistic, and quick-witted. Driven by deep devotion to his daughter Kira and haunted by the loss of his wife Zia. Leads with his heart even when his head should know better."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A former Harper bard who turned to thieving after his wife Zia was murdered by Red Wizards seeking revenge. Arrested and sent to Revel''s End, he escaped with his companion Holga and set out to reclaim his daughter from his former partner Forge Fitzwilliam, who had seized power in Neverwinter."}]}]}'
where name ilike 'Edgin%';

-- Holga (Honor Among Thieves)
update hall_of_heroes set
  race        = 'Human',
  alignment   = 'Chaotic Good',
  occupation  = 'Barbarian',
  appearance  = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Tall and powerfully built with braided red hair and a no-nonsense bearing. Dresses for function over form and carries a handaxe with practised ease."}]}]}',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Blunt, fierce, and deeply protective of those she calls family. Uncomfortable with lengthy conversation but unfailingly loyal. Has a surprising soft spot for Edgin''s daughter Kira and an inexplicable fondness for potatoes."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"An exile from the Uthgardt Elk tribe, Holga found purpose as a companion to the bard Edgin Darvis and a surrogate mother figure to his daughter Kira. When Edgin was imprisoned in Revel''s End, she waited loyally for his return. Considered one of the most formidable fighters in Neverwinter''s underworld."}]}]}'
where name ilike 'Holga%';

-- Forge Fitzwilliam (Honor Among Thieves)
update hall_of_heroes set
  race        = 'Human',
  alignment   = 'Neutral Evil',
  occupation  = 'Rogue / Lord of Neverwinter',
  appearance  = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Impeccably dressed in fine clothing that advertises his newly acquired wealth and status. Preening and polished, with the air of a man who has recently clawed his way into power and intends to stay there."}]}]}',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Charismatic, self-serving, and casually treacherous. Betrays allies the moment it becomes convenient. Deeply vain about his title and elevated status as Lord of Neverwinter."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Once a thief and partner to Edgin Darvis, Forge seized his opportunity while Edgin rotted in Revel''s End — allying with the Red Wizard Sofina to ascend to Lord of Neverwinter. He used the city''s arena as a brutal revenue source to fund their shared ambitions until Edgin''s group exposed him."}]}]}'
where name ilike 'Forge%';

-- Zia Darvis (Honor Among Thieves)
update hall_of_heroes set
  race        = 'Human',
  alignment   = 'Lawful Good',
  occupation  = 'Harper',
  status      = 'dead',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Warm, principled, and devoted to her family. Her memory drives Edgin''s every action and shapes his understanding of what is worth fighting for."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Edgin Darvis''s wife and a fellow Harper. Murdered by Red Wizards when they came to punish Edgin for stealing from them. Later briefly resurrected by the Tablet of Reawakening, she chose to pass on peacefully rather than remain."}]}]}'
where name ilike 'Zia%';
