/**
 * Fills the local fixture campaign with the entity types `cloneRichestCampaign`
 * does not carry: notes, factions, pantheons, deities and items.
 *
 * ## Why it exists
 *
 * Without these, six list views render their empty state on the one account we
 * are told to use for anything RLS-scoped — so "look at the running app before
 * calling UI work done" and "sign in as the fixture, not the admin" contradict
 * each other, and the way out of that contradiction is the admin account, which
 * is the fixture that hid #736. Reveal work on note cards and faction rows had
 * to hand-insert rows with `psql` twice before this existed.
 *
 * ## Why synthetic rather than cloned
 *
 * Same reason `ensureFixtureParty` gives: these tables carry FKs — a note's
 * linked calendar event, a deity's pantheon, an item's bundle contents — that a
 * clone would have to remap, and a dangling reference fails the insert outright.
 *
 * ## Two things that are easy to get wrong here
 *
 * **Counts sit under the free-tier caps on purpose.** `plans.quotas` allows 10
 * notes, 5 factions, 5 deities and 3 pantheons; over the cap the app renders
 * locked, blurred cards, which is the single state that makes a fixture useless
 * for looking at anything. Each set leaves a slot or two spare so the fixture
 * can still create one by hand. Items are not quota'd.
 *
 * **Every set spreads `player_visible_to` across all three reveal states.** With
 * every row in one state you cannot see whether the states are distinguishable
 * from each other — and that was the actual defect behind the reveal-control
 * fix, where the "shared" chip rendered as an unreadable smear on a light theme
 * and no amount of looking at hidden-only rows would have shown it.
 */
import { markdownToTiptap } from "./tiptap.ts";
import { quote, sql } from "./dev-db.ts";

/** How many rows of each kind the fixture ended up with, for the CLI summary. */
export type FixtureContentCounts = Record<string, number>;

export function ensureFixtureContent(dbUrl: string, ownerId: string): FixtureContentCounts {
  const campaignId = sql(
    dbUrl,
    `select id from public.campaigns where user_id = ${quote(ownerId)} order by created_at limit 1`,
  );
  if (!campaignId) return {};

  const owner = quote(ownerId);
  const campaign = quote(campaignId);
  const [hidden, some, all] = revealSpread(
    sql(
      dbUrl,
      `select id from public.party_members where campaign_id = ${campaign} order by sort_order`,
    )
      .split("\n")
      .filter(Boolean),
  );

  const seed = (table: string, statement: string) =>
    seedIfEmpty(dbUrl, table, campaignId, statement);

  const seedMembership = (table: string, statement: string) =>
    seedMembershipIfEmpty(dbUrl, table, campaignId, statement);

  return {
    notes: seed(
      "notes",
      `insert into public.notes
         (user_id, campaign_id, title, content, category, tags, session_num, player_visible_to)
       values
         (${owner}, ${campaign}, 'Ashes in Easthaven',
          ${prose("The party reached Easthaven wanting warmth and answers, and got a body in the ice instead.")},
          'session', '{murder,easthaven}', 3, ${all}),
         (${owner}, ${campaign}, 'The Cold Pursuit of Sephek',
          ${prose("Tracks led north out of Caer-Konig. Whatever made them was not walking on two legs the whole way.")},
          'session', '{chase}', 4, ${some}),
         (${owner}, ${campaign}, 'What the Speaker Would Not Say',
          ${prose("She answered every question put to her, and not one that mattered.")},
          'session', '{politics}', 5, ${hidden}),
         (${owner}, ${campaign}, 'The Rime and Who Profits By It',
          ${prose("Someone is selling firewood at four times last winter's price, and it is not a Ten-Towns speaker.")},
          'lore', '{economy,winter}', null, ${some}),
         (${owner}, ${campaign}, 'Chardalyn, and What It Does to People',
          ${prose("Black stone that takes a spell and gives it back wrong. The tribes will not carry it uncut.")},
          'lore', '{chardalyn}', null, ${all}),
         (${owner}, ${campaign}, 'Frostmaiden — DM only',
          ${prose("Auril is not the villain of this campaign. The people deciding who eats this winter are.")},
          'general', '{spoilers}', null, ${hidden});`,
    ),

    factions: seed(
      "factions",
      `insert into public.factions (user_id, campaign_id, name, faction_type, tags, player_visible_to)
       values
         (${owner}, ${campaign}, 'Council of Speakers', 'Government', '{political,civic,"ten towns"}', ${all}),
         (${owner}, ${campaign}, 'The Frostbloom Syndicate', 'Criminal', '{"thieves guild",easthaven}', ${some}),
         (${owner}, ${campaign}, 'Reghed: Elk Tribe', 'Tribe', '{nomads,tundra}', ${some}),
         (${owner}, ${campaign}, 'Knights of the Black Sword', 'Cult', '{levistus,secretive}', ${hidden});`,
    ),

    /**
     * The relationship web's actual subject: ties between the people.
     *
     * Without these the fixture's eight NPCs are eight unconnected nodes, and a
     * force layout with nothing to pull on spreads them past the edges of the
     * viewport — so `/npcs/web` reviewed on the mandated account showed an empty
     * canvas and read as broken when it was merely empty. Every edge-coloured
     * thing on that screen (the 15-type taxonomy, the inverse-type filter, the
     * dashed PC links) was unreachable.
     *
     * Paired by row number for the same reason the memberships below are: the
     * NPCs are cloned from whichever campaign is richest on this machine, so
     * their names cannot be known here.
     *
     * The types are spread across the taxonomy's families — blood, affinity,
     * hierarchy, hostility — rather than repeating one, because they map to
     * distinct `--relation-*` colours and a single-type web cannot show whether
     * those colours are distinguishable from each other.
     */
    "npc relationships": seed(
      "npc_relationships",
      `with n as (
         select id, row_number() over (order by name) rn
           from public.npcs where campaign_id = ${campaign}
       ), m(a, b, type) as (
         values (1, 2, 'sibling'), (1, 3, 'rival'), (2, 4, 'mentor'),
                (4, 5, 'apprentice'), (3, 6, 'enemy'), (5, 6, 'ally'),
                (6, 7, 'contact'), (7, 8, 'former_ally'), (2, 8, 'lover')
       )
       insert into public.npc_relationships
         (user_id, campaign_id, npc_id, related_npc_id, relationship_type)
       select ${owner}, ${campaign}, a.id, b.id, m.type
         from m join n a on a.rn = m.a join n b on b.rn = m.b;`,
    ),

    /** The dashed half of the web — what the party has to do with any of them. */
    "npc-pc ties": seed(
      "npc_pc_notes",
      `with n as (
         select id, row_number() over (order by name) rn
           from public.npcs where campaign_id = ${campaign}
       ), p as (
         select id, row_number() over (order by sort_order) rn
           from public.party_members where campaign_id = ${campaign}
       ), m(nrn, prn, type, note) as (
         values (1, 1, 'ally', 'Vouched for us at the gate.'),
                (3, 2, 'enemy', 'Blames her for the fire, and is not wrong.'),
                (5, 3, 'contact', 'Sells information, and to whoever asks.')
       )
       insert into public.npc_pc_notes
         (user_id, campaign_id, npc_id, party_member_id, relationship_type, notes)
       select ${owner}, ${campaign}, n.id, p.id, m.type, m.note
         from m join n on n.rn = m.nrn join p on p.rn = m.prn;`,
    ),

    /**
     * Who belongs to what. Without these the four factions above are empty
     * shells: the relationship web's membership badges, every faction sheet's
     * Members section and the NPC sheet's Factions section all render their
     * empty state on the one account we are told to use for anything
     * RLS-scoped.
     *
     * Joined by row number rather than by name, because the NPCs are *cloned*
     * from whichever campaign happens to be richest on this machine — their
     * names are not knowable here, and hardcoding any would seed nothing on
     * someone else's dump.
     *
     * The mapping is shaped to put every display state on screen at once, which
     * a realistic-looking one would not: NPC 1 is in all four factions, so the
     * badge cap and its "+N" overflow both render; and the statuses spread
     * across Active / Retired / Expelled so a former tie — drawn faded, not
     * dropped — is visible beside a current one.
     */
    "faction memberships": seedMembership(
      "faction_npcs",
      `with f as (
         select id, row_number() over (order by name) rn
           from public.factions where campaign_id = ${campaign}
       ), n as (
         select id, row_number() over (order by name) rn
           from public.npcs where campaign_id = ${campaign}
       ), m(frn, nrn, role, status) as (
         values (1, 1, 'Leader', 'Active'), (1, 2, 'Officer', 'Active'),
                (1, 3, 'Member', 'Active'),
                (2, 1, 'Agent', 'Expelled'), (2, 4, 'Initiate', 'Active'),
                (3, 1, 'Associate', 'Retired'), (3, 5, 'Member', 'Active'),
                (4, 1, 'Informant', 'Active'), (4, 6, 'Enforcer', 'Active')
       )
       insert into public.faction_npcs (user_id, faction_id, npc_id, role, status)
       select ${owner}, f.id, n.id, m.role, m.status
         from m join f on f.rn = m.frn join n on n.rn = m.nrn;`,
    ),

    /** The party's own ties, so PC nodes carry badges too. */
    "party faction ties": seedMembership(
      "faction_party_members",
      `with f as (
         select id, row_number() over (order by name) rn
           from public.factions where campaign_id = ${campaign}
       ), p as (
         select id, row_number() over (order by sort_order) rn
           from public.party_members where campaign_id = ${campaign}
       ), m(frn, prn, role, status) as (
         values (1, 1, 'Associate', 'Active'), (3, 2, 'Member', 'Active'),
                (4, 2, 'Informant', 'Defected')
       )
       insert into public.faction_party_members (user_id, faction_id, party_member_id, role, status)
       select ${owner}, f.id, p.id, m.role, m.status
         from m join f on f.rn = m.frn join p on p.rn = m.prn;`,
    ),

    pantheons: seed(
      "pantheons",
      `insert into public.pantheons (user_id, campaign_id, name, tags, player_visible_to)
       values
         (${owner}, ${campaign}, 'Gods of the Reghed Tribes', '{tribal,shamanic}', ${all}),
         (${owner}, ${campaign}, 'The Frostmaiden and Her Kin', '{winter,auril}', ${hidden});`,
    ),

    deities: seed(
      "deities",
      `insert into public.deities
         (user_id, campaign_id, name, titles, alignment, domains, tags, player_visible_to)
       values
         (${owner}, ${campaign}, 'Amaunator', 'Keeper of the Yellow Sun', 'Lawful Neutral',
          '{Life,Light}', '{sun,law}', ${all}),
         (${owner}, ${campaign}, 'Tempus', 'Lord of Battles', 'Chaotic Neutral',
          '{War}', '{battle}', ${some}),
         (${owner}, ${campaign}, 'Auril', 'The Frostmaiden', 'Neutral Evil',
          '{Nature,Tempest}', '{winter}', ${hidden}),
         (${owner}, ${campaign}, 'Ulutiu', 'Lord of the Glaciers', 'Lawful Neutral',
          '{Nature}', '{ice,sleeping}', ${hidden});`,
    ),

    // Not quota'd, but the item card carries a rarity badge and a quick-stat
    // line, so the set spreads rarities and gives damage / AC / charges a row
    // each — six mundane statless items make the card look like it has a bug.
    items: seed(
      "items",
      `insert into public.items
         (user_id, campaign_id, name, item_type, rarity, tags, damage_rolls, armor_class, charges)
       values
         (${owner}, ${campaign}, 'Icingdeath', 'weapon', 'legendary', '{scimitar,frost}',
          '[{"dice":"1d6","type":"slashing"}]'::jsonb, null, null),
         (${owner}, ${campaign}, 'Frost Giant Plate', 'armor', 'very_rare', '{heavy,cold}',
          null, 18, null),
         (${owner}, ${campaign}, 'Wand of Winter', 'wand', 'very_rare', '{arcane,cold}',
          null, null, 7),
         (${owner}, ${campaign}, 'Chardalyn Shard', 'crafting_material', 'rare', '{chardalyn,cursed}',
          null, null, 3),
         (${owner}, ${campaign}, 'Potion of Heroism', 'potion', 'rare', '{consumable}',
          null, null, null),
         (${owner}, ${campaign}, 'Ring of Warmth', 'ring', 'uncommon', '{attunement}',
          null, null, null);`,
    ),
  };
}

/**
 * Runs `insertStatement` only when the fixture's campaign has none of `table`
 * yet, and returns the resulting count either way.
 *
 * Guarded per table rather than once for the lot, so a fixture that predates one
 * of these sets picks up only what it is missing. That is the trap
 * `ensureFixtureParty` documents: a guard on the wrong question means an
 * addition only ever reaches a fixture created after it was written, which is
 * precisely the fixture nobody has.
 */
/**
 * The join-table variant.
 *
 * `faction_npcs` and `faction_party_members` carry no `campaign_id` of their
 * own — a membership is scoped by the faction it points at — so the emptiness
 * guard has to reach through that FK. Passing them to `seedIfEmpty` does not
 * fail loudly either; it fails with "column campaign_id does not exist", which
 * reads like a schema problem rather than the wrong guard.
 */
function seedMembershipIfEmpty(
  dbUrl: string,
  table: string,
  campaignId: string,
  insertStatement: string,
): number {
  const count = () =>
    Number(
      sql(
        dbUrl,
        `select count(*) from public.${table} t
           join public.factions f on f.id = t.faction_id
          where f.campaign_id = ${quote(campaignId)}`,
      ),
    );
  if (count() === 0) sql(dbUrl, insertStatement);
  return count();
}

function seedIfEmpty(
  dbUrl: string,
  table: string,
  campaignId: string,
  insertStatement: string,
): number {
  const count = () =>
    Number(
      sql(dbUrl, `select count(*) from public.${table} where campaign_id = ${quote(campaignId)}`),
    );
  if (count() === 0) sql(dbUrl, insertStatement);
  return count();
}

/**
 * The three `player_visible_to` literals a set cycles through: nobody, one
 * player, the whole party.
 *
 * Degrades to all-hidden when the campaign has no party, which cannot happen
 * after `ensureFixtureParty` but keeps this honest if called on its own.
 */
function revealSpread(partyIds: readonly string[]): [string, string, string] {
  const none = "'{}'::uuid[]";
  if (!partyIds.length) return [none, none, none];
  return [
    none,
    `array[${quote(partyIds[0])}]::uuid[]`,
    `array[${partyIds.map(quote).join(",")}]::uuid[]`,
  ];
}

/**
 * A note's `content` column holds tiptap JSON, not HTML and not plain text.
 * `extractTiptapText` renders an HTML string verbatim — tags and all — into the
 * card preview, which looks exactly like a rendering bug and was one during the
 * first pass at this.
 *
 * Goes through the importers' own `markdownToTiptap` rather than hand-building a
 * doc node, so fixture rows are byte-aligned with what `RichTextEditor` writes
 * (`TIPTAP_DOC_ATTRS` included) instead of a second, subtly different shape.
 */
function prose(text: string): string {
  const doc = markdownToTiptap(text);
  if (!doc) throw new Error("Fixture note text must not be empty");
  return quote(doc);
}
