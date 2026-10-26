/**
 * The World Web catalogue (#1084): every kind of tie two things in a campaign
 * can have, in one list.
 *
 * A tie has exactly one home ("one fact, one home"). Two kinds of home:
 *
 *  - A **link** is a typed tie with nothing more to say ("worships", "controls",
 *    "rival of"). Every link lives in `world_links`, whatever the two kinds are.
 *  - A **record** is a tie that carries facts of its own and already has a home:
 *    a membership's role and succession, a kin link's parentage, an NPC's home,
 *    a pack's contents. Records stay where they are; the catalogue names them so
 *    that the picker can offer them and write to the right place, and so that
 *    reads can describe them in the same words.
 *
 * This module is the one source of the types. The client imports it through
 * `@edge-shared`, the suggester validates the model's output against it, global
 * search matches its words, and the database holds the same link types in
 * `private.world_link_types` (`src/lib/worldLinks/catalogueMirror.test.ts`
 * keeps the two equal), so a type outside its pair is refused everywhere.
 *
 * Direction. A link is stored once, from the catalogue's `from` kind to its `to`
 * kind ("Brenna worships the Drowned Lady", never the reverse). `forward` reads
 * it from the `from` end, `reverse` from the `to` end. A symmetric type reads the
 * same both ways and is stored with its ends in a fixed order, so it can never
 * exist twice for one pair. When the two kinds are the same (person and person),
 * an asymmetric type still has one stored direction: "mentor of" is kept from the
 * mentor, and the apprentice's sheet reads it as "apprentice of".
 */

/** The kinds a link can join. A PC is a `party_member`. */
export const LINK_KINDS = ["npc", "party_member", "faction", "location", "deity", "item"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Kinds that can appear at the far end of a connection; quests only through their own records. */
export type ConnectionKind = LinkKind | "quest";

/** People: an NPC or a PC. Most person ties do not care which. */
export const PERSON_KINDS: readonly LinkKind[] = ["npc", "party_member"];

/**
 * What a tie is about, which decides its colour on a sheet and on the web. A
 * family says nothing about which kinds it joins.
 */
export const LINK_FAMILIES = ["bond", "enmity", "faith", "place", "holding", "stance", "record"] as const;
export type LinkFamily = (typeof LINK_FAMILIES)[number];

export interface LinkTypeDef {
  /** Stored in `world_links.type`. Unique within its pair, not across pairs. */
  key: string;
  /** Read from the `from` end: "worships". */
  forward: string;
  /** Read from the `to` end: "worshipped by". Equal to `forward` when symmetric. */
  reverse: string;
  family: LinkFamily;
  /** Reads the same both ways; stored with its ends ordered. */
  symmetric?: boolean;
  /** Offered as a chip; the rest sit under "more…". */
  common?: boolean;
}

/** Where a record type lives. The picker writes there; the read gathers from there. */
export const RECORD_HOMES = [
  "membership", // faction_npcs / faction_party_members
  "kin", // kin_links
  "npc_home", // npcs.location_id
  "pc_place", // party_members.current_location_id
  "keeper", // locations.npc_owner_id
  "seat", // factions.seat_location_id
  "patron_deity", // party_members.deity_id
  "inventory", // npc_inventory / party_inventory.carried_by
  "store", // store_items
  "quest", // quests.giver_npc_id / location_id, quest_refs
] as const;
export type RecordHome = (typeof RECORD_HOMES)[number];

export interface RecordTypeDef {
  key: string;
  forward: string;
  reverse: string;
  home: RecordHome;
  /** The `from` end can be only these kinds (a PC has no NPC home). */
  fromKinds?: readonly ConnectionKind[];
  /** The `to` end can be only these kinds. */
  toKinds?: readonly ConnectionKind[];
  /** The record holds one value for its `from` end, so choosing it replaces the old one. */
  single?: boolean;
  common?: boolean;
}

export interface LinkPair {
  /** Stable name of the pair, used in tests and in the database's catalogue. */
  pair: string;
  from: readonly LinkKind[];
  to: readonly LinkKind[];
  /** At most one link of this pair per ordered pair of things (a faction's stance). */
  exclusive?: boolean;
  types: readonly LinkTypeDef[];
  records?: readonly RecordTypeDef[];
}

const sym = (key: string, word: string, family: LinkFamily, common = false): LinkTypeDef => ({
  key, forward: word, reverse: word, family, symmetric: true, ...(common ? { common } : {}),
});
const dir = (key: string, forward: string, reverse: string, family: LinkFamily, common = false): LinkTypeDef => ({
  key, forward, reverse, family, ...(common ? { common } : {}),
});

export const WORLD_LINK_PAIRS: readonly LinkPair[] = [
  {
    pair: "person_person",
    from: PERSON_KINDS,
    to: PERSON_KINDS,
    types: [
      sym("friend", "friend of", "bond", true),
      sym("ally", "ally of", "bond", true),
      sym("lover", "lover of", "bond", true),
      sym("contact", "contact of", "bond", true),
      sym("rival", "rival of", "enmity", true),
      sym("enemy", "enemy of", "enmity", true),
      dir("mentor_of", "mentor of", "apprentice of", "bond", true),
      dir("superior_of", "superior of", "subordinate of", "bond", true),
      sym("chosen_family", "chosen family of", "bond"),
      sym("former_ally", "former ally of", "bond"),
      sym("former_enemy", "former enemy of", "enmity"),
      dir("employer_of", "employer of", "works for", "bond"),
      dir("patron_of", "patron of", "protégé of", "bond"),
      dir("creditor_of", "creditor of", "owes", "holding"),
      dir("blackmails", "blackmails", "blackmailed by", "enmity"),
      dir("betrayed", "betrayed", "betrayed by", "enmity"),
      dir("sworn_to", "sworn to", "holds the oath of", "bond"),
    ],
    records: [
      { key: "parent_of", forward: "parent of", reverse: "child of", home: "kin" },
      { key: "spouse_of", forward: "spouse of", reverse: "spouse of", home: "kin" },
      { key: "former_spouse_of", forward: "former spouse of", reverse: "former spouse of", home: "kin" },
      { key: "sibling_of", forward: "sibling of", reverse: "sibling of", home: "kin" },
      { key: "relative_of", forward: "relative of", reverse: "relative of", home: "kin" },
    ],
  },
  {
    pair: "person_faction",
    from: PERSON_KINDS,
    to: ["faction"],
    // Every person-to-faction tie is a membership; its roles already say Patron, Adversary, Infiltrator.
    types: [],
    records: [{ key: "member_of", forward: "member of", reverse: "includes", home: "membership", common: true }],
  },
  {
    pair: "person_location",
    from: PERSON_KINDS,
    to: ["location"],
    types: [
      dir("born_in", "born in", "birthplace of", "place", true),
      dir("rules", "rules", "ruled by", "place", true),
      dir("works_at", "works at", "workplace of", "place", true),
      dir("guards", "guards", "guarded by", "place", true),
      dir("owns", "owns", "owned by", "holding"),
      dir("haunts", "haunts", "haunted by", "place"),
      dir("hides_in", "hides in", "hiding place of", "place"),
      dir("buried_at", "buried at", "resting place of", "place"),
      dir("exiled_from", "exiled from", "exiled", "enmity"),
      dir("banned_from", "banned from", "bans", "enmity"),
      dir("seeks", "seeks", "sought by", "place"),
    ],
    records: [
      { key: "lives_in", forward: "lives in", reverse: "home of", home: "npc_home", fromKinds: ["npc"], single: true, common: true },
      { key: "is_at", forward: "is at", reverse: "hosts", home: "pc_place", fromKinds: ["party_member"], single: true },
      { key: "keeps", forward: "keeps", reverse: "kept by", home: "keeper", fromKinds: ["npc"] },
    ],
  },
  {
    pair: "person_deity",
    from: PERSON_KINDS,
    to: ["deity"],
    types: [
      dir("worships", "worships", "worshipped by", "faith", true),
      dir("serves", "serves", "served by", "faith", true),
      dir("champion_of", "champion of", "championed by", "faith"),
      dir("chosen_of", "chosen of", "has chosen", "faith"),
      dir("blessed_by", "blessed by", "has blessed", "faith"),
      dir("cursed_by", "cursed by", "has cursed", "enmity", true),
      dir("defies", "defies", "defied by", "enmity"),
      dir("forsook", "forsook", "forsaken by", "enmity"),
    ],
    records: [
      { key: "patron_deity", forward: "patron deity", reverse: "patron of", home: "patron_deity", fromKinds: ["party_member"], single: true },
    ],
  },
  {
    pair: "person_item",
    from: PERSON_KINDS,
    to: ["item"],
    types: [
      dir("seeks", "seeks", "sought by", "holding", true),
      dir("made", "made", "made by", "holding", true),
      dir("guards", "guards", "guarded by", "holding"),
      dir("stole", "stole", "stolen by", "enmity"),
      dir("lost", "lost", "lost by", "holding"),
      dir("owes", "owes", "owed by", "holding"),
      dir("bound_to", "bound to", "bound to", "faith"),
      dir("cursed_by", "cursed by", "curses", "enmity"),
    ],
    records: [{ key: "carries", forward: "carries", reverse: "carried by", home: "inventory", common: true }],
  },
  {
    pair: "faction_faction",
    from: ["faction"],
    to: ["faction"],
    // A stance is held by each side for itself: one per direction, and the other side may differ.
    exclusive: true,
    types: [
      dir("allied", "allied with", "seen as an ally by", "stance", true),
      dir("friendly", "friendly to", "seen as a friend by", "stance", true),
      dir("neutral", "neutral to", "seen as neutral by", "stance", true),
      dir("suspicious", "suspicious of", "suspected by", "stance"),
      dir("rival", "rival of", "seen as a rival by", "stance", true),
      dir("hostile", "hostile to", "seen as hostile by", "stance", true),
      dir("secret_ally", "secretly allied with", "secretly seen as an ally by", "stance"),
      dir("secret_enemy", "secretly hostile to", "secretly seen as an enemy by", "stance"),
    ],
  },
  {
    pair: "faction_location",
    from: ["faction"],
    to: ["location"],
    types: [
      dir("controls", "controls", "controlled by", "place", true),
      dir("based_in", "based in", "base of", "place", true),
      dir("operates_in", "operates in", "home ground of", "place", true),
      dir("contests", "contests", "contested by", "enmity"),
      dir("protects", "protects", "protected by", "place"),
      dir("taxes", "taxes", "taxed by", "holding"),
      dir("raids", "raids", "raided by", "enmity"),
      dir("founded", "founded", "founded by", "place"),
      dir("banned_from", "banned from", "bans", "enmity"),
    ],
    records: [{ key: "seat", forward: "seated at", reverse: "seat of", home: "seat", single: true }],
  },
  {
    pair: "faction_deity",
    from: ["faction"],
    to: ["deity"],
    types: [
      dir("worships", "worships", "worshipped by", "faith", true),
      dir("serves", "serves", "served by", "faith"),
      dir("sponsored_by", "sponsored by", "sponsors", "faith"),
      dir("opposes", "opposes", "opposed by", "enmity", true),
      dir("suppresses", "suppresses", "suppressed by", "enmity"),
    ],
  },
  {
    pair: "faction_item",
    from: ["faction"],
    to: ["item"],
    types: [
      dir("holds", "holds", "held by", "holding", true),
      dir("seeks", "seeks", "sought by", "holding", true),
      dir("guards", "guards", "guarded by", "holding"),
      dir("made", "made", "made by", "holding"),
      dir("lost", "lost", "lost by", "holding"),
      dir("forbids", "forbids", "forbidden by", "enmity"),
    ],
  },
  {
    pair: "location_location",
    from: ["location"],
    to: ["location"],
    types: [
      sym("allied_with", "allied with", "place", true),
      sym("at_war_with", "at war with", "enmity", true),
      sym("trades_with", "trades with", "holding", true),
      sym("rival_of", "rival of", "enmity"),
      sym("sister_town_of", "sister town of", "place"),
      dir("liege_of", "liege of", "vassal of", "place"),
      sym("road_to", "road to", "place"),
    ],
  },
  {
    pair: "deity_deity",
    from: ["deity"],
    to: ["deity"],
    types: [
      sym("ally_of", "ally of", "faith", true),
      sym("rival_of", "rival of", "enmity", true),
      sym("enemy_of", "enemy of", "enmity", true),
      sym("consort_of", "consort of", "faith"),
      dir("parent_of", "parent of", "child of", "faith"),
      dir("master_of", "master of", "servant of", "faith"),
      dir("aspect_of", "aspect of", "has the aspect", "faith"),
      dir("usurped", "usurped", "usurped by", "enmity"),
    ],
  },
  {
    pair: "location_deity",
    from: ["location"],
    to: ["deity"],
    types: [
      dir("sacred_to", "sacred to", "holy at", "faith", true),
      dir("shrine_to", "shrine to", "enshrined at", "faith", true),
      dir("blessed_by", "blessed by", "has blessed", "faith"),
      dir("cursed_by", "cursed by", "has cursed", "enmity"),
      dir("forsaken_by", "forsaken by", "has forsaken", "enmity"),
    ],
  },
  {
    pair: "item_location",
    from: ["item"],
    to: ["location"],
    types: [
      dir("kept_at", "kept at", "keeps", "holding", true),
      dir("hidden_at", "hidden at", "hides", "holding", true),
      dir("lost_at", "lost at", "site of the loss of", "holding"),
      dir("forged_at", "forged at", "forge of", "holding"),
    ],
    records: [{ key: "sold_at", forward: "sold at", reverse: "sells", home: "store" }],
  },
  {
    pair: "item_deity",
    from: ["item"],
    to: ["deity"],
    types: [
      dir("relic_of", "relic of", "has the relic", "faith", true),
      dir("blessed_by", "blessed by", "has blessed", "faith"),
      dir("cursed_by", "cursed by", "has cursed", "enmity"),
    ],
  },
];

/**
 * A quest says what it involves itself, so it takes no links; these are the
 * quest's own records, read from the quest's side ("given by" Harl, and on
 * Harl's sheet "gave this quest").
 */
export const QUEST_RECORDS: readonly RecordTypeDef[] = [
  { key: "quest_giver", forward: "given by", reverse: "gave this quest", home: "quest", toKinds: ["npc"] },
  { key: "quest_place", forward: "set in", reverse: "quest set here", home: "quest", toKinds: ["location"] },
  { key: "quest_ref", forward: "involves", reverse: "involved in", home: "quest", toKinds: ["npc", "location", "faction", "item"] },
];

/** The pair two kinds belong to, in either order, with whether `a` is the pair's `from` side. */
export function pairFor(a: LinkKind, b: LinkKind): { pair: LinkPair; aIsFrom: boolean } | null {
  for (const pair of WORLD_LINK_PAIRS) {
    if (pair.from.includes(a) && pair.to.includes(b)) return { pair, aIsFrom: true };
    if (pair.from.includes(b) && pair.to.includes(a)) return { pair, aIsFrom: false };
  }
  return null;
}

/** The link type with this key in the pair joining these two kinds. */
export function linkTypeFor(fromKind: LinkKind, toKind: LinkKind, key: string): LinkTypeDef | null {
  const found = pairFor(fromKind, toKind);
  if (!found || !found.aIsFrom) return null;
  return found.pair.types.find((t) => t.key === key) ?? null;
}

/** Every type def with this key, link or record, for the pair joining these kinds; quest records for a quest. */
export function typeDefFor(kindA: ConnectionKind, kindB: ConnectionKind, key: string): LinkTypeDef | RecordTypeDef | null {
  if (kindA === "quest" || kindB === "quest") return QUEST_RECORDS.find((r) => r.key === key) ?? null;
  const found = pairFor(kindA, kindB);
  if (!found) return null;
  return found.pair.types.find((t) => t.key === key) ?? found.pair.records?.find((r) => r.key === key) ?? null;
}

/**
 * The word a tie reads as from the thing on screen ("worships", "worshipped by").
 * `subjectKind` is the kind of the thing whose sheet it is and `outward` is
 * whether it is the stored `from` end. An unknown type reads as its key.
 */
export function wordFor(subjectKind: ConnectionKind, otherKind: ConnectionKind, type: string, outward: boolean): string {
  const def = typeDefFor(subjectKind, otherKind, type);
  if (!def) return type.replaceAll("_", " ");
  return outward ? def.forward : def.reverse;
}

/** One choice in a type picker between the thing on screen and another. */
export interface TypeChoice {
  /** The catalogue key; with `home` it names a record type rather than a link. */
  key: string;
  /** Read from the thing on screen: "worships", or "apprentice of" when the screen is the `to` end. */
  word: string;
  /** Whether the thing on screen is stored as the `from` end. */
  subjectIsFrom: boolean;
  family: LinkFamily;
  common: boolean;
  /** The catalogue pair this type belongs to. */
  pair: string;
  /** The pair holds at most one link per ordered pair of things (a faction's stance). */
  exclusive?: true;
  /** Set for a record type: where choosing it writes. */
  home?: RecordTypeDef["home"];
  /** A record holding one value for its `from` end: choosing it replaces the old one. */
  single?: boolean;
}

/**
 * Every type the thing on screen (`subject`) can hold towards `other`, read from
 * the subject. For two people an asymmetric type is offered both ways ("mentor of"
 * and "apprentice of") because either can be the stored `from`.
 */
export function typeChoices(subject: LinkKind, other: LinkKind): TypeChoice[] {
  const choices: TypeChoice[] = [];
  for (const pair of WORLD_LINK_PAIRS) {
    const forward = pair.from.includes(subject) && pair.to.includes(other);
    const backward = pair.from.includes(other) && pair.to.includes(subject);
    if (!forward && !backward) continue;
    const base = { pair: pair.pair, ...(pair.exclusive ? { exclusive: true as const } : {}) };
    for (const t of pair.types) {
      if (forward) choices.push({ key: t.key, word: t.forward, subjectIsFrom: true, family: t.family, common: t.common === true, ...base });
      // A symmetric type reads the same from either end, so it is offered once.
      if (backward && !(forward && t.symmetric)) {
        choices.push({ key: t.key, word: t.reverse, subjectIsFrom: false, family: t.family, common: t.common === true, ...base });
      }
    }
    for (const r of pair.records ?? []) {
      const directions = [forward ? true : null, backward && !(forward && r.forward === r.reverse) ? false : null]
        .filter((d): d is boolean => d !== null);
      for (const subjectIsFrom of directions) {
        const fromKind = subjectIsFrom ? subject : other;
        const toKind = subjectIsFrom ? other : subject;
        if (r.fromKinds && !r.fromKinds.includes(fromKind)) continue;
        if (r.toKinds && !r.toKinds.includes(toKind)) continue;
        choices.push({
          key: r.key,
          word: subjectIsFrom ? r.forward : r.reverse,
          subjectIsFrom,
          family: "record",
          common: r.common === true,
          home: r.home,
          ...(r.single ? { single: true } : {}),
          ...base,
        });
      }
    }
  }
  return choices;
}

/**
 * The (from_kind, to_kind, type) triples the database accepts, one per kind
 * combination. The person pairs expand to both NPC and PC ends, which is what
 * `private.world_link_types` holds.
 */
export function catalogueRows(): { from_kind: LinkKind; to_kind: LinkKind; type: string; symmetric: boolean; exclusive: boolean }[] {
  const rows: { from_kind: LinkKind; to_kind: LinkKind; type: string; symmetric: boolean; exclusive: boolean }[] = [];
  for (const pair of WORLD_LINK_PAIRS) {
    for (const from of pair.from) {
      for (const to of pair.to) {
        for (const t of pair.types) {
          rows.push({ from_kind: from, to_kind: to, type: t.key, symmetric: t.symmetric === true, exclusive: pair.exclusive === true });
        }
      }
    }
  }
  return rows;
}
