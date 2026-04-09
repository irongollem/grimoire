-- ── Hall of Heroes: Harper council members from Revel's End ──────────────────
-- Jil Torbo, Kriv Norixius, and Voss Anderton are Harper council members
-- who travel to Revel's End prison alongside Jarnathan in Honor Among Thieves.

-- Voss Anderton (Harper council member)
update hall_of_heroes set
  race        = 'Human',
  alignment   = 'Lawful Good',
  occupation  = 'Harper Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Composed and deliberate. Takes the Harpers'' mandate seriously and is not amused by those who treat council proceedings as an opportunity for scheming."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A senior member of the Harper council who travelled to Revel''s End to preside over proceedings there. Like his fellow council members, he found himself an unwilling participant in Edgin Darvis''s prison escape scheme."}]}]}'
where name ilike 'Voss%';

-- Jil Torbo (Harper council member)
update hall_of_heroes set
  alignment   = 'Lawful Good',
  occupation  = 'Harper Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Methodical and cautious. Prefers procedure over improvisation and is deeply suspicious of anyone who seems too charming."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Harper council member who travelled to Revel''s End for the council session. Present during Edgin Darvis''s hearing and the chaos that followed."}]}]}'
where name ilike 'Jil%';

-- Kriv Norixius (Harper council member, Dragonborn)
update hall_of_heroes set
  race        = 'Dragonborn',
  alignment   = 'Lawful Good',
  occupation  = 'Harper Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Stern and principled. Brings a Dragonborn''s sense of honour to every council deliberation and expects the same of others."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Dragonborn Harper council member who attended the session at Revel''s End. One of the more imposing figures on the council, though no less caught off-guard by Edgin''s schemes than his colleagues."}]}]}'
where name ilike 'Kriv%';
