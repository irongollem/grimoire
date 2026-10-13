-- Archetypes regain the features Open5e's v2 class data lost.
--
-- The official archetypes were imported from Open5e v2, which splits a
-- subclass into features at its markdown headings. Where a book's heading was
-- one level off (`####` instead of `#####`) or ended in a full stop, v2 either
-- folded the feature into the one before it or dropped it. Path of Hellfire
-- arrived with no features at all. Open5e's v1 archetype text still has every
-- one, so these were read from it (Tome of Heroes, Kobold Press, and Open5e
-- Originals, both OGL 1.0a; the SRD 5.1 intros CC-BY-4.0) and compared heading
-- by heading against every library archetype on 13 Oct 2026:
--
--   Path of Hellfire     Hellish Aspect (3), Hell's Vengeance (6),
--                        Hellfire Shield (10), Devilish Essence (14)
--   Circle of Ash        Covered in Ash (6), which v2 had appended to Firesight
--   Oath of the Hearth   Divine Sense and Fiery Smite (3), the oath's changes
--                        to the paladin's own features
--   Oath of the Elements Elemental Strike (3), the oath's second Channel
--                        Divinity option, cut off its first
--   Eldritch Trickster   Sleight of Mage Hand (3)
--
-- Tenets and restrictions ("Restriction: Alseid") are flavour, and the oath and
-- expanded spell tables are already the archetype's spell maps, so neither is
-- a feature here.
--
-- The twelve SRD 5.1 archetypes also never had an introduction: v2 serves none,
-- v1 has the book's. Written only while the description is empty.
--
-- Official rows only (user_id is null), matched on the import's identity, never
-- on uuid. A feature is inserted only when its record key is absent, and a
-- feature map is only added to, so a second run and a later admin import
-- change nothing. The new rows carry the record keys an Open5e fix would use,
-- so a future import adopts them in place. Their mechanics come with the
-- archetype mechanics catalogue in the next migration.

-- The restored features as one constant, processed row by row in a single
-- block. No temporary table: a temp table made by one statement is not always
-- visible to the next on every way of running a migration (the Management
-- API's query endpoint lost it), and nothing here needs one.
do $do$
declare
  r record;
  v_fid uuid;
begin
  for r in
    select * from jsonb_to_recordset($lost$[
 {
  "doc": "toh",
  "subclass_rec": "toh_path-of-hellfire",
  "rec": "toh_path-of-hellfire_hellish-aspect",
  "name": "Hellish Aspect",
  "lvl": 3,
  "ckey": "hellish_aspect",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"Beginning at 3rd level, when you enter your rage, you take on minor fiendish aspects. The way these aspects manifest is up to you and can include sprouting horns from your head, changing the color of your skin, growing fangs or a tail, or other small physical changes. Though infused with fiendish power, you aren't a fiend. While raging, you have resistance to fire damage, and the first creature you hit on each of your turns with a weapon attack takes 1d6 extra fire damage. This damage increases to 2d6 at 10th level.\"}]}]}"
 },
 {
  "doc": "toh",
  "subclass_rec": "toh_path-of-hellfire",
  "rec": "toh_path-of-hellfire_hells-vengeance",
  "name": "Hell's Vengeance",
  "lvl": 6,
  "ckey": "hells_vengeance",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"At 6th level, you can use your hellfire to punish enemies. If an ally you can see within 60 feet of you takes damage while you are raging, you can use your reaction to surround the attacker with hellfire, dealing fire damage equal to your proficiency bonus to it.\"}]}]}"
 },
 {
  "doc": "toh",
  "subclass_rec": "toh_path-of-hellfire",
  "rec": "toh_path-of-hellfire_hellfire-shield",
  "name": "Hellfire Shield",
  "lvl": 10,
  "ckey": "hellfire_shield",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"Starting at 10th level, when you enter your rage, you can surround yourself with flames. This effect works like the fire shield spell, except you are surrounded with a warm shield only and it ends when your rage ends. Once used, you can't use this feature again until you finish a short or long rest.\"}]}]}"
 },
 {
  "doc": "toh",
  "subclass_rec": "toh_path-of-hellfire",
  "rec": "toh_path-of-hellfire_devilish-essence",
  "name": "Devilish Essence",
  "lvl": 14,
  "ckey": "devilish_essence",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"At 14th level, while raging, you have advantage on saving throws against spells and other magical effects, and if you take damage from a spell, you can use your reaction to gain temporary hit points equal to your barbarian level.\"}]}]}"
 },
 {
  "doc": "toh",
  "subclass_rec": "toh_circle-of-ash",
  "rec": "toh_circle-of-ash_covered-in-ash",
  "name": "Covered in Ash",
  "lvl": 6,
  "ckey": "covered_in_ash",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"At 6th level, when a creature within 30 feet of you that you can see (including yourself) takes damage, you can use your reaction to cover the creature in magical ash, giving it temporary hit points equal to twice your proficiency bonus. The target gains the temporary hit points before it takes the damage. You can use this feature a number of times equal to your proficiency bonus. You regain all expended uses when you finish a long rest.\"}]}, {\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"In addition, while your Ash Cloud feature is active and you are within 30 feet of it, you can use a bonus action to teleport to an unoccupied space you can see within the cloud. You can use this teleportation no more than once per minute.\"}]}]}"
 },
 {
  "doc": "toh",
  "subclass_rec": "toh_oath-of-the-hearth",
  "rec": "toh_oath-of-the-hearth_divine-sense",
  "name": "Divine Sense",
  "lvl": 3,
  "ckey": "divine_sense",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"In addition to knowing the location of any celestial, fiend, or undead, your Divine Sense feature allows you to know the location of any cold creature within 60 feet of you that is not behind total cover.\"}]}]}"
 },
 {
  "doc": "toh",
  "subclass_rec": "toh_oath-of-the-hearth",
  "rec": "toh_oath-of-the-hearth_fiery-smite",
  "name": "Fiery Smite",
  "lvl": 3,
  "ckey": "fiery_smite",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"When you use your Divine Smite feature, you can choose for the extra damage you deal to be fire or radiant, and the extra damage increases to 1d8 only if the target is an undead or a cold creature.\"}]}]}"
 },
 {
  "doc": "toh",
  "subclass_rec": "toh_oath-of-the-elements",
  "rec": "toh_oath-of-the-elements_elemental-strike",
  "name": "Elemental Strike",
  "lvl": 3,
  "ckey": "elemental_strike",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"As a bonus action, you can use your Channel Divinity to magically imbue one weapon you are holding with the power of the elements. Choose air, earth, fire, or water. For 1 minute, you gain a bonus to damage rolls equal to your Charisma modifier (minimum of +1) on attacks made with the weapon. The type of damage is based on the element you chose: lightning or thunder (air), acid (earth), fire (fire), or cold (water). While your weapon is imbued with an element, you can choose to deal its damage type instead of radiant damage when you use your Divine Smite.\"}]}, {\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"You can end this effect on your turn as part of any other action. If you are no longer holding or carrying this weapon, or if you fall unconscious, this effect ends.\"}]}]}"
 },
 {
  "doc": "open5e",
  "subclass_rec": "open5e_eldritch-trickster",
  "rec": "open5e_eldritch-trickster_sleight-of-mage-hand",
  "name": "Sleight of Mage Hand",
  "lvl": 3,
  "ckey": "sleight_of_mage_hand",
  "description": "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"If you cast the cantrip \"}, {\"type\": \"text\", \"marks\": [{\"type\": \"italic\"}], \"text\": \"mage hand\"}, {\"type\": \"text\", \"text\": \", you may cause the spectral, floating hand created by the spell to be invisible to observers. In addition to the functions described in the spell’s description, you may carry out the following tasks:\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"You can disarm traps and pick locks using thieves’ tools at the range of the spell.\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"You can pick a creature’s pocket, retrieving an object in a container that is being carried or worn by that creature.\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"You can also plant an object being held by the hand into a container that is being carried or worn by another creature.\"}]}]}]}, {\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"In order to complete any of these tasks without being noticed, you must contest the target creature’s Wisdom (Perception) with a successful Dexterity (Sleight of Hand) check. Rather than controlling the spectral hand with an action, you may use the bonus action from your Cunning Action feature.\"}]}]}"
 }
]$lost$::jsonb)
      as t(doc text, subclass_rec text, rec text, name text, lvl int, ckey text, description text)
     order by subclass_rec, lvl, name
  loop
    -- Inserted only when absent, with the document block (title, publisher,
    -- permalink) and source of the archetype it belongs to.
    insert into public.class_features
      (user_id, campaign_id, name, description, source, tags, open5e_import, ruleset, conceptual_key,
       source_document_key, source_record_key, source_revision, source_license, provenance, kind, mechanics)
    select null, null, r.name, r.description,
           coalesce((select f.source from public.class_features f
                      where f.user_id is null and f.source_document_key = r.doc
                        and f.source is not null limit 1), r.doc),
           '{}', true, s.ruleset, r.ckey,
           r.doc, r.rec, s.source_revision, s.source_license,
           jsonb_build_object('document', s.provenance -> 'document', 'provider', 'open5e-v1'),
           'feature', '{}'::jsonb
      from public.custom_subclasses s
     where s.user_id is null and s.source_document_key = r.doc and s.source_record_key = r.subclass_rec
       and not exists (select 1 from public.class_features f
                        where f.user_id is null and f.source_document_key = r.doc and f.source_record_key = r.rec);

    -- Each restored feature joins its archetype's map at its level, appended, once.
    select f.id into v_fid from public.class_features f
     where f.user_id is null and f.source_document_key = r.doc and f.source_record_key = r.rec;
    if v_fid is not null then
      update public.custom_subclasses s
         set features = s.features || jsonb_build_object(
               r.lvl::text, coalesce(s.features -> r.lvl::text, '[]'::jsonb) || to_jsonb(v_fid::text))
       where s.user_id is null and s.source_document_key = r.doc and s.source_record_key = r.subclass_rec
         and not coalesce(s.features -> r.lvl::text, '[]'::jsonb) ? v_fid::text;
    end if;
  end loop;
end
$do$;

-- v2 appended Covered in Ash to Firesight's one text node; keep Firesight's own.
update public.class_features f
   set description = jsonb_set(
         f.description::jsonb, '{content,0,content,0,text}',
         to_jsonb(split_part(f.description::jsonb #>> '{content,0,content,0,text}', E'\n#### Covered in Ash', 1)))::text
 where f.user_id is null
   and f.source_document_key = 'toh' and f.source_record_key = 'toh_circle-of-ash_firesight'
   and position(E'\n#### Covered in Ash' in coalesce(f.description::jsonb #>> '{content,0,content,0,text}', '')) > 0;

-- The SRD 5.1 archetypes' introductions, where none was ever written.
update public.custom_subclasses s
   set description = v.intro
  from (values
    ('srd_path-of-the-berserker', 'For some barbarians, rage is a means to an end- that end being violence. The Path of the Berserker is a path of untrammeled fury, slick with blood. As you enter the berserker''s rage, you thrill in the chaos of battle, heedless of your own health or well-being.'),
    ('srd_college-of-lore', 'Bards of the College of Lore know something about most things, collecting bits of knowledge from sources as diverse as scholarly tomes and peasant tales. Whether singing folk ballads in taverns or elaborate compositions in royal courts, these bards use their gifts to hold audiences spellbound. When the applause dies down, the audience members might find themselves questioning everything they held to be true, from their faith in the priesthood of the local temple to their loyalty to the king. 

The loyalty of these bards lies in the pursuit of beauty and truth, not in fealty to a monarch or following the tenets of a deity. A noble who keeps such a bard as a herald or advisor knows that the bard would rather be honest than politic. 

The college''s members gather in libraries and sometimes in actual colleges, complete with classrooms and dormitories, to share their lore with one another. They also meet at festivals or affairs of state, where they can expose corruption, unravel lies, and poke fun at self-important figures of authority.'),
    ('srd_life-domain', 'The Life domain focuses on the vibrant positive energy-one of the fundamental forces of the universe-that sustains all life. The gods of life promote vitality and health through healing the sick and wounded, caring for those in need, and driving away the forces of death and undeath. Almost any non-evil deity can claim influence over this domain, particularly agricultural deities (such as Chauntea, Arawai, and Demeter), sun gods (such as Lathander, Pelor, and Re-Horakhty), gods of healing or endurance (such as Ilmater, Mishakal, Apollo, and Diancecht), and gods of home and community (such as Hestia, Hathor, and Boldrei).'),
    ('srd_circle-of-the-land', 'The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle''s wisest members preside as the chief priests of communities that hold to the Old Faith and serve as advisors to the rulers of those folk. As a member of this circle, your magic is influenced by the land where you were initiated into the circle''s mysterious rites.'),
    ('srd_champion', 'The archetypal Champion focuses on the development of raw physical power honed to deadly perfection. Those who model themselves on this archetype combine rigorous training with physical excellence to deal devastating blows.'),
    ('srd_way-of-the-open-hand', 'Monks of the Way of the Open Hand are the ultimate masters of martial arts combat, whether armed or unarmed. They learn techniques to push and trip their opponents, manipulate ki to heal damage to their bodies, and practice advanced meditation that can protect them from harm.'),
    ('srd_oath-of-devotion', 'The Oath of Devotion binds a paladin to the loftiest ideals of justice, virtue, and order. Sometimes called cavaliers, white knights, or holy warriors, these paladins meet the ideal of the knight in shining armor, acting with honor in pursuit of justice and the greater good. They hold themselves to the highest standards of conduct, and some, for better or worse, hold the rest of the world to the same standards. Many who swear this oath are devoted to gods of law and good and use their gods'' tenets as the measure of their devotion. They hold angels-the perfect servants of good-as their ideals, and incorporate images of angelic wings into their helmets or coats of arms.'),
    ('srd_hunter', 'Emulating the Hunter archetype means accepting your place as a bulwark between civilization and the terrors of the wilderness. As you walk the Hunter''s path, you learn specialized techniques for fighting the threats you face, from rampaging ogres and hordes of orcs to towering giants and terrifying dragons.'),
    ('srd_thief', 'You hone your skills in the larcenous arts. Burglars, bandits, cutpurses, and other criminals typically follow this archetype, but so do rogues who prefer to think of themselves as professional treasure seekers, explorers, delvers, and investigators. In addition to improving your agility and stealth, you learn skills useful for delving into ancient ruins, reading unfamiliar languages, and using magic items you normally couldn''t employ.'),
    ('srd_draconic-bloodline', 'Your innate magic comes from draconic magic that was mingled with your blood or that of your ancestors. Most often, sorcerers with this origin trace their descent back to a mighty sorcerer of ancient times who made a bargain with a dragon or who might even have claimed a dragon parent. Some of these bloodlines are well established in the world, but most are obscure. Any given sorcerer could be the first of a new bloodline, as a result of a pact or some other exceptional circumstance.'),
    ('srd_the-fiend', 'You have made a pact with a fiend from the lower planes of existence, a being whose aims are evil, even if you strive against those aims. Such beings desire the corruption or destruction of all things, ultimately including you. Fiends powerful enough to forge a pact include demon lords such as Demogorgon, Orcus, Fraz''Urb-luu, and Baphomet; archdevils such as Asmodeus, Dispater, Mephistopheles, and Belial; pit fiends and balors that are especially mighty; and ultroloths and other lords of the yugoloths.'),
    ('srd_school-of-evocation', 'You focus your study on magic that creates powerful elemental effects such as bitter cold, searing flame, rolling thunder, crackling lightning, and burning acid. Some evokers find employment in military forces, serving as artillery to blast enemy armies from afar. Others use their spectacular power to protect the weak, while some seek their own gain as bandits, adventurers, or aspiring tyrants.')
  ) as v(rec, intro)
 where s.user_id is null and s.source_document_key = 'srd-2014' and s.ruleset = '2014'
   and s.source_record_key = v.rec
   and coalesce(s.description, '') = '';

