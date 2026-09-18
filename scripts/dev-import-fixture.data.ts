/**
 * The invented "extracted" payload for `dev-import-fixture.ts` — a short,
 * wholly made-up adventure ("The Hollow Seam", a flooded mine) shaped exactly
 * like a real `import-extract` response, so the document-import REVIEW screen
 * (settings wizard and the quest-paste panel) has something to look at
 * without spending a real AI call. Never copy real published adventure text
 * here — see CLAUDE.md's licensing note in `documentImport.types.ts`.
 *
 * ## Why these shapes are hand-rolled rather than `ExtractedNpc` etc.
 *
 * A concurrent wave (see git status: `entityMatching.ts`, `normalize.ts`,
 * `runImportKind.ts`) is adding cross-entity link fields the extraction
 * contract does not have yet — an NPC's `location_name`, a location's
 * `owner_npc_name`, a faction's `location_names`, and per-beat
 * `npc_names`/`monster_names`/`encounter_names`/`item_names`/`faction_names`.
 * `document_imports.extracted` is opaque jsonb (see the header comment on
 * `DocumentImport` in `documentImport.types.ts`), so nothing stops a payload
 * from carrying them today — but importing `ExtractedNpc` et al. and bolting
 * extra properties on would either need an intersection type per shape (noisy)
 * or excess-property-check workarounds (worse). Plain local interfaces, one
 * per kind, say exactly what this fixture writes and cost nothing to keep in
 * sync — they are not the contract, just this file's own idea of it. Do NOT
 * add these fields to `src/types/documentImport.types.ts` on the strength of
 * this file; that is the concurrent wave's decision to make.
 *
 * ## Every review state, on purpose
 *
 * - `npcs`/`locations`/`factions` each carry two names computed at *run time*
 *   from the fixture campaign's real rows (`buildFixtureExtraction`'s
 *   `overlap` argument) — one verbatim, one through a transform that
 *   `normalizeEntityName` (`src/lib/documentImport/entityName.ts`) is
 *   guaranteed to fold back to the same key regardless of what the underlying
 *   name actually is (case, a leading article, or extra whitespace — never
 *   pluralisation, which only reverses safely for names whose grammar the
 *   normalizer already assumes). This is what makes the review surface show
 *   real "already have this" matches on any machine's seed data, not just the
 *   one this file was written against.
 * - `monsters` covers all four link outcomes `entityMatching.ts` distinguishes:
 *   "Goblin" (matches both the library and the campaign's own three, inserted
 *   separately by `dev-import-fixture.ts`), "Giant Rats" (plural — matches
 *   library "Giant Rat" through the same normalizer), "Silt Wraith" (a full,
 *   real stat block — `canCreateFromPage` allows Create), and "The Gallery
 *   Stalker" (name only, no stats — defaults to Generate).
 * - A handful of fields are explicit JSON `null` rather than omitted — the
 *   provider's strict extraction schema answers `null` for anything the page
 *   didn't say (every optional field is `["string","null"]`), and
 *   `sanitizeEntities.ts`'s `stripNulls`/`stripNullsDeep` is what turns that
 *   into the absent-`?:`-field shape every mapper expects (see commit
 *   `d4370368`, "the model's null answers are absent fields, not null
 *   ones"). Leaving every field either present-with-content or simply
 *   omitted would never exercise that path at all.
 */
import type { MonsterStatBlock } from "@/types/monster.types";

/** Identifies this script's own row (for idempotent replace) and, on
 *  `monsters`, this script's own rows (for `--clear`). Never matched against
 *  anything a real DM might type by hand. */
export const FIXTURE_IMPORT_DISPLAY_NAME = "Dev fixture — The Hollow Seam";
export const FIXTURE_MONSTER_SOURCE_MARKER = "dev-import-fixture";

/** One entity envelope — `ExtractedEntity` (documentImport.types.ts) without
 *  importing it, so this file's `data` shapes are free to carry fields that
 *  type does not know about yet. */
export interface FixtureEnvelope<T> {
  ref: string;
  page: number | null;
  confidence: "complete" | "partial";
  data: T;
}

// ── Per-kind payload shapes ─────────────────────────────────────────────────
// Base fields mirror `ExtractedX` in documentImport.types.ts; fields marked
// NEW are the concurrent wave's, included here even though that file doesn't
// declare them yet (jsonb has no schema to violate).

export interface FixtureNpcData {
  name: string;
  race?: string;
  alignment?: string;
  age?: string;
  occupation?: string;
  appearance?: string | null;
  personality?: string;
  backstory?: string;
  notes?: string | null;
  faction_name?: string;
  /** NEW: this NPC's home location, by name, resolved against this same
   *  extraction's `locations`. */
  location_name?: string | null;
}

export interface FixtureLocationData {
  name: string;
  location_type?: string;
  description?: string;
  read_aloud?: string | null;
  notes?: string;
  parent_name?: string;
  /** NEW: who runs/owns this place, by NPC name. */
  owner_npc_name?: string;
}

export interface FixtureFactionData {
  name: string;
  faction_type?: string;
  alignment?: string;
  description?: string | null;
  /** NEW: places this faction operates out of, by name. */
  location_names?: string[];
}

export interface FixtureItemData {
  name: string;
  item_type?: string;
  subtype?: string;
  rarity?: string;
  requires_attunement?: boolean;
  weight?: number | null;
  cost?: string;
  description?: string;
  charges?: number;
}

export interface FixtureMonsterData {
  name: string;
  monster_type?: string;
  size?: string;
  alignment?: string;
  description?: string;
  habitat?: string | null;
  /**
   * `Partial<MonsterStatBlock>` (`src/types/monster.types.ts`) loosened to
   * `Record<string, unknown>` on purpose: the real extraction schema answers
   * `null` for a stat-block field the page didn't print (see the module
   * doc), and `MonsterStatBlock`'s optional fields are typed `?:` — undefined
   * only, never `| null` — so a strict `Partial<MonsterStatBlock>` here would
   * reject exactly the null values this fixture exists to seed.
   */
  stat_block?: Record<string, unknown>;
}

export interface FixtureEncounterData {
  name: string;
  description?: string;
  location_name?: string;
  combatants?: { name: string; count: number }[];
}

export interface FixtureQuestBeatData {
  key: string;
  title: string;
  dm_content: string;
  read_aloud?: string | null;
  kind: string;
  /** NEW per-beat link fields — every beat below names 1-3 of the other
   *  entities in this same extraction, by their exact `name`/`title`. */
  location_name?: string;
  npc_names?: string[];
  monster_names?: string[];
  encounter_names?: string[];
  item_names?: string[];
  faction_names?: string[];
}

export interface FixtureQuestRouteData {
  from: string;
  to: string;
}

export interface FixtureQuestObjectiveData {
  description: string;
  raised_by?: string | null;
}

export interface FixtureQuestData {
  title: string;
  summary?: string;
  beats?: FixtureQuestBeatData[];
  routes?: FixtureQuestRouteData[];
  objectives?: FixtureQuestObjectiveData[];
  giver_npc_name?: string;
  location_name?: string;
}

export interface FixtureExtraction {
  factions: FixtureEnvelope<FixtureFactionData>[];
  monsters: FixtureEnvelope<FixtureMonsterData>[];
  npcs: FixtureEnvelope<FixtureNpcData>[];
  locations: FixtureEnvelope<FixtureLocationData>[];
  items: FixtureEnvelope<FixtureItemData>[];
  quests: FixtureEnvelope<FixtureQuestData>[];
  encounters: FixtureEnvelope<FixtureEncounterData>[];
}

/** The two real rows (per kind) `dev-import-fixture.ts` read from the live
 *  campaign, exact name plus a transformed variant — see the file header for
 *  why the transform is picked per kind rather than pluralisation. */
export interface OverlapNames {
  npcExact: string;
  npcVariant: string;
  locationExact: string;
  locationVariant: string;
  factionExact: string;
  factionVariant: string;
}

/** A full, real stat block — the one monster this fixture lets the DM
 *  "Create" directly rather than send to the generator. CR 2, so it reads as
 *  a genuine mid-fight threat rather than a filler stub. */
const SILT_WRAITH_STAT_BLOCK: Record<string, unknown> = {
  armor_class: 13,
  hit_points: "9d8+18",
  speed: "0 ft., fly 40 ft. (hover)",
  str: 6,
  dex: 16,
  con: 14,
  int: 8,
  wis: 13,
  cha: 15,
  challenge_rating: "2",
  // Explicit nulls: a 2014-style page never prints these, and the strict
  // extraction schema answers null rather than omitting the key. Nested
  // nulls inside stat_block are exactly what `sanitizeEntities.ts`'s
  // `stripNullsDeep` has to reach past `stripNulls`'s top level to catch.
  proficiency_bonus: null,
  initiative_bonus: null,
  legendary_resistance: null,
  spellcasting: null,
  saving_throws: "Dex +5, Wis +3",
  damage_resistances: "acid, cold, fire, lightning, thunder",
  damage_immunities: "necrotic, poison",
  condition_immunities: "charmed, exhaustion, frightened, grappled, paralyzed, petrified, poisoned, prone, restrained",
  senses: "darkvision 60 ft., passive Perception 11",
  languages: "understands Common but can't speak",
  special_abilities: [
    {
      name: "Incorporeal Movement",
      description: "The wraith can move through other creatures and objects as if they were difficult terrain.",
    },
    {
      name: "Waterbound",
      description: "The wraith can't move more than 60 feet from standing water without disadvantage on all rolls.",
    },
  ],
  actions: [
    {
      name: "Drowning Touch",
      description: "Melee Spell Attack: +5 to hit, reach 5 ft., one creature. Hit: 21 (6d6) cold damage, and the target must succeed on a DC 13 Constitution saving throw or gain one level of exhaustion.",
    },
  ],
};

/** ~1.9k characters — well under the 3500-char-per-page ceiling
 *  `document_imports_source_shape_check` derives `page_count` from, so
 *  `page_count: 1` stays truthful. A short "pasted page" on purpose: this is
 *  what a DM copy-pastes from a PDF or a homebrew doc, not the full module. */
export const FIXTURE_SOURCE_TEXT = `THE HOLLOW SEAM
A flooded mine, three days old

For two generations the Hollow Seam fed Easthaven's forges with good iron. Three nights ago the lower galleries filled with black water between one watch and the next, and something came up out of the dark with it. The mine's warden, Orin Vance, has been turning away every miner who wants back inside — and quietly asking travelers for help instead.

THE GATEHOUSE. Orin Vance keeps the mine sealed from a squat stone gatehouse at the entrance, Watch-Captain Ilyn Marsh at his side more often than not. He'll pay in coin and in the mine's own iron for anyone willing to go down and find out what's actually loose in the flooded galleries — and to see Foreman Dresk answer for the state of the support timbers, if it comes to that.

DOWN INTO THE DARK. The mine forks below the gatehouse. One route climbs to the Upper Gallery, where Foreman Dresk still keeps an office and, the rumor goes, a very profitable arrangement with a company that would rather the mine stayed closed. The other drops straight into the Flooded Depths, where the water never fully drained and where something that isn't rats has been heard moving.

VOICES UNDER THE WATER. Whatever came up with the flood water hasn't left. Divers who've gone in report a cold that isn't the water's, and at least one has come back swearing an old iron lantern started burning again the moment it touched the black water.

Refugees from the flooded shafts are camped at Tallow's Rest, tended by Mirela Tuck and, for the ones who need more than food, Brother Kessic at the small chapel nearby. Nobody there has a straight answer for what happened three nights ago — but somebody profited from the mine going quiet, and it wasn't the miners.`;

/**
 * Builds the whole extraction. `overlap` is computed by the caller from the
 * fixture campaign's actual rows — see the module doc for why this file
 * cannot hardcode a name and expect it to exist on every machine's seed.
 */
export function buildFixtureExtraction(overlap: OverlapNames): FixtureExtraction {
  return {
    factions: [
      {
        ref: "faction-syndicate",
        page: 1,
        confidence: "partial",
        data: {
          name: overlap.factionExact,
          faction_type: "unknown",
          description: "Named once, in passing, in connection with the mine's closure — the page gives nothing more.",
          location_names: ["Upper Gallery", "Hollow Seam Gatehouse"],
        },
      },
      {
        ref: "faction-syndicate-variant",
        page: null,
        confidence: "partial",
        data: {
          name: overlap.factionVariant,
          faction_type: "unknown",
          description: null,
          location_names: ["Flooded Depths"],
        },
      },
    ],

    monsters: [
      {
        ref: "monster-goblin",
        page: 1,
        confidence: "partial",
        data: {
          name: "Goblin",
          monster_type: "humanoid",
          size: "small",
          description: "A handful keep to the upper tunnels, more interested in salvage than a fight.",
          habitat: null,
        },
      },
      {
        ref: "monster-silt-wraith",
        page: 1,
        confidence: "complete",
        data: {
          name: "Silt Wraith",
          monster_type: "undead",
          size: "medium",
          alignment: "neutral evil",
          description: "A drowned shape that never quite resolves into a face, always a few feet above the waterline.",
          habitat: "flooded, still water",
          stat_block: SILT_WRAITH_STAT_BLOCK,
        },
      },
      {
        ref: "monster-gallery-stalker",
        page: null,
        confidence: "partial",
        data: {
          name: "The Gallery Stalker",
          monster_type: "aberration",
          size: "large",
          description: "Heard, not seen — something that moves through the flooded galleries without disturbing the water.",
          habitat: null,
        },
      },
      {
        ref: "monster-giant-rats",
        page: 1,
        confidence: "complete",
        data: {
          name: "Giant Rats",
          monster_type: "beast",
          size: "small",
          description: "Driven up out of the lower shafts by the flood, in numbers nobody's bothered to count.",
        },
      },
    ],

    npcs: [
      {
        ref: "npc-orin-vance",
        page: 1,
        confidence: "complete",
        data: {
          name: "Orin Vance",
          race: "dwarf",
          occupation: "mine warden",
          appearance: "Grey-bearded, soot in every crease, a bandaged hand he doesn't explain.",
          personality: "Blunt, guilty, more scared than he'll say.",
          backstory: "Has run the Hollow Seam's gatehouse for eleven years and never once closed it before this week.",
          notes: null,
          location_name: "Hollow Seam Gatehouse",
        },
      },
      {
        ref: "npc-mirela-tuck",
        page: 1,
        confidence: "complete",
        data: {
          name: "Mirela Tuck",
          race: "human",
          occupation: "innkeeper",
          appearance: "Sleeves rolled to the elbow, never sits down.",
          personality: "Warm to refugees, cold to anyone asking questions for coin.",
          location_name: "Tallow's Rest",
        },
      },
      {
        ref: "npc-brother-kessic",
        page: 1,
        confidence: "partial",
        data: {
          name: "Brother Kessic",
          race: "human",
          occupation: "priest",
          backstory: "Came to Easthaven for the winter and stayed once the flood started bringing in the injured.",
          location_name: "Chapel of the Still Water",
        },
      },
      {
        ref: "npc-foreman-dresk",
        page: 1,
        confidence: "complete",
        data: {
          name: "Foreman Dresk",
          race: "human",
          occupation: "mine foreman",
          appearance: "Well-fed for a man who works underground.",
          personality: "Affable right up until the support timbers come up in conversation.",
          faction_name: "The Frostbloom Syndicate",
          location_name: "Upper Gallery",
        },
      },
      {
        ref: "npc-sella-brask",
        page: 1,
        confidence: "partial",
        data: {
          name: "Sella Brask",
          race: "half-elf",
          occupation: "smuggler",
          notes: "Has been using the flooded lower galleries as a cache for at least a season.",
          location_name: "Flooded Depths",
        },
      },
      {
        ref: "npc-ilyn-marsh",
        page: 1,
        confidence: "complete",
        data: {
          name: "Watch-Captain Ilyn Marsh",
          race: "human",
          occupation: "town watch",
          personality: "Professional, unconvinced Foreman Dresk's paperwork is complete.",
          location_name: "Hollow Seam Gatehouse",
        },
      },
      {
        ref: "npc-overlap-exact",
        page: 1,
        confidence: "partial",
        data: {
          name: overlap.npcExact,
          occupation: "unclear — recognized from elsewhere",
          notes: "Same name as someone already known to this campaign; the page says nothing more about them.",
          location_name: null,
        },
      },
      {
        ref: "npc-overlap-variant",
        page: null,
        confidence: "partial",
        data: {
          name: overlap.npcVariant,
          appearance: "Barely more than a mention in passing.",
        },
      },
    ],

    locations: [
      {
        ref: "loc-hollow-seam-mine",
        page: 1,
        confidence: "complete",
        data: {
          name: "Hollow Seam Mine",
          location_type: "dungeon",
          description: "An iron mine, two generations worked, its lower galleries flooded three nights ago.",
        },
      },
      {
        ref: "loc-upper-gallery",
        page: 1,
        confidence: "complete",
        data: {
          name: "Upper Gallery",
          location_type: "dungeon",
          description: "Dry, still worked, and where Foreman Dresk keeps an office he'd rather nobody searched.",
          parent_name: "Hollow Seam Mine",
        },
      },
      {
        ref: "loc-flooded-depths",
        page: 1,
        confidence: "partial",
        data: {
          name: "Flooded Depths",
          location_type: "dungeon",
          description: "Black water, waist-deep in places, that never fully drained after the flood.",
          read_aloud: "The lantern light doesn't carry here. The water is utterly still, and utterly cold.",
          parent_name: "Hollow Seam Mine",
        },
      },
      {
        ref: "loc-gatehouse",
        page: 1,
        confidence: "complete",
        data: {
          name: "Hollow Seam Gatehouse",
          location_type: "building",
          description: "A squat stone gatehouse sealing the mine entrance, one door in, one door down.",
          owner_npc_name: "Orin Vance",
        },
      },
      {
        ref: "loc-tallows-rest",
        page: 1,
        confidence: "complete",
        data: {
          name: "Tallow's Rest",
          location_type: "tavern",
          description: "Half inn, half relief camp for miners with nowhere else to sleep this week.",
          owner_npc_name: "Mirela Tuck",
        },
      },
      {
        ref: "loc-chapel",
        page: 1,
        confidence: "partial",
        data: {
          name: "Chapel of the Still Water",
          location_type: "building",
          description: "A one-room chapel that has seen more patients than prayers since the flood.",
          notes: "",
        },
      },
      {
        ref: "loc-overlap-exact",
        page: 1,
        confidence: "partial",
        data: {
          name: overlap.locationExact,
          location_type: "place",
          description: "Named once, in passing — the page gives nothing more about it.",
          read_aloud: null,
        },
      },
      {
        ref: "loc-overlap-variant",
        page: null,
        confidence: "partial",
        data: {
          name: overlap.locationVariant,
          location_type: "place",
          description: "A variant spelling of somewhere already on the map.",
        },
      },
    ],

    items: [
      {
        ref: "item-potion-of-healing",
        page: 1,
        confidence: "complete",
        data: {
          name: "Potion of Healing",
          item_type: "potion",
          rarity: "common",
          description: "A standard-issue healing draught, several crates of which sit in Orin Vance's gatehouse stores.",
          weight: null,
        },
      },
      {
        ref: "item-miners-pick",
        page: 1,
        confidence: "partial",
        data: {
          name: "Miner's Lucky Pick",
          item_type: "tool",
          rarity: "common",
          description: "A well-worn iron pick a miner swears has never once struck bad rock.",
        },
      },
      {
        ref: "item-chained-lantern",
        page: 1,
        confidence: "complete",
        data: {
          name: "Chained Lantern",
          item_type: "wondrous_item",
          rarity: "uncommon",
          requires_attunement: false,
          description: "An old iron lantern on a short chain. It only burns near standing water, and it burns brighter the closer something dead is.",
        },
      },
    ],

    quests: [
      {
        ref: "quest-hollow-seam",
        page: 1,
        confidence: "complete",
        data: {
          title: "What the Mine Let In",
          summary: "Water is pouring out of the Hollow Seam, and something came out of the dark with it.",
          giver_npc_name: "Orin Vance",
          location_name: "Hollow Seam Gatehouse",
          beats: [
            {
              key: "b1",
              title: "A warden's plea",
              dm_content: "Orin Vance meets the party at the gatehouse. He wants the mine's lower galleries checked, but won't say outright that he's afraid of what's down there.",
              read_aloud: null,
              kind: "social",
              location_name: "Hollow Seam Gatehouse",
              npc_names: ["Orin Vance"],
            },
            {
              key: "b2",
              title: "Down into the dark",
              dm_content: "The mine forks below the gatehouse: one route climbs to the Upper Gallery, the other drops into the Flooded Depths. Watch-Captain Marsh escorts the party this far and no further.",
              kind: "explore",
              location_name: "Hollow Seam Mine",
              npc_names: ["Watch-Captain Ilyn Marsh"],
            },
            {
              key: "b3",
              title: "The foreman's price",
              dm_content: "Foreman Dresk is affable until the support timbers come up. He'll pay well for the party to look elsewhere — or fight to keep his arrangement with the Syndicate quiet.",
              kind: "social",
              location_name: "Upper Gallery",
              npc_names: ["Foreman Dresk"],
              faction_names: [overlap.factionExact],
              encounter_names: ["The Foreman's Guards"],
            },
            {
              key: "b4",
              title: "Voices under the water",
              dm_content: "The Flooded Depths are cold in a way the water alone doesn't explain. Something moves without disturbing the surface.",
              read_aloud: "The lantern light doesn't carry here. The water is utterly still, and utterly cold.",
              kind: "explore",
              location_name: "Flooded Depths",
              monster_names: ["Silt Wraith"],
              encounter_names: ["Ambush in the Flooded Depths"],
            },
            {
              key: "b5",
              title: "What the flood woke",
              dm_content: "Whatever the Gallery Stalker is, it wants the Chained Lantern extinguished, not the party dead — at least not first.",
              kind: "combat",
              location_name: "Flooded Depths",
              monster_names: ["The Gallery Stalker"],
              item_names: ["Chained Lantern"],
            },
            {
              key: "b6",
              title: "Sealing the seam",
              dm_content: "With the depths quiet, Orin Vance and Brother Kessic decide together whether the Hollow Seam ever reopens.",
              kind: "discovery",
              location_name: "Hollow Seam Gatehouse",
              npc_names: ["Orin Vance", "Brother Kessic"],
              faction_names: [overlap.factionVariant],
            },
          ],
          routes: [
            { from: "b1", to: "b2" },
            { from: "b2", to: "b3" },
            { from: "b2", to: "b4" },
            { from: "b3", to: "b5" },
            { from: "b4", to: "b5" },
            { from: "b5", to: "b6" },
          ],
          objectives: [
            { description: "Find out what is flooding the Hollow Seam, and stop it", raised_by: "b1" },
            { description: "Learn what interest the Frostbloom Syndicate has in the flooded depths", raised_by: "b4" },
          ],
        },
      },
    ],

    encounters: [
      {
        ref: "encounter-ambush",
        page: 1,
        confidence: "partial",
        data: {
          name: "Ambush in the Flooded Depths",
          description: "The rats come first, driven ahead of the wraith rather than hunting on their own.",
          location_name: "Flooded Depths",
          combatants: [
            { name: "Giant Rats", count: 4 },
            { name: "Silt Wraith", count: 1 },
          ],
        },
      },
      {
        ref: "encounter-foremans-guards",
        page: 1,
        confidence: "complete",
        data: {
          name: "The Foreman's Guards",
          description: "Dresk keeps a couple of goblins on retainer for anyone who asks too many questions in the Upper Gallery.",
          location_name: "Upper Gallery",
          combatants: [
            { name: "Goblin", count: 2 },
            { name: "Foreman Dresk", count: 1 },
          ],
        },
      },
    ],
  };
}

/**
 * Three campaign-owned "Goblin" rows, distinct enough to make the resulting
 * A/B/C/library/new/none candidate list mean something instead of showing
 * three identical cards. `dev-import-fixture.ts` inserts these directly into
 * `monsters` (not through the import pipeline) and tags every one with
 * `source: FIXTURE_MONSTER_SOURCE_MARKER` so `--clear` can find them again
 * without touching a Goblin a real DM made by hand.
 */
export const FIXTURE_CAMPAIGN_GOBLINS: Array<{
  suffix: string;
  monster_type: string;
  size: string;
  alignment: string;
  tags: string[];
  notes: string;
  stat_block: MonsterStatBlock;
}> = [
  {
    suffix: "scout",
    monster_type: "humanoid",
    size: "small",
    alignment: "neutral evil",
    tags: ["dev-fixture"],
    notes: "Dev import-fixture row (npm run dev:import-fixture) — a plain scout, CR 1/4.",
    stat_block: {
      armor_class: 15,
      hit_points: "2d6",
      speed: "30 ft.",
      str: 8,
      dex: 14,
      con: 10,
      int: 10,
      wis: 8,
      cha: 8,
      challenge_rating: "1/4",
      skills: { stealth: "+6" },
      senses: "darkvision 60 ft., passive Perception 9",
      languages: "Common, Goblin",
      actions: [{ name: "Scimitar", description: "Melee Weapon Attack: +4 to hit. Hit: 5 (1d6+2) slashing damage." }],
    },
  },
  {
    suffix: "raider",
    monster_type: "humanoid",
    size: "small",
    alignment: "neutral evil",
    tags: ["dev-fixture"],
    notes: "Dev import-fixture row (npm run dev:import-fixture) — a battle-hardened raider, CR 1.",
    stat_block: {
      armor_class: 16,
      hit_points: "5d6+5",
      speed: "30 ft.",
      str: 10,
      dex: 15,
      con: 12,
      int: 10,
      wis: 9,
      cha: 10,
      challenge_rating: "1",
      skills: { stealth: "+6" },
      senses: "darkvision 60 ft., passive Perception 9",
      languages: "Common, Goblin",
      actions: [{ name: "Shortsword", description: "Melee Weapon Attack: +4 to hit. Hit: 6 (1d6+3) piercing damage." }],
    },
  },
  {
    suffix: "boss",
    monster_type: "humanoid",
    size: "small",
    alignment: "neutral evil",
    tags: ["dev-fixture", "boss"],
    notes: "Dev import-fixture row (npm run dev:import-fixture) — the gang's boss, CR 2.",
    stat_block: {
      armor_class: 17,
      hit_points: "9d6+9",
      speed: "30 ft.",
      str: 12,
      dex: 16,
      con: 12,
      int: 10,
      wis: 10,
      cha: 14,
      challenge_rating: "2",
      skills: { stealth: "+6", intimidation: "+4" },
      senses: "darkvision 60 ft., passive Perception 10",
      languages: "Common, Goblin",
      special_abilities: [
        { name: "Nimble Escape", description: "The boss can take the Disengage or Hide action as a bonus action on each of its turns." },
      ],
      actions: [{ name: "Scimitar", description: "Melee Weapon Attack: +5 to hit. Hit: 6 (1d6+3) slashing damage." }],
    },
  },
];
