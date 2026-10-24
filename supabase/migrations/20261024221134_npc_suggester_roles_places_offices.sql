-- The NPC relationship suggester, three fixes.
--
-- 1. Faction roles. The prompt invited free text ("such as Informant or Quartermaster") and an accepted suggestion
--    saved it as faction_npcs.role, but the membership's role picker offers only NPC_FACTION_ROLES
--    (src/types/faction.types.ts), so the picker showed it blank. The list now covers ties short of membership and
--    hidden ones (Envoy, Patron, Supplier, Sympathiser, Supplicant, Secret member, Infiltrator, Unwitting pawn,
--    Adversary), the prompt names it, and sanitizeSuggestions maps anything else to Associate.
-- 2. Places and offices. Candidates now carry where an NPC is and the factions they belong to with their role, and
--    each faction who heads it, so the model stops offering one town's speaker the leadership of another town.
-- 3. Shared factions. The same membership lines tell the model who already serves together.
-- 4. Breadth. It asked for "3 to 6" connections, so a DM re-ran it again and again to reach an NPC's whole family
--    and faction; it now asks for every connection the material supports, up to 12 (MAX_SUGGESTIONS).
--
-- replace() touches a fragment only if it still reads as seeded, so an admin's own edit of the prompt is kept.
update public.ai_system_prompts
   set content = replace(replace(replace(replace(content,
     $o$Propose 3 to 6 meaningful connections between one NPC$o$,
     $n$Propose every meaningful connection, up to 12, between one NPC$n$),
     $o$      "role": "a short role in the faction, such as Informant or Quartermaster (faction only, omit for npc)",$o$,
     $n$      "role": "one of: Leader, Head of house, Officer, Enforcer, Member, Initiate, Envoy, Patron, Associate, Supplier, Sympathiser, Supplicant, Agent, Informant, Secret member, Infiltrator, Unwitting pawn, Adversary, Unknown (kind faction only, omit otherwise)",$n$),
     $o$NPCs (npc|name|occupation|born year), the party's characters (pc|name|born year) and factions (faction|name|type).$o$,
     $n$NPCs (npc|name|occupation|born year|where they are and the factions they belong to, with their role), the party's characters (pc|name|born year) and factions (faction|name|type|who heads it).$n$),
     $o$- Mix NPC and faction suggestions when the candidate list allows it.$o$,
     $n$- Mix NPC and faction suggestions when the candidate list allows it.
- Respect where people are and the offices they hold. Someone who leads or speaks for one town, house or order does not lead another, and a faction that is already headed gets no second Leader or Head of house. A tie across distance needs a reason in notes (trade, exile, letters, a shared past).
- A faction role can fall short of membership or be hidden. Use Envoy, Patron, Supplier, Sympathiser or Supplicant for a tie short of membership, Secret member, Infiltrator or Unwitting pawn when the tie is secret or the NPC does not know whom they serve, and Adversary for someone who works against the faction. Say who knows in notes.
- Be thorough before you are inventive. First offer every connection the material already implies: family a shared surname, house or backstory points to, the factions their occupation and place make them part of, the people who serve with them. Then add ties that create story.
- NPCs who already share a faction know each other. A bond between them should fit their roles there (a Leader and an Officer, two rivals for the same office), and never treat them as strangers meeting for the first time.$n$)
 where generator_type = 'npc_relationships';

-- Memberships already saved with a role outside the list. On 24 Oct 2026 production held nine, all written by the
-- suggester; each maps to the role it describes. Anything else outside the list becomes Associate, the loosest tie.
update public.faction_npcs fn
   set role = coalesce(
     (select v.role from (values
        ('unwitting informant',    'Unwitting pawn'),
        ('unwitting supplier',     'Unwitting pawn'),
        ('confidential informant', 'Informant'),
        ('arctic informant',       'Informant'),
        ('inside informant',       'Infiltrator'),
        ('secret supplicant',      'Supplicant'),
        ('religious adversary',    'Adversary'),
        ('waystation supplier',    'Supplier'),
        ('logistics broker',       'Associate')
      ) as v(was, role)
       where v.was = lower(btrim(fn.role))),
     (select r from unnest(array['Leader', 'Head of house', 'Officer', 'Enforcer', 'Member', 'Initiate', 'Envoy', 'Patron',
                                 'Associate', 'Supplier', 'Sympathiser', 'Supplicant', 'Agent', 'Informant',
                                 'Secret member', 'Infiltrator', 'Unwitting pawn', 'Adversary', 'Unknown']) as r
       where lower(r) = lower(btrim(fn.role))),
     'Associate')
 where fn.role is not null
   and fn.role not in ('Leader', 'Head of house', 'Officer', 'Enforcer', 'Member', 'Initiate', 'Envoy', 'Patron',
                       'Associate', 'Supplier', 'Sympathiser', 'Supplicant', 'Agent', 'Informant',
                       'Secret member', 'Infiltrator', 'Unwitting pawn', 'Adversary', 'Unknown');
