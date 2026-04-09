-- ── Hall of Heroes: correct Lords' Alliance council lore ─────────────────────
-- These are Lords' Alliance representatives (not Harpers), each from a city-state,
-- convening at Revel's End to decide on prisoner pardons and releases.
-- Jarnathan is exploited specifically because Aarakocra can survive a window jump.

update hall_of_heroes set
  occupation  = 'Lords'' Alliance Council Member',
  appearance  = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A tall, dignified Aarakocra with sharp amber eyes and neatly preened feathers. Wears formal council robes and carries himself with the composed authority expected of his office — at least until someone throws him out a window."}]}]}',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Solemn, duty-bound, and deeply unimpressed by adventurers. Holds his council duties in the highest regard and has very strong opinions about what constitutes appropriate use of a council member."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Lords'' Alliance representative attending the council session at Revel''s End prison, where the Alliance convenes to rule on prisoner pardons. Jarnathan''s misfortune was being the only council member capable of surviving a drop from a high window — a fact Edgin Darvis''s group exploited to engineer their escape. He was thrown out the window, glided to safety, and has had complicated feelings about justice ever since."}]}]}'
where name ilike 'Jarnathan%';

update hall_of_heroes set
  race        = 'Human',
  alignment   = 'Lawful Neutral',
  occupation  = 'Lords'' Alliance Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Composed and deliberate. Takes the Alliance''s mandate seriously and is not amused by those who treat council proceedings as an opportunity for scheming."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Lords'' Alliance representative from his city-state, travelling to Revel''s End to sit on the council that decides which prisoners deserve pardon or release. Found himself an unwilling participant in Edgin Darvis''s escape scheme."}]}]}'
where name ilike 'Voss%';

update hall_of_heroes set
  alignment   = 'Lawful Neutral',
  occupation  = 'Lords'' Alliance Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Methodical and cautious. Prefers procedure over improvisation and is deeply suspicious of anyone who seems too charming."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Lords'' Alliance council member representing their city-state at Revel''s End. Present during Edgin Darvis''s hearing and the chaos that followed when the escape plan was set in motion."}]}]}'
where name ilike 'Jil%';

update hall_of_heroes set
  race        = 'Dragonborn',
  alignment   = 'Lawful Neutral',
  occupation  = 'Lords'' Alliance Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Stern and principled. Brings a Dragonborn''s sense of honour to every council deliberation and expects the same of others — including prisoners petitioning for pardon."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Dragonborn Lords'' Alliance representative attending the council at Revel''s End. One of the more imposing figures on the council, though no less blindsided by Edgin''s escape scheme than his colleagues."}]}]}'
where name ilike 'Kriv%';
