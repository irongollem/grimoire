-- ── Hall of Heroes ────────────────────────────────────────────────────────────
-- Global admin-curated NPC roster importable into any campaign.
-- Admin is determined by app_metadata.role = 'admin' in the JWT.

-- ── Update is_app_admin() to use JWT role claim ───────────────────────────────
create or replace function public.is_app_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;

-- ── Table ─────────────────────────────────────────────────────────────────────
create table public.hall_of_heroes (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null references auth.users(id) on delete cascade,
  name                            text not null,
  setting                         text not null default 'faerun',
  race                            text,
  alignment                       text,
  age                             text,
  occupation                      text,
  appearance                      text,
  personality                     text,
  backstory                       text,
  notes                           text,
  status                          text not null default 'alive',
  relationship                    text not null default 'neutral',
  portrait_url                    text,
  card_art_url                    text,
  portrait_focal_point            jsonb,
  disguise_name                   text,
  disguise_portrait_url           text,
  disguise_portrait_focal_point   jsonb,
  is_revealed                     boolean not null default false,
  tags                            text[] not null default '{}',
  stat_block                      jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index hall_of_heroes_setting_idx on public.hall_of_heroes(setting);
create index hall_of_heroes_name_idx    on public.hall_of_heroes(name);

create trigger hall_of_heroes_updated_at
  before update on hall_of_heroes
  for each row execute procedure update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table hall_of_heroes enable row level security;

create policy "hall_of_heroes_select" on hall_of_heroes
  for select using (auth.role() = 'authenticated');

create policy "hall_of_heroes_insert" on hall_of_heroes
  for insert with check (is_app_admin());

create policy "hall_of_heroes_update" on hall_of_heroes
  for update using (is_app_admin());

create policy "hall_of_heroes_delete" on hall_of_heroes
  for delete using (is_app_admin());

-- ── Seed from existing campaign NPCs ─────────────────────────────────────────
-- Only inserts if the source NPCs exist (single-instance project).
-- Portrait URLs are copied by reference — no storage duplication.

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
  '08b50643-fb6e-4e49-af33-38bdb5f15845', -- Edgin Darvis
  '61646a31-ae37-499c-b13f-c27eaa3a08a6', -- Jarnathan
  'f3574f79-3634-4392-88c8-524b14cb8400', -- Jil Torbo
  'c869a29e-9fb6-4716-88f1-2ec0e8e094ab'  -- Kriv Norixius
)
on conflict do nothing;

-- ── Public-knowledge lore ─────────────────────────────────────────────────────

-- Drizzt Do'Urden
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

-- Holga Kilgore (Honor Among Thieves)
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

-- Marlamin (Honor Among Thieves — minor crew member, partner of Holga)
update hall_of_heroes set
  occupation  = 'Thief',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Scrappy and street-smart, more comfortable in the shadows than in the spotlight. Loyal to those who''ve earned it."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A minor member of Edgin and Holga''s thieving crew during their early days of crime. Present for the heist that eventually led to Edgin''s imprisonment, though his own fate after that night is less well documented."}]}]}'
where name ilike 'Marlamin%';

-- Jarnathan (Honor Among Thieves — Lords' Alliance council, Revel's End)
update hall_of_heroes set
  race        = 'Aarakocra',
  alignment   = 'Lawful Neutral',
  occupation  = 'Lords'' Alliance Council Member',
  appearance  = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A tall, dignified Aarakocra with sharp amber eyes and neatly preened feathers. Wears formal council robes and carries himself with the composed authority expected of his office — at least until someone throws him out a window."}]}]}',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Solemn, duty-bound, and deeply unimpressed by adventurers. Holds his council duties in the highest regard and has very strong opinions about what constitutes appropriate use of a council member."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Lords'' Alliance representative attending the council session at Revel''s End prison, where the Alliance convenes to rule on prisoner pardons. Jarnathan''s misfortune was being the only council member capable of surviving a drop from a high window — a fact Edgin Darvis''s group exploited to engineer their escape. He was thrown out the window, glided to safety, and has had complicated feelings about justice ever since."}]}]}'
where name ilike 'Jarnathan%';

-- Voss Anderton (Lords' Alliance council, Revel's End)
update hall_of_heroes set
  race        = 'Human',
  alignment   = 'Lawful Neutral',
  occupation  = 'Lords'' Alliance Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Composed and deliberate. Takes the Alliance''s mandate seriously and is not amused by those who treat council proceedings as an opportunity for scheming."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Lords'' Alliance representative from his city-state, travelling to Revel''s End to sit on the council that decides which prisoners deserve pardon or release. Found himself an unwilling participant in Edgin Darvis''s escape scheme."}]}]}'
where name ilike 'Voss%';

-- Jil Torbo (Lords' Alliance council, Revel's End)
update hall_of_heroes set
  alignment   = 'Lawful Neutral',
  occupation  = 'Lords'' Alliance Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Methodical and cautious. Prefers procedure over improvisation and is deeply suspicious of anyone who seems too charming."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Lords'' Alliance council member representing their city-state at Revel''s End. Present during Edgin Darvis''s hearing and the chaos that followed when the escape plan was set in motion."}]}]}'
where name ilike 'Jil%';

-- Kriv Norixius (Lords' Alliance council, Revel's End — Dragonborn)
update hall_of_heroes set
  race        = 'Dragonborn',
  alignment   = 'Lawful Neutral',
  occupation  = 'Lords'' Alliance Council Member',
  personality = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Stern and principled. Brings a Dragonborn''s sense of honour to every council deliberation and expects the same of others — including prisoners petitioning for pardon."}]}]}',
  backstory   = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A Dragonborn Lords'' Alliance representative attending the council at Revel''s End. One of the more imposing figures on the council, though no less blindsided by Edgin''s escape scheme than his colleagues."}]}]}'
where name ilike 'Kriv%';
