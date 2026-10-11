-- Migration: grimoire_backgrounds
-- 22 player backgrounds written from scratch for Dungeon Grimoire (12 Oct 2026), each with a 2014 and a 2024 row:
-- Archaeologist, Arcane Apprentice, Artisan, Bounty Hunter, Charlatan, Courtier, Entertainer, Far Traveller, Farmer,
-- Gladiator, Guard, Guide, Herbalist, Hermit, Investigator, Knight, Merchant, Noble, Sailor, Scribe, Spy, Wayfarer.
--
-- Why: a 2024 table read four backgrounds (SRD 5.2.1 has only Acolyte, Criminal, Sage and Soldier), and the common
-- concepts outside the open books (Archaeologist, Far Traveller, Knight, Spy, Investigator...) existed nowhere, so
-- players built their own. These are ordinary walks of life, not anyone's property; the descriptions, feature names,
-- feature effects and characteristic tables are original, and no setting names are used.
--
-- Mechanics follow each edition's own construction rules. 2014: two skills, two tool or language proficiencies, a
-- narrative feature, starting equipment with a pouch of coin. 2024: two skills, one tool, an ability trio for the
-- +2/+1 or +1/+1/+1 increase, an Origin feat, and the A-or-B equipment choice worth 50 GP. The Origin feat is one the
-- library actually holds (Alert, Magic Initiate, Savage Attacker, Skilled: the SRD 5.2.1 four), because the 2024
-- builder resolves `origin_feat` against `class_features`; a feat the library lacks would leave the grant dangling.
-- The characteristic tables ride on both rows: 2024 dropped them from the rules, not from the table.
--
-- They live under their own source, `grimoire-backgrounds`, "Grimoire Backgrounds (homebrew)", opt-in per campaign
-- like `grimoire-species` (20261009215703): a DM enables it under sources, and can see it is house content.
-- Art is published separately (`npm run library:art -- generate --background <id>`), one picture per name.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-backgrounds', null, 'Grimoire Backgrounds (homebrew)', 'Dungeon Grimoire', '{}', 'Original homebrew backgrounds written for Dungeon Grimoire. Not from any published book.', null, null, true, true, 84)
on conflict (key) do nothing;

insert into public.library_backgrounds (id, name, description, skill_proficiencies, tool_proficiencies, languages, equipment, feature_name, feature_description, suggested_characteristics, feat_grant_name, asi_ability_trio, origin_feat, source, source_title, ruleset, conceptual_key, source_document_key, source_record_key, source_revision, source_license, provenance)
values
  ('grimoire_archaeologist', 'Archaeologist', 'You spent years in the field, kneeling in trenches and coaxing the past out of the dirt with a brush and a great deal of patience. Perhaps you studied under a scholar who funded digs, or perhaps you learned by sneaking onto a site and being handed a trowel to keep you quiet. Either way, you know that a broken pot can tell you more than a king''s tomb inscription, if you ask it properly.

The work has left you with a good eye for old things, a respect for the dead and a lasting tolerance for cold, damp and dark places. It has also left you with enemies: looters, rival scholars and patrons who wanted treasure when you offered them knowledge.', array['History', 'Survival']::text[], array['Cartographer''s Tools or Navigator''s Tools']::text[], array['One of your choice']::text[], 'A shovel, a hooded lantern, a coil of rope, a set of traveller''s clothes, a field notebook, and a pouch containing 15 gp', 'Ruin-Reader', 'When you enter a ruin, tomb or abandoned dungeon, you can tell what it was originally built for and which people raised it, provided enough of the structure survives to study. You can also judge the age, origin and fair worth of very old art objects and relics at a glance, and collectors tend to take your appraisal seriously.', 'Archaeologists tend to be patient, curious and quietly stubborn, happier with a trowel than a sword. Many treat every site as a conversation with people long gone.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I narrate what I find aloud, whether or not anyone is listening. |
| 2 | I would rather be an hour late than rush a careful measurement. |
| 3 | I apologise to skeletons when I have to move them. |
| 4 | Dirt under my fingernails is a sign of a good week. |
| 5 | I get unbearably smug when a theory of mine turns out right. |
| 6 | I name every tool I own, and I am hurt when they are mistreated. |
| 7 | I ask permission before touching anything that looks sacred. |
| 8 | I have a story about a cursed object for every occasion, and most are true. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Knowledge.** The past belongs to everyone, so it should be recorded before it is sold. (Good) |
| 2 | **Order.** A site dug carelessly is a library burned, and I will do it properly. (Lawful) |
| 3 | **Discovery.** The greatest finds are under the places everyone says are empty. (Chaotic) |
| 4 | **Respect.** The dead made these things, and I will not treat their graves as shops. (Good) |
| 5 | **Fame.** I mean to put my name on a find that outlives me. (Any) |
| 6 | **Greed.** A relic is worth what a buyer will pay, and I know many buyers. (Evil) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | My old mentor vanished on a dig, and I mean to learn what they found. |
| 2 | A museum holds a piece taken from a site I excavated, and I want it returned. |
| 3 | I carry a broken tablet whose other half I have sworn to find. |
| 4 | My field notebook is the only record of a place that has since collapsed. |
| 5 | A rival once credited my work to themselves, and I will set the record straight. |
| 6 | I promised a village I would protect their ancient shrine from looters. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I will take a stupid risk if the alternative is leaving a chamber unexplored. |
| 2 | I keep artefacts I should hand over, just to look at them a little longer. |
| 3 | I trust anyone who shows real interest in my work. |
| 4 | I dismiss the traditions of living people as mere superstition. |
| 5 | I cannot stop correcting people about dates. |
| 6 | I am convinced every old thing is a clue to something larger. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'archaeologist', 'grimoire-backgrounds', 'grimoire_2014_archaeologist', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_archaeologist', 'Archaeologist', 'You spent years in the field, kneeling in trenches and coaxing the past out of the dirt with a brush and a great deal of patience. Perhaps you studied under a scholar who funded digs, or perhaps you learned by sneaking onto a site and being handed a trowel to keep you quiet. Either way, you know that a broken pot can tell you more than a king''s tomb inscription, if you ask it properly.

The work has left you with a good eye for old things, a respect for the dead and a lasting tolerance for cold, damp and dark places. It has also left you with enemies: looters, rival scholars and patrons who wanted treasure when you offered them knowledge.', array['History', 'Survival']::text[], array['Cartographer''s Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Cartographer''s Tools, Shovel, Hooded Lantern, Traveler''s Clothes, Rope, Backpack, 23 GP; or (B) 50 GP', null, null, 'Archaeologists tend to be patient, curious and quietly stubborn, happier with a trowel than a sword. Many treat every site as a conversation with people long gone.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I narrate what I find aloud, whether or not anyone is listening. |
| 2 | I would rather be an hour late than rush a careful measurement. |
| 3 | I apologise to skeletons when I have to move them. |
| 4 | Dirt under my fingernails is a sign of a good week. |
| 5 | I get unbearably smug when a theory of mine turns out right. |
| 6 | I name every tool I own, and I am hurt when they are mistreated. |
| 7 | I ask permission before touching anything that looks sacred. |
| 8 | I have a story about a cursed object for every occasion, and most are true. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Knowledge.** The past belongs to everyone, so it should be recorded before it is sold. (Good) |
| 2 | **Order.** A site dug carelessly is a library burned, and I will do it properly. (Lawful) |
| 3 | **Discovery.** The greatest finds are under the places everyone says are empty. (Chaotic) |
| 4 | **Respect.** The dead made these things, and I will not treat their graves as shops. (Good) |
| 5 | **Fame.** I mean to put my name on a find that outlives me. (Any) |
| 6 | **Greed.** A relic is worth what a buyer will pay, and I know many buyers. (Evil) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | My old mentor vanished on a dig, and I mean to learn what they found. |
| 2 | A museum holds a piece taken from a site I excavated, and I want it returned. |
| 3 | I carry a broken tablet whose other half I have sworn to find. |
| 4 | My field notebook is the only record of a place that has since collapsed. |
| 5 | A rival once credited my work to themselves, and I will set the record straight. |
| 6 | I promised a village I would protect their ancient shrine from looters. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I will take a stupid risk if the alternative is leaving a chamber unexplored. |
| 2 | I keep artefacts I should hand over, just to look at them a little longer. |
| 3 | I trust anyone who shows real interest in my work. |
| 4 | I dismiss the traditions of living people as mere superstition. |
| 5 | I cannot stop correcting people about dates. |
| 6 | I am convinced every old thing is a clue to something larger. |', 'Skilled', array['constitution', 'intelligence', 'wisdom']::text[], '{"name":"Skilled","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'archaeologist', 'grimoire-backgrounds', 'grimoire_2024_archaeologist', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_arcane_apprentice', 'Arcane Apprentice', 'You spent your youth in a wizard''s tower, sweeping floors, copying notes and fetching ingredients that you were told never to taste. In return you were taught, in fits and starts, how the unseen workings of the world fit together. Your master may have been kind, forgetful, exacting or alarming, and probably all four before breakfast.

You left, or were sent away, with a head full of half-finished theory, ink on your sleeves and a deep suspicion of anything that hums. You can read a spell''s structure even when you cannot cast it, and you know the difference between genuine magic and a good showman. What you do with that knowledge is up to you.', array['Arcana', 'History']::text[], '{}'::text[], array['Two of your choice']::text[], 'A spellbook of notes, a bottle of black ink, a quill, a small knife, a set of traveller''s clothes, and a pouch containing 10 gp', 'Master''s Library', 'Your former master''s library and the scholars around it still open doors for you. You can gain access to the private study of a wizard or the reading room of a magical school by invoking your master''s name or craft, and you can usually find someone there willing to answer one question about a magical subject, though they may expect a favour in return.', 'Arcane apprentices often carry themselves like students who have not quite finished their lessons: eager, a little anxious, and certain the answer is in a book somewhere.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I quote my old master constantly, and not always accurately. |
| 2 | I cannot walk past a bookshelf without reading the spines. |
| 3 | I flinch when anything glows unexpectedly. |
| 4 | I label things in my pack, then forget what the labels mean. |
| 5 | I treat every problem as an exercise to be solved properly. |
| 6 | I get quietly furious when someone calls magic "tricks". |
| 7 | I hum while I think, and the notes are always the same three. |
| 8 | I ask a great many questions, usually in the middle of danger. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Curiosity.** Every locked door is a lesson I have not finished. (Chaotic) |
| 2 | **Responsibility.** Power left unchecked burns the people near it, so I check mine. (Lawful) |
| 3 | **Mastery.** I will be better than my master, however long it takes. (Any) |
| 4 | **Sharing.** Knowledge hoarded is knowledge wasted. (Good) |
| 5 | **Caution.** Most disasters begin with someone saying it will be fine. (Neutral) |
| 6 | **Ambition.** The world rewards the people who dare to cast the spell. (Evil) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | My master is missing, and I intend to find out why. |
| 2 | I took something from the tower that was not mine, and I owe it back. |
| 3 | A fellow apprentice and I swore to meet again as full wizards. |
| 4 | I carry my master''s spellbook, which I am forbidden to open. |
| 5 | The tower''s old cat followed me out, and I am responsible for it now. |
| 6 | I owe my training to a debt that is still unpaid. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I sneer at anyone who has not read the foundational texts. |
| 2 | I would rather read about danger than face it. |
| 3 | I keep secrets from my friends because I was taught to guard them. |
| 4 | I assume anything I do not understand is my fault. |
| 5 | I take shortcuts in the lab that I would never allow in others. |
| 6 | I resent being treated as a servant, even when I volunteer. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'arcane_apprentice', 'grimoire-backgrounds', 'grimoire_2014_arcane_apprentice', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_arcane_apprentice', 'Arcane Apprentice', 'You spent your youth in a wizard''s tower, sweeping floors, copying notes and fetching ingredients that you were told never to taste. In return you were taught, in fits and starts, how the unseen workings of the world fit together. Your master may have been kind, forgetful, exacting or alarming, and probably all four before breakfast.

You left, or were sent away, with a head full of half-finished theory, ink on your sleeves and a deep suspicion of anything that hums. You can read a spell''s structure even when you cannot cast it, and you know the difference between genuine magic and a good showman. What you do with that knowledge is up to you.', array['Arcana', 'Investigation']::text[], array['Calligrapher''s Supplies']::text[], '{}'::text[], '*Choose A or B:* (A) Calligrapher''s Supplies, Arcane Focus (Wand), Book, Traveler''s Clothes, 3 GP; or (B) 50 GP', null, null, 'Arcane apprentices often carry themselves like students who have not quite finished their lessons: eager, a little anxious, and certain the answer is in a book somewhere.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I quote my old master constantly, and not always accurately. |
| 2 | I cannot walk past a bookshelf without reading the spines. |
| 3 | I flinch when anything glows unexpectedly. |
| 4 | I label things in my pack, then forget what the labels mean. |
| 5 | I treat every problem as an exercise to be solved properly. |
| 6 | I get quietly furious when someone calls magic "tricks". |
| 7 | I hum while I think, and the notes are always the same three. |
| 8 | I ask a great many questions, usually in the middle of danger. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Curiosity.** Every locked door is a lesson I have not finished. (Chaotic) |
| 2 | **Responsibility.** Power left unchecked burns the people near it, so I check mine. (Lawful) |
| 3 | **Mastery.** I will be better than my master, however long it takes. (Any) |
| 4 | **Sharing.** Knowledge hoarded is knowledge wasted. (Good) |
| 5 | **Caution.** Most disasters begin with someone saying it will be fine. (Neutral) |
| 6 | **Ambition.** The world rewards the people who dare to cast the spell. (Evil) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | My master is missing, and I intend to find out why. |
| 2 | I took something from the tower that was not mine, and I owe it back. |
| 3 | A fellow apprentice and I swore to meet again as full wizards. |
| 4 | I carry my master''s spellbook, which I am forbidden to open. |
| 5 | The tower''s old cat followed me out, and I am responsible for it now. |
| 6 | I owe my training to a debt that is still unpaid. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I sneer at anyone who has not read the foundational texts. |
| 2 | I would rather read about danger than face it. |
| 3 | I keep secrets from my friends because I was taught to guard them. |
| 4 | I assume anything I do not understand is my fault. |
| 5 | I take shortcuts in the lab that I would never allow in others. |
| 6 | I resent being treated as a servant, even when I volunteer. |', 'Magic Initiate (Wizard)', array['constitution', 'intelligence', 'wisdom']::text[], '{"name":"Magic Initiate","variant":"Wizard"}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'arcane_apprentice', 'grimoire-backgrounds', 'grimoire_2024_arcane_apprentice', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_artisan', 'Artisan', 'You learned a trade at a bench, forge or loom, starting with the dull work and slowly earning the interesting jobs. You know the weight of good material, the smell of a bad weld and the exact moment a customer has stopped listening to your price. Your hands know things your mouth cannot explain.

You may have run a workshop, belonged to a guild or simply worked beside a relative until the craft became yours. Either way, you leave the trade with calluses, a few sharp opinions about shoddy work and a reputation that travels further than you do.', array['Investigation', 'Persuasion']::text[], array['One type of Artisan''s Tools']::text[], array['One of your choice']::text[], 'A set of artisan''s tools of your choice, a mallet, a bolt of cloth with your maker''s mark, a set of traveller''s clothes, and a pouch containing 15 gp', 'Maker''s Mark', 'You have a recognisable maker''s mark, and fellow craftspeople know it. In any settlement with a workshop of your trade, you can borrow the use of a bench and basic tools for a day, and sellers and buyers there will treat your word on the quality of a made item as reliable.', 'Artisans tend to be practical, proud of their work and quick to size up a stranger by how they treat their tools.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I touch every well-made thing I pass, and I always say something about it. |
| 2 | I cannot leave a wobbling table alone. |
| 3 | I refuse to cut a corner, even when it would be sensible. |
| 4 | I speak in measurements, and I am usually right. |
| 5 | I haggle with a grin and never take offence. |
| 6 | I teach anyone who shows the slightest interest in my craft. |
| 7 | I hum a work song whenever my hands are busy. |
| 8 | I cannot sleep until I have cleaned my tools. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Craft.** A thing done well is its own reward. (Good) |
| 2 | **Tradition.** The old methods exist because they work. (Lawful) |
| 3 | **Freedom.** No guild gets to tell me what I am allowed to make. (Chaotic) |
| 4 | **Community.** A town is built by the people who fix its roofs. (Good) |
| 5 | **Profit.** Good work deserves a good price, and I will set it. (Neutral) |
| 6 | **Legacy.** I want my work still holding up when I am gone. (Any) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | My old workshop was lost, and I mean to rebuild it. |
| 2 | I owe my skill to a teacher whose last wish I have not yet kept. |
| 3 | A piece I made is in the wrong hands, and I want it back. |
| 4 | I am sworn to a guild that has stopped answering my letters. |
| 5 | My apprentice is somewhere out there, and I worry about them. |
| 6 | I made something for a loved one that I have never been able to deliver. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I judge people by the quality of their boots. |
| 2 | I will take a commission I know I cannot finish on time. |
| 3 | I cannot admit when someone else has done it better. |
| 4 | I trust my own measure over anyone else''s, even when I am wrong. |
| 5 | I am slow to forgive anyone who damages my tools. |
| 6 | I will work myself into the ground before I ask for help. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'artisan', 'grimoire-backgrounds', 'grimoire_2014_artisan', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_artisan', 'Artisan', 'You learned a trade at a bench, forge or loom, starting with the dull work and slowly earning the interesting jobs. You know the weight of good material, the smell of a bad weld and the exact moment a customer has stopped listening to your price. Your hands know things your mouth cannot explain.

You may have run a workshop, belonged to a guild or simply worked beside a relative until the craft became yours. Either way, you leave the trade with calluses, a few sharp opinions about shoddy work and a reputation that travels further than you do.', array['Investigation', 'Persuasion']::text[], array['Choose one kind of Artisan''s Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Carpenter''s Tools, Crowbar, Backpack, Traveler''s Clothes, 36 GP; or (B) 50 GP', null, null, 'Artisans tend to be practical, proud of their work and quick to size up a stranger by how they treat their tools.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I touch every well-made thing I pass, and I always say something about it. |
| 2 | I cannot leave a wobbling table alone. |
| 3 | I refuse to cut a corner, even when it would be sensible. |
| 4 | I speak in measurements, and I am usually right. |
| 5 | I haggle with a grin and never take offence. |
| 6 | I teach anyone who shows the slightest interest in my craft. |
| 7 | I hum a work song whenever my hands are busy. |
| 8 | I cannot sleep until I have cleaned my tools. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Craft.** A thing done well is its own reward. (Good) |
| 2 | **Tradition.** The old methods exist because they work. (Lawful) |
| 3 | **Freedom.** No guild gets to tell me what I am allowed to make. (Chaotic) |
| 4 | **Community.** A town is built by the people who fix its roofs. (Good) |
| 5 | **Profit.** Good work deserves a good price, and I will set it. (Neutral) |
| 6 | **Legacy.** I want my work still holding up when I am gone. (Any) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | My old workshop was lost, and I mean to rebuild it. |
| 2 | I owe my skill to a teacher whose last wish I have not yet kept. |
| 3 | A piece I made is in the wrong hands, and I want it back. |
| 4 | I am sworn to a guild that has stopped answering my letters. |
| 5 | My apprentice is somewhere out there, and I worry about them. |
| 6 | I made something for a loved one that I have never been able to deliver. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I judge people by the quality of their boots. |
| 2 | I will take a commission I know I cannot finish on time. |
| 3 | I cannot admit when someone else has done it better. |
| 4 | I trust my own measure over anyone else''s, even when I am wrong. |
| 5 | I am slow to forgive anyone who damages my tools. |
| 6 | I will work myself into the ground before I ask for help. |', 'Skilled', array['strength', 'dexterity', 'intelligence']::text[], '{"name":"Skilled","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'artisan', 'grimoire-backgrounds', 'grimoire_2024_artisan', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_bounty_hunter', 'Bounty Hunter', 'You made your living by finding people who did not want to be found and delivering them to people who wanted them badly. It was patient work: reading rumours, buying drinks for the wrong sort of friend and waiting in cold doorways. Some of your quarry deserved their fate; some did not, and you learned to keep track of which.

The trade left you with sharp instincts, a good memory for faces and a habit of sitting where you can see the door. Whether you still work for a bounty or have turned that skill to your own purposes, you know how people hide, how they run and what always gives them away.', array['Investigation', 'Survival']::text[], array['Thieves'' Tools', 'One type of Gaming Set']::text[], '{}'::text[], 'A set of manacles, a coil of rope, a set of thieves'' tools, a deck of cards, a set of traveller''s clothes, and a pouch containing 15 gp', 'Ear to the Ground', 'You know where to listen. In any settlement, you can find the tavern, market or lodging house where rumour gathers, and within a day or so you can learn whether a particular person has passed through recently and which way they went, unless they have taken great care to hide it. Locals who see you as a hunter will usually share what they know quietly, or sell it.', 'Bounty hunters tend to be watchful and wry, with a patience that unnerves people and a bluntness that saves time.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I always sit facing the door and I never explain why. |
| 2 | I remember a face for years, and I tell people so. |
| 3 | I keep my promises, especially the unpleasant ones. |
| 4 | I am unfailingly polite to the people I am about to arrest. |
| 5 | I laugh at the wrong moments, and then apologise. |
| 6 | I carry a little extra rope, just in case. |
| 7 | I do not drink on a job, and I am always on a job. |
| 8 | I judge a stranger by how they treat the waiter. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Justice.** A crime named should be a crime answered. (Lawful) |
| 2 | **Mercy.** Not everyone I find deserves what is waiting for them. (Good) |
| 3 | **Coin.** The work is honest, and so is the price. (Neutral) |
| 4 | **Freedom.** I answer to no warrant but my own sense of right. (Chaotic) |
| 5 | **Reputation.** When I take a job, it stays taken. (Any) |
| 6 | **Fear.** A hunter feared gets doors opened and questions answered. (Evil) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | I am hunting someone who slipped away from me, and I will not rest until I find them. |
| 2 | A person I once brought in turned out to be innocent, and I am trying to make it right. |
| 3 | My former partner taught me everything, and I owe them a favour. |
| 4 | I promised a child that I would find their missing parent. |
| 5 | I carry a warrant that I never delivered. |
| 6 | I owe a debt to a smuggler who kept me alive. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I trust coin more than conscience, and I know it. |
| 2 | I cannot let a trail go cold, even when I should. |
| 3 | I treat everyone I meet as a possible target. |
| 4 | I lie awake wondering about the ones I got wrong. |
| 5 | I do not accept help, because I do not trust it. |
| 6 | I keep trophies of my captures that I should have thrown away. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'bounty_hunter', 'grimoire-backgrounds', 'grimoire_2014_bounty_hunter', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_bounty_hunter', 'Bounty Hunter', 'You made your living by finding people who did not want to be found and delivering them to people who wanted them badly. It was patient work: reading rumours, buying drinks for the wrong sort of friend and waiting in cold doorways. Some of your quarry deserved their fate; some did not, and you learned to keep track of which.

The trade left you with sharp instincts, a good memory for faces and a habit of sitting where you can see the door. Whether you still work for a bounty or have turned that skill to your own purposes, you know how people hide, how they run and what always gives them away.', array['Investigation', 'Survival']::text[], array['Thieves'' Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Thieves'' Tools, Manacles, Rope, Traveler''s Clothes, Bedroll, 19 GP; or (B) 50 GP', null, null, 'Bounty hunters tend to be watchful and wry, with a patience that unnerves people and a bluntness that saves time.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I always sit facing the door and I never explain why. |
| 2 | I remember a face for years, and I tell people so. |
| 3 | I keep my promises, especially the unpleasant ones. |
| 4 | I am unfailingly polite to the people I am about to arrest. |
| 5 | I laugh at the wrong moments, and then apologise. |
| 6 | I carry a little extra rope, just in case. |
| 7 | I do not drink on a job, and I am always on a job. |
| 8 | I judge a stranger by how they treat the waiter. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Justice.** A crime named should be a crime answered. (Lawful) |
| 2 | **Mercy.** Not everyone I find deserves what is waiting for them. (Good) |
| 3 | **Coin.** The work is honest, and so is the price. (Neutral) |
| 4 | **Freedom.** I answer to no warrant but my own sense of right. (Chaotic) |
| 5 | **Reputation.** When I take a job, it stays taken. (Any) |
| 6 | **Fear.** A hunter feared gets doors opened and questions answered. (Evil) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | I am hunting someone who slipped away from me, and I will not rest until I find them. |
| 2 | A person I once brought in turned out to be innocent, and I am trying to make it right. |
| 3 | My former partner taught me everything, and I owe them a favour. |
| 4 | I promised a child that I would find their missing parent. |
| 5 | I carry a warrant that I never delivered. |
| 6 | I owe a debt to a smuggler who kept me alive. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I trust coin more than conscience, and I know it. |
| 2 | I cannot let a trail go cold, even when I should. |
| 3 | I treat everyone I meet as a possible target. |
| 4 | I lie awake wondering about the ones I got wrong. |
| 5 | I do not accept help, because I do not trust it. |
| 6 | I keep trophies of my captures that I should have thrown away. |', 'Alert', array['strength', 'dexterity', 'wisdom']::text[], '{"name":"Alert","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'bounty_hunter', 'grimoire-backgrounds', 'grimoire_2024_bounty_hunter', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_charlatan', 'Charlatan', 'You have always known how to make people believe things. Perhaps you sold cure-alls from the back of a cart, passed yourself off as a minor noble, or ran a long, patient game on a town that trusted you completely. You learned early that a smile and a ready answer are worth more than a good lock pick.

The life has left you with a pocketful of voices, a flexible relationship with the truth and a gift for reading what people most want to hear. You also know what it costs to be found out, so you keep your exits close and your stories consistent.', array['Deception', 'Sleight of Hand']::text[], array['Disguise Kit', 'Forgery Kit']::text[], '{}'::text[], 'A set of fine clothes, a disguise kit, a forgery kit, a small bottle of coloured water labelled "tonic", and a pouch containing 15 gp', 'Borrowed Name', 'You keep a well-built false identity, with the papers and manner to match. Within a region where it has not yet been exposed, you can pass as that person among ordinary folk and minor officials without much scrutiny, and your cover story will hold up unless someone actively investigates it. You can maintain one such identity at a time.', 'Charlatans tend to be charming, quick-witted and slightly tired, always half a step ahead of whatever they just said.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I tell small lies for fun, just to keep in practice. |
| 2 | I am at my most sincere when I am making things up. |
| 3 | I never forget a name, and I use it constantly. |
| 4 | I cannot resist a crowd with a bit of coin in its pockets. |
| 5 | I give away my last coin to a stranger, then steal it back from myself. |
| 6 | I am genuinely delighted when someone catches me out. |
| 7 | I speak confidently about subjects I know nothing about. |
| 8 | I always have an exit in mind, even at a wedding. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Cleverness.** A well-played trick is a work of art. (Chaotic) |
| 2 | **Fairness.** I only fleece those who can afford it, and who have it coming. (Neutral) |
| 3 | **Honesty.** My lies keep the people I care about safe. (Good) |
| 4 | **Freedom.** No one gets to tell me who I must be. (Chaotic) |
| 5 | **Greed.** Every trusting fool is another purse. (Evil) |
| 6 | **Loyalty.** I never sell out a partner, however bad things get. (Any) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | A former partner in a scheme holds a secret that could ruin me. |
| 2 | I owe someone I swindled more than I can repay. |
| 3 | I am trying to send money to a family who believe I am respectable. |
| 4 | I once told a lie so well that it became true, and I feel responsible. |
| 5 | I carry a ring that belonged to an identity I have since dropped. |
| 6 | A town where I was happy still believes in the person I pretended to be. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I cannot resist a perfect con, even when it is a terrible idea. |
| 2 | I trust no one, because I know how I would cheat them. |
| 3 | I hide behind my masks and sometimes forget the face underneath. |
| 4 | I put on a performance when honesty would be easier. |
| 5 | I keep a debt in every town and leave before it is collected. |
| 6 | I cannot bear to be thought a fool. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'charlatan', 'grimoire-backgrounds', 'grimoire_2014_charlatan', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_charlatan', 'Charlatan', 'You have always known how to make people believe things. Perhaps you sold cure-alls from the back of a cart, passed yourself off as a minor noble, or ran a long, patient game on a town that trusted you completely. You learned early that a smile and a ready answer are worth more than a good lock pick.

The life has left you with a pocketful of voices, a flexible relationship with the truth and a gift for reading what people most want to hear. You also know what it costs to be found out, so you keep your exits close and your stories consistent.', array['Deception', 'Sleight of Hand']::text[], array['Forgery Kit']::text[], '{}'::text[], '*Choose A or B:* (A) Forgery Kit, Costume, Fine Clothes, Perfume, 10 GP; or (B) 50 GP', null, null, 'Charlatans tend to be charming, quick-witted and slightly tired, always half a step ahead of whatever they just said.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I tell small lies for fun, just to keep in practice. |
| 2 | I am at my most sincere when I am making things up. |
| 3 | I never forget a name, and I use it constantly. |
| 4 | I cannot resist a crowd with a bit of coin in its pockets. |
| 5 | I give away my last coin to a stranger, then steal it back from myself. |
| 6 | I am genuinely delighted when someone catches me out. |
| 7 | I speak confidently about subjects I know nothing about. |
| 8 | I always have an exit in mind, even at a wedding. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Cleverness.** A well-played trick is a work of art. (Chaotic) |
| 2 | **Fairness.** I only fleece those who can afford it, and who have it coming. (Neutral) |
| 3 | **Honesty.** My lies keep the people I care about safe. (Good) |
| 4 | **Freedom.** No one gets to tell me who I must be. (Chaotic) |
| 5 | **Greed.** Every trusting fool is another purse. (Evil) |
| 6 | **Loyalty.** I never sell out a partner, however bad things get. (Any) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | A former partner in a scheme holds a secret that could ruin me. |
| 2 | I owe someone I swindled more than I can repay. |
| 3 | I am trying to send money to a family who believe I am respectable. |
| 4 | I once told a lie so well that it became true, and I feel responsible. |
| 5 | I carry a ring that belonged to an identity I have since dropped. |
| 6 | A town where I was happy still believes in the person I pretended to be. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I cannot resist a perfect con, even when it is a terrible idea. |
| 2 | I trust no one, because I know how I would cheat them. |
| 3 | I hide behind my masks and sometimes forget the face underneath. |
| 4 | I put on a performance when honesty would be easier. |
| 5 | I keep a debt in every town and leave before it is collected. |
| 6 | I cannot bear to be thought a fool. |', 'Skilled', array['dexterity', 'constitution', 'charisma']::text[], '{"name":"Skilled","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'charlatan', 'grimoire-backgrounds', 'grimoire_2024_charlatan', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_courtier', 'Courtier', 'You grew up among throne rooms, drawing rooms and the narrow corridors that connect them. You learned that real decisions are made in whispers, that a compliment is a currency and that a raised eyebrow can end a career. Whether you served a duke, a queen or a minor lord with a large opinion of himself, you were always watching.

You left with fine manners, a flawless memory for who said what to whom and a deep wariness of friendly smiles. You can read a room faster than most people read a letter, and you know the cost of being the one who was too honest.', array['Deception', 'Insight']::text[], array['Calligrapher''s Supplies']::text[], array['One of your choice']::text[], 'A set of fine clothes, a signet ring, a sealed letter of introduction, calligrapher''s supplies, and a pouch containing 20 gp', 'Ear at Court', 'You have an ear for gossip among the great and the almost-great. In any place with a noble household or formal court, you can learn the current rumours, feuds and favourites within a day, and you can usually secure a brief audience with a minor official or attendant. You are not given access to the ruler, but you know who is.', 'Courtiers tend to be polished, observant and careful, saying less than they know and rarely meaning only one thing.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I never say what I mean when a hint will do. |
| 2 | I remember what everyone wore to every occasion. |
| 3 | I am gracious to servants and cutting to equals. |
| 4 | I flatter automatically, and I am startled when it is sincere. |
| 5 | I smile when I am angry, and it frightens people. |
| 6 | I always know who is standing behind me. |
| 7 | I cannot resist passing on a good secret. |
| 8 | I treat every conversation as a game with hidden rules. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Service.** A well-run house protects everyone who lives in it. (Lawful) |
| 2 | **Influence.** Whoever controls the conversation controls the room. (Any) |
| 3 | **Honesty.** I was surrounded by lies, and I will not add to them. (Good) |
| 4 | **Ambition.** I did not learn all this to stay a footnote. (Evil) |
| 5 | **Discretion.** What I know is a trust, not a weapon. (Neutral) |
| 6 | **Freedom.** I have been a puppet long enough. (Chaotic) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | A former patron fell from grace, and I still feel responsible. |
| 2 | I carry a letter that could end a marriage or start a war. |
| 3 | A friend at court paid dearly for protecting me. |
| 4 | I am sworn to a house that no longer exists. |
| 5 | I owe a favour that I have not been asked to repay. |
| 6 | I once betrayed someone out of fear, and I am trying to make it right. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I assume every kindness hides a motive. |
| 2 | I cannot resist the pleasure of knowing something first. |
| 3 | I look down on those who lack manners. |
| 4 | I keep my feelings buried so deep I forget I have them. |
| 5 | I will say anything to avoid a scene. |
| 6 | I lie awake rehearsing conversations that never happen. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'courtier', 'grimoire-backgrounds', 'grimoire_2014_courtier', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_courtier', 'Courtier', 'You grew up among throne rooms, drawing rooms and the narrow corridors that connect them. You learned that real decisions are made in whispers, that a compliment is a currency and that a raised eyebrow can end a career. Whether you served a duke, a queen or a minor lord with a large opinion of himself, you were always watching.

You left with fine manners, a flawless memory for who said what to whom and a deep wariness of friendly smiles. You can read a room faster than most people read a letter, and you know the cost of being the one who was too honest.', array['Deception', 'Insight']::text[], array['Calligrapher''s Supplies']::text[], '{}'::text[], '*Choose A or B:* (A) Calligrapher''s Supplies, Fine Clothes, Ink, Perfume, 10 GP; or (B) 50 GP', null, null, 'Courtiers tend to be polished, observant and careful, saying less than they know and rarely meaning only one thing.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I never say what I mean when a hint will do. |
| 2 | I remember what everyone wore to every occasion. |
| 3 | I am gracious to servants and cutting to equals. |
| 4 | I flatter automatically, and I am startled when it is sincere. |
| 5 | I smile when I am angry, and it frightens people. |
| 6 | I always know who is standing behind me. |
| 7 | I cannot resist passing on a good secret. |
| 8 | I treat every conversation as a game with hidden rules. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Service.** A well-run house protects everyone who lives in it. (Lawful) |
| 2 | **Influence.** Whoever controls the conversation controls the room. (Any) |
| 3 | **Honesty.** I was surrounded by lies, and I will not add to them. (Good) |
| 4 | **Ambition.** I did not learn all this to stay a footnote. (Evil) |
| 5 | **Discretion.** What I know is a trust, not a weapon. (Neutral) |
| 6 | **Freedom.** I have been a puppet long enough. (Chaotic) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | A former patron fell from grace, and I still feel responsible. |
| 2 | I carry a letter that could end a marriage or start a war. |
| 3 | A friend at court paid dearly for protecting me. |
| 4 | I am sworn to a house that no longer exists. |
| 5 | I owe a favour that I have not been asked to repay. |
| 6 | I once betrayed someone out of fear, and I am trying to make it right. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I assume every kindness hides a motive. |
| 2 | I cannot resist the pleasure of knowing something first. |
| 3 | I look down on those who lack manners. |
| 4 | I keep my feelings buried so deep I forget I have them. |
| 5 | I will say anything to avoid a scene. |
| 6 | I lie awake rehearsing conversations that never happen. |', 'Skilled', array['intelligence', 'wisdom', 'charisma']::text[], '{"name":"Skilled","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'courtier', 'grimoire-backgrounds', 'grimoire_2024_courtier', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_entertainer', 'Entertainer', 'You have spent your life performing for anyone who would stop to watch: tavern crowds, village festivals, noble banquets and the occasional bored guard. You may have been born into a troupe, apprenticed to a bard or simply found that you could not stop yourself from showing off. Applause taught you more than any teacher.

The road has left you with quick reflexes, a sharp sense for a crowd''s mood and an unshakeable belief that most problems can be improved by a good entrance. You know how to hold a room, how to fall without breaking anything and how to leave before the bill arrives.', array['Acrobatics', 'Performance']::text[], array['Disguise Kit', 'One type of Musical Instrument']::text[], '{}'::text[], 'A musical instrument of your choice, a disguise kit, a bright costume, a set of traveller''s clothes, a small token from an admirer, and a pouch containing 15 gp', 'Crowd''s Favourite', 'Your name and your act are known in places where your kind of performance is loved. In any settlement with an audience, you can earn lodging, meals and modest tips by performing each evening, and people who have seen you perform will greet you warmly and are inclined to hear you out.', 'Entertainers tend to be expressive, quick to laugh and difficult to ignore, though the performance often hides someone more thoughtful.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I turn every story into a performance, even ordinary ones. |
| 2 | I cannot walk past an empty stage without climbing on it. |
| 3 | I am kind to hecklers, because they keep me sharp. |
| 4 | I notice who is not clapping. |
| 5 | I practise in the dark, so I can do it in any light. |
| 6 | I give everyone a nickname within five minutes. |
| 7 | I dress for the audience I want, not the one I have. |
| 8 | I sing when I am nervous, and I am always nervous. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Joy.** The world is heavy enough, and I mean to lighten it. (Good) |
| 2 | **Craft.** I will practise until the work looks easy. (Lawful) |
| 3 | **Freedom.** I go where the road and the crowd take me. (Chaotic) |
| 4 | **Fame.** I mean to be remembered long after the last bow. (Any) |
| 5 | **Honesty.** A good song can say what polite people cannot. (Neutral) |
| 6 | **Applause.** Their cheering is what I live for, and I will do whatever it takes. (Evil) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | My old troupe scattered, and I mean to bring us back together. |
| 2 | I owe my first break to a patron I have never properly thanked. |
| 3 | I wrote a song for someone I lost, and I have never finished it. |
| 4 | My instrument was a gift, and I will never part with it. |
| 5 | A rival stole my best act, and I want it back. |
| 6 | I promised a child in a faraway town I would return and perform. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I cannot resist an audience, even at the worst time. |
| 2 | I exaggerate everything, including my own failures. |
| 3 | I fall apart when no one is watching. |
| 4 | I hold grudges against critics. |
| 5 | I spend coin the moment I earn it. |
| 6 | I avoid serious conversations by making a joke. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'entertainer', 'grimoire-backgrounds', 'grimoire_2014_entertainer', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_entertainer', 'Entertainer', 'You have spent your life performing for anyone who would stop to watch: tavern crowds, village festivals, noble banquets and the occasional bored guard. You may have been born into a troupe, apprenticed to a bard or simply found that you could not stop yourself from showing off. Applause taught you more than any teacher.

The road has left you with quick reflexes, a sharp sense for a crowd''s mood and an unshakeable belief that most problems can be improved by a good entrance. You know how to hold a room, how to fall without breaking anything and how to leave before the bill arrives.', array['Acrobatics', 'Performance']::text[], array['Choose one kind of Musical Instrument']::text[], '{}'::text[], '*Choose A or B:* (A) Lute, Costume, Traveler''s Clothes, 8 GP; or (B) 50 GP', null, null, 'Entertainers tend to be expressive, quick to laugh and difficult to ignore, though the performance often hides someone more thoughtful.

| d8 | Personality Trait |
|----|----------------------------------------|
| 1 | I turn every story into a performance, even ordinary ones. |
| 2 | I cannot walk past an empty stage without climbing on it. |
| 3 | I am kind to hecklers, because they keep me sharp. |
| 4 | I notice who is not clapping. |
| 5 | I practise in the dark, so I can do it in any light. |
| 6 | I give everyone a nickname within five minutes. |
| 7 | I dress for the audience I want, not the one I have. |
| 8 | I sing when I am nervous, and I am always nervous. |

| d6 | Ideal |
|----|----------------------------------------|
| 1 | **Joy.** The world is heavy enough, and I mean to lighten it. (Good) |
| 2 | **Craft.** I will practise until the work looks easy. (Lawful) |
| 3 | **Freedom.** I go where the road and the crowd take me. (Chaotic) |
| 4 | **Fame.** I mean to be remembered long after the last bow. (Any) |
| 5 | **Honesty.** A good song can say what polite people cannot. (Neutral) |
| 6 | **Applause.** Their cheering is what I live for, and I will do whatever it takes. (Evil) |

| d6 | Bond |
|----|----------------------------------------|
| 1 | My old troupe scattered, and I mean to bring us back together. |
| 2 | I owe my first break to a patron I have never properly thanked. |
| 3 | I wrote a song for someone I lost, and I have never finished it. |
| 4 | My instrument was a gift, and I will never part with it. |
| 5 | A rival stole my best act, and I want it back. |
| 6 | I promised a child in a faraway town I would return and perform. |

| d6 | Flaw |
|----|----------------------------------------|
| 1 | I cannot resist an audience, even at the worst time. |
| 2 | I exaggerate everything, including my own failures. |
| 3 | I fall apart when no one is watching. |
| 4 | I hold grudges against critics. |
| 5 | I spend coin the moment I earn it. |
| 6 | I avoid serious conversations by making a joke. |', 'Skilled', array['strength', 'dexterity', 'charisma']::text[], '{"name":"Skilled","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'entertainer', 'grimoire-backgrounds', 'grimoire_2024_entertainer', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_far_traveller', 'Far Traveller', 'You were born far beyond the edge of any map your neighbours trust, in a land whose customs, foods and songs are strange to everyone you meet now. Perhaps you came as an envoy, perhaps a shipwreck threw you ashore, or perhaps you simply walked until the road ran out. Either way, you have spent years being the one who does not know the rules.

That has made you a careful watcher. You read faces because words sometimes fail you, you remember what each stranger''s kindness cost them, and you carry a few keepsakes from home that nobody here can put a price on. People are curious about you, and you have learned to turn that curiosity into a seat by the fire.', array['Insight', 'Perception']::text[], array['One type of Musical Instrument or Gaming Set']::text[], array['One of your choice']::text[], 'A musical instrument or gaming set of your choice, a keepsake from your homeland, a set of traveller''s clothes, and a pouch containing 15 gp', 'Stranger''s Welcome', 'Folk are curious about outlanders, and you know how to make use of it. In any settlement you can find a household willing to give you a bed and a meal for a night or two in return for stories of your homeland and its ways. Your hosts owe nothing to your companions, and a host who catches you in a lie may not forgive it.', 'Far travellers are watchers and guests, forever translating one world into another. They tend to be polite to a fault, endlessly curious, and quietly homesick.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I ask what a custom means before I judge it, and I usually end up adopting it. |
| 2 | I hum the songs of home when I think no one is listening. |
| 3 | I bow, nod or salute in three different ways because I can never remember which one is right here. |
| 4 | I treat every shared meal as a small ceremony and expect others to do the same. |
| 5 | I take strange foods as a challenge and eat them with great seriousness. |
| 6 | I speak slowly and choose my words with care, and people mistake it for wisdom. |
| 7 | I collect small gifts from everyone who helps me and I remember each giver. |
| 8 | I laugh loudly at jokes I only half understand. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Understanding.** Two peoples who share a table will rarely share a war. (Good) |
| 2 | **Duty.** I was sent to bring something home, and I will not return without it. (Lawful) |
| 3 | **Freedom.** Nobody here knows my family, so I can become anyone I choose. (Chaotic) |
| 4 | **Curiosity.** Every new place is a lesson I am not ready to stop learning. (Neutral) |
| 5 | **Honour.** I carry the good name of my people, so I must never shame them. (Lawful) |
| 6 | **Advantage.** Being a stranger means being underestimated, and I plan to use that. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | I carry a carved token from my mother, and I will not let it be sold or stolen. |
| 2 | Someone here taught me their language when they had no reason to, and I owe them dearly. |
| 3 | My people believe I am lost, and I mean to send word that I am not. |
| 4 | I swore to see the great river of this country with my own eyes. |
| 5 | A rival from home followed me across the sea, and one of us must finish it. |
| 6 | I promised a dying companion that I would sing their funeral song at a crossroads. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I assume everyone is hiding a motive because that was true where I grew up. |
| 2 | I cannot resist bargaining, even when someone is offering a gift. |
| 3 | I find the local gods faintly ridiculous and sometimes say so. |
| 4 | I fall silent when I am afraid, which makes me look haughty. |
| 5 | I would sooner starve than admit to a host that I dislike their cooking. |
| 6 | I lie smoothly about my past because the truth makes people pity me. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'far_traveller', 'grimoire-backgrounds', 'grimoire_2014_far_traveller', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_far_traveller', 'Far Traveller', 'You were born far beyond the edge of any map your neighbours trust, in a land whose customs, foods and songs are strange to everyone you meet now. Perhaps you came as an envoy, perhaps a shipwreck threw you ashore, or perhaps you simply walked until the road ran out. Either way, you have spent years being the one who does not know the rules.

That has made you a careful watcher. You read faces because words sometimes fail you, you remember what each stranger''s kindness cost them, and you carry a few keepsakes from home that nobody here can put a price on. People are curious about you, and you have learned to turn that curiosity into a seat by the fire.', array['Insight', 'Perception']::text[], array['Choose one kind of Musical Instrument']::text[], '{}'::text[], '*Choose A or B:* (A) Flute, Crystal, Traveler''s Clothes, Backpack, Bedroll, 33 GP; or (B) 50 GP', null, null, 'Far travellers are watchers and guests, forever translating one world into another. They tend to be polite to a fault, endlessly curious, and quietly homesick.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I ask what a custom means before I judge it, and I usually end up adopting it. |
| 2 | I hum the songs of home when I think no one is listening. |
| 3 | I bow, nod or salute in three different ways because I can never remember which one is right here. |
| 4 | I treat every shared meal as a small ceremony and expect others to do the same. |
| 5 | I take strange foods as a challenge and eat them with great seriousness. |
| 6 | I speak slowly and choose my words with care, and people mistake it for wisdom. |
| 7 | I collect small gifts from everyone who helps me and I remember each giver. |
| 8 | I laugh loudly at jokes I only half understand. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Understanding.** Two peoples who share a table will rarely share a war. (Good) |
| 2 | **Duty.** I was sent to bring something home, and I will not return without it. (Lawful) |
| 3 | **Freedom.** Nobody here knows my family, so I can become anyone I choose. (Chaotic) |
| 4 | **Curiosity.** Every new place is a lesson I am not ready to stop learning. (Neutral) |
| 5 | **Honour.** I carry the good name of my people, so I must never shame them. (Lawful) |
| 6 | **Advantage.** Being a stranger means being underestimated, and I plan to use that. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | I carry a carved token from my mother, and I will not let it be sold or stolen. |
| 2 | Someone here taught me their language when they had no reason to, and I owe them dearly. |
| 3 | My people believe I am lost, and I mean to send word that I am not. |
| 4 | I swore to see the great river of this country with my own eyes. |
| 5 | A rival from home followed me across the sea, and one of us must finish it. |
| 6 | I promised a dying companion that I would sing their funeral song at a crossroads. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I assume everyone is hiding a motive because that was true where I grew up. |
| 2 | I cannot resist bargaining, even when someone is offering a gift. |
| 3 | I find the local gods faintly ridiculous and sometimes say so. |
| 4 | I fall silent when I am afraid, which makes me look haughty. |
| 5 | I would sooner starve than admit to a host that I dislike their cooking. |
| 6 | I lie smoothly about my past because the truth makes people pity me. |', 'Magic Initiate (Wizard)', array['constitution', 'wisdom', 'charisma']::text[], '{"name":"Magic Initiate","variant":"Wizard"}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'far_traveller', 'grimoire-backgrounds', 'grimoire_2024_far_traveller', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_farmer', 'Farmer', 'You grew up with soil under your nails, ploughing, sowing and bringing in the crop before the weather turned. You learned to mend a cart, to talk a nervous ox through a ford, and to tell by the smell of the wind whether the night would bring frost. Nobody taught you to read the land; you simply lived there.

Whatever pulled you away from the fields, a bad harvest, a burned barn or just a restless heart, you took their patience with you. You know how little the powerful understand about where bread comes from, and you know the quiet old customs by which a village keeps itself fed. A few of those customs may even be older than the village.', array['Animal Handling', 'Nature']::text[], array['Carpenter''s Tools', 'Vehicles (Land)']::text[], '{}'::text[], 'A set of carpenter''s tools, a shovel, a set of traveller''s clothes, a small bag of seed from home, and a pouch containing 10 gp', 'Hearth and Harvest', 'Country people recognise one of their own. In any village, farmstead or hamlet you can get directions, fair prices on food and fodder, and an introduction to the local reeve or elder. If you ask, the farming folk there will keep quiet about which way you went. Townsfolk and city dwellers owe you no such courtesy.', 'Farmers are steady, practical people who measure the world in seasons. They tend to be patient, blunt, and suspicious of anything that cannot be eaten, mended or sold.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I wake before dawn without trying, and I cannot understand people who do not. |
| 2 | I judge a stranger by how they treat an animal. |
| 3 | I say little, and when I speak it is usually about the weather. |
| 4 | I feel guilty whenever I sit idle while others work. |
| 5 | I keep seeds in my pockets and cannot resist planting them. |
| 6 | I tell long, rambling stories about my cousins that always end with a pig. |
| 7 | I stop to admire any good field, whatever else is going on. |
| 8 | I haggle fiercely over coin and give away food without a thought. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Stewardship.** What the land gives, we must give back. (Good) |
| 2 | **Community.** A village that eats together is hard to break. (Lawful) |
| 3 | **Self-reliance.** If I do not dig the well myself, I cannot trust the water. (Neutral) |
| 4 | **Change.** The old ways starved us once, and I am ready to try new ones. (Chaotic) |
| 5 | **Greed.** Hunger taught me to hoard, and I will never be hungry again. (Evil) |
| 6 | **Fairness.** A fair price and an honest day of work are all anyone should ask. (Any) |

| d6 | Bond |
|----|----------------------------|
| 1 | My family farm still stands, and I send what coin I can to keep it. |
| 2 | A child in my village looked up to me, and I want to be worth it. |
| 3 | The lord who took our harvest still sits in his hall, and I have not forgotten. |
| 4 | I buried my father under the oldest tree on our land, and I mean to be buried there too. |
| 5 | My best ox is the finest creature in the district, and I am never parted from it. |
| 6 | I promised my sister I would come back for the harvest festival. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I distrust anyone who has soft hands. |
| 2 | I am easily taken in by a friendly stranger with a sad story. |
| 3 | I cannot bear to see food wasted, and I will lecture anyone who does. |
| 4 | I hold grudges for exactly as long as it takes a tree to grow. |
| 5 | I stubbornly insist that my family''s way is the only right way to do anything. |
| 6 | I am so used to hard work that I cannot rest without feeling unwell. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'farmer', 'grimoire-backgrounds', 'grimoire_2014_farmer', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_farmer', 'Farmer', 'You grew up with soil under your nails, ploughing, sowing and bringing in the crop before the weather turned. You learned to mend a cart, to talk a nervous ox through a ford, and to tell by the smell of the wind whether the night would bring frost. Nobody taught you to read the land; you simply lived there.

Whatever pulled you away from the fields, a bad harvest, a burned barn or just a restless heart, you took their patience with you. You know how little the powerful understand about where bread comes from, and you know the quiet old customs by which a village keeps itself fed. A few of those customs may even be older than the village.', array['Animal Handling', 'Nature']::text[], array['Carpenter''s Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Carpenter''s Tools, Shovel, Druidic Focus (Sprig of Mistletoe), Traveler''s Clothes, Iron Pot, 35 GP; or (B) 50 GP', null, null, 'Farmers are steady, practical people who measure the world in seasons. They tend to be patient, blunt, and suspicious of anything that cannot be eaten, mended or sold.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I wake before dawn without trying, and I cannot understand people who do not. |
| 2 | I judge a stranger by how they treat an animal. |
| 3 | I say little, and when I speak it is usually about the weather. |
| 4 | I feel guilty whenever I sit idle while others work. |
| 5 | I keep seeds in my pockets and cannot resist planting them. |
| 6 | I tell long, rambling stories about my cousins that always end with a pig. |
| 7 | I stop to admire any good field, whatever else is going on. |
| 8 | I haggle fiercely over coin and give away food without a thought. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Stewardship.** What the land gives, we must give back. (Good) |
| 2 | **Community.** A village that eats together is hard to break. (Lawful) |
| 3 | **Self-reliance.** If I do not dig the well myself, I cannot trust the water. (Neutral) |
| 4 | **Change.** The old ways starved us once, and I am ready to try new ones. (Chaotic) |
| 5 | **Greed.** Hunger taught me to hoard, and I will never be hungry again. (Evil) |
| 6 | **Fairness.** A fair price and an honest day of work are all anyone should ask. (Any) |

| d6 | Bond |
|----|----------------------------|
| 1 | My family farm still stands, and I send what coin I can to keep it. |
| 2 | A child in my village looked up to me, and I want to be worth it. |
| 3 | The lord who took our harvest still sits in his hall, and I have not forgotten. |
| 4 | I buried my father under the oldest tree on our land, and I mean to be buried there too. |
| 5 | My best ox is the finest creature in the district, and I am never parted from it. |
| 6 | I promised my sister I would come back for the harvest festival. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I distrust anyone who has soft hands. |
| 2 | I am easily taken in by a friendly stranger with a sad story. |
| 3 | I cannot bear to see food wasted, and I will lecture anyone who does. |
| 4 | I hold grudges for exactly as long as it takes a tree to grow. |
| 5 | I stubbornly insist that my family''s way is the only right way to do anything. |
| 6 | I am so used to hard work that I cannot rest without feeling unwell. |', 'Magic Initiate (Druid)', array['strength', 'constitution', 'wisdom']::text[], '{"name":"Magic Initiate","variant":"Druid"}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'farmer', 'grimoire-backgrounds', 'grimoire_2024_farmer', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_gladiator', 'Gladiator', 'You fought for the crowd. Whether you were a slave, a debtor, a volunteer or a prize-winner, you stepped onto sand every few weeks and learned that the only thing worse than losing was being dull. You know how to make a blow look better than it landed, and how to make a killing stroke look like mercy.

The arena gave you a body that works like a well-oiled machine and a name that still sparks recognition in some places. It also left scars, a few enemies among the people who bet against you, and a complicated feeling about applause. You may have bought your freedom, broken out, or simply been let go. Either way, you are done with the sand, though it is not done with you.', array['Athletics', 'Performance']::text[], array['Smith''s Tools', 'One type of Gaming Set']::text[], '{}'::text[], 'A set of smith''s tools, a gaming set of your choice, a trophy from the arena, a set of common clothes, and a pouch containing 10 gp', 'Name in the Sand', 'Anywhere arena fighting is known, your name or your scars are recognised. Fans, trainers and promoters will offer you a seat, a drink and a hearing, and you can usually arrange an exhibition bout for modest pay. People who lost money on your old opponents may greet you less warmly.', 'Gladiators carry themselves like performers who also happen to be killers. They tend to be generous in victory, proud, and unsettlingly calm before a fight.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I give every opponent a nod before we begin, because someone should. |
| 2 | I narrate my own fights under my breath, as the announcer used to. |
| 3 | I always take the seat facing the door. |
| 4 | I am suspicious of any applause I have not earned. |
| 5 | I eat enormous meals and share them with anyone nearby. |
| 6 | I gamble on everything, including things I can control. |
| 7 | I keep my weapons spotless and talk to them when I am alone. |
| 8 | I laugh easily and loudly, and it unnerves people. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Mercy.** I have killed on command and I do not want to again. (Good) |
| 2 | **Glory.** Let my name be sung in every hall long after I am dust. (Any) |
| 3 | **Discipline.** Whoever trains hardest wins, and I train hardest. (Lawful) |
| 4 | **Freedom.** I will never again fight, kneel or bow because I am told to. (Chaotic) |
| 5 | **Mastery.** The finest duellist alive is out there, and I will meet them. (Neutral) |
| 6 | **Dominance.** The strong decide how the weak live, and I have chosen to be strong. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | A fellow fighter died shielding me, and I carry their name wherever I go. |
| 2 | I owe my freedom to a patron I have never met, and I mean to repay them. |
| 3 | The owner who held my contract still lives, and I intend to face them. |
| 4 | My old trainer taught me everything, and I send them money each season. |
| 5 | I left behind a younger fighter who looked to me, and I have not stopped worrying. |
| 6 | Someone saw me spare a beaten foe once and gave me a reason to stay alive. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I cannot walk away from a challenge, however foolish. |
| 2 | I show off when a crowd gathers, even if it is dangerous. |
| 3 | I have a hot temper that I tame only when I have an audience. |
| 4 | I trust no one who has not faced me in a fight. |
| 5 | I wake from nightmares and refuse to admit I had them. |
| 6 | I take any insult to my record as a personal wound. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'gladiator', 'grimoire-backgrounds', 'grimoire_2014_gladiator', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_gladiator', 'Gladiator', 'You fought for the crowd. Whether you were a slave, a debtor, a volunteer or a prize-winner, you stepped onto sand every few weeks and learned that the only thing worse than losing was being dull. You know how to make a blow look better than it landed, and how to make a killing stroke look like mercy.

The arena gave you a body that works like a well-oiled machine and a name that still sparks recognition in some places. It also left scars, a few enemies among the people who bet against you, and a complicated feeling about applause. You may have bought your freedom, broken out, or simply been let go. Either way, you are done with the sand, though it is not done with you.', array['Athletics', 'Performance']::text[], array['Smith''s Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Smith''s Tools, Spear, Traveler''s Clothes, Healer''s Kit, 22 GP; or (B) 50 GP', null, null, 'Gladiators carry themselves like performers who also happen to be killers. They tend to be generous in victory, proud, and unsettlingly calm before a fight.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I give every opponent a nod before we begin, because someone should. |
| 2 | I narrate my own fights under my breath, as the announcer used to. |
| 3 | I always take the seat facing the door. |
| 4 | I am suspicious of any applause I have not earned. |
| 5 | I eat enormous meals and share them with anyone nearby. |
| 6 | I gamble on everything, including things I can control. |
| 7 | I keep my weapons spotless and talk to them when I am alone. |
| 8 | I laugh easily and loudly, and it unnerves people. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Mercy.** I have killed on command and I do not want to again. (Good) |
| 2 | **Glory.** Let my name be sung in every hall long after I am dust. (Any) |
| 3 | **Discipline.** Whoever trains hardest wins, and I train hardest. (Lawful) |
| 4 | **Freedom.** I will never again fight, kneel or bow because I am told to. (Chaotic) |
| 5 | **Mastery.** The finest duellist alive is out there, and I will meet them. (Neutral) |
| 6 | **Dominance.** The strong decide how the weak live, and I have chosen to be strong. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | A fellow fighter died shielding me, and I carry their name wherever I go. |
| 2 | I owe my freedom to a patron I have never met, and I mean to repay them. |
| 3 | The owner who held my contract still lives, and I intend to face them. |
| 4 | My old trainer taught me everything, and I send them money each season. |
| 5 | I left behind a younger fighter who looked to me, and I have not stopped worrying. |
| 6 | Someone saw me spare a beaten foe once and gave me a reason to stay alive. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I cannot walk away from a challenge, however foolish. |
| 2 | I show off when a crowd gathers, even if it is dangerous. |
| 3 | I have a hot temper that I tame only when I have an audience. |
| 4 | I trust no one who has not faced me in a fight. |
| 5 | I wake from nightmares and refuse to admit I had them. |
| 6 | I take any insult to my record as a personal wound. |', 'Savage Attacker', array['strength', 'dexterity', 'constitution']::text[], '{"name":"Savage Attacker","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'gladiator', 'grimoire-backgrounds', 'grimoire_2024_gladiator', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_guard', 'Guard', 'You wore a badge or a tabard and stood where you were told: a gate, a wall, a market corner, a lord''s door. Most nights were dull, some were not, and you learned the difference between the two by the prickle on the back of your neck. You can break up a fight with a stern word and spot a pickpocket across a crowded square.

You also learned how a settlement actually runs, who looks the other way, and who pays for it. Perhaps you left under a cloud, perhaps you served out your term, or perhaps you simply could not stomach the orders. Either way you kept the habits: you notice exits, you count heads, and you do not sleep with your back to a door.', array['Athletics', 'Perception']::text[], array['One type of Gaming Set']::text[], array['One of your choice']::text[], 'A gaming set of your choice, a badge or tabard of your old post, a set of common clothes, and a pouch containing 10 gp', 'Watch House', 'You can claim a cot and a plain meal at the watch house or garrison of any settlement that keeps a standing guard, so long as you do not bring trouble to the door. Off-duty guards will also share gossip about local patrols, curfews and the streets best avoided after dark.', 'Guards are watchful, dutiful and slow to relax. They tend to speak in short sentences, to stand a little too straight, and to prefer rules because rules are predictable.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I walk the perimeter of every room I enter, even a friend''s home. |
| 2 | I count the people in a crowd without meaning to. |
| 3 | I have a dry sense of humour that I use mostly to put frightened people at ease. |
| 4 | I eat quickly and stay near the exit, whatever the company. |
| 5 | I address everyone as sir or madam until they tell me not to. |
| 6 | I hum marching songs when I am nervous. |
| 7 | I remember every face I have ever arrested. |
| 8 | I never say what I plan to do next, even to friends. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Order.** A town with rules is a town that sleeps safe. (Lawful) |
| 2 | **Protection.** Somebody has to stand between the weak and the wolves. (Good) |
| 3 | **Justice.** The law means little if it bends for the rich. (Any) |
| 4 | **Pragmatism.** Peace has a price, and I know exactly where to pay it. (Neutral) |
| 5 | **Loyalty.** My squad was my family, and I do not abandon family. (Lawful) |
| 6 | **Power.** A badge is just a blade with paperwork, and I have used both. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | My old sergeant took a blow meant for me, and I still carry the debt. |
| 2 | I left a partner behind at the wall, and I need to know they are safe. |
| 3 | The town I guarded is gone, and I hold myself responsible. |
| 4 | I took an oath to a captain who is long dead, and I am still keeping it. |
| 5 | A child I once pulled from a fire writes to me every year. |
| 6 | Someone in the watch sold out its people, and I will find out who. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I follow orders even when I suspect they are wrong. |
| 2 | I lecture strangers about petty rules, and it costs me friends. |
| 3 | I drink to forget the worst nights and rarely forget them. |
| 4 | I assume anyone out after dark is guilty of something. |
| 5 | I cannot bring myself to ask for help, even when I plainly need it. |
| 6 | I take bribes more often than I admit. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'guard', 'grimoire-backgrounds', 'grimoire_2014_guard', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_guard', 'Guard', 'You wore a badge or a tabard and stood where you were told: a gate, a wall, a market corner, a lord''s door. Most nights were dull, some were not, and you learned the difference between the two by the prickle on the back of your neck. You can break up a fight with a stern word and spot a pickpocket across a crowded square.

You also learned how a settlement actually runs, who looks the other way, and who pays for it. Perhaps you left under a cloud, perhaps you served out your term, or perhaps you simply could not stomach the orders. Either way you kept the habits: you notice exits, you count heads, and you do not sleep with your back to a door.', array['Athletics', 'Perception']::text[], array['Choose one kind of Gaming Set']::text[], '{}'::text[], '*Choose A or B:* (A) Dragonchess Set, Spear, Manacles, Hooded Lantern, Traveler''s Clothes, 39 GP; or (B) 50 GP', null, null, 'Guards are watchful, dutiful and slow to relax. They tend to speak in short sentences, to stand a little too straight, and to prefer rules because rules are predictable.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I walk the perimeter of every room I enter, even a friend''s home. |
| 2 | I count the people in a crowd without meaning to. |
| 3 | I have a dry sense of humour that I use mostly to put frightened people at ease. |
| 4 | I eat quickly and stay near the exit, whatever the company. |
| 5 | I address everyone as sir or madam until they tell me not to. |
| 6 | I hum marching songs when I am nervous. |
| 7 | I remember every face I have ever arrested. |
| 8 | I never say what I plan to do next, even to friends. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Order.** A town with rules is a town that sleeps safe. (Lawful) |
| 2 | **Protection.** Somebody has to stand between the weak and the wolves. (Good) |
| 3 | **Justice.** The law means little if it bends for the rich. (Any) |
| 4 | **Pragmatism.** Peace has a price, and I know exactly where to pay it. (Neutral) |
| 5 | **Loyalty.** My squad was my family, and I do not abandon family. (Lawful) |
| 6 | **Power.** A badge is just a blade with paperwork, and I have used both. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | My old sergeant took a blow meant for me, and I still carry the debt. |
| 2 | I left a partner behind at the wall, and I need to know they are safe. |
| 3 | The town I guarded is gone, and I hold myself responsible. |
| 4 | I took an oath to a captain who is long dead, and I am still keeping it. |
| 5 | A child I once pulled from a fire writes to me every year. |
| 6 | Someone in the watch sold out its people, and I will find out who. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I follow orders even when I suspect they are wrong. |
| 2 | I lecture strangers about petty rules, and it costs me friends. |
| 3 | I drink to forget the worst nights and rarely forget them. |
| 4 | I assume anyone out after dark is guilty of something. |
| 5 | I cannot bring myself to ask for help, even when I plainly need it. |
| 6 | I take bribes more often than I admit. |', 'Alert', array['strength', 'intelligence', 'wisdom']::text[], '{"name":"Alert","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'guard', 'grimoire-backgrounds', 'grimoire_2024_guard', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_guide', 'Guide', 'You spent your youth leading others through country that would have killed them alone: mountain passes, salt marshes, forests with no paths, deserts where the wells move. Travellers paid you in coin and trust, and you gave them in return a quiet voice, a steady pace and a plan for every sort of trouble.

You learned to leave no more mark than you must, to know where the game goes and where the weather comes from, and to say no to a client who wants to take the shortcut. You remember every route you have ever walked, and a few you wish you had not. Now the map is your trade, and the people on it are your charge.', array['Stealth', 'Survival']::text[], array['Cartographer''s Tools']::text[], array['One of your choice']::text[], 'A set of cartographer''s tools, a hooded lantern, a coil of rope, a set of traveller''s clothes, and a pouch containing 10 gp', 'Trail Sense', 'Once you have walked a stretch of country, you never lose your bearings in it. You can always retrace your route, and you can name the nearest water, shelter or landmark within a day''s walk of anywhere you have been. You can also read the marks other travellers leave, such as blazes, cairns and cold campfires, to tell roughly how long ago they passed and how many there were.', 'Guides are calm, observant and sparing with words. They tend to walk at the back or the front, never the middle, and to refuse to be hurried by anyone who has not been lost.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I check the sky first thing every morning and again before I speak. |
| 2 | I give everyone a nickname based on how they walk. |
| 3 | I carry a small notebook of routes and I add to it every night. |
| 4 | I never touch a campfire I did not build myself. |
| 5 | I am calm in a crisis and irritable in a city. |
| 6 | I whistle softly while I walk, and I know exactly who has noticed. |
| 7 | I talk to horses, mules and the occasional tree. |
| 8 | I hate being asked whether we are nearly there, and I always answer honestly. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Safety.** Every person I lead comes home, whatever it costs me. (Good) |
| 2 | **Knowledge.** A map is a promise, and I will not break it. (Lawful) |
| 3 | **Freedom.** The wild belongs to nobody, and I answer to nobody in it. (Chaotic) |
| 4 | **Respect.** The land lends us its paths, and I leave it as I found it. (Neutral) |
| 5 | **Self-interest.** Everyone has a price, and I have named mine. (Evil) |
| 6 | **Duty.** If I take the contract, I finish it. (Any) |

| d6 | Bond |
|----|----------------------------|
| 1 | A client I lost in the high snow still haunts me, and I will not lose another. |
| 2 | My mentor taught me every route I know, and I keep their old compass. |
| 3 | I promised a village I would lead their children out of the hills. |
| 4 | There is a pass nobody has crossed in living memory, and I mean to be first. |
| 5 | A rival guide sabotaged my last group, and I have not forgotten. |
| 6 | I owe a river spirit a favour, and the debt is coming due. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I trust my instincts over every map, including the ones I drew. |
| 2 | I abandon people who ignore my warnings more than once. |
| 3 | I keep secrets about routes and have refused to share them even with allies. |
| 4 | I cannot sleep in a building and would rather sit outdoors in the rain. |
| 5 | I get restless whenever we stay in one place for more than three days. |
| 6 | I take unnecessary risks to prove I am still the best. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'guide', 'grimoire-backgrounds', 'grimoire_2014_guide', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_guide', 'Guide', 'You spent your youth leading others through country that would have killed them alone: mountain passes, salt marshes, forests with no paths, deserts where the wells move. Travellers paid you in coin and trust, and you gave them in return a quiet voice, a steady pace and a plan for every sort of trouble.

You learned to leave no more mark than you must, to know where the game goes and where the weather comes from, and to say no to a client who wants to take the shortcut. You remember every route you have ever walked, and a few you wish you had not. Now the map is your trade, and the people on it are your charge.', array['Stealth', 'Survival']::text[], array['Cartographer''s Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Cartographer''s Tools, Druidic Focus (Sprig of Mistletoe), Rope, Bedroll, Traveler''s Clothes, Hunting Trap, 25 GP; or (B) 50 GP', null, null, 'Guides are calm, observant and sparing with words. They tend to walk at the back or the front, never the middle, and to refuse to be hurried by anyone who has not been lost.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I check the sky first thing every morning and again before I speak. |
| 2 | I give everyone a nickname based on how they walk. |
| 3 | I carry a small notebook of routes and I add to it every night. |
| 4 | I never touch a campfire I did not build myself. |
| 5 | I am calm in a crisis and irritable in a city. |
| 6 | I whistle softly while I walk, and I know exactly who has noticed. |
| 7 | I talk to horses, mules and the occasional tree. |
| 8 | I hate being asked whether we are nearly there, and I always answer honestly. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Safety.** Every person I lead comes home, whatever it costs me. (Good) |
| 2 | **Knowledge.** A map is a promise, and I will not break it. (Lawful) |
| 3 | **Freedom.** The wild belongs to nobody, and I answer to nobody in it. (Chaotic) |
| 4 | **Respect.** The land lends us its paths, and I leave it as I found it. (Neutral) |
| 5 | **Self-interest.** Everyone has a price, and I have named mine. (Evil) |
| 6 | **Duty.** If I take the contract, I finish it. (Any) |

| d6 | Bond |
|----|----------------------------|
| 1 | A client I lost in the high snow still haunts me, and I will not lose another. |
| 2 | My mentor taught me every route I know, and I keep their old compass. |
| 3 | I promised a village I would lead their children out of the hills. |
| 4 | There is a pass nobody has crossed in living memory, and I mean to be first. |
| 5 | A rival guide sabotaged my last group, and I have not forgotten. |
| 6 | I owe a river spirit a favour, and the debt is coming due. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I trust my instincts over every map, including the ones I drew. |
| 2 | I abandon people who ignore my warnings more than once. |
| 3 | I keep secrets about routes and have refused to share them even with allies. |
| 4 | I cannot sleep in a building and would rather sit outdoors in the rain. |
| 5 | I get restless whenever we stay in one place for more than three days. |
| 6 | I take unnecessary risks to prove I am still the best. |', 'Magic Initiate (Druid)', array['dexterity', 'constitution', 'wisdom']::text[], '{"name":"Magic Initiate","variant":"Druid"}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'guide', 'grimoire-backgrounds', 'grimoire_2024_guide', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_herbalist', 'Herbalist', 'You grew up among drying bundles and stained mortars, learning which leaf eases a fever and which one only looks like it does. Perhaps you were a hedge-healer''s apprentice, a midwife''s child or a monastery''s gardener. You can tell the season by what is flowering and the hour by which blossoms are closing.

People bring you their coughs, burns and heartaches before they bring them to anyone else, because you listen and you do not flinch. You know that most medicine is patience and most poison is a matter of dose. Your pockets smell of thyme and you are never without a little twine, and the road has shown you plants nobody has named yet.', array['Medicine', 'Nature']::text[], array['Herbalism Kit']::text[], array['One of your choice']::text[], 'A herbalism kit, a hooded lantern, a small trowel, a set of traveller''s clothes, and a pouch containing 10 gp', 'Remedies Known', 'In any settlement you can find a healer, midwife or apothecary who will share what they know of local herbs and let you use their stillroom in return for news of what grows elsewhere. Locals tend to bring minor ailments to you without being asked, and often leave a small gift in thanks.', 'Herbalists are patient, gentle and a little untidy. They tend to carry a bundle of something drying, and to answer questions with a question about how the patient slept.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I smell everything before I decide whether I like it. |
| 2 | I fuss over my companions'' health and none of them will admit it helps. |
| 3 | I label everything, including things that do not need labels. |
| 4 | I stop mid-sentence to pick a plant that has caught my eye. |
| 5 | I speak softly to the sick and sharply to the stubborn. |
| 6 | I am happiest with soil under my nails and a pot on the fire. |
| 7 | I distrust anyone who calls a remedy a miracle. |
| 8 | I measure out portions precisely, even for dinner. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Healing.** Easing suffering is the best use of a clever hand. (Good) |
| 2 | **Tradition.** The old recipes work, and I will teach them to the next generation. (Lawful) |
| 3 | **Nature.** Every plant has a place, and I take only what I need. (Neutral) |
| 4 | **Experiment.** Today''s poison is tomorrow''s cure if you tinker long enough. (Chaotic) |
| 5 | **Knowledge.** What is not written down is lost, so I write it all. (Any) |
| 6 | **Leverage.** A cure in my pouch is worth more than gold in theirs. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | I am hunting for one rare flower that is said to cure a wasting illness. |
| 2 | My teacher died before finishing their great book, and I mean to finish it. |
| 3 | A village I tended was lost to plague, and I swore to be better prepared. |
| 4 | I owe my life to a stranger who gave me the right tea at the right moment. |
| 5 | My garden is half a continent away, and my sister keeps it for me. |
| 6 | I once misjudged a dose and have been making up for it ever since. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I try home remedies on friends without asking. |
| 2 | I cannot bear to see a person suffer, and I ignore every plain request to stop fussing. |
| 3 | I share the secrets of the craft only when I am very drunk. |
| 4 | I assume anyone with a cough has the worst condition imaginable. |
| 5 | I sneer at soldiers and priests who think they can heal. |
| 6 | I secretly carry a few poisons and have not decided what they are for. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'herbalist', 'grimoire-backgrounds', 'grimoire_2014_herbalist', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_herbalist', 'Herbalist', 'You grew up among drying bundles and stained mortars, learning which leaf eases a fever and which one only looks like it does. Perhaps you were a hedge-healer''s apprentice, a midwife''s child or a monastery''s gardener. You can tell the season by what is flowering and the hour by which blossoms are closing.

People bring you their coughs, burns and heartaches before they bring them to anyone else, because you listen and you do not flinch. You know that most medicine is patience and most poison is a matter of dose. Your pockets smell of thyme and you are never without a little twine, and the road has shown you plants nobody has named yet.', array['Medicine', 'Nature']::text[], array['Herbalism Kit']::text[], '{}'::text[], '*Choose A or B:* (A) Herbalism Kit, Druidic Focus (Sprig of Mistletoe), Healer''s Kit, Traveler''s Clothes, Iron Pot, 35 GP; or (B) 50 GP', null, null, 'Herbalists are patient, gentle and a little untidy. They tend to carry a bundle of something drying, and to answer questions with a question about how the patient slept.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I smell everything before I decide whether I like it. |
| 2 | I fuss over my companions'' health and none of them will admit it helps. |
| 3 | I label everything, including things that do not need labels. |
| 4 | I stop mid-sentence to pick a plant that has caught my eye. |
| 5 | I speak softly to the sick and sharply to the stubborn. |
| 6 | I am happiest with soil under my nails and a pot on the fire. |
| 7 | I distrust anyone who calls a remedy a miracle. |
| 8 | I measure out portions precisely, even for dinner. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Healing.** Easing suffering is the best use of a clever hand. (Good) |
| 2 | **Tradition.** The old recipes work, and I will teach them to the next generation. (Lawful) |
| 3 | **Nature.** Every plant has a place, and I take only what I need. (Neutral) |
| 4 | **Experiment.** Today''s poison is tomorrow''s cure if you tinker long enough. (Chaotic) |
| 5 | **Knowledge.** What is not written down is lost, so I write it all. (Any) |
| 6 | **Leverage.** A cure in my pouch is worth more than gold in theirs. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | I am hunting for one rare flower that is said to cure a wasting illness. |
| 2 | My teacher died before finishing their great book, and I mean to finish it. |
| 3 | A village I tended was lost to plague, and I swore to be better prepared. |
| 4 | I owe my life to a stranger who gave me the right tea at the right moment. |
| 5 | My garden is half a continent away, and my sister keeps it for me. |
| 6 | I once misjudged a dose and have been making up for it ever since. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I try home remedies on friends without asking. |
| 2 | I cannot bear to see a person suffer, and I ignore every plain request to stop fussing. |
| 3 | I share the secrets of the craft only when I am very drunk. |
| 4 | I assume anyone with a cough has the worst condition imaginable. |
| 5 | I sneer at soldiers and priests who think they can heal. |
| 6 | I secretly carry a few poisons and have not decided what they are for. |', 'Magic Initiate (Druid)', array['constitution', 'intelligence', 'wisdom']::text[], '{"name":"Magic Initiate","variant":"Druid"}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'herbalist', 'grimoire-backgrounds', 'grimoire_2024_herbalist', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_hermit', 'Hermit', 'You lived alone, or nearly so, for years. A cave above the treeline, a hut by a marsh, a monastic cell, a lighthouse nobody else wanted. You chose it, or it was chosen for you, and the silence taught you things that no teacher did. You learned the habits of birds, the shape of your own thoughts, and the patience to wait for one truth to show itself.

Something sent you back to the world: a vision, an illness, a visitor, or just the slow certainty that your time apart was over. You are not quite at ease among crowds, but you look at them with the clarity of someone who has finally stopped talking. You are surprisingly good with a broken bone or a worried heart.', array['Medicine', 'Religion']::text[], array['Herbalism Kit']::text[], array['One of your choice']::text[], 'A herbalism kit, a scroll case stuffed with notes on your studies, a winter blanket, a set of common clothes, and a pouch containing 5 gp', 'Hard-Won Insight', 'Troubled people confide in you. If you give them quiet and time, anyone who is grieving, guilty or at odds with someone will tell you what is truly weighing on them, and the DM reveals one true fact about the trouble. This does not oblige them to take your advice, or to trust you with anything else.', 'Hermits are quiet, strange and very present when they do speak. They tend to answer slowly, stare at things for a long time, and say something unexpectedly kind.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I pause for a long breath before I answer any question. |
| 2 | I talk to myself in the old tongue of my cell when I am nervous. |
| 3 | I sit with my back to a wall, facing a window, whatever the company. |
| 4 | I give odd little gifts to people I like: a feather, a stone, a pressed flower. |
| 5 | I find crowds exhausting and cities overwhelming. |
| 6 | I speak plainly and say things others only think. |
| 7 | I am strangely cheerful at funerals. |
| 8 | I notice small things about people and mention them at the wrong moment. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Humility.** I have little and need less, and I want to keep it that way. (Good) |
| 2 | **Devotion.** What I saw in the silence is true, and I will serve it. (Lawful) |
| 3 | **Solitude.** Wisdom is rarely found where there are many voices. (Neutral) |
| 4 | **Honesty.** Pretence is noise, and I have no patience for it. (Any) |
| 5 | **Insight.** One more year of study and I will understand everything. (Chaotic) |
| 6 | **Control.** The weak need guidance, and I have decided to give it. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | I left a vigil unfinished, and something unresolved waits for me back there. |
| 2 | A traveller once shared their fire and their stories, and I never forgot. |
| 3 | My old teacher is still alive and has sent for me. |
| 4 | There is a secret in my cell that I swore I would never reveal. |
| 5 | I made a vow in the dark that I have not yet fulfilled. |
| 6 | The one person who understood my silence has gone, and I am looking for them. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I am so used to silence that I forget to say thank you. |
| 2 | I speak in riddles when a plain answer would be kinder. |
| 3 | I believe I have seen the truth and struggle to listen to anyone else. |
| 4 | I am afraid of the dark, and it is why I took up the lamp. |
| 5 | I hoard small comforts, such as tea, candles and soft wool. |
| 6 | I judge people who rush and I let them see it. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'hermit', 'grimoire-backgrounds', 'grimoire_2014_hermit', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_hermit', 'Hermit', 'You lived alone, or nearly so, for years. A cave above the treeline, a hut by a marsh, a monastic cell, a lighthouse nobody else wanted. You chose it, or it was chosen for you, and the silence taught you things that no teacher did. You learned the habits of birds, the shape of your own thoughts, and the patience to wait for one truth to show itself.

Something sent you back to the world: a vision, an illness, a visitor, or just the slow certainty that your time apart was over. You are not quite at ease among crowds, but you look at them with the clarity of someone who has finally stopped talking. You are surprisingly good with a broken bone or a worried heart.', array['Insight', 'Religion']::text[], array['Herbalism Kit']::text[], '{}'::text[], '*Choose A or B:* (A) Herbalism Kit, Holy Symbol, Book, Traveler''s Clothes, Bedroll, 12 GP; or (B) 50 GP', null, null, 'Hermits are quiet, strange and very present when they do speak. They tend to answer slowly, stare at things for a long time, and say something unexpectedly kind.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I pause for a long breath before I answer any question. |
| 2 | I talk to myself in the old tongue of my cell when I am nervous. |
| 3 | I sit with my back to a wall, facing a window, whatever the company. |
| 4 | I give odd little gifts to people I like: a feather, a stone, a pressed flower. |
| 5 | I find crowds exhausting and cities overwhelming. |
| 6 | I speak plainly and say things others only think. |
| 7 | I am strangely cheerful at funerals. |
| 8 | I notice small things about people and mention them at the wrong moment. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Humility.** I have little and need less, and I want to keep it that way. (Good) |
| 2 | **Devotion.** What I saw in the silence is true, and I will serve it. (Lawful) |
| 3 | **Solitude.** Wisdom is rarely found where there are many voices. (Neutral) |
| 4 | **Honesty.** Pretence is noise, and I have no patience for it. (Any) |
| 5 | **Insight.** One more year of study and I will understand everything. (Chaotic) |
| 6 | **Control.** The weak need guidance, and I have decided to give it. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | I left a vigil unfinished, and something unresolved waits for me back there. |
| 2 | A traveller once shared their fire and their stories, and I never forgot. |
| 3 | My old teacher is still alive and has sent for me. |
| 4 | There is a secret in my cell that I swore I would never reveal. |
| 5 | I made a vow in the dark that I have not yet fulfilled. |
| 6 | The one person who understood my silence has gone, and I am looking for them. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I am so used to silence that I forget to say thank you. |
| 2 | I speak in riddles when a plain answer would be kinder. |
| 3 | I believe I have seen the truth and struggle to listen to anyone else. |
| 4 | I am afraid of the dark, and it is why I took up the lamp. |
| 5 | I hoard small comforts, such as tea, candles and soft wool. |
| 6 | I judge people who rush and I let them see it. |', 'Magic Initiate (Cleric)', array['constitution', 'wisdom', 'charisma']::text[], '{"name":"Magic Initiate","variant":"Cleric"}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'hermit', 'grimoire-backgrounds', 'grimoire_2024_hermit', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_investigator', 'Investigator', 'You are paid to find out what other people would prefer stay buried. A missing heir, a forged will, a poisoned well, a quiet theft from a counting house: you walked into each one with a notebook, a lamp and a willingness to ask the same question six different ways. Most of your cases ended in a conversation, not a fight.

You learned that guilt has a tell, that alibis are like cheap locks, and that the real trick is to be forgotten by everyone you interview. You still keep a list of the cases you could not close. Whether you worked for a magistrate, a guild or yourself, you came away with a quiet confidence, a few useful contacts and a distrust of tidy answers.', array['Insight', 'Investigation']::text[], array['Disguise Kit', 'Thieves'' Tools']::text[], '{}'::text[], 'A disguise kit, a set of thieves'' tools, a notebook of old cases, a set of common clothes, and a pouch containing 15 gp', 'Old Friends at the Watch', 'You are known, and mostly liked, by officers of the law in at least one region. In any settlement with a watch or constabulary you can ask to read its public records of recent crimes, to speak with prisoners held on minor charges, and to look over a crime scene before it is tidied. Officers will expect a share of anything useful you find.', 'Investigators are patient, observant and politely sceptical. They tend to ask questions that sound idle, to keep a notebook within reach, and to stay unremarkable on purpose.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I ask the same question twice, an hour apart, to see if the answer changes. |
| 2 | I take notes on everything, including conversations at dinner. |
| 3 | I dress to blend in and feel oddly offended when someone remembers me. |
| 4 | I assume every story has a missing piece, and I say so. |
| 5 | I stay calm and polite when interviewing even the worst of suspects. |
| 6 | I fiddle with a coin when I am thinking. |
| 7 | I can tell a lie from a mistake, and I let the second go. |
| 8 | I turn down strong drink while working and make up for it afterwards. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Truth.** Whatever it costs, the facts should be known. (Any) |
| 2 | **Justice.** Someone who did harm should answer for it. (Lawful) |
| 3 | **Mercy.** Not every secret needs to be dragged into the light. (Good) |
| 4 | **Curiosity.** A locked door is just a question with a handle. (Chaotic) |
| 5 | **Fairness.** I serve whoever hires me honestly, and no one else. (Neutral) |
| 6 | **Leverage.** What I learn about people is the best coin there is. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | A case I could not close still keeps me awake, and I want it solved. |
| 2 | A magistrate gave me my first chance, and I will not let them down. |
| 3 | My old partner vanished mid-case, and I have not stopped looking. |
| 4 | Someone innocent was hanged on my evidence, and I am trying to make amends. |
| 5 | I have a nemesis who always covers their tracks, and I want to meet them. |
| 6 | A client I failed once sent me a letter of thanks anyway, and I keep it. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I cannot leave a mystery alone, even when it is none of my business. |
| 2 | I suspect my friends of keeping things from me. |
| 3 | I lie more easily than I should, and sometimes to people I like. |
| 4 | I prefer information to people, and I behave accordingly. |
| 5 | I keep a file on everyone I meet, and I add to it without asking. |
| 6 | I overlook the obvious because I am hunting for something clever. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'investigator', 'grimoire-backgrounds', 'grimoire_2014_investigator', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_investigator', 'Investigator', 'You are paid to find out what other people would prefer stay buried. A missing heir, a forged will, a poisoned well, a quiet theft from a counting house: you walked into each one with a notebook, a lamp and a willingness to ask the same question six different ways. Most of your cases ended in a conversation, not a fight.

You learned that guilt has a tell, that alibis are like cheap locks, and that the real trick is to be forgotten by everyone you interview. You still keep a list of the cases you could not close. Whether you worked for a magistrate, a guild or yourself, you came away with a quiet confidence, a few useful contacts and a distrust of tidy answers.', array['Insight', 'Investigation']::text[], array['Thieves'' Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Thieves'' Tools, Hooded Lantern, Crowbar, Dagger, Traveler''s Clothes, 14 GP; or (B) 50 GP', null, null, 'Investigators are patient, observant and politely sceptical. They tend to ask questions that sound idle, to keep a notebook within reach, and to stay unremarkable on purpose.

| d8 | Personality Trait |
|----|----------------------------|
| 1 | I ask the same question twice, an hour apart, to see if the answer changes. |
| 2 | I take notes on everything, including conversations at dinner. |
| 3 | I dress to blend in and feel oddly offended when someone remembers me. |
| 4 | I assume every story has a missing piece, and I say so. |
| 5 | I stay calm and polite when interviewing even the worst of suspects. |
| 6 | I fiddle with a coin when I am thinking. |
| 7 | I can tell a lie from a mistake, and I let the second go. |
| 8 | I turn down strong drink while working and make up for it afterwards. |

| d6 | Ideal |
|----|----------------------------|
| 1 | **Truth.** Whatever it costs, the facts should be known. (Any) |
| 2 | **Justice.** Someone who did harm should answer for it. (Lawful) |
| 3 | **Mercy.** Not every secret needs to be dragged into the light. (Good) |
| 4 | **Curiosity.** A locked door is just a question with a handle. (Chaotic) |
| 5 | **Fairness.** I serve whoever hires me honestly, and no one else. (Neutral) |
| 6 | **Leverage.** What I learn about people is the best coin there is. (Evil) |

| d6 | Bond |
|----|----------------------------|
| 1 | A case I could not close still keeps me awake, and I want it solved. |
| 2 | A magistrate gave me my first chance, and I will not let them down. |
| 3 | My old partner vanished mid-case, and I have not stopped looking. |
| 4 | Someone innocent was hanged on my evidence, and I am trying to make amends. |
| 5 | I have a nemesis who always covers their tracks, and I want to meet them. |
| 6 | A client I failed once sent me a letter of thanks anyway, and I keep it. |

| d6 | Flaw |
|----|----------------------------|
| 1 | I cannot leave a mystery alone, even when it is none of my business. |
| 2 | I suspect my friends of keeping things from me. |
| 3 | I lie more easily than I should, and sometimes to people I like. |
| 4 | I prefer information to people, and I behave accordingly. |
| 5 | I keep a file on everyone I meet, and I add to it without asking. |
| 6 | I overlook the obvious because I am hunting for something clever. |', 'Alert', array['dexterity', 'intelligence', 'wisdom']::text[], '{"name":"Alert","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'investigator', 'grimoire-backgrounds', 'grimoire_2024_investigator', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_knight', 'Knight', 'You were raised to the saddle and the oath. Perhaps you served as a page in a baron''s hall, or earned your spurs in a border war, or were knighted on a muddy field for dragging a banner out of a rout. Either way, you swore to a lord, a crown or a cause, and the weight of that promise has shaped how you stand, speak and ride.

You know how to hold a lance, how to bargain a ransom, and how to keep a hall quiet by entering it. You also know that honour is a tool as much as a burden: it opens gates, and it closes them on those who break it. Whether your lord still lives, or you ride on your own account, the oath has not let go of you.', array['Athletics', 'Persuasion']::text[], array['One type of Gaming Set', 'Vehicles (Land)']::text[], '{}'::text[], 'A set of traveller''s clothes, a dragonchess set, a lance, a sealed letter from your lord, and a pouch containing 15 gp', 'Sworn Retainer', 'You are bound to a lord, order or house that counts you as one of its own. In any of its holdings, or those of its allies, you can claim a bed, a stable for your mount and a hearing with the person in charge. In return, your sworn patron may call on you for a favour, and refusing it costs you that standing.', 'Knights carry themselves as though someone is always watching, because someone usually is. Some wear their vows lightly and others like a second suit of armour.

| d8 | Personality Trait |
|----|----------|
| 1 | I stand when anyone older or wounded enters the room, even in a tavern brawl. |
| 2 | I name my horse in every introduction, and I expect you to be polite to her. |
| 3 | I keep careful count of every debt and favour, mine and yours. |
| 4 | I tell the plain truth, even when a kind lie would cost me nothing. |
| 5 | I treat every meal as a feast day, since I have gone without often enough. |
| 6 | I practise my sword forms each dawn, loudly, whether or not anyone is trying to sleep. |
| 7 | I address everyone as ''good sir'' or ''good lady'', including my enemies. |
| 8 | I fall silent and still when I am truly angry, which unsettles people more than shouting. |

| d6 | Ideal |
|----|----------|
| 1 | **Service.** A strong arm exists to shield those who cannot shield themselves. (Good) |
| 2 | **Order.** An oath kept is the only thing that holds a kingdom together. (Lawful) |
| 3 | **Glory.** A deed worth doing is worth being sung about afterwards. (Chaotic) |
| 4 | **Mercy.** A yielded foe has earned the right to walk away. (Good) |
| 5 | **Ambition.** Titles are won by those bold enough to reach for them. (Any) |
| 6 | **Duty.** My orders are not mine to question, only to carry out. (Lawful) |

| d6 | Bond |
|----|----------|
| 1 | My lord gave me my spurs, and I will not shame the hand that gave them. |
| 2 | My squire looks to me for everything, and I will not fail the child. |
| 3 | A rival knight bested me once, and I will meet them again on better ground. |
| 4 | My family''s old banner hangs in a ruined keep, and I mean to raise it again. |
| 5 | I carry a dead companion''s token, and I will see it home. |
| 6 | The order that trained me is in trouble, and I am the only one who knows how deep. |

| d6 | Flaw |
|----|----------|
| 1 | I cannot walk away from a challenge, however foolish the odds. |
| 2 | I look down on anyone who works for coin rather than for honour. |
| 3 | I trust a person''s rank far more than I trust their words. |
| 4 | I will not admit an error in front of those who serve under me. |
| 5 | I hold a grudge for years and call it justice. |
| 6 | My pride makes me a poor guest and an impossible patient. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'knight', 'grimoire-backgrounds', 'grimoire_2014_knight', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_knight', 'Knight', 'You were raised to the saddle and the oath. Perhaps you served as a page in a baron''s hall, or earned your spurs in a border war, or were knighted on a muddy field for dragging a banner out of a rout. Either way, you swore to a lord, a crown or a cause, and the weight of that promise has shaped how you stand, speak and ride.

You know how to hold a lance, how to bargain a ransom, and how to keep a hall quiet by entering it. You also know that honour is a tool as much as a burden: it opens gates, and it closes them on those who break it. Whether your lord still lives, or you ride on your own account, the oath has not let go of you.', array['Athletics', 'Persuasion']::text[], array['Choose one kind of Gaming Set']::text[], '{}'::text[], '*Choose A or B:* (A) Dragonchess Set, Lance, Traveler''s Clothes, Bedroll, 36 GP; or (B) 50 GP', null, null, 'Knights carry themselves as though someone is always watching, because someone usually is. Some wear their vows lightly and others like a second suit of armour.

| d8 | Personality Trait |
|----|----------|
| 1 | I stand when anyone older or wounded enters the room, even in a tavern brawl. |
| 2 | I name my horse in every introduction, and I expect you to be polite to her. |
| 3 | I keep careful count of every debt and favour, mine and yours. |
| 4 | I tell the plain truth, even when a kind lie would cost me nothing. |
| 5 | I treat every meal as a feast day, since I have gone without often enough. |
| 6 | I practise my sword forms each dawn, loudly, whether or not anyone is trying to sleep. |
| 7 | I address everyone as ''good sir'' or ''good lady'', including my enemies. |
| 8 | I fall silent and still when I am truly angry, which unsettles people more than shouting. |

| d6 | Ideal |
|----|----------|
| 1 | **Service.** A strong arm exists to shield those who cannot shield themselves. (Good) |
| 2 | **Order.** An oath kept is the only thing that holds a kingdom together. (Lawful) |
| 3 | **Glory.** A deed worth doing is worth being sung about afterwards. (Chaotic) |
| 4 | **Mercy.** A yielded foe has earned the right to walk away. (Good) |
| 5 | **Ambition.** Titles are won by those bold enough to reach for them. (Any) |
| 6 | **Duty.** My orders are not mine to question, only to carry out. (Lawful) |

| d6 | Bond |
|----|----------|
| 1 | My lord gave me my spurs, and I will not shame the hand that gave them. |
| 2 | My squire looks to me for everything, and I will not fail the child. |
| 3 | A rival knight bested me once, and I will meet them again on better ground. |
| 4 | My family''s old banner hangs in a ruined keep, and I mean to raise it again. |
| 5 | I carry a dead companion''s token, and I will see it home. |
| 6 | The order that trained me is in trouble, and I am the only one who knows how deep. |

| d6 | Flaw |
|----|----------|
| 1 | I cannot walk away from a challenge, however foolish the odds. |
| 2 | I look down on anyone who works for coin rather than for honour. |
| 3 | I trust a person''s rank far more than I trust their words. |
| 4 | I will not admit an error in front of those who serve under me. |
| 5 | I hold a grudge for years and call it justice. |
| 6 | My pride makes me a poor guest and an impossible patient. |', 'Savage Attacker', array['strength', 'constitution', 'charisma']::text[], '{"name":"Savage Attacker","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'knight', 'grimoire-backgrounds', 'grimoire_2024_knight', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_merchant', 'Merchant', 'You made your living on the margin between what a thing costs here and what it fetches there. Perhaps you ran a market stall, kept a warehouse, or rode with a caravan and counted every crate twice. You learned to read a buyer''s hands before their face, and to smell a bad deal across a crowded square.

The trade has left you with a head for figures, a memory for faces and prices, and a quiet network of contacts who owe you, or whom you owe. You understand that every road is a ledger, and that most disputes end when someone finds the right number. Whether you left trade through bankruptcy, boredom or opportunity, you still price everything you see.', array['Insight', 'Persuasion']::text[], array['Navigator''s Tools']::text[], array['One of your choice']::text[], 'A set of fine clothes, a pair of merchant''s scales, a ledger with a pen and ink, a set of navigator''s tools, and a pouch containing 20 gp', 'Trade Ledger', 'You keep a trade ledger of contacts, routes and favours. In any town of reasonable size, you can find a fellow trader who will tell you what goods are scarce, who is buying and who is selling, and who is not to be trusted. Such a contact will also vouch for you to local merchants, making it easier to secure storage, passage for goods or an introduction.', 'Merchants are friendly with a purpose. They remember names, count change by instinct, and rarely say what they are thinking until the price is agreed.

| d8 | Personality Trait |
|----|----------|
| 1 | I always seem to know what something cost, and I say so at awkward moments. |
| 2 | I smile warmly at everyone I meet, and I mean it about half the time. |
| 3 | I never pass an unattended crate without wondering what is in it. |
| 4 | I haggle over everything, including things I intend to give away. |
| 5 | I write down every expense in a small book, even the ones I would rather forget. |
| 6 | I never take the first offer, and I never make my best one first. |
| 7 | I treat strangers as customers, and customers as old friends. |
| 8 | I get restless when idle, and I am always looking for something to buy low. |

| d6 | Ideal |
|----|----------|
| 1 | **Fair Dealing.** A good name is worth more than a good profit. (Lawful) |
| 2 | **Prosperity.** Trade lifts everyone, and the more roads, the better. (Good) |
| 3 | **Opportunity.** Every shortage is a chance for the quick-witted. (Chaotic) |
| 4 | **Craft.** I take pride in knowing the true worth of everything. (Any) |
| 5 | **Greed.** There is no such thing as too much coin. (Evil) |
| 6 | **Community.** A town that trades together stays together. (Good) |

| d6 | Bond |
|----|----------|
| 1 | A partner cheated me, and I mean to see the books balanced. |
| 2 | I owe a great deal to the caravan master who taught me the trade. |
| 3 | My family''s shop stands empty, and I will reopen it one day. |
| 4 | A rival house of traders has ruined many friends, and I will not rest until they fall. |
| 5 | I hold a debt note that could free or doom someone I care about. |
| 6 | I once lost a shipment that was not mine, and the owner still waits for an answer. |

| d6 | Flaw |
|----|----------|
| 1 | I put a price on everything, including things that should not have one. |
| 2 | I cannot resist a bargain, however foolish the purchase. |
| 3 | I lie smoothly about my own business and cannot stop myself. |
| 4 | I measure friendship by who has been useful to me lately. |
| 5 | I hoard coin and goods well beyond any sensible need. |
| 6 | I take every insult personally and every compliment suspiciously. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'merchant', 'grimoire-backgrounds', 'grimoire_2014_merchant', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_merchant', 'Merchant', 'You made your living on the margin between what a thing costs here and what it fetches there. Perhaps you ran a market stall, kept a warehouse, or rode with a caravan and counted every crate twice. You learned to read a buyer''s hands before their face, and to smell a bad deal across a crowded square.

The trade has left you with a head for figures, a memory for faces and prices, and a quiet network of contacts who owe you, or whom you owe. You understand that every road is a ledger, and that most disputes end when someone finds the right number. Whether you left trade through bankruptcy, boredom or opportunity, you still price everything you see.', array['Insight', 'Persuasion']::text[], array['Navigator''s Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Navigator''s Tools, Merchant''s Scale, Traveler''s Clothes, Case (Map or Scroll), 17 GP; or (B) 50 GP', null, null, 'Merchants are friendly with a purpose. They remember names, count change by instinct, and rarely say what they are thinking until the price is agreed.

| d8 | Personality Trait |
|----|----------|
| 1 | I always seem to know what something cost, and I say so at awkward moments. |
| 2 | I smile warmly at everyone I meet, and I mean it about half the time. |
| 3 | I never pass an unattended crate without wondering what is in it. |
| 4 | I haggle over everything, including things I intend to give away. |
| 5 | I write down every expense in a small book, even the ones I would rather forget. |
| 6 | I never take the first offer, and I never make my best one first. |
| 7 | I treat strangers as customers, and customers as old friends. |
| 8 | I get restless when idle, and I am always looking for something to buy low. |

| d6 | Ideal |
|----|----------|
| 1 | **Fair Dealing.** A good name is worth more than a good profit. (Lawful) |
| 2 | **Prosperity.** Trade lifts everyone, and the more roads, the better. (Good) |
| 3 | **Opportunity.** Every shortage is a chance for the quick-witted. (Chaotic) |
| 4 | **Craft.** I take pride in knowing the true worth of everything. (Any) |
| 5 | **Greed.** There is no such thing as too much coin. (Evil) |
| 6 | **Community.** A town that trades together stays together. (Good) |

| d6 | Bond |
|----|----------|
| 1 | A partner cheated me, and I mean to see the books balanced. |
| 2 | I owe a great deal to the caravan master who taught me the trade. |
| 3 | My family''s shop stands empty, and I will reopen it one day. |
| 4 | A rival house of traders has ruined many friends, and I will not rest until they fall. |
| 5 | I hold a debt note that could free or doom someone I care about. |
| 6 | I once lost a shipment that was not mine, and the owner still waits for an answer. |

| d6 | Flaw |
|----|----------|
| 1 | I put a price on everything, including things that should not have one. |
| 2 | I cannot resist a bargain, however foolish the purchase. |
| 3 | I lie smoothly about my own business and cannot stop myself. |
| 4 | I measure friendship by who has been useful to me lately. |
| 5 | I hoard coin and goods well beyond any sensible need. |
| 6 | I take every insult personally and every compliment suspiciously. |', 'Skilled', array['constitution', 'intelligence', 'charisma']::text[], '{"name":"Skilled","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'merchant', 'grimoire-backgrounds', 'grimoire_2024_merchant', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_noble', 'Noble', 'You were born into a house with a crest, a hall and an expectation. Your childhood was dancing masters, genealogies and tutors who corrected your vowels. You learned who may sit before whom, how to refuse an invitation without insult, and which cousin''s marriage mattered more than which cousin''s happiness.

Privilege shaped you, but so did its obligations. People bow to your name before they know your face, and that can be a gift or a cage. You may have left your family willingly, or been sent away in disgrace, or be travelling at its bidding. Either way, you carry the manner of a person who has never needed to ask permission to be heard.', array['History', 'Persuasion']::text[], array['One type of Gaming Set']::text[], array['One of your choice']::text[], 'A set of fine clothes, a signet ring, a scroll of pedigree, a set of playing cards, and a purse containing 25 gp', 'Name That Opens Doors', 'Your family name carries weight among the well-born and the well-off. In most noble houses, courts and wealthy circles, people are inclined to receive you politely, grant you an audience and give you the benefit of the doubt. You can also usually secure an introduction to a minor official or local gentry, though your family''s reputation, good or bad, travels with you.', 'Nobles are shaped by expectation. Some wear their birth with easy grace, while others spend a lifetime trying to outrun it.

| d8 | Personality Trait |
|----|----------|
| 1 | I speak softly and expect to be listened to without having to repeat myself. |
| 2 | I am gracious to servants, in the way that only someone raised among them can be. |
| 3 | I find ordinary chores baffling and fascinating in equal measure. |
| 4 | I never apologise first, though I have learned to find other ways of saying it. |
| 5 | I remember every slight, and I repay it with perfect courtesy. |
| 6 | I laugh loudly in formal company, to see who flinches. |
| 7 | I judge a person by how they treat those who cannot repay them. |
| 8 | I can name every guest at a feast and what each of them wants. |

| d6 | Ideal |
|----|----------|
| 1 | **Noblesse.** Those with power owe a debt to those without it. (Good) |
| 2 | **Tradition.** The old ways kept this realm together, and I will keep them. (Lawful) |
| 3 | **Freedom.** My birth is an accident, and I intend to live by my own choices. (Chaotic) |
| 4 | **Ambition.** My house deserves greater glory, and I am the one to win it. (Any) |
| 5 | **Honour.** A name is only as good as its worst deed. (Lawful) |
| 6 | **Dominion.** The strong were born to rule the weak. (Evil) |

| d6 | Bond |
|----|----------|
| 1 | My family''s honour rests on my shoulders, and I will not be the one to let it fall. |
| 2 | A commoner saved my life once, and I intend to repay them in full. |
| 3 | I was promised in marriage to a stranger, and I am running from, or toward, that day. |
| 4 | My younger sibling is still at court, and I fear for them. |
| 5 | A forgotten heirloom of my house is lost in the wilds, and I will find it. |
| 6 | I swore on my mother''s grave to expose the traitor who ruined us. |

| d6 | Flaw |
|----|----------|
| 1 | I assume I am the most important person in any room until proven otherwise. |
| 2 | I cannot cook, mend or fight dirty, and I am too proud to learn. |
| 3 | I take offence at the smallest breach of manners. |
| 4 | I spend coin faster than I earn it, and I do not like to be reminded. |
| 5 | I am deeply afraid of being ordinary. |
| 6 | I keep my feelings so well hidden that even I am sometimes unsure of them. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'noble', 'grimoire-backgrounds', 'grimoire_2014_noble', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_noble', 'Noble', 'You were born into a house with a crest, a hall and an expectation. Your childhood was dancing masters, genealogies and tutors who corrected your vowels. You learned who may sit before whom, how to refuse an invitation without insult, and which cousin''s marriage mattered more than which cousin''s happiness.

Privilege shaped you, but so did its obligations. People bow to your name before they know your face, and that can be a gift or a cage. You may have left your family willingly, or been sent away in disgrace, or be travelling at its bidding. Either way, you carry the manner of a person who has never needed to ask permission to be heard.', array['History', 'Persuasion']::text[], array['Choose one kind of Gaming Set']::text[], '{}'::text[], '*Choose A or B:* (A) Dragonchess Set, Fine Clothes, Perfume, Case (Map or Scroll), 28 GP; or (B) 50 GP', null, null, 'Nobles are shaped by expectation. Some wear their birth with easy grace, while others spend a lifetime trying to outrun it.

| d8 | Personality Trait |
|----|----------|
| 1 | I speak softly and expect to be listened to without having to repeat myself. |
| 2 | I am gracious to servants, in the way that only someone raised among them can be. |
| 3 | I find ordinary chores baffling and fascinating in equal measure. |
| 4 | I never apologise first, though I have learned to find other ways of saying it. |
| 5 | I remember every slight, and I repay it with perfect courtesy. |
| 6 | I laugh loudly in formal company, to see who flinches. |
| 7 | I judge a person by how they treat those who cannot repay them. |
| 8 | I can name every guest at a feast and what each of them wants. |

| d6 | Ideal |
|----|----------|
| 1 | **Noblesse.** Those with power owe a debt to those without it. (Good) |
| 2 | **Tradition.** The old ways kept this realm together, and I will keep them. (Lawful) |
| 3 | **Freedom.** My birth is an accident, and I intend to live by my own choices. (Chaotic) |
| 4 | **Ambition.** My house deserves greater glory, and I am the one to win it. (Any) |
| 5 | **Honour.** A name is only as good as its worst deed. (Lawful) |
| 6 | **Dominion.** The strong were born to rule the weak. (Evil) |

| d6 | Bond |
|----|----------|
| 1 | My family''s honour rests on my shoulders, and I will not be the one to let it fall. |
| 2 | A commoner saved my life once, and I intend to repay them in full. |
| 3 | I was promised in marriage to a stranger, and I am running from, or toward, that day. |
| 4 | My younger sibling is still at court, and I fear for them. |
| 5 | A forgotten heirloom of my house is lost in the wilds, and I will find it. |
| 6 | I swore on my mother''s grave to expose the traitor who ruined us. |

| d6 | Flaw |
|----|----------|
| 1 | I assume I am the most important person in any room until proven otherwise. |
| 2 | I cannot cook, mend or fight dirty, and I am too proud to learn. |
| 3 | I take offence at the smallest breach of manners. |
| 4 | I spend coin faster than I earn it, and I do not like to be reminded. |
| 5 | I am deeply afraid of being ordinary. |
| 6 | I keep my feelings so well hidden that even I am sometimes unsure of them. |', 'Skilled', array['strength', 'intelligence', 'charisma']::text[], '{"name":"Skilled","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'noble', 'grimoire-backgrounds', 'grimoire_2024_noble', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_sailor', 'Sailor', 'You have spent years where the horizon is the only wall. You hauled rope, scrubbed decks and learned to sleep through a gale in a swinging hammock. You can tell the weather by the colour of the sunset and the mood of the crew by the sound of the galley.

Ship life taught you to trust the people on either side of you, and to distrust the sea, which has no favourites. You learned a hundred knots, a dozen dialects of dockside slang, and the particular stillness of a becalmed afternoon. On land you walk with a rolling gait and find the ground oddly rude for refusing to move. Whether you served on a merchant hull, a navy cutter or something less legal, the water remains in your bones.', array['Acrobatics', 'Perception']::text[], array['Navigator''s Tools', 'Vehicles (Water)']::text[], '{}'::text[], 'A belaying pin, fifty feet of silk rope, a set of traveller''s clothes, a lucky charm, and a pouch containing 10 gp', 'Berth Aboard', 'You are a member of the broad fellowship of seafarers. At almost any port, harbour or river landing, you can find passage aboard a ship heading somewhere, in exchange for working your keep. You may also get a bunk and a meal at a sailors'' hall or dockside tavern, and local crews will usually share rumours of shipping, storms and rival vessels.', 'Sailors talk about weather, wages and the next port, in roughly that order. Under the bluster, most are loyal to a fault to the people who share their hull.

| d8 | Personality Trait |
|----|----------|
| 1 | I whistle when I work, and I will not stop even if asked politely. |
| 2 | I measure every distance in days of sail. |
| 3 | I am cheerfully superstitious and will not set out on a Friday. |
| 4 | I cannot sleep in a bed that does not move, so I rock it. |
| 5 | I give nicknames to everyone, and they tend to stick. |
| 6 | I tell tall tales with a perfectly straight face. |
| 7 | I coil every rope I find, whether or not it is mine. |
| 8 | I never refuse a drink or a dare. |

| d6 | Ideal |
|----|----------|
| 1 | **Crew.** Everyone on the ship pulls together or sinks together. (Good) |
| 2 | **Discipline.** A tight ship is a safe ship, and orders are orders. (Lawful) |
| 3 | **Freedom.** The open sea belongs to no king, and neither do I. (Chaotic) |
| 4 | **Fortune.** Every voyage might be the one that makes me rich. (Any) |
| 5 | **Respect.** The sea humbles everyone, and I will humble anyone who forgets it. (Neutral) |
| 6 | **Plunder.** What is not nailed down belongs to the sharpest hands. (Evil) |

| d6 | Bond |
|----|----------|
| 1 | My old ship was lost with most of its crew, and I carry their names with me. |
| 2 | I owe my life to a captain I once wronged. |
| 3 | I have a sweetheart in every port, and one who truly matters. |
| 4 | I stole something from a harbour master, and word is on its way. |
| 5 | A treasure chart tattooed on my back remains half-finished. |
| 6 | My little sister waits at the quay each season, and I have not been home in years. |

| d6 | Flaw |
|----|----------|
| 1 | I have a foul temper when sober and a worse one when drunk. |
| 2 | I cannot keep a secret longer than a fortnight. |
| 3 | I gamble away my wages in the first port I reach. |
| 4 | I distrust anyone who has never been seasick. |
| 5 | I mock landlubbers without noticing the damage. |
| 6 | I will not swim, and I will not admit I cannot. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'sailor', 'grimoire-backgrounds', 'grimoire_2014_sailor', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_sailor', 'Sailor', 'You have spent years where the horizon is the only wall. You hauled rope, scrubbed decks and learned to sleep through a gale in a swinging hammock. You can tell the weather by the colour of the sunset and the mood of the crew by the sound of the galley.

Ship life taught you to trust the people on either side of you, and to distrust the sea, which has no favourites. You learned a hundred knots, a dozen dialects of dockside slang, and the particular stillness of a becalmed afternoon. On land you walk with a rolling gait and find the ground oddly rude for refusing to move. Whether you served on a merchant hull, a navy cutter or something less legal, the water remains in your bones.', array['Acrobatics', 'Perception']::text[], array['Navigator''s Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Navigator''s Tools, Rope, Traveler''s Clothes, Dagger, 20 GP; or (B) 50 GP', null, null, 'Sailors talk about weather, wages and the next port, in roughly that order. Under the bluster, most are loyal to a fault to the people who share their hull.

| d8 | Personality Trait |
|----|----------|
| 1 | I whistle when I work, and I will not stop even if asked politely. |
| 2 | I measure every distance in days of sail. |
| 3 | I am cheerfully superstitious and will not set out on a Friday. |
| 4 | I cannot sleep in a bed that does not move, so I rock it. |
| 5 | I give nicknames to everyone, and they tend to stick. |
| 6 | I tell tall tales with a perfectly straight face. |
| 7 | I coil every rope I find, whether or not it is mine. |
| 8 | I never refuse a drink or a dare. |

| d6 | Ideal |
|----|----------|
| 1 | **Crew.** Everyone on the ship pulls together or sinks together. (Good) |
| 2 | **Discipline.** A tight ship is a safe ship, and orders are orders. (Lawful) |
| 3 | **Freedom.** The open sea belongs to no king, and neither do I. (Chaotic) |
| 4 | **Fortune.** Every voyage might be the one that makes me rich. (Any) |
| 5 | **Respect.** The sea humbles everyone, and I will humble anyone who forgets it. (Neutral) |
| 6 | **Plunder.** What is not nailed down belongs to the sharpest hands. (Evil) |

| d6 | Bond |
|----|----------|
| 1 | My old ship was lost with most of its crew, and I carry their names with me. |
| 2 | I owe my life to a captain I once wronged. |
| 3 | I have a sweetheart in every port, and one who truly matters. |
| 4 | I stole something from a harbour master, and word is on its way. |
| 5 | A treasure chart tattooed on my back remains half-finished. |
| 6 | My little sister waits at the quay each season, and I have not been home in years. |

| d6 | Flaw |
|----|----------|
| 1 | I have a foul temper when sober and a worse one when drunk. |
| 2 | I cannot keep a secret longer than a fortnight. |
| 3 | I gamble away my wages in the first port I reach. |
| 4 | I distrust anyone who has never been seasick. |
| 5 | I mock landlubbers without noticing the damage. |
| 6 | I will not swim, and I will not admit I cannot. |', 'Savage Attacker', array['strength', 'dexterity', 'wisdom']::text[], '{"name":"Savage Attacker","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'sailor', 'grimoire-backgrounds', 'grimoire_2024_sailor', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_scribe', 'Scribe', 'You spent your days with ink on your fingers and a hundred voices in your hands. In a monastery scriptorium, a counting house or a magistrate''s office, you copied, catalogued and checked what other people dictated or lost. You learned that nothing is true until it has been written down, and that almost everything written down is a little wrong.

Your trade made you patient, precise and quietly invisible, which means you have overheard a great deal. You can read most hands at a glance, spot a forgery by the slant of a letter, and find your way through any archive. Whether you left your desk by choice, by scandal or by fire, you carry the habit of noticing what everyone else skims past.', array['History', 'Investigation']::text[], array['Calligrapher''s Supplies']::text[], array['One of your choice']::text[], 'A set of calligrapher''s supplies, a bottle of black ink, three pens, a stack of parchment, a set of common clothes, and a pouch containing 10 gp', 'Archive Access', 'You have the standing of someone who works with records. Archives, libraries, registries and scriptoriums will generally let you in to consult their holdings, and the clerks inside are usually willing to help you find a specific document. Official copyists and record-keepers will also treat you as a colleague, sharing what they know of local affairs and who has been asking about what.', 'Scribes are watchful and exact, with a dry humour that tends to surface when no one important is listening.

| d8 | Personality Trait |
|----|----------|
| 1 | I correct other people''s spelling aloud, usually without meaning to. |
| 2 | I take notes on everything, including conversations with friends. |
| 3 | I cannot bear a blot or a crooked line, and I will fix it unasked. |
| 4 | I whisper while reading and get embarrassed when someone notices. |
| 5 | I speak in carefully balanced sentences, as though dictating. |
| 6 | I know the exact weight and price of every kind of paper. |
| 7 | I get excited by an index. |
| 8 | I find the most boring documents the most interesting, because that is where the truth hides. |

| d6 | Ideal |
|----|----------|
| 1 | **Knowledge.** What is written down must be preserved, for it is how we remember. (Good) |
| 2 | **Accuracy.** A record that lies is worse than none at all. (Lawful) |
| 3 | **Secrecy.** Some pages are better left unread, and unwritten. (Neutral) |
| 4 | **Freedom.** Words should belong to everyone, not locked behind a library door. (Chaotic) |
| 5 | **Influence.** Whoever holds the pen holds the story. (Any) |
| 6 | **Authority.** The right document opens any door, and I forge the key. (Evil) |

| d6 | Bond |
|----|----------|
| 1 | My old master taught me everything, and I mean to finish the great work they left unfinished. |
| 2 | A letter I copied years ago has haunted me since, and I want to know what became of it. |
| 3 | I fled a burning archive, and I carry the one volume I managed to save. |
| 4 | A fellow scribe is falsely imprisoned, and I know the proof exists somewhere. |
| 5 | My apprentice looks up to me, and I do not want to disappoint them. |
| 6 | I owe a debt to a noble house that once spared me from a bad copy. |

| d6 | Flaw |
|----|----------|
| 1 | I cannot resist reading things not meant for me. |
| 2 | I am terrible in a fight and slow to admit it. |
| 3 | I judge people by their handwriting. |
| 4 | I withhold a useful detail until someone asks me properly. |
| 5 | I get lost in a task and forget to eat, sleep or run. |
| 6 | I trust the written word more than I trust the person standing in front of me. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'scribe', 'grimoire-backgrounds', 'grimoire_2014_scribe', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_scribe', 'Scribe', 'You spent your days with ink on your fingers and a hundred voices in your hands. In a monastery scriptorium, a counting house or a magistrate''s office, you copied, catalogued and checked what other people dictated or lost. You learned that nothing is true until it has been written down, and that almost everything written down is a little wrong.

Your trade made you patient, precise and quietly invisible, which means you have overheard a great deal. You can read most hands at a glance, spot a forgery by the slant of a letter, and find your way through any archive. Whether you left your desk by choice, by scandal or by fire, you carry the habit of noticing what everyone else skims past.', array['Investigation', 'Perception']::text[], array['Calligrapher''s Supplies']::text[], '{}'::text[], '*Choose A or B:* (A) Calligrapher''s Supplies, Book, Traveler''s Clothes, Case (Map or Scroll), 12 GP; or (B) 50 GP', null, null, 'Scribes are watchful and exact, with a dry humour that tends to surface when no one important is listening.

| d8 | Personality Trait |
|----|----------|
| 1 | I correct other people''s spelling aloud, usually without meaning to. |
| 2 | I take notes on everything, including conversations with friends. |
| 3 | I cannot bear a blot or a crooked line, and I will fix it unasked. |
| 4 | I whisper while reading and get embarrassed when someone notices. |
| 5 | I speak in carefully balanced sentences, as though dictating. |
| 6 | I know the exact weight and price of every kind of paper. |
| 7 | I get excited by an index. |
| 8 | I find the most boring documents the most interesting, because that is where the truth hides. |

| d6 | Ideal |
|----|----------|
| 1 | **Knowledge.** What is written down must be preserved, for it is how we remember. (Good) |
| 2 | **Accuracy.** A record that lies is worse than none at all. (Lawful) |
| 3 | **Secrecy.** Some pages are better left unread, and unwritten. (Neutral) |
| 4 | **Freedom.** Words should belong to everyone, not locked behind a library door. (Chaotic) |
| 5 | **Influence.** Whoever holds the pen holds the story. (Any) |
| 6 | **Authority.** The right document opens any door, and I forge the key. (Evil) |

| d6 | Bond |
|----|----------|
| 1 | My old master taught me everything, and I mean to finish the great work they left unfinished. |
| 2 | A letter I copied years ago has haunted me since, and I want to know what became of it. |
| 3 | I fled a burning archive, and I carry the one volume I managed to save. |
| 4 | A fellow scribe is falsely imprisoned, and I know the proof exists somewhere. |
| 5 | My apprentice looks up to me, and I do not want to disappoint them. |
| 6 | I owe a debt to a noble house that once spared me from a bad copy. |

| d6 | Flaw |
|----|----------|
| 1 | I cannot resist reading things not meant for me. |
| 2 | I am terrible in a fight and slow to admit it. |
| 3 | I judge people by their handwriting. |
| 4 | I withhold a useful detail until someone asks me properly. |
| 5 | I get lost in a task and forget to eat, sleep or run. |
| 6 | I trust the written word more than I trust the person standing in front of me. |', 'Skilled', array['dexterity', 'intelligence', 'wisdom']::text[], '{"name":"Skilled","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'scribe', 'grimoire-backgrounds', 'grimoire_2024_scribe', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_spy', 'Spy', 'You lived under another name, and sometimes under several. You listened at doors, copied letters, passed messages and walked away before anyone thought to ask who you were. Perhaps you served a crown, a guild, a rich family or only yourself, but you learned that the most valuable thing in any room is whatever the others do not realise they have said.

You are comfortable lying, watching and waiting, and uncomfortable being looked at for too long. You know the signals that mean a meeting is safe or burned, and the faces that matter in any crowd. The work taught you to trust slowly and leave quickly. If you have stepped away from the shadows, they have not quite stepped away from you.', array['Deception', 'Stealth']::text[], array['Disguise Kit', 'Poisoner''s Kit']::text[], '{}'::text[], 'A set of dark common clothes, a disguise kit, a poisoner''s kit, a small mirror, and a pouch containing 15 gp', 'Dead Drop', 'You know how to arrange secret communication. In any settlement, you can pick out a good place for a dead drop and tell when someone has used one. You can leave messages and small items there that only your allies can find, and you can find the markers that other agents leave behind. Anyone who recognises your signs will probably understand what you are, so choose where you use them.', 'Spies keep their own counsel. They are often charming, always observant, and a little too ready to tell you what you want to hear.

| d8 | Personality Trait |
|----|----------|
| 1 | I always sit facing the door, whatever the table. |
| 2 | I change my accent without noticing, and I sometimes forget the original. |
| 3 | I never give a straight answer when a crooked one will do. |
| 4 | I can recall a stranger''s face a year later, and I wish I could not. |
| 5 | I enjoy being underestimated. |
| 6 | I laugh a half-second after everyone else, to see who laughs first. |
| 7 | I pay for everything in small coin and never remember my own order. |
| 8 | I get restless in places with only one exit. |

| d6 | Ideal |
|----|----------|
| 1 | **Loyalty.** My first allegiance is to the one who recruited me. (Lawful) |
| 2 | **Truth.** I lie to protect the truth, not to bury it. (Good) |
| 3 | **Self.** In my trade, the only person you can trust is yourself. (Neutral) |
| 4 | **Liberty.** No state has the right to know everything about its people. (Chaotic) |
| 5 | **Leverage.** A secret is a weapon, and I keep mine sharp. (Evil) |
| 6 | **Peace.** If one quiet death prevents a war, so be it. (Any) |

| d6 | Bond |
|----|----------|
| 1 | My handler vanished, and I intend to learn what happened. |
| 2 | A false name I used long ago became a real person, and I am still sorry for it. |
| 3 | I left a friend behind on my last job, and I cannot forget it. |
| 4 | There is a ledger of names that would unmake my old masters, and I know where it is. |
| 5 | I protect a child whose true parentage no one else must learn. |
| 6 | A rival agent knows my real face, and I intend to hold a grudge. |

| d6 | Flaw |
|----|----------|
| 1 | I lie even when the truth would serve me better. |
| 2 | I can no longer tell whether I like someone or merely find them useful. |
| 3 | I snoop through every room I enter, however polite the invitation. |
| 4 | I cannot take a compliment without suspecting a motive. |
| 5 | I abandon allies swiftly when a mission sours. |
| 6 | I keep secrets even from people who would help me. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'spy', 'grimoire-backgrounds', 'grimoire_2014_spy', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_spy', 'Spy', 'You lived under another name, and sometimes under several. You listened at doors, copied letters, passed messages and walked away before anyone thought to ask who you were. Perhaps you served a crown, a guild, a rich family or only yourself, but you learned that the most valuable thing in any room is whatever the others do not realise they have said.

You are comfortable lying, watching and waiting, and uncomfortable being looked at for too long. You know the signals that mean a meeting is safe or burned, and the faces that matter in any crowd. The work taught you to trust slowly and leave quickly. If you have stepped away from the shadows, they have not quite stepped away from you.', array['Deception', 'Stealth']::text[], array['Disguise Kit']::text[], '{}'::text[], '*Choose A or B:* (A) Disguise Kit, Costume, Dagger, Traveler''s Clothes, 16 GP; or (B) 50 GP', null, null, 'Spies keep their own counsel. They are often charming, always observant, and a little too ready to tell you what you want to hear.

| d8 | Personality Trait |
|----|----------|
| 1 | I always sit facing the door, whatever the table. |
| 2 | I change my accent without noticing, and I sometimes forget the original. |
| 3 | I never give a straight answer when a crooked one will do. |
| 4 | I can recall a stranger''s face a year later, and I wish I could not. |
| 5 | I enjoy being underestimated. |
| 6 | I laugh a half-second after everyone else, to see who laughs first. |
| 7 | I pay for everything in small coin and never remember my own order. |
| 8 | I get restless in places with only one exit. |

| d6 | Ideal |
|----|----------|
| 1 | **Loyalty.** My first allegiance is to the one who recruited me. (Lawful) |
| 2 | **Truth.** I lie to protect the truth, not to bury it. (Good) |
| 3 | **Self.** In my trade, the only person you can trust is yourself. (Neutral) |
| 4 | **Liberty.** No state has the right to know everything about its people. (Chaotic) |
| 5 | **Leverage.** A secret is a weapon, and I keep mine sharp. (Evil) |
| 6 | **Peace.** If one quiet death prevents a war, so be it. (Any) |

| d6 | Bond |
|----|----------|
| 1 | My handler vanished, and I intend to learn what happened. |
| 2 | A false name I used long ago became a real person, and I am still sorry for it. |
| 3 | I left a friend behind on my last job, and I cannot forget it. |
| 4 | There is a ledger of names that would unmake my old masters, and I know where it is. |
| 5 | I protect a child whose true parentage no one else must learn. |
| 6 | A rival agent knows my real face, and I intend to hold a grudge. |

| d6 | Flaw |
|----|----------|
| 1 | I lie even when the truth would serve me better. |
| 2 | I can no longer tell whether I like someone or merely find them useful. |
| 3 | I snoop through every room I enter, however polite the invitation. |
| 4 | I cannot take a compliment without suspecting a motive. |
| 5 | I abandon allies swiftly when a mission sours. |
| 6 | I keep secrets even from people who would help me. |', 'Alert', array['dexterity', 'intelligence', 'charisma']::text[], '{"name":"Alert","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'spy', 'grimoire-backgrounds', 'grimoire_2024_spy', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_wayfarer', 'Wayfarer', 'You grew up with no fixed roof. Whether it was a city alley, a roadside ditch or a series of borrowed barns, you learned young that a locked door is a puzzle and a kind stranger is a gamble. You ate what was left, slept where it was dry and learned how to be unremarkable.

Out of that, you built your skills. You can read a stranger''s mood from across the street, find a way through any town that never asked you in, and slip away before trouble finds you. You know the back ways, the quiet hours and the people who share a fire without asking your name. You do not forget who helped you, nor who did not.', array['Insight', 'Stealth']::text[], array['Thieves'' Tools', 'One type of Gaming Set']::text[], '{}'::text[], 'A set of common clothes, a set of thieves'' tools, a dice set, a bedroll, a length of hempen rope, and a pouch containing 10 gp', 'Back Ways', 'You know the hidden paths of settlements and roads. In any town or city, you can find a quiet route through it that avoids crowds, checkpoints and watched gates, so long as you are not in a hurry. You can also bring up to a few companions with you along these paths, though they will have to keep quiet and keep up.', 'Wayfarers are wary of strangers and generous to those who ask for nothing. They pack light, in every sense.

| d8 | Personality Trait |
|----|----------|
| 1 | I never sit with my back to an open space. |
| 2 | I share my food without being asked, and I notice who shares theirs. |
| 3 | I hoard small useful things, such as string, nails and bent coins. |
| 4 | I sleep lightly and wake without moving. |
| 5 | I flinch at raised voices, and I try to hide it with jokes. |
| 6 | I always know the nearest way out. |
| 7 | I feel uneasy beneath a ceiling that is too high. |
| 8 | I think everyone is hiding something, and I am usually right. |

| d6 | Ideal |
|----|----------|
| 1 | **Kinship.** The ones who share a fire are family, whatever their blood. (Good) |
| 2 | **Freedom.** Nobody who has been hungry will ever be bossed again. (Chaotic) |
| 3 | **Survival.** You do what you must to see tomorrow. (Neutral) |
| 4 | **Fairness.** The poor deserve a hand, because no one else will give one. (Good) |
| 5 | **Cunning.** The world was never fair, so I do not play fair. (Any) |
| 6 | **Rules.** Even on the street there are laws, and I keep them. (Lawful) |

| d6 | Bond |
|----|----------|
| 1 | The street family that raised me is scattered, and I mean to find them. |
| 2 | A baker once gave me bread on a bad night, and I have not forgotten her. |
| 3 | I carry the last thing my mother owned, and I will never sell it. |
| 4 | A gang boss wants me back, and I want him to lose. |
| 5 | I am sworn to protect a younger wanderer who trusts me. |
| 6 | I stole from the wrong person once, and I have been paying ever since. |

| d6 | Flaw |
|----|----------|
| 1 | I steal small things I do not need, just to prove I can. |
| 2 | I do not trust any offer that sounds generous. |
| 3 | I run when things get hard, even when I should stay. |
| 4 | I dread being owed a favour more than owing one. |
| 5 | I flinch from any uniform, even friendly ones. |
| 6 | I lie about my past so often I have lost track of the true version. |', null, null, null, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2014', 'wayfarer', 'grimoire-backgrounds', 'grimoire_2014_wayfarer', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb),
  ('grimoire_2024_wayfarer', 'Wayfarer', 'You grew up with no fixed roof. Whether it was a city alley, a roadside ditch or a series of borrowed barns, you learned young that a locked door is a puzzle and a kind stranger is a gamble. You ate what was left, slept where it was dry and learned how to be unremarkable.

Out of that, you built your skills. You can read a stranger''s mood from across the street, find a way through any town that never asked you in, and slip away before trouble finds you. You know the back ways, the quiet hours and the people who share a fire without asking your name. You do not forget who helped you, nor who did not.', array['Insight', 'Stealth']::text[], array['Thieves'' Tools']::text[], '{}'::text[], '*Choose A or B:* (A) Thieves'' Tools, Traveler''s Clothes, Bedroll, Rope, 21 GP; or (B) 50 GP', null, null, 'Wayfarers are wary of strangers and generous to those who ask for nothing. They pack light, in every sense.

| d8 | Personality Trait |
|----|----------|
| 1 | I never sit with my back to an open space. |
| 2 | I share my food without being asked, and I notice who shares theirs. |
| 3 | I hoard small useful things, such as string, nails and bent coins. |
| 4 | I sleep lightly and wake without moving. |
| 5 | I flinch at raised voices, and I try to hide it with jokes. |
| 6 | I always know the nearest way out. |
| 7 | I feel uneasy beneath a ceiling that is too high. |
| 8 | I think everyone is hiding something, and I am usually right. |

| d6 | Ideal |
|----|----------|
| 1 | **Kinship.** The ones who share a fire are family, whatever their blood. (Good) |
| 2 | **Freedom.** Nobody who has been hungry will ever be bossed again. (Chaotic) |
| 3 | **Survival.** You do what you must to see tomorrow. (Neutral) |
| 4 | **Fairness.** The poor deserve a hand, because no one else will give one. (Good) |
| 5 | **Cunning.** The world was never fair, so I do not play fair. (Any) |
| 6 | **Rules.** Even on the street there are laws, and I keep them. (Lawful) |

| d6 | Bond |
|----|----------|
| 1 | The street family that raised me is scattered, and I mean to find them. |
| 2 | A baker once gave me bread on a bad night, and I have not forgotten her. |
| 3 | I carry the last thing my mother owned, and I will never sell it. |
| 4 | A gang boss wants me back, and I want him to lose. |
| 5 | I am sworn to protect a younger wanderer who trusts me. |
| 6 | I stole from the wrong person once, and I have been paying ever since. |

| d6 | Flaw |
|----|----------|
| 1 | I steal small things I do not need, just to prove I can. |
| 2 | I do not trust any offer that sounds generous. |
| 3 | I run when things get hard, even when I should stay. |
| 4 | I dread being owed a favour more than owing one. |
| 5 | I flinch from any uniform, even friendly ones. |
| 6 | I lie about my past so often I have lost track of the true version. |', 'Alert', array['dexterity', 'wisdom', 'charisma']::text[], '{"name":"Alert","variant":null}'::jsonb, 'grimoire-backgrounds', 'Grimoire Backgrounds (homebrew)', '2024', 'wayfarer', 'grimoire-backgrounds', 'grimoire_2024_wayfarer', 'Dungeon Grimoire homebrew, October 2026', 'grimoire', '{"provider": "grimoire", "document": {"key": "grimoire-backgrounds", "publisher": {"key": "grimoire", "name": "Dungeon Grimoire"}}}'::jsonb)
on conflict (id) do nothing;

-- ── Which books carry backgrounds ───────────────────────────────────────────
-- The Codex backgrounds tab had no sources picker, because nothing listed the books that carry backgrounds; a
-- set that is only reachable by enabling its source was therefore unreachable. Same shape and same reason for
-- being an invoker as its four siblings (20260930224550): library_backgrounds is readable by anyone through its
-- own select policy, so the function adds no reach.
create or replace function public.get_library_background_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql
stable security invoker
set search_path to 'public'
as $function$
  select source, source_title, count(*)
  from library_backgrounds
  where source is not null and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source);
$function$;

grant execute on function public.get_library_background_sources(text) to anon, authenticated;
