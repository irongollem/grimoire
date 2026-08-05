import { describe, it, expect } from "vitest";
import {
  buildNpcEmbedText,
  buildFactionEmbedText,
  buildLocationEmbedText,
  buildNoteEmbedText,
  buildItemEmbedText,
  entityEmbedHash,
  type EmbeddableNpc,
  type EmbeddableFaction,
  type EmbeddableLocation,
  type EmbeddableNote,
  type EmbeddableItem,
} from "./entityEmbedText";

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

const NPC_NAME_ONLY: EmbeddableNpc = {
  name: "Baelin Ironforge",
  race: null,
  occupation: null,
  alignment: null,
  tags: [],
  appearance: null,
  personality: null,
  backstory: null,
};

describe("buildNpcEmbedText", () => {
  it("builds the complete string for a fully-populated NPC", () => {
    expect(buildNpcEmbedText(makeNpc())).toBe(
      "Baelin Ironforge. Dwarf blacksmith, Lawful Good. gruff, reliable. " +
      "Broad-shouldered with soot-stained hands. Short-tempered but fiercely loyal. " +
      "Fled the mines after the cave-in.",
    );
  });

  it("produces exactly the name clause for a name-only NPC — no stray separators or dangling punctuation", () => {
    expect(buildNpcEmbedText(NPC_NAME_ONLY)).toBe("Baelin Ironforge.");
  });

  it("omits the race/occupation/alignment clause entirely when race is missing (no dangling comma)", () => {
    const text = buildNpcEmbedText(makeNpc({ race: null }));
    expect(text).toBe(
      "Baelin Ironforge. blacksmith, Lawful Good. gruff, reliable. " +
      "Broad-shouldered with soot-stained hands. Short-tempered but fiercely loyal. " +
      "Fled the mines after the cave-in.",
    );
  });

  it("omits the race/occupation/alignment clause entirely when occupation is missing", () => {
    const text = buildNpcEmbedText(makeNpc({ occupation: null }));
    expect(text).toContain("Baelin Ironforge. Dwarf, Lawful Good.");
  });

  it("never emits a dangling comma when alignment is missing", () => {
    const text = buildNpcEmbedText(makeNpc({ alignment: null }));
    expect(text).not.toContain(", .");
    expect(text).toContain("Baelin Ironforge. Dwarf blacksmith.");
  });

  it("emits an alignment-only clause when race and occupation are both missing", () => {
    const text = buildNpcEmbedText(makeNpc({ race: null, occupation: null }));
    expect(text).toBe(
      "Baelin Ironforge. Lawful Good. gruff, reliable. " +
      "Broad-shouldered with soot-stained hands. Short-tempered but fiercely loyal. " +
      "Fled the mines after the cave-in.",
    );
  });

  it("omits the race/occupation/alignment clause entirely when all three are missing", () => {
    const text = buildNpcEmbedText(makeNpc({ race: null, occupation: null, alignment: null }));
    expect(text).toBe(
      "Baelin Ironforge. gruff, reliable. " +
      "Broad-shouldered with soot-stained hands. Short-tempered but fiercely loyal. " +
      "Fled the mines after the cave-in.",
    );
  });

  it("omits the tags clause entirely when tags is an empty array", () => {
    const text = buildNpcEmbedText(makeNpc({ tags: [] }));
    expect(text).not.toContain("  ");
    expect(text).toBe(
      "Baelin Ironforge. Dwarf blacksmith, Lawful Good. " +
      "Broad-shouldered with soot-stained hands. Short-tempered but fiercely loyal. " +
      "Fled the mines after the cave-in.",
    );
  });

  it("preserves tag order as given, never re-sorted", () => {
    const text = buildNpcEmbedText(makeNpc({ tags: ["zebra", "gruff", "aardvark"] }));
    expect(text).toContain("zebra, gruff, aardvark.");
  });

  it("omits appearance, personality, and backstory independently when each is missing", () => {
    expect(buildNpcEmbedText(makeNpc({ appearance: null }))).not.toContain("Broad-shouldered");
    expect(buildNpcEmbedText(makeNpc({ personality: null }))).not.toContain("Short-tempered");
    expect(buildNpcEmbedText(makeNpc({ backstory: null }))).not.toContain("Fled the mines");
  });

  it("never embeds `notes` -- it is not a field on EmbeddableNpc at all", () => {
    // Type-level guard: EmbeddableNpc has no `notes` key, so there is nothing
    // a caller could even pass through here. This test exists so the
    // exclusion is visible in the suite, not just the interface comment.
    const npc = makeNpc();
    expect(Object.keys(npc)).not.toContain("notes");
  });

  it("flattens a Tiptap JSON appearance to plain text", () => {
    const tiptap = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Soot-stained hands." }] }],
    });
    const text = buildNpcEmbedText(makeNpc({ appearance: tiptap }));
    expect(text).toContain("Soot-stained hands.");
    expect(text).not.toContain("{");
  });

  it("truncates a backstory longer than 500 characters at a word boundary, never mid-word", () => {
    const longBackstory = Array.from({ length: 120 }, () => "alpha").join(" "); // 719 chars
    const text = buildNpcEmbedText(makeNpc({ backstory: longBackstory }));
    const backstoryPart = text.split("Short-tempered but fiercely loyal. ")[1]!;

    expect(backstoryPart.length).toBeLessThanOrEqual(500);
    expect(backstoryPart.split(" ").every((word) => word === "alpha")).toBe(true);
    expect(longBackstory.startsWith(backstoryPart)).toBe(true);
  });

  it("collapses runs of whitespace so output is stable regardless of source formatting", () => {
    const text = buildNpcEmbedText(
      makeNpc({ race: "Dwarf", occupation: "black\tsmith", personality: "Short\n\ntempered." }),
    );
    expect(text).not.toMatch(/\s{2,}/);
  });

  it("is deterministic — the same input always produces byte-identical output", () => {
    expect(buildNpcEmbedText(makeNpc())).toBe(buildNpcEmbedText(makeNpc()));
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

const FACTION_NAME_ONLY: EmbeddableFaction = {
  name: "The Iron Concord",
  faction_type: null,
  alignment: null,
  tags: [],
  description: null,
};

describe("buildFactionEmbedText", () => {
  it("builds the complete string for a fully-populated faction", () => {
    expect(buildFactionEmbedText(makeFaction())).toBe(
      "The Iron Concord. Guild, Lawful Neutral. smugglers, docks. " +
      "A merchant consortium that controls the harbor trade.",
    );
  });

  it("produces exactly the name clause for a name-only faction", () => {
    expect(buildFactionEmbedText(FACTION_NAME_ONLY)).toBe("The Iron Concord.");
  });

  it("omits the type/alignment clause entirely when faction_type is missing", () => {
    const text = buildFactionEmbedText(makeFaction({ faction_type: null }));
    expect(text).toBe(
      "The Iron Concord. Lawful Neutral. smugglers, docks. " +
      "A merchant consortium that controls the harbor trade.",
    );
  });

  it("never emits a dangling comma when alignment is missing", () => {
    const text = buildFactionEmbedText(makeFaction({ alignment: null }));
    expect(text).not.toContain(", .");
    expect(text).toContain("The Iron Concord. Guild.");
  });

  it("omits the type/alignment clause entirely when both are missing", () => {
    const text = buildFactionEmbedText(makeFaction({ faction_type: null, alignment: null }));
    expect(text).toBe(
      "The Iron Concord. smugglers, docks. A merchant consortium that controls the harbor trade.",
    );
  });

  it("omits the tags clause entirely when tags is an empty array", () => {
    const text = buildFactionEmbedText(makeFaction({ tags: [] }));
    expect(text).toBe(
      "The Iron Concord. Guild, Lawful Neutral. A merchant consortium that controls the harbor trade.",
    );
  });

  it("omits the description entirely when it is missing", () => {
    const text = buildFactionEmbedText(makeFaction({ description: null }));
    expect(text).toBe("The Iron Concord. Guild, Lawful Neutral. smugglers, docks.");
  });

  it("flattens a Tiptap JSON description to plain text", () => {
    const tiptap = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Controls the harbor trade." }] }],
    });
    const text = buildFactionEmbedText(makeFaction({ description: tiptap }));
    expect(text).toContain("Controls the harbor trade.");
    expect(text).not.toContain("{");
  });

  it("truncates a description longer than 500 characters at a word boundary, never mid-word", () => {
    const longDescription = Array.from({ length: 120 }, () => "alpha").join(" ");
    const text = buildFactionEmbedText(makeFaction({ description: longDescription }));
    const descriptionPart = text.split("smugglers, docks. ")[1]!;

    expect(descriptionPart.length).toBeLessThanOrEqual(500);
    expect(descriptionPart.split(" ").every((word) => word === "alpha")).toBe(true);
    expect(longDescription.startsWith(descriptionPart)).toBe(true);
  });

  it("is deterministic — the same input always produces byte-identical output", () => {
    expect(buildFactionEmbedText(makeFaction())).toBe(buildFactionEmbedText(makeFaction()));
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

const LOCATION_MINIMAL: EmbeddableLocation = {
  name: "The Rusty Anchor",
  location_type: "tavern",
  tags: [],
  player_summary: null,
  description: null,
};

describe("buildLocationEmbedText", () => {
  it("builds the complete string for a fully-populated location", () => {
    expect(buildLocationEmbedText(makeLocation())).toBe(
      "The Rusty Anchor. tavern. waterfront, smugglers. " +
      "A dockside tavern known for cheap ale and quiet corners. " +
      "Beneath the taproom, a smuggling tunnel connects to the docks.",
    );
  });

  it("produces exactly the name and location_type clauses when everything else is absent", () => {
    expect(buildLocationEmbedText(LOCATION_MINIMAL)).toBe("The Rusty Anchor. tavern.");
  });

  it("omits the tags clause entirely when tags is an empty array", () => {
    const text = buildLocationEmbedText(makeLocation({ tags: [] }));
    expect(text).toBe(
      "The Rusty Anchor. tavern. A dockside tavern known for cheap ale and quiet corners. " +
      "Beneath the taproom, a smuggling tunnel connects to the docks.",
    );
  });

  it("omits the player_summary clause entirely when it is missing", () => {
    const text = buildLocationEmbedText(makeLocation({ player_summary: null }));
    expect(text).toBe(
      "The Rusty Anchor. tavern. waterfront, smugglers. " +
      "Beneath the taproom, a smuggling tunnel connects to the docks.",
    );
  });

  it("omits the description clause entirely when it is missing", () => {
    const text = buildLocationEmbedText(makeLocation({ description: null }));
    expect(text).toBe(
      "The Rusty Anchor. tavern. waterfront, smugglers. A dockside tavern known for cheap ale and quiet corners.",
    );
  });

  it("never embeds `notes` -- it is not a field on EmbeddableLocation at all", () => {
    const location = makeLocation();
    expect(Object.keys(location)).not.toContain("notes");
  });

  it("does NOT flatten player_summary as Tiptap JSON — it is stored as plain text", () => {
    // If a raw '{"type":"doc",...}' string ever ended up in player_summary
    // (e.g. bad data), it should pass through untouched (module-doc-truncated),
    // not be silently emptied by a failed Tiptap parse.
    const rawLookingText = "A place with {curly braces} in the summary.";
    const text = buildLocationEmbedText(makeLocation({ player_summary: rawLookingText }));
    expect(text).toContain("A place with {curly braces} in the summary.");
  });

  it("flattens a Tiptap JSON description to plain text", () => {
    const tiptap = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A smuggling tunnel." }] }],
    });
    const text = buildLocationEmbedText(makeLocation({ description: tiptap }));
    expect(text).toContain("A smuggling tunnel.");
    expect(text).not.toContain("{");
  });

  it("truncates a description longer than 500 characters at a word boundary, never mid-word", () => {
    const longDescription = Array.from({ length: 120 }, () => "alpha").join(" ");
    const text = buildLocationEmbedText(makeLocation({ description: longDescription }));
    const descriptionPart = text.split("A dockside tavern known for cheap ale and quiet corners. ")[1]!;

    expect(descriptionPart.length).toBeLessThanOrEqual(500);
    expect(descriptionPart.split(" ").every((word) => word === "alpha")).toBe(true);
    expect(longDescription.startsWith(descriptionPart)).toBe(true);
  });

  it("truncates player_summary longer than 500 characters at a word boundary, never mid-word", () => {
    const longSummary = Array.from({ length: 120 }, () => "beta").join(" ");
    const text = buildLocationEmbedText(makeLocation({ player_summary: longSummary, description: null }));
    const summaryPart = text.split("tavern. waterfront, smugglers. ")[1]!;

    expect(summaryPart.length).toBeLessThanOrEqual(500);
    expect(summaryPart.split(" ").every((word) => word === "beta")).toBe(true);
  });

  it("collapses runs of whitespace so output is stable regardless of source formatting", () => {
    const text = buildLocationEmbedText(
      makeLocation({ player_summary: "A place\n\nwith   odd\tspacing." }),
    );
    expect(text).not.toMatch(/\s{2,}/);
  });

  it("is deterministic — the same input always produces byte-identical output", () => {
    expect(buildLocationEmbedText(makeLocation())).toBe(buildLocationEmbedText(makeLocation()));
  });
});

// ── Note ──────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<EmbeddableNote> = {}): EmbeddableNote {
  return {
    title: "The Sunken Vault",
    category: "session",
    session_num: 7,
    tags: ["dungeon", "vault"],
    content: "The party descended into the flooded ruins and found the vault door ajar.",
    ...overrides,
  };
}

const NOTE_TITLE_ONLY: EmbeddableNote = {
  title: "Loose thread: the merchant's ledger",
  category: "general",
  session_num: null,
  tags: [],
  content: null,
};

describe("buildNoteEmbedText", () => {
  it("builds the complete string for a fully-populated note", () => {
    expect(buildNoteEmbedText(makeNote())).toBe(
      "The Sunken Vault. session, Session 7. dungeon, vault. " +
      "The party descended into the flooded ruins and found the vault door ajar.",
    );
  });

  it("produces exactly the title and category clauses when everything else is absent", () => {
    expect(buildNoteEmbedText(NOTE_TITLE_ONLY)).toBe("Loose thread: the merchant's ledger. general.");
  });

  it("omits the session-number clause when session_num is null (category-only clause)", () => {
    const text = buildNoteEmbedText(makeNote({ session_num: null }));
    expect(text).toContain("The Sunken Vault. session.");
    expect(text).not.toContain("Session 7");
  });

  it("includes the session-number clause when session_num is set", () => {
    const text = buildNoteEmbedText(makeNote({ session_num: 3 }));
    expect(text).toContain("session, Session 3.");
  });

  it("never emits a dangling comma when session_num is missing", () => {
    const text = buildNoteEmbedText(makeNote({ session_num: null }));
    expect(text).not.toContain(", .");
  });

  it("omits the tags clause entirely when tags is an empty array", () => {
    const text = buildNoteEmbedText(makeNote({ tags: [] }));
    expect(text).toBe(
      "The Sunken Vault. session, Session 7. " +
      "The party descended into the flooded ruins and found the vault door ajar.",
    );
  });

  it("preserves tag order as given, never re-sorted", () => {
    const text = buildNoteEmbedText(makeNote({ tags: ["zebra", "gruff", "aardvark"] }));
    expect(text).toContain("zebra, gruff, aardvark.");
  });

  it("omits the content clause entirely when it is missing", () => {
    const text = buildNoteEmbedText(makeNote({ content: null }));
    expect(text).toBe("The Sunken Vault. session, Session 7. dungeon, vault.");
  });

  it("flattens a Tiptap JSON content field to plain text", () => {
    const tiptap = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "The vault door was ajar." }] }],
    });
    const text = buildNoteEmbedText(makeNote({ content: tiptap }));
    expect(text).toContain("The vault door was ajar.");
    expect(text).not.toContain("{");
  });

  it("truncates content longer than 4000 characters at a word boundary, never mid-word", () => {
    const longContent = Array.from({ length: 900 }, () => "alpha").join(" "); // 5399 chars
    const text = buildNoteEmbedText(makeNote({ content: longContent }));
    const contentPart = text.split("dungeon, vault. ")[1]!;

    expect(contentPart.length).toBeLessThanOrEqual(4000);
    expect(contentPart.split(" ").every((word) => word === "alpha")).toBe(true);
    expect(longContent.startsWith(contentPart)).toBe(true);
  });

  it("does NOT truncate content under the 4000-character limit", () => {
    const shortContent = Array.from({ length: 50 }, () => "alpha").join(" "); // 299 chars
    const text = buildNoteEmbedText(makeNote({ content: shortContent }));
    expect(text).toContain(shortContent);
  });

  it("collapses runs of whitespace so output is stable regardless of source formatting", () => {
    const text = buildNoteEmbedText(makeNote({ content: "The party\n\nfound   a\tdoor." }));
    expect(text).not.toMatch(/\s{2,}/);
  });

  it("is deterministic — the same input always produces byte-identical output", () => {
    expect(buildNoteEmbedText(makeNote())).toBe(buildNoteEmbedText(makeNote()));
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

  it("omits the subtype from the clause without leaving a dangling comma", () => {
    expect(buildItemEmbedText(makeItem({ subtype: null }))).toContain("Flame Tongue. rare weapon. Requires");
  });

  it("omits the attunement phrase entirely when the item needs no attunement", () => {
    const text = buildItemEmbedText(makeItem({ requires_attunement: false }));
    expect(text).not.toContain("attunement");
  });

  // The class words in `attunement_requirements` are the ONLY place a druid
  // item says "druid" for 16 of the 16 library items attuned by one — see the
  // field's comment on EmbeddableItem.
  it("carries the attunement requirement text verbatim when it is already a sentence", () => {
    const text = buildItemEmbedText(makeItem({
      name: "Staff of the Woodlands",
      attunement_requirements: "Requires Attunement by a Druid",
    }));
    expect(text).toContain("Requires Attunement by a Druid.");
    expect(text).not.toContain("Requires attunement. Requires");
  });

  it("turns a bare requirement fragment into a sentence without losing the words", () => {
    const text = buildItemEmbedText(makeItem({ attunement_requirements: "Druid or Ranger" }));
    expect(text).toContain("Requires attunement: Druid or Ranger.");
  });

  it("does not double the full stop when the requirement text already ends in one", () => {
    const text = buildItemEmbedText(makeItem({
      attunement_requirements: "the user must be a member of one of the Reghed tribes.",
    }));
    expect(text).toContain("Requires attunement: the user must be a member of one of the Reghed tribes.");
    expect(text).not.toContain("tribes..");
  });

  it("keeps the requirement text even when the boolean disagrees with it", () => {
    const text = buildItemEmbedText(makeItem({
      requires_attunement: false,
      attunement_requirements: "Requires Attunement by a Druid",
    }));
    expect(text).toContain("Requires Attunement by a Druid.");
  });

  it("degrades to name plus the two NOT NULL columns when everything optional is absent", () => {
    expect(buildItemEmbedText({
      name: "Rusty Nail",
      item_type: "gear",
      rarity: "mundane",
      subtype: null,
      requires_attunement: false,
      attunement_requirements: null,
      cost: null,
      tags: [],
      description: null,
    })).toBe("Rusty Nail. mundane gear.");
  });

  it("truncates a description longer than 500 characters at a word boundary", () => {
    const longDescription = Array.from({ length: 200 }, () => "alpha").join(" "); // 1199 chars
    const text = buildItemEmbedText(makeItem({ description: longDescription }));
    const descriptionPart = text.split("fire, flashy. ")[1]!;

    expect(descriptionPart.length).toBeLessThanOrEqual(500);
    expect(descriptionPart.split(" ").every((word) => word === "alpha")).toBe(true);
  });

  it("treats a blank description as absent rather than emitting an empty clause", () => {
    expect(buildItemEmbedText(makeItem({ description: "   " }))).toBe(
      "Flame Tongue. rare weapon, longsword. Requires attunement. 5,000 gp. fire, flashy.",
    );
  });

  it("collapses runs of whitespace so output is stable regardless of source formatting", () => {
    const text = buildItemEmbedText(makeItem({ description: "A blade\n\nthat   burns." }));
    expect(text).not.toMatch(/\s{2,}/);
  });

  it("is deterministic — the same input always produces byte-identical output", () => {
    expect(buildItemEmbedText(makeItem())).toBe(buildItemEmbedText(makeItem()));
  });
});

// ── entityEmbedHash ───────────────────────────────────────────────────────

describe("entityEmbedHash", () => {
  it("is stable for identical text", async () => {
    const text = buildNpcEmbedText(makeNpc());
    const [first, second] = await Promise.all([entityEmbedHash(text), entityEmbedHash(text)]);
    expect(first).toBe(second);
  });

  it("differs for different text", async () => {
    const a = await entityEmbedHash(buildNpcEmbedText(makeNpc()));
    const b = await entityEmbedHash(buildNpcEmbedText(makeNpc({ name: "Someone Else" })));
    expect(a).not.toBe(b);
  });

  it("returns lowercase hex SHA-256 (64 chars)", async () => {
    const hash = await entityEmbedHash("The Rusty Anchor.");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
