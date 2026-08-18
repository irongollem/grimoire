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
