import { describe, it, expect } from "vitest";
import {
  buildNpcEmbedText,
  buildFactionEmbedText,
  buildLocationEmbedText,
  buildNoteEmbedText,
  buildItemEmbedText,
  buildQuestEmbedText,
  entityEmbedHash,
  tieNameKey,
  tieSentences,
  type TieLink,
  type EmbeddableNpc,
  type EmbeddableFaction,
  type EmbeddableLocation,
  type EmbeddableNote,
  type EmbeddableItem,
  type EmbeddableQuest,
} from "./entityEmbedText";

// ── Shared properties ─────────────────────────────────────────────────────
//
// What every builder must hold, whichever field is missing: the output is the
// text a vector is made from, and its hash decides whether a row is re-embedded,
// so a stray separator or doubled space is churn, and a dropped field's words
// must not linger.

/** No double spaces, no clause that is only punctuation, no leading or trailing blank. */
const STRAY_SEPARATORS = /\s{2}|,\s*\.|\.\s*\.|^\s|\s$|,\s*,/;

const tiptap = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

/** `alpha alpha ...`: long enough to be cut, with word boundaries everywhere. */
const words = (word: string, count: number) => Array.from({ length: count }, () => word).join(" ");

/**
 * A field longer than its limit comes back as the longest whole-word prefix that
 * fits: never over the limit, never mid-word, and not cut shorter than it must be
 * (the limit is the contract, so a limit that drifted down would still pass `<=`).
 */
function expectCutAtWordBoundary(part: string, source: string, limit: number, word: string) {
  expect(part.length).toBeLessThanOrEqual(limit);
  expect(part.length).toBeGreaterThan(limit - word.length - 1);
  expect(part.split(" ").every((w) => w === word)).toBe(true);
  expect(source.startsWith(part)).toBe(true);
}

// ── NPC ───────────────────────────────────────────────────────────────────

function makeNpc(overrides: Partial<EmbeddableNpc> = {}): EmbeddableNpc {
  return {
    name: "Baelin Ironforge",
    race: "Dwarf",
    occupation: "blacksmith",
    alignment: "Lawful Good",
    tags: ["gruff", "reliable"],
    appearance: "Broad-shouldered with soot-stained hands.",
    personality: "Short-tempered but fiercely loyal.",
    backstory: "Fled the mines after the cave-in.",
    ...overrides,
  };
}

describe("buildNpcEmbedText", () => {
  it("builds the complete string for a fully-populated NPC", () => {
    expect(buildNpcEmbedText(makeNpc())).toBe(
      "Baelin Ironforge. Dwarf blacksmith, Lawful Good. gruff, reliable. " +
      "Broad-shouldered with soot-stained hands. Short-tempered but fiercely loyal. " +
      "Fled the mines after the cave-in.",
    );
  });

  it("is exactly the name when nothing else is known", () => {
    const bare = makeNpc({ race: null, occupation: null, alignment: null, tags: [], appearance: null, personality: null, backstory: null });
    expect(buildNpcEmbedText(bare)).toBe("Baelin Ironforge.");
  });

  it.each<[string, NonNullable<Parameters<typeof makeNpc>[0]>, string]>([
    ["race", { race: null }, "Dwarf"],
    ["occupation", { occupation: null }, "blacksmith"],
    ["alignment", { alignment: null }, "Lawful Good"],
    ["race, occupation and alignment", { race: null, occupation: null, alignment: null }, "Dwarf"],
    ["tags", { tags: [] }, "gruff"],
    ["appearance", { appearance: null }, "Broad-shouldered"],
    ["personality", { personality: null }, "Short-tempered"],
    ["backstory", { backstory: null }, "Fled the mines"],
  ])("drops %s cleanly when it is missing", (_label, over, dropped) => {
    const text = buildNpcEmbedText(makeNpc(over));
    expect(text).not.toContain(dropped);
    expect(text).not.toMatch(STRAY_SEPARATORS);
    expect(text.startsWith("Baelin Ironforge.")).toBe(true);
  });

  it("keeps what is left of the identity clause in order when one part is missing", () => {
    expect(buildNpcEmbedText(makeNpc({ race: null }))).toContain("Baelin Ironforge. blacksmith, Lawful Good. gruff");
    expect(buildNpcEmbedText(makeNpc({ alignment: null }))).toContain("Baelin Ironforge. Dwarf blacksmith. gruff");
  });

  it("keeps tags in the order given", () => {
    expect(buildNpcEmbedText(makeNpc({ tags: ["zebra", "gruff", "aardvark"] }))).toContain("zebra, gruff, aardvark.");
  });

  it("flattens a Tiptap appearance to its words", () => {
    const text = buildNpcEmbedText(makeNpc({ appearance: tiptap("Soot-stained hands.") }));
    expect(text).toContain("Soot-stained hands.");
    expect(text).not.toContain("{");
  });

  it("cuts a backstory over 500 characters at a word boundary", () => {
    const long = words("alpha", 120);
    const text = buildNpcEmbedText(makeNpc({ backstory: long }));
    expectCutAtWordBoundary(text.split("Short-tempered but fiercely loyal. ")[1], long, 500, "alpha");
  });

  it("collapses runs of whitespace, whatever field they are in", () => {
    const text = buildNpcEmbedText(makeNpc({ occupation: "black\tsmith", personality: "Short\n\ntempered." }));
    expect(text).not.toMatch(/\s{2,}/);
  });
});

// ── Faction ───────────────────────────────────────────────────────────────

function makeFaction(overrides: Partial<EmbeddableFaction> = {}): EmbeddableFaction {
  return {
    name: "The Iron Concord",
    faction_type: "Guild",
    alignment: "Lawful Neutral",
    tags: ["smugglers", "docks"],
    description: "A merchant consortium that controls the harbor trade.",
    ...overrides,
  };
}

describe("buildFactionEmbedText", () => {
  it("builds the complete string for a fully-populated faction", () => {
    expect(buildFactionEmbedText(makeFaction())).toBe(
      "The Iron Concord. Guild, Lawful Neutral. smugglers, docks. " +
      "A merchant consortium that controls the harbor trade.",
    );
  });

  it("is exactly the name when nothing else is known", () => {
    expect(buildFactionEmbedText({ name: "The Iron Concord", faction_type: null, alignment: null, tags: [], description: null }))
      .toBe("The Iron Concord.");
  });

  it.each<[string, NonNullable<Parameters<typeof makeFaction>[0]>, string]>([
    ["type", { faction_type: null }, "Guild"],
    ["alignment", { alignment: null }, "Lawful Neutral"],
    ["type and alignment", { faction_type: null, alignment: null }, "Guild"],
    ["tags", { tags: [] }, "smugglers"],
    ["description", { description: null }, "merchant consortium"],
  ])("drops %s cleanly when it is missing", (_label, over, dropped) => {
    const text = buildFactionEmbedText(makeFaction(over));
    expect(text).not.toContain(dropped);
    expect(text).not.toMatch(STRAY_SEPARATORS);
  });

  it("flattens a Tiptap description to its words", () => {
    const text = buildFactionEmbedText(makeFaction({ description: tiptap("Controls the harbor trade.") }));
    expect(text).toContain("Controls the harbor trade.");
    expect(text).not.toContain("{");
  });

  it("cuts a description over 500 characters at a word boundary", () => {
    const long = words("alpha", 120);
    const text = buildFactionEmbedText(makeFaction({ description: long }));
    expectCutAtWordBoundary(text.split("smugglers, docks. ")[1], long, 500, "alpha");
  });
});

// ── Location ──────────────────────────────────────────────────────────────

function makeLocation(overrides: Partial<EmbeddableLocation> = {}): EmbeddableLocation {
  return {
    name: "The Rusty Anchor",
    location_type: "tavern",
    tags: ["waterfront", "smugglers"],
    player_summary: "A dockside tavern known for cheap ale and quiet corners.",
    description: "Beneath the taproom, a smuggling tunnel connects to the docks.",
    ...overrides,
  };
}

describe("buildLocationEmbedText", () => {
  it("builds the complete string for a fully-populated location", () => {
    expect(buildLocationEmbedText(makeLocation())).toBe(
      "The Rusty Anchor. tavern. waterfront, smugglers. " +
      "A dockside tavern known for cheap ale and quiet corners. " +
      "Beneath the taproom, a smuggling tunnel connects to the docks.",
    );
  });

  it("is the name and type when everything else is absent", () => {
    expect(buildLocationEmbedText(makeLocation({ tags: [], player_summary: null, description: null }))).toBe("The Rusty Anchor. tavern.");
  });

  it.each<[string, NonNullable<Parameters<typeof makeLocation>[0]>, string]>([
    ["tags", { tags: [] }, "waterfront"],
    ["player summary", { player_summary: null }, "dockside tavern"],
    ["description", { description: null }, "smuggling tunnel"],
  ])("drops %s cleanly when it is missing", (_label, over, dropped) => {
    const text = buildLocationEmbedText(makeLocation(over));
    expect(text).not.toContain(dropped);
    expect(text).not.toMatch(STRAY_SEPARATORS);
  });

  it("reads player_summary as plain text, so braces in it are kept and not mistaken for Tiptap", () => {
    const text = buildLocationEmbedText(makeLocation({ player_summary: "A place with {curly braces} in the summary." }));
    expect(text).toContain("A place with {curly braces} in the summary.");
  });

  it("flattens a Tiptap description to its words", () => {
    const text = buildLocationEmbedText(makeLocation({ description: tiptap("A smuggling tunnel.") }));
    expect(text).toContain("A smuggling tunnel.");
    expect(text).not.toContain("{");
  });

  it("cuts a description and a player summary over 500 characters, each at a word boundary", () => {
    const longDescription = words("alpha", 120);
    const withLongDescription = buildLocationEmbedText(makeLocation({ description: longDescription }));
    expectCutAtWordBoundary(withLongDescription.split("quiet corners. ")[1], longDescription, 500, "alpha");

    const longSummary = words("beta", 120);
    const withLongSummary = buildLocationEmbedText(makeLocation({ player_summary: longSummary, description: null }));
    expectCutAtWordBoundary(withLongSummary.split("waterfront, smugglers. ")[1], longSummary, 500, "beta");
  });
});

// ── Note ──────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<EmbeddableNote> = {}): EmbeddableNote {
  return {
    title: "The Sunken Vault",
    category: "session",
    session_number: 7,
    tags: ["dungeon", "vault"],
    content: "The party descended into the flooded ruins and found the vault door ajar.",
    ...overrides,
  };
}

describe("buildNoteEmbedText", () => {
  it("builds the complete string for a fully-populated note", () => {
    expect(buildNoteEmbedText(makeNote())).toBe(
      "The Sunken Vault. session, Session 7. dungeon, vault. " +
      "The party descended into the flooded ruins and found the vault door ajar.",
    );
  });

  it("is the title and category when everything else is absent", () => {
    expect(buildNoteEmbedText({ title: "Loose thread: the merchant's ledger", category: "general", session_number: null, tags: [], content: null }))
      .toBe("Loose thread: the merchant's ledger. general.");
  });

  it.each<[string, NonNullable<Parameters<typeof makeNote>[0]>, string]>([
    ["session number", { session_number: null }, "Session 7"],
    ["tags", { tags: [] }, "dungeon"],
    ["content", { content: null }, "vault door"],
  ])("drops %s cleanly when it is missing", (_label, over, dropped) => {
    const text = buildNoteEmbedText(makeNote(over));
    expect(text).not.toContain(dropped);
    expect(text).not.toMatch(STRAY_SEPARATORS);
  });

  it("flattens Tiptap content to its words", () => {
    const text = buildNoteEmbedText(makeNote({ content: tiptap("The vault door was ajar.") }));
    expect(text).toContain("The vault door was ajar.");
    expect(text).not.toContain("{");
  });

  it("keeps up to 4000 characters of content, far more than a 500-character field, and cuts beyond that at a word boundary", () => {
    const long = words("alpha", 900);
    const text = buildNoteEmbedText(makeNote({ content: long }));
    expectCutAtWordBoundary(text.split("dungeon, vault. ")[1], long, 4000, "alpha");

    const shortEnough = words("alpha", 50);
    expect(buildNoteEmbedText(makeNote({ content: shortEnough }))).toContain(shortEnough);
  });
});

// ── Item ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<EmbeddableItem> = {}): EmbeddableItem {
  return {
    name: "Flame Tongue",
    item_type: "weapon",
    rarity: "rare",
    subtype: "longsword",
    requires_attunement: true,
    attunement_requirements: null,
    cost: "5,000 gp",
    tags: ["fire", "flashy"],
    description: "While holding this magic sword you can use a bonus action to ignite it.",
    ...overrides,
  };
}

describe("buildItemEmbedText", () => {
  it("builds the full clause sequence in order", () => {
    expect(buildItemEmbedText(makeItem())).toBe(
      "Flame Tongue. rare weapon, longsword. Requires attunement. 5,000 gp. fire, flashy. " +
      "While holding this magic sword you can use a bonus action to ignite it.",
    );
  });

  it("degrades to the name and the two NOT NULL columns when everything optional is absent", () => {
    expect(buildItemEmbedText({
      name: "Rusty Nail", item_type: "gear", rarity: "mundane", subtype: null, requires_attunement: false,
      attunement_requirements: null, cost: null, tags: [], description: null,
    })).toBe("Rusty Nail. mundane gear.");
  });

  it.each<[string, NonNullable<Parameters<typeof makeItem>[0]>, string]>([
    ["subtype", { subtype: null }, "longsword"],
    ["attunement", { requires_attunement: false }, "ttunement"],
    ["cost", { cost: null }, "5,000 gp"],
    ["tags", { tags: [] }, "flashy"],
    ["description", { description: null }, "bonus action"],
    ["a blank description", { description: "   " }, "bonus action"],
  ])("drops %s cleanly when it is missing", (_label, over, dropped) => {
    const text = buildItemEmbedText(makeItem(over));
    expect(text).not.toContain(dropped);
    expect(text).not.toMatch(STRAY_SEPARATORS);
  });

  // The class words in `attunement_requirements` are the ONLY place a druid
  // item says "druid" for 16 of the 16 library items attuned by one.
  it("carries the attunement requirement text verbatim when it is already a sentence", () => {
    const text = buildItemEmbedText(makeItem({ attunement_requirements: "Requires Attunement by a Druid" }));
    expect(text).toContain("Requires Attunement by a Druid.");
    expect(text).not.toContain("Requires attunement. Requires");
  });

  it("turns a bare requirement fragment into a sentence without losing the words", () => {
    expect(buildItemEmbedText(makeItem({ attunement_requirements: "Druid or Ranger" }))).toContain("Requires attunement: Druid or Ranger.");
  });

  it("does not double the full stop when the requirement already ends in one", () => {
    const text = buildItemEmbedText(makeItem({ attunement_requirements: "the user must be a member of one of the Reghed tribes." }));
    expect(text).toContain("tribes.");
    expect(text).not.toContain("tribes..");
  });

  it("keeps the requirement text even when the boolean disagrees with it", () => {
    const text = buildItemEmbedText(makeItem({ requires_attunement: false, attunement_requirements: "Requires Attunement by a Druid" }));
    expect(text).toContain("Requires Attunement by a Druid.");
  });

  it("cuts a description over 500 characters at a word boundary", () => {
    const long = words("alpha", 200);
    const text = buildItemEmbedText(makeItem({ description: long }));
    expectCutAtWordBoundary(text.split("fire, flashy. ")[1], long, 500, "alpha");
  });
});

// ── entityEmbedHash ───────────────────────────────────────────────────────

describe("entityEmbedHash", () => {
  it("is the same for the same text and different for different text", async () => {
    const [a, b, c] = await Promise.all([
      entityEmbedHash(buildNpcEmbedText(makeNpc())),
      entityEmbedHash(buildNpcEmbedText(makeNpc())),
      entityEmbedHash(buildNpcEmbedText(makeNpc({ name: "Someone Else" }))),
    ]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── Quest ─────────────────────────────────────────────────────────────────

function makeQuest(overrides: Partial<EmbeddableQuest> = {}): EmbeddableQuest {
  return {
    title: "The Missing Shipment",
    tags: ["trade", "docks"],
    summary: "Find who took the grain barges.",
    objectives: [
      { description: "Recover the cargo", sort_order: 1 },
      { description: "Question the harbour master", sort_order: 0 },
    ],
    beats: [
      { id: "b2", title: "Warehouse", created_at: "2026-01-02T00:00:00Z" },
      { id: "b1", title: "Harbour office", created_at: "2026-01-01T00:00:00Z" },
    ],
    ...overrides,
  };
}

describe("buildQuestEmbedText", () => {
  it("orders title, tags, summary, objectives by sort_order, beats by created_at", () => {
    expect(buildQuestEmbedText(makeQuest())).toBe(
      "The Missing Shipment. trade, docks. Find who took the grain barges. Question the harbour master. Recover the cargo. Harbour office. Warehouse.",
    );
  });

  it("is stable regardless of input order", () => {
    const q = makeQuest();
    const shuffled = makeQuest({ objectives: [...q.objectives].reverse(), beats: [...q.beats].reverse() });
    expect(buildQuestEmbedText(shuffled)).toBe(buildQuestEmbedText(q));
  });

  it("breaks a created_at tie by id", () => {
    const same = "2026-01-01T00:00:00Z";
    const a = makeQuest({ beats: [
      { id: "y", title: "Y", created_at: same },
      { id: "x", title: "X", created_at: same },
    ] });
    expect(buildQuestEmbedText(a)).toContain("X. Y.");
  });

  it("caps the whole text at 1500 chars", () => {
    const beats = Array.from({ length: 200 }, (_, i) => ({
      id: `b${i}`, title: `Beat number ${i} in a long quest`, created_at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
    }));
    const text = buildQuestEmbedText(makeQuest({ beats }));
    expect(text.length).toBeLessThanOrEqual(1500);
    // Cut at a word boundary, so a little under; but not far under (a limit that drifted down would still be <= 1500).
    expect(text.length).toBeGreaterThan(1450);
  });

  it("degrades to the title alone", () => {
    expect(buildQuestEmbedText({ title: "Bare", tags: [], summary: null, objectives: [], beats: [] })).toBe("Bare.");
  });
});

// ── Ties (World Web, #1084) ───────────────────────────────────────────────


describe("tieSentences", () => {
  const names = new Map([
    [tieNameKey("npc", "harl"), "Harl the Toll-man"],
    [tieNameKey("npc", "brenna"), "Brenna"],
    [tieNameKey("deity", "lady"), "The Drowned Lady"],
    [tieNameKey("faction", "concord"), "The Iron Concord"],
  ]);

  it("words a link from the side the subject stands on", () => {
    const links: TieLink[] = [
      { from_kind: "npc", from_id: "brenna", to_kind: "deity", to_id: "lady", type: "worships" },
      { from_kind: "npc", from_id: "brenna", to_kind: "npc", to_id: "harl", type: "rival" },
      { from_kind: "npc", from_id: "harl", to_kind: "npc", to_id: "brenna", type: "mentor_of" },
    ];
    expect(tieSentences("npc", "brenna", links, names)).toEqual([
      "apprentice of Harl the Toll-man",
      "rival of Harl the Toll-man",
      "worships The Drowned Lady",
    ]);
    expect(tieSentences("npc", "harl", links, names)).toEqual(["mentor of Brenna", "rival of Brenna"]);
  });

  it("is independent of the order links arrive in", () => {
    const a: TieLink = { from_kind: "npc", from_id: "brenna", to_kind: "deity", to_id: "lady", type: "worships" };
    const b: TieLink = { from_kind: "npc", from_id: "brenna", to_kind: "npc", to_id: "harl", type: "rival" };
    expect(tieSentences("npc", "brenna", [a, b], names)).toEqual(tieSentences("npc", "brenna", [b, a], names));
  });

  it("drops unknown types, unnamed far ends and links the subject is not on", () => {
    const links: TieLink[] = [
      { from_kind: "npc", from_id: "brenna", to_kind: "npc", to_id: "harl", type: "no_such_type" },
      { from_kind: "npc", from_id: "brenna", to_kind: "npc", to_id: "ghost", type: "rival" },
      { from_kind: "npc", from_id: "x", to_kind: "npc", to_id: "harl", type: "rival" },
    ];
    expect(tieSentences("npc", "brenna", links, names)).toEqual([]);
  });

  it("caps the list", () => {
    const many = new Map<string, string>();
    const links: TieLink[] = [];
    for (let i = 0; i < 30; i++) {
      many.set(tieNameKey("npc", `n${i}`), `Person ${String(i).padStart(2, "0")}`);
      links.push({ from_kind: "npc", from_id: "hub", to_kind: "npc", to_id: `n${i}`, type: "friend" });
    }
    // App convention (#1084): at most twelve ties go into one embed text.
    expect(tieSentences("npc", "hub", links, many)).toHaveLength(12);
  });
});

describe("tie clauses", () => {
  it("adds home, membership and ties to an NPC, between the tags and the prose", () => {
    const text = buildNpcEmbedText(
      makeNpc({
        name: "Brenna",
        home: "Fordwatch",
        memberships: [{ faction: "The Iron Concord", role: "captain" }, { faction: "The Ferrymen", role: null }],
        ties: ["worships The Drowned Lady", "rival of Harl the Toll-man"],
      }),
    );
    expect(text).toBe(
      "Brenna. Dwarf blacksmith, Lawful Good. gruff, reliable. Lives in Fordwatch. " +
        "Member of The Ferrymen, The Iron Concord (captain). " +
        "Rival of Harl the Toll-man, worships The Drowned Lady. " +
        "Broad-shouldered with soot-stained hands. Short-tempered but fiercely loyal. Fled the mines after the cave-in.",
    );
  });

  it("changes nothing for an entity with no ties", () => {
    expect(buildNpcEmbedText(makeNpc({ home: null, memberships: [], ties: [] }))).toBe(buildNpcEmbedText(makeNpc()));
  });

  it("is deterministic in the order ties are given", () => {
    const one = buildNpcEmbedText(makeNpc({ ties: ["b one", "a two"] }));
    const two = buildNpcEmbedText(makeNpc({ ties: ["a two", "b one"] }));
    expect(one).toBe(two);
  });

  it("gives a faction its seat and ties, a location its seat-of and ties, an item its ties", () => {
    const faction = buildFactionEmbedText({
      name: "The Iron Concord", faction_type: null, alignment: null, tags: [], description: null,
      seat: "Fordwatch", ties: ["controls The Rusty Anchor"],
    });
    expect(faction).toBe("The Iron Concord. Seated at Fordwatch. Controls The Rusty Anchor.");

    const location = buildLocationEmbedText({
      name: "Fordwatch", location_type: "town", tags: [], player_summary: null, description: null,
      seatOf: ["The Iron Concord"], ties: ["controlled by The Ferrymen"],
    });
    expect(location).toBe("Fordwatch. town. Seat of The Iron Concord. Controlled by The Ferrymen.");

    const item = buildItemEmbedText({
      name: "Toll Ledger", item_type: "Wondrous item", rarity: "Common", subtype: null, requires_attunement: false,
      attunement_requirements: null, cost: null, tags: [], description: null, ties: ["blessed by The Drowned Lady"],
    });
    expect(item).toContain("Blessed by The Drowned Lady.");
  });
});
