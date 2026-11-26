import { describe, expect, it } from "vitest";
import {
  habitatsForBlock,
  habitatsLines,
  worldBlockFromRows,
  worldBlockText,
  worldImageSetting,
  type CanonRowForBlock,
  type HabitatForBlock,
  type PeopleRow,
} from "./worldBlock";
import type { EcologyLink, EcologySpecies, HabitatEcology } from "./worldBlockEcology";

/** The block for a campaign that has said nothing of its peoples, unless a test says otherwise. */
const build = (setting: string | null, rows: CanonRowForBlock[], peoples: readonly PeopleRow[] = []) => worldBlockFromRows(setting, rows, peoples, []);

let order = 0;
const row = (over: Partial<CanonRowForBlock>): CanonRowForBlock => ({
  part: "premise",
  premise_kind: null,
  knowledge: null,
  title: "",
  body: null,
  sort_order: order++,
  reference_images: [],
  ...over,
});
const premise = (premise_kind: string, title: string, body: string | null = null) =>
  row({ part: "premise", premise_kind, title, body });
const truth = (knowledge: string, title: string) => row({ part: "truth", knowledge, title });

describe("worldBlockFromRows", () => {
  it("takes the look's pictures as its style references, and no other entry's", () => {
    const block = build(null, [
      row({ part: "premise", premise_kind: "pitch", title: "Open", reference_images: ["https://x/pitch.webp"] }),
      row({ part: "premise", premise_kind: "look", title: "Gouache", reference_images: ["https://x/a.webp", "https://x/b.webp"] }),
    ]);
    expect(block.lookReferences).toEqual(["https://x/a.webp", "https://x/b.webp"]);
  });

  it("never lets a secret or a some-know truth reach a generator", () => {
    const block = build("Sothery", [
      truth("all", "The sun is a door"),
      truth("some", "The abbot is a lich"),
      truth("secret", "The king is dead"),
    ]);
    expect(block.truths).toEqual(["The sun is a door"]);
    const text = worldBlockText(block) + worldImageSetting(block);
    expect(text).not.toContain("lich");
    expect(text).not.toContain("king is dead");
  });

  it("ignores forces, secrets, questions, lore and chronicle entries entirely", () => {
    const block = build(null, [
      row({ part: "force", title: "The Pale Court" }),
      row({ part: "secret", title: "Hidden crypt" }),
      row({ part: "lore", title: "Old war" }),
    ]);
    expect(worldBlockText(block)).toBe("");
  });

  it("reads a premise entry's title, falling back to its body as plain text", () => {
    const body = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A drowned kingdom." }] }],
    });
    const block = build(null, [premise("pitch", "", body)]);
    expect(block.pitch).toBe("A drowned kingdom.");
  });

  // Bug caught: a pitch with a heading and a body (the book import) reached every generator as its heading alone.
  it("reads a text premise's body under its heading, and the title alone when there is no body", () => {
    const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A drowned kingdom." }] }] });
    expect(build(null, [premise("pitch", "The Sunken Crown", body)]).pitch).toBe("The Sunken Crown: A drowned kingdom.");
    expect(build(null, [premise("voice", "Dry and warm", null)]).voice).toBe("Dry and warm");
    expect(build(null, [premise("line", "Gore", body)]).lines).toEqual(["Gore"]);
  });

  // Bug caught: a secret block inside a premise body went to every generator.
  it("never lets a DM-only block of a premise body through", () => {
    const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Open." }] }, { type: "secretBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "HIDDEN" }] }] }] });
    expect(build(null, [premise("pitch", "", body)]).pitch).toBe("Open.");
  });

  it("orders entries by sort_order and joins several voice entries", () => {
    const block = build(null, [
      row({ part: "premise", premise_kind: "voice", title: "second", sort_order: 5 }),
      row({ part: "premise", premise_kind: "voice", title: "first", sort_order: 1 }),
    ]);
    expect(block.voice).toBe("first\n\nsecond");
  });
});

describe("worldBlockText", () => {
  it("is empty for a campaign with no canon, so a prompt gains nothing", () => {
    expect(worldBlockText(build(null, []))).toBe("");
    expect(worldBlockText(build("   ", []))).toBe("");
  });

  it("renders lines and veils as binding rules, not as flavour", () => {
    const text = worldBlockText(
      build("Sothery", [
        premise("line", "Harm to children"),
        premise("veil", "Torture"),
      ]),
    );
    expect(text).toContain("Never include, in any form:\n- Harm to children");
    expect(text).toContain("May happen, but only off the page:\n- Torture");
  });

  it("names the world, pitch, voice and truths under their headings and leaves empty ones out", () => {
    const text = worldBlockText(
      build("Sothery", [
        premise("pitch", "Cosy horror"),
        premise("voice", "Dry and warm"),
        truth("all", "Winter never ends"),
      ]),
    );
    expect(text).toContain("## World\nSothery");
    expect(text).toContain("## Pitch\nCosy horror");
    expect(text).toContain("## Voice\nDry and warm");
    expect(text).toContain("## Truths of the world\n- Winter never ends");
    expect(text).not.toContain("## Themes");
    expect(text).not.toContain("## Lines");
  });
});

describe("the peoples of the world", () => {
  // Bug caught: a world where elves are 80% of the populace reached the generators as silence, so they invented humans.
  it("tells every generator the shares, largest first, with the remainder as anyone else, and the instruction", () => {
    const text = worldBlockText(build(null, [], [{ name: "Human", percent: 15 }, { name: "Elf", percent: 80 }]));
    expect(text).toContain("## Peoples of the world\nElf 80%, Human 15%, anyone else 5%\n");
    expect(text).toContain("choose who they are at these odds; do not default to humans.");
  });

  // Bug caught: an empty list (a campaign that never said) added an empty section, or a "100% anyone else" line.
  it("adds nothing when no peoples are listed", () => {
    const block = build(null, [], []);
    expect(block.peoples).toBeNull();
    expect(worldBlockText(block)).toBe("");
  });

  it("says 100% without an anyone-else and leaves a share of zero out", () => {
    expect(build(null, [], [{ name: "Elf", percent: 100 }, { name: "Orc", percent: 0 }]).peoples).toBe("Elf 100%");
  });
});

describe("peoples with a name and words", () => {
  const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

  // Bug: a culture reached the generators as its species alone, so "the Vell" were just humans with no way of life.
  it("names a people over its record and says what they are like, in a sentence", () => {
    const text = worldBlockText(build(null, [], [
      { name: "the Vell", own_name: "the Vell", record_name: "Human", percent: 30, body: doc("Salt traders who bury their dead at sea. They distrust the hills.") },
      { name: "Elf", percent: 50 },
    ]));
    expect(text).toContain("## Peoples of the world\nElf, 50%\nthe Vell (Human), 30%: Salt traders who bury their dead at sea.\nanyone else, 20%\n");
  });

  // Bug: a long body went into every generator's prompt in full.
  it("trims what they are like to about 200 characters", () => {
    const block = build(null, [], [{ name: "Elf", percent: 100, body: doc("a".repeat(500)) }]);
    expect(block.peoples!.length).toBeLessThan(230);
    expect(block.peoples).toContain("…");
  });

  // Bug: a DM-only passage in a people's description was told to every generator.
  it("leaves a secret passage of the description out", () => {
    const body = JSON.stringify({ type: "doc", content: [{ type: "secretBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "HIDDEN-MARKER" }] }] }, { type: "paragraph", content: [{ type: "text", text: "Proud." }] }] });
    expect(build(null, [], [{ name: "Elf", percent: 100, body }]).peoples).not.toContain("HIDDEN-MARKER");
  });
});

describe("what the world commonly believes", () => {
  // Bug: only the cover story may leave a secret; the block must hold the line and nothing of the secret's own words.
  it("lists the cover stories in order and nothing else", () => {
    const block = worldBlockFromRows(null, [], [], [], undefined, [
      { cover_story: "The king died of fever.", sort_order: 2 },
      { cover_story: "  ", sort_order: 3 },
      { cover_story: "The bridge fell in a storm.", sort_order: 1 },
    ]);
    expect(block.commonBeliefs).toEqual(["The bridge fell in a storm.", "The king died of fever."]);
    expect(worldBlockText(block)).toContain("## Commonly believed\n- The bridge fell in a storm.\n- The king died of fever.");
  });

  it("adds no section when no secret has a cover story", () => {
    expect(worldBlockText(build(null, [], []))).toBe("");
  });
});

describe("worldImageSetting", () => {
  it("carries the name, the look and the lines, never the pitch or the voice", () => {
    const setting = worldImageSetting(
      build("Sothery", [
        premise("pitch", "SECRET-PITCH-MARKER"),
        premise("voice", "VOICE-MARKER"),
        premise("look", "Gouache, muted greens"),
        premise("line", "Gore"),
      ]),
    );
    expect(setting).toContain("Sothery");
    expect(setting).toContain("Gouache, muted greens");
    expect(setting).toContain("Never depict: Gore");
    expect(setting).not.toContain("PITCH");
    expect(setting).not.toContain("VOICE");
  });

  // Bug caught: an old setting prompt that carried the visual style (migrated into the pitch) was lost from every picture.
  it("falls back to the pitch, capped, when there is no look, and still never carries the voice", () => {
    const setting = worldImageSetting(
      build("Sothery", [premise("pitch", `Watercolour fens. ${"x".repeat(600)}`), premise("voice", "VOICE-MARKER")]),
    );
    expect(setting).toContain("Setting: Watercolour fens.");
    expect(setting.length).toBeLessThan(450);
    expect(setting).not.toContain("VOICE");
  });

  it("is empty when there is nothing to say", () => {
    expect(worldImageSetting(build(null, []))).toBe("");
  });
});

describe("mentions in canon text", () => {
  const mentioning = (before: string, after: string) =>
    JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: before }, { type: "entityMention", attrs: { id: "n1", entityType: "npc" } }, { type: "text", text: after }] }],
    });
  const nameOf = (type: string, id: string) => (type === "npc" && id === "n1" ? "Maren Voss" : null);

  // Bug the resolver exists for: a mention stores no name, so "The bell was sold by @Maren" reached every generator
  // as "The bell was sold by".
  it("reads a pitch's mention and a truth's body with the name in the block", () => {
    const rows = [
      premise("pitch", "", mentioning("The bell was sold by ", " to the ferryman.")),
      premise("theme", "Debt", mentioning("Owed to ", ".")),
    ];
    const text = worldBlockText(worldBlockFromRows("Sothery", rows, [], [], nameOf));
    expect(text).toContain("The bell was sold by Maren Voss to the ferryman.");
    expect(text).toContain("Debt: Owed to Maren Voss.");
    expect(worldBlockText(worldBlockFromRows("Sothery", rows, [], []))).toContain("The bell was sold by  to the ferryman.");
  });
});

describe("the life of the world", () => {
  const sp = (id: string, name: string, extra: Partial<EcologySpecies> = {}): EcologySpecies => ({
    id, name, kingdom: "animal", livesAs: null, abundance: null, clade: null, ...extra,
  });
  const eco = (over: Partial<HabitatEcology>): HabitatEcology => ({ otherPercent: null, species: [], life: [], links: [], ...over });
  const habitat = (name: string, places: string[], ecology: HabitatEcology): HabitatForBlock => ({ name, places, ecology });
  const withHabitats = (list: HabitatForBlock[]) => worldBlockText(worldBlockFromRows(null, [], [], list));

  // Bug: a DM-set share was overwritten by the worked-out one, or an unset one read as 0 and vanished.
  it("keeps a set share, works an unset one out from abundance, and names species with the abundance word", () => {
    const lines = habitatsLines([
      habitat("Marsh", ["the Marsh"], eco({
        species: [sp("a", "Puffrush", { abundance: "common" }), sp("b", "Pith Piper", { abundance: "common" })],
        life: [{ formId: "fa", speciesId: "a", percent: 15 }, { formId: "fb", speciesId: "b", percent: null }],
      })),
    ]);
    // Set 15; "anything else" defaults to 10; the unset form takes what is left: 100 - 10 - 15 = 75.
    expect(lines).toBe("Marsh (the Marsh): Pith Piper 75% (common), Puffrush 15% (common), anything else 10%");
  });

  // Bug: a species with several forms listed each form apart instead of as one species share.
  it("adds a species' forms into one share", () => {
    const lines = habitatsLines([
      habitat("Marsh", [], eco({
        otherPercent: 0,
        species: [sp("b", "Pith Piper")],
        life: [{ formId: "f1", speciesId: "b", percent: 20 }, { formId: "f2", speciesId: "b", percent: 3.4 }],
      })),
    ]);
    expect(lines).toBe("Marsh: Pith Piper 23.4%");
  });

  // Bug: a plant nobody fights vanished from the block, so a generator never heard it exists.
  it("lists a species with no form on the roll as never met", () => {
    const lines = habitatsLines([
      habitat("Marsh", [], eco({
        species: [sp("a", "Puffrush"), sp("g", "Grub-duster", { kingdom: "plant" })],
        life: [{ formId: "fa", speciesId: "a", percent: 50 }],
      })),
    ]);
    expect(lines).toContain("\n  Also here, never met as an encounter: Grub-duster (plant).");
    expect(lines.split("\n")[0]).not.toContain("Grub-duster");
  });

  const here = [sp("r", "Rust Robber"), sp("p", "Puffrush"), sp("s", "Squillick")];
  const link = (over: Partial<EcologyLink>): EcologyLink => ({ kind: "eats", fromSpeciesId: "r", fromForm: null, toSpeciesId: "p", toForm: null, ...over });

  it("words the food web, with a narrowed form before its species and 'other animals' for no target", () => {
    const lines = habitatsLines([
      habitat("Marsh", [], eco({
        species: here,
        links: [link({}), link({ kind: "eats", fromSpeciesId: "s", toForm: "Young" }), link({ kind: "carries", fromSpeciesId: "p", toSpeciesId: null })],
      })),
    ]);
    expect(lines).toContain("  Food web: Rust Robber eats Puffrush; Squillick eats young Puffrush; Puffrush carries other animals.");
  });

  // Bug: a link to a species that lives elsewhere told the generator about food that is not in this country.
  it("leaves out a link whose species does not live in the habitat", () => {
    const lines = habitatsLines([habitat("Marsh", [], eco({ species: here, links: [link({ toSpeciesId: "elsewhere" }), link({ fromSpeciesId: "elsewhere" })] }))]);
    expect(lines).not.toContain("Food web");
  });

  // Bug: a food web of hundreds of links drowned the block.
  it("caps the food web at 12 links, keeping those of the most met species", () => {
    const many = Array.from({ length: 15 }, (_, i) => sp(`x${i}`, `Beast ${i}`));
    const life = many.map((m, i) => ({ formId: `f${i}`, speciesId: m.id, percent: i === 14 ? 50 : 1 }));
    const links = many.map((m) => link({ fromSpeciesId: m.id, toSpeciesId: null, kind: "shelters" }));
    const lines = habitatsLines([habitat("Marsh", [], eco({ species: many, life, links }))]);
    const web = lines.split("\n").find((l) => l.includes("Food web")) ?? "";
    expect(web.split("; ")).toHaveLength(12);
    expect(web).toContain("Beast 14 shelters");
  });

  // Bug: kin were named by nothing, or species of different clades were lumped together.
  it("names species that share a clade as kin", () => {
    const rub = { id: "c1", name: "Rubiursus" };
    const lines = habitatsLines([
      habitat("Wood", [], eco({ species: [sp("a", "Bramblebear", { clade: rub }), sp("b", "Bristlewick", { clade: rub }), sp("c", "Lone Owl", { clade: { id: "c2", name: "Strix" } })] })),
    ]);
    expect(lines).toContain("  Kin: Bramblebear and Bristlewick (Rubiursus).");
    expect(lines).not.toContain("Lone Owl (Strix)");
  });

  // Bug: an empty ecology still wrote a heading and an instruction about odds that name nothing.
  it("adds nothing for an empty ecology, nor for a habitat with no place and no species", () => {
    expect(withHabitats([])).toBe("");
    expect(withHabitats([habitat("Barren", [], eco({}))])).toBe("");
    expect(worldBlockFromRows(null, [], [], []).habitats).toBeNull();
  });

  it("closes with the instruction to keep to what eats what", () => {
    expect(withHabitats([habitat("Fen", ["Mere"], eco({}))])).toContain("keep to what eats what.");
  });

  // Bug: the join took every habitat's species for each habitat, or kept a place the reader may not read as "undefined".
  it("joins each habitat only to its own places, species and links, and leaves out a place that cannot be read", () => {
    const joined = habitatsForBlock({
      habitats: [{ id: "h1", name: "Marsh", other_percent: 5 }, { id: "h2", name: "Hills", other_percent: null }],
      places: [{ habitat_id: "h1", location: { name: "Mere" } }, { habitat_id: "h1", location: null }, { habitat_id: "h2", location: { name: "Tor" } }],
      life: [{ habitat_id: "h1", species_id: "a", form_id: "fa", percent: null }],
      habitatSpecies: [{ habitat_id: "h1", species_id: "a", abundance: "rare" }, { habitat_id: "h2", species_id: "g", abundance: null }],
      species: [
        { id: "a", name: "Eel", kingdom: "animal", lives_as: null, clade_id: "c" },
        { id: "g", name: "Goat", kingdom: "animal", lives_as: "herd", clade_id: null },
      ],
      forms: [{ id: "fa", species_id: "a", label: "Adult" }],
      links: [
        { from_species_id: "a", kind: "eats", to_species_id: null, from_form_id: "fa", to_form_id: null, habitat_id: "h1" },
        { from_species_id: "g", kind: "eats", to_species_id: null, from_form_id: null, to_form_id: null, habitat_id: "h2" },
      ],
      clades: [{ id: "c", name: "Anguilla" }],
    });
    expect(joined[0].places).toEqual(["Mere"]);
    expect(joined[0].ecology.otherPercent).toBe(5);
    expect(joined[0].ecology.species).toEqual([{ id: "a", name: "Eel", kingdom: "animal", livesAs: null, abundance: "rare", clade: { id: "c", name: "Anguilla" } }]);
    expect(joined[0].ecology.links).toEqual([{ kind: "eats", fromSpeciesId: "a", fromForm: "Adult", toSpeciesId: null, toForm: null }]);
    expect(joined[1].places).toEqual(["Tor"]);
    expect(joined[1].ecology.species.map((s) => s.name)).toEqual(["Goat"]);
    expect(joined[1].ecology.life).toEqual([]);
  });
});
