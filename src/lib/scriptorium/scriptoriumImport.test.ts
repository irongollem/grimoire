// @vitest-environment happy-dom
import { emptyDefenses, type Defenses } from "@/types/statBlock.types";
import { describe, it, expect } from "vitest";
import {
  formatNpcForScriptorium,
  formatMonsterForScriptorium,
  formatEntityEmbedBodyHtml,
  formatSpellForScriptorium,
  formatLocationForScriptorium,
  formatQuestForScriptorium,
  formatItemForScriptorium,
} from "@/lib/scriptorium/scriptoriumImport";
import type { Spell } from "@/types/spell.types";
import type { Location } from "@/types/location.types";
import type { Quest, QuestObjective } from "@/types/quest.types";
import type { Npc } from "@/types/npc.types";
import type { Monster, MonsterStatBlock } from "@/types/monster.types";
import type { Item } from "@/types/item.types";

function npc(overrides: Partial<Npc> = {}): Npc {
  return {
    name: "Adewale D'uun",
    portrait_url: "https://example.com/adewale.webp",
    race: "Human (Chultan)",
    alignment: "Neutral Good",
    appearance: "Tall and broad-shouldered.",
    ...overrides,
  } as unknown as Npc;
}

describe("formatNpcForScriptorium — portrait + cutout (#917 story 4)", () => {
  it("renders the picture as a centered figure, never a float", () => {
    const { content } = formatNpcForScriptorium(npc());
    expect(content).toContain("https://example.com/adewale.webp");
    expect(content).toContain("sc-entity-art--picture");
    expect(content).not.toMatch(/float:\s*right/);
  });

  it("places the portrait after the name heading", () => {
    const { content } = formatNpcForScriptorium(npc());
    expect(content.indexOf("<h1>")).toBeLessThan(content.indexOf("<img"));
  });

  it("also renders the cutout when the NPC has one", () => {
    const { content } = formatNpcForScriptorium(
      npc({ cutout_url: "https://example.com/adewale-cutout.webp" }),
    );
    expect(content).toContain("sc-entity-art--cutout");
    expect(content).toContain("https://example.com/adewale-cutout.webp");
  });

  it("omits the art entirely when the NPC has neither image", () => {
    const { content } = formatNpcForScriptorium(npc({ portrait_url: null }));
    expect(content).not.toContain("<img");
  });
});

function monster(overrides: Partial<Monster> = {}): Monster {
  return {
    name: "Owlbear",
    size: "large",
    monster_type: "monstrosity",
    alignment: "unaligned",
    image_url: null,
    cutout_url: null,
    stat_block: {
      armor_class: 13,
      hit_points: 59,
      speed: "40 ft.",
      challenge_rating: "3",
      str: 20,
      dex: 12,
      con: 17,
      int: 3,
      wis: 12,
      cha: 7,
      defenses: emptyDefenses(),
    },
    ...overrides,
  } as unknown as Monster;
}

describe("formatEntityEmbedBodyHtml", () => {
  it("dispatches an npc input to the npc formatter's body HTML", () => {
    const html = formatEntityEmbedBodyHtml({
      type: "npc",
      npc: npc({ location_id: "loc-1" }),
      locationName: "Baldur's Gate",
    });
    expect(html).toContain("Adewale D'uun");
    expect(html).toContain("Baldur's Gate");
  });

  it("dispatches a monster input to the monster formatter's body HTML", () => {
    const html = formatEntityEmbedBodyHtml({ type: "monster", monster: monster() });
    expect(html).toContain("Owlbear");
    expect(html).toContain('<strong>CR</strong> 3');
  });

  it("matches the equivalent formatNpcForScriptorium output exactly", () => {
    const n = npc();
    const viaFormatter = formatNpcForScriptorium(n, "Baldur's Gate", "phb2014").content;
    const viaDispatch = formatEntityEmbedBodyHtml(
      { type: "npc", npc: n, locationName: "Baldur's Gate" },
      "phb2014",
    );
    expect(viaDispatch).toBe(viaFormatter);
  });
});

describe("formatMonsterForScriptorium — stat block frame (#915 story 6)", () => {
  it("renders the name as the block's own title, never a document heading", () => {
    const { content } = formatMonsterForScriptorium(monster());
    expect(content).toContain('<p class="sc-statblock-name">Owlbear</p>');
    expect(content).not.toMatch(/<h1>Owlbear/);
  });

  it("frames the block and defaults to the column size for a short stat block", () => {
    const { content } = formatMonsterForScriptorium(monster());
    expect(content).toContain("sc-statblock sc-statblock--column");
  });

  // Text length, not entry count, decides the size (#915 story 6 round 2) —
  // seven short one-line entries stay a column; two long ones (each well past
  // a paragraph) push the same block over WIDE_STATBLOCK_CHAR_THRESHOLD.
  const LONG_DESCRIPTION =
    "This trait's description runs on at considerable length, well past what a single short line would hold, " +
    "the way an actual creature's action or trait often does in practice with a full attack routine and damage " +
    "roll spelled out in prose, plus a second sentence of exactly the same sort so the whole entry runs long. ";

  it("stays the column size for many SHORT trait/action entries (text length, not item count, decides)", () => {
    const trait = { name: "Trait", description: "Does a thing.", structured: { kind: "other" as const, source: "manual" as const } };
    const many: Partial<MonsterStatBlock> = {
      special_abilities: [trait, trait, trait],
      actions: [trait, trait, trait, trait],
    };
    const { content } = formatMonsterForScriptorium(monster({ stat_block: { ...monster().stat_block, ...many } }));
    expect(content).toContain("sc-statblock--column");
    expect(content).not.toContain("sc-statblock--wide");
  });

  it("switches to the wide size once the stat block's own text passes the length threshold", () => {
    const long = { name: "Trait", description: LONG_DESCRIPTION, structured: { kind: "other" as const, source: "manual" as const } };
    const many: Partial<MonsterStatBlock> = {
      special_abilities: [long, long, long],
      actions: [long, long, long],
    };
    const { content } = formatMonsterForScriptorium(monster({ stat_block: { ...monster().stat_block, ...many } }));
    expect(content).toContain("sc-statblock--wide");
    expect(content).not.toContain("sc-statblock--column");
  });

  // A visible entry heading (the creature has lore) takes room from the
  // column, so a mid-length block that fits a column on its own goes wide
  // once lore puts the heading above it. Calibrated on the demo booklet: the
  // Marzipan Sentry and Toffee Maw overflowed at the single threshold.
  it("goes wide at a shorter length when lore makes the entry heading visible", () => {
    const medium = {
      structured: { kind: "other" as const, source: "manual" as const },
      name: "Trait",
      description:
        "A mid-length trait that runs to a couple of sentences, long enough that four of them together " +
        "push the block past a thousand characters without reaching the page-wide threshold on their own.",
    };
    const block = { ...monster().stat_block, special_abilities: [medium, medium], actions: [medium, medium, medium] };
    const noLore = formatMonsterForScriptorium(monster({ stat_block: block })).content;
    const withLore = formatMonsterForScriptorium(
      monster({ stat_block: block, description: "An owlbear is a lot of bear with a beak." }),
    ).content;
    expect(noLore).toContain("sc-statblock--column");
    expect(withLore).toContain("sc-statblock--wide");
  });

  it("title-cases the type line with a comma before the alignment (onednd2024)", () => {
    const { content } = formatMonsterForScriptorium(
      monster({ size: "small", monster_type: "construct", alignment: "unaligned" }),
    );
    expect(content).toContain("Small Construct, Unaligned");
  });

  it("capitalises skill names", () => {
    const { content } = formatMonsterForScriptorium(
      monster({ stat_block: { ...monster().stat_block, skills: { stealth: "+6" } } }),
    );
    expect(content).toContain("Stealth +6");
    expect(content).not.toContain("stealth +6");
  });

  it("renders typed defenses as escaped property lines", () => {
    const defenses: Defenses = {
      resistances: [{ types: ["cold"] }],
      immunities: [{ types: ["poison"] }],
      vulnerabilities: [],
      condition_immunities: ["Charmed"],
      notes: "<b>Fey Resilience</b>",
    };
    const { content } = formatMonsterForScriptorium(
      monster({ stat_block: { ...monster().stat_block, defenses } }),
    );
    expect(content).toContain("Damage Resistances</strong> cold");
    expect(content).toContain("Damage Immunities</strong> poison");
    expect(content).toContain("Condition Immunities</strong> charmed");
    expect(content).not.toContain("Damage Vulnerabilities");
    expect(content).toContain("&lt;b&gt;Fey Resilience&lt;/b&gt;");
    expect(content).not.toContain("<b>Fey Resilience</b>");
  });

  it("adds an Initiative line derived from DEX when onednd2024 and none is stored", () => {
    // dex 12 → mod +1 → Initiative +1 (11)
    const { content } = formatMonsterForScriptorium(monster());
    expect(content).toContain("Initiative");
    expect(content).toContain("+1 (11)");
  });

  it("uses an explicit initiative_bonus over the derived DEX modifier", () => {
    const { content } = formatMonsterForScriptorium(
      monster({ stat_block: { ...monster().stat_block, initiative_bonus: 5 } }),
    );
    expect(content).toContain("+5 (15)");
  });

  it("prints the onednd2024 CR line as 'CR N (XP …; PB +N)'", () => {
    const { content } = formatMonsterForScriptorium(monster());
    // CR 3 → 700 XP, PB derived from CR (<=4 → +2)
    expect(content).toContain("<strong>CR</strong> 3 (XP 700; PB +2)");
  });

  it("prints the phb2014 CR line as 'Challenge N (N XP)' plus a Proficiency Bonus line", () => {
    const { content } = formatMonsterForScriptorium(monster(), "phb2014");
    expect(content).toContain("<strong>Challenge</strong> 3 (700 XP)");
    expect(content).toContain("<strong>Proficiency Bonus</strong> +2");
    expect(content).not.toMatch(/<strong>CR<\/strong>/);
  });

  it("does not use Initiative for phb2014", () => {
    const { content } = formatMonsterForScriptorium(monster(), "phb2014");
    expect(content).not.toContain("Initiative");
  });

  it("labels trait/action sections with h4, not a document heading", () => {
    const { content } = formatMonsterForScriptorium(
      monster({
        stat_block: {
          ...monster().stat_block,
          special_abilities: [{ name: "Keen Smell", description: "Advantage on smell checks.", structured: { kind: "other" as const, source: "manual" as const } }],
          actions: [{ name: "Bite", description: "Melee attack.", structured: { kind: "other" as const, source: "manual" as const } }],
        },
      }),
    );
    expect(content).toContain('<h4 class="sc-statblock-section-title">Traits</h4>');
    expect(content).toContain('<h4 class="sc-statblock-section-title">Actions</h4>');
    expect(content).not.toMatch(/<h2>Special Abilities/);
    expect(content).not.toMatch(/<h2>Actions/);
  });

  it("renders the ability scores as one two-panel table for onednd2024 (never a saturated fill)", () => {
    const { content } = formatMonsterForScriptorium(monster());
    expect(content).toContain("sc-ability-table--2024");
    expect(content).toContain("sc-abil-physical");
    expect(content).toContain("sc-abil-mental");
  });

  it("renders the ability scores as a single row of six for phb2014", () => {
    const { content } = formatMonsterForScriptorium(monster(), "phb2014");
    expect(content).toContain("sc-ability-table--classic");
  });
});

describe("formatMonsterForScriptorium — entry composition (heading, lore, art)", () => {
  // #915 story 6 round 2: the column-break mechanism (a manual
  // `.sc-column-break` Paged.js didn't reliably honour, sending art/lore to
  // an otherwise empty next page) is gone. Every entry is now
  // `.sc-statblock-entry`, a deterministic grid: two side-by-side cells for a
  // column-size entry, or a stat block band plus a full-width art/lore slot
  // for a wide one.

  it("opens with a document heading naming the creature, inside the entry wrapper", () => {
    const { content } = formatMonsterForScriptorium(monster());
    expect(content).toMatch(/^<div class="sc-statblock-entry sc-statblock-entry--column"/);
    expect(content).toContain('<h2 class="sc-statblock-entry-heading');
    expect(content).toContain(">Owlbear</h2>");
  });

  it("hides the entry heading visually when there is no lore, but keeps it for the TOC", () => {
    const { content } = formatMonsterForScriptorium(monster({ description: null }));
    expect(content).toContain("sc-statblock-entry-heading sc-statblock-entry-heading--no-lore");
  });

  it("shows both the entry heading and the frame's own name when there is lore", () => {
    const { content } = formatMonsterForScriptorium(
      monster({ description: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Lore."}]}]}' }),
    );
    expect(content).not.toContain("sc-statblock-entry-heading--no-lore");
    expect(content).toContain('<p class="sc-statblock-name">Owlbear</p>');
  });

  it("treats a genuinely empty Tiptap description (no lore ever typed) as no lore, not as dumped JSON", () => {
    const { content } = formatMonsterForScriptorium(monster({ description: '{"type":"doc","content":[]}' }));
    expect(content).toContain("sc-statblock-entry-heading--no-lore");
    expect(content).not.toContain('"type":"doc"');
    expect(content).not.toMatch(/sc-statblock-entry-lore">\s*<p/);
  });

  it("converts a plain-text description (escaped) — both shapes exist in real data", () => {
    const { content } = formatMonsterForScriptorium(monster({ description: "Ampersands & <brackets> need escaping." }));
    expect(content).toContain("Ampersands &amp; &lt;brackets&gt; need escaping.");
    expect(content).not.toContain("Ampersands & <brackets>");
  });

  it("places the portrait in the entry's aside cell, classed for the showArt toggle", () => {
    const { content } = formatMonsterForScriptorium(monster({ image_url: "https://example.com/owlbear.webp" }));
    expect(content).toContain("sc-entity-art");
    expect(content).toContain('data-art-kind="picture"');
    const asideIndex = content.indexOf("sc-statblock-entry-aside");
    const artIndex = content.indexOf("sc-entity-art");
    expect(asideIndex).toBeGreaterThan(-1);
    expect(artIndex).toBeGreaterThan(asideIndex);
    // No float any more — the aside cell places it, not an inline float.
    expect(content).not.toMatch(/float:\s*right/);
  });

  it("omits the art figure entirely when the monster has no image", () => {
    const { content } = formatMonsterForScriptorium(monster({ image_url: null }));
    expect(content).not.toContain("sc-entity-art");
    expect(content).not.toContain("<img");
  });

  it("renders both the picture and the cutout figures when the monster has both (#917)", () => {
    const { content } = formatMonsterForScriptorium(
      monster({ image_url: "https://example.com/owlbear.webp", cutout_url: "https://example.com/owlbear-cut.webp" }),
    );
    expect(content).toContain('data-art-kind="picture"');
    expect(content).toContain('data-art-kind="cutout"');
    expect(content).toContain("https://example.com/owlbear.webp");
    expect(content).toContain("https://example.com/owlbear-cut.webp");
  });

  it("renders only the cutout figure when the monster has a cutout but no picture", () => {
    const { content } = formatMonsterForScriptorium(
      monster({ image_url: null, cutout_url: "https://example.com/owlbear-cut.webp" }),
    );
    expect(content).toContain('data-art-kind="cutout"');
    expect(content).not.toContain('data-art-kind="picture"');
  });

  it("places art and lore in the entry's aside cell for a column-size entry, with no column-break", () => {
    const { content } = formatMonsterForScriptorium(
      monster({
        image_url: "https://example.com/owlbear.webp",
        description: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Lore."}]}]}',
      }),
    );
    expect(content).toContain("sc-statblock-entry--column");
    expect(content).toContain("sc-statblock-entry-aside");
    expect(content).not.toContain("sc-column-break");
  });

  it("omits the aside cell entirely when there is no lore or art", () => {
    const { content } = formatMonsterForScriptorium(monster({ image_url: null, description: null }));
    expect(content).not.toContain("sc-statblock-entry-aside");
    expect(content).not.toContain("sc-column-break");
  });

  it("uses the wide entry class for a long stat block, still with no column-break", () => {
    const long = {
      structured: { kind: "other" as const, source: "manual" as const },
      name: "Trait",
      description:
        "This trait's description runs on at considerable length, well past what a single short line would " +
        "hold, the way an actual creature's action or trait often does in practice with a full attack routine " +
        "and damage roll spelled out in prose, plus a second sentence of the same sort so the entry runs long. ",
    };
    const many: Partial<MonsterStatBlock> = {
      special_abilities: [long, long, long],
      actions: [long, long, long],
    };
    const { content } = formatMonsterForScriptorium(
      monster({
        image_url: "https://example.com/owlbear.webp",
        stat_block: { ...monster().stat_block, ...many },
      }),
    );
    expect(content).toContain("sc-statblock-entry--wide");
    expect(content).toContain("sc-statblock--wide");
    expect(content).not.toContain("sc-column-break");
  });

  it("defaults a wide entry's band position to top", () => {
    const { content } = formatMonsterForScriptorium(monster());
    expect(content).toContain('data-band-position="top"');
  });
});

describe("item entries in a book (#917)", () => {
  const item = {
    id: "i1",
    name: 'The "Master\'s" Recipe Book',
    item_type: "gear",
    rarity: "uncommon",
    subtype: null,
    image_url: "https://example.com/book.webp",
    description: "Bound in candied leather.\n\nOne recipe works as a keepsake.",
    cost: null,
    weight: 2,
    damage_rolls: [],
    armor_class: null,
    properties: [],
    requires_attunement: false,
    attunement_requirements: null,
    charges: null,
    recharge: null,
    tags: [],
    source: null,
  } as unknown as Item;

  it("sets a treasure as an entry, not a chapter: small heading, type line, text, art alongside", () => {
    const html = formatEntityEmbedBodyHtml({ type: "item", item, spells: [] });
    const el = document.createElement("div");
    el.innerHTML = html;
    const entry = el.querySelector(".sc-item-entry");
    expect(entry).not.toBeNull();
    expect(el.querySelector("h1")).toBeNull();
    expect(entry?.querySelector("h3")?.textContent).toBe('The "Master\'s" Recipe Book');
    expect(entry?.querySelector(".sc-item-entry-type")?.textContent).toContain("Uncommon");
    expect(entry?.querySelector('img[data-art-kind="picture"]')?.getAttribute("alt")).toBe('The "Master\'s" Recipe Book');
    expect([...(entry?.querySelectorAll("p") ?? [])].map((p) => p.textContent)).toContain("One recipe works as a keepsake.");
  });

  it("leaves the art out when the item has none", () => {
    const html = formatEntityEmbedBodyHtml({ type: "item", item: { ...item, image_url: null }, spells: [] });
    expect(html).not.toContain("<img");
  });
});

// The ability-modifier and proficiency tables come from the SRD 5.2 creature
// rules: modifier = floor((score - 10) / 2), proficiency bonus by challenge
// rating in steps of four.
describe("formatMonsterForScriptorium — numbers on the stat block", () => {
  const withStats = (patch: Partial<MonsterStatBlock>) => monster({ stat_block: { ...monster().stat_block, ...patch } });

  it("rounds an odd score's modifier down and writes a negative one with a minus sign", () => {
    // DEX 9: (9 - 10) / 2 = -0.5, rounded down is -1 (SRD 5.2 "Ability Scores").
    const dex9 = formatMonsterForScriptorium(withStats({ dex: 9 })).content;
    expect(dex9).toContain("\u22121 (9)"); // initiative: -1, 10 + -1
    expect(dex9).toContain('<td class="sc-abil-mod sc-abil-physical">\u22121</td>');
  });

  it("writes a score of 10 as +0, never as a negative zero", () => {
    const content = formatMonsterForScriptorium(withStats({ dex: 10 })).content;
    expect(content).toContain("+0 (10)");
    expect(content).toContain('<td class="sc-abil-mod sc-abil-physical">+0</td>');
  });

  it.each([
    ["1/2", 2],
    ["4", 2],
    ["5", 3],
    ["8", 3],
    ["9", 4],
    ["12", 4],
    ["13", 5],
    ["16", 5],
    ["17", 6],
    ["21", 7],
    ["25", 8],
    ["29", 9],
  ])("a CR %s creature has a proficiency bonus of +%d", (cr, pb) => {
    const { content } = formatMonsterForScriptorium(withStats({ challenge_rating: cr }), "phb2014");
    expect(content).toContain(`<strong>Proficiency Bonus</strong> +${pb}`);
  });

  it("prints a stored proficiency bonus over the one the CR implies", () => {
    const { content } = formatMonsterForScriptorium(withStats({ proficiency_bonus: 6 }), "phb2014");
    expect(content).toContain("<strong>Proficiency Bonus</strong> +6");
  });

  it("an explicit saving throw replaces the plain modifier in the Save column; the rest keep theirs", () => {
    const { content } = formatMonsterForScriptorium(withStats({ saving_throws: "Dexterity +5, WIS +4" }));
    const saveOf = new Map(
      [...content.matchAll(/sc-abil-name sc-abil-(?:physical|mental)">([A-Z]+)<[\s\S]*?sc-abil-save sc-abil-(?:physical|mental)">([^<]+)</g)].map(
        (m) => [m[1], m[2]],
      ),
    );
    // Scores STR 20, DEX 12, CON 17, INT 3, WIS 12, CHA 7. DEX and WIS carry stated saves (+5, +4),
    // where their modifiers alone would give +1.
    expect(Object.fromEntries(saveOf)).toEqual({
      STR: "+5",
      DEX: "+5",
      CON: "+3",
      INT: "\u22124",
      WIS: "+4",
      CHA: "\u22122",
    });
  });

  it("onednd2024 keeps saves in the table; phb2014 lists them as a line", () => {
    const patch = { saving_throws: "DEX +5" };
    expect(formatMonsterForScriptorium(withStats(patch)).content).not.toContain("Saving Throws");
    expect(formatMonsterForScriptorium(withStats(patch), "phb2014").content).toContain(
      "<strong>Saving Throws</strong> DEX +5",
    );
  });

  it("prints skills, senses and languages only when the stat block has them", () => {
    const bare = formatMonsterForScriptorium(withStats({ skills: {} })).content;
    expect(bare).not.toContain("Skills");
    expect(bare).not.toContain("Senses");
    expect(bare).not.toContain("Languages");
    const full = formatMonsterForScriptorium(
      withStats({ skills: { sleight_of_hand: "+4" }, senses: "darkvision 60 ft.", languages: "Common" }),
    ).content;
    expect(full).toContain("Sleight Of Hand +4");
    expect(full).toContain("<strong>Senses</strong> darkvision 60 ft.");
    expect(full).toContain("<strong>Languages</strong> Common");
  });
});

describe("formatMonsterForScriptorium — sections and text", () => {
  const trait = (name: string, description: string) => ({
    name,
    description,
    structured: { kind: "other" as const, source: "manual" as const },
  });
  const withStats = (patch: Partial<MonsterStatBlock>, rest: Partial<Monster> = {}) =>
    monster({ ...rest, stat_block: { ...monster().stat_block, ...patch } });
  const titles = (content: string) =>
    [...content.matchAll(/sc-statblock-section-title">([^<]+)</g)].map((m) => m[1]);

  it("lists each kind of ability under its own title, in play order, and skips the empty ones", () => {
    const { content } = formatMonsterForScriptorium(
      withStats({
        special_abilities: [trait("A", "a")],
        actions: [trait("B", "b")],
        bonus_actions: [trait("C", "c")],
        reactions: [trait("D", "d")],
        lair_actions: [trait("E", "e")],
      }),
    );
    expect(titles(content)).toEqual(["Traits", "Actions", "Bonus Actions", "Reactions", "Lair Actions"]);
    expect(titles(formatMonsterForScriptorium(monster()).content)).toEqual([]);
  });

  it("states Legendary Resistance under the legendary actions, and opens that section for it alone", () => {
    const resistOnly = formatMonsterForScriptorium(withStats({ legendary_resistance: 3 })).content;
    expect(titles(resistOnly)).toEqual(["Legendary Actions"]);
    expect(resistOnly).toContain("Legendary Resistance (3/Day)");
    expect(resistOnly).toContain("If Owlbear fails a saving throw");
    const none = formatMonsterForScriptorium(withStats({ legendary_resistance: 0 })).content;
    expect(titles(none)).toEqual([]);
  });

  it("puts the DM notes after the entry, and only when there are some", () => {
    const withNotes = formatMonsterForScriptorium(withStats({}, { notes: "Hates fire." })).content;
    expect(withNotes).toContain("<h2>DM Notes</h2>");
    expect(withNotes).toContain("Hates fire.");
    expect(formatMonsterForScriptorium(withStats({}, { notes: null })).content).not.toContain("DM Notes");
  });

  it("reads a rich-text ability description and starts its first paragraph with the ability's name", () => {
    const body = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Pounces <fast>." }] }],
    });
    const { content } = formatMonsterForScriptorium(withStats({ actions: [trait("Pounce", body)] }));
    expect(content).toContain("<p><strong>Pounce.</strong> Pounces &lt;fast&gt;.</p>");
    expect(content).not.toContain('"type":"doc"');
  });

  it("italicises the run-in phrase of an attack once, and the whole of 'Melee or Ranged Weapon Attack:'", () => {
    const { content } = formatMonsterForScriptorium(
      withStats({
        actions: [
          trait("Claw", "Melee or Ranged Weapon Attack: +7 to hit. Hit: 10 damage. <em>Miss:</em> half."),
        ],
      }),
    );
    expect(content).toContain("<em>Melee or Ranged Weapon Attack:</em> +7 to hit.");
    expect(content).toContain("<em>Hit:</em> 10 damage.");
    expect(content).not.toContain("<em><em>"); // already-italic phrases are not wrapped again
    expect(content).toContain("<em>Miss:</em> half.");
  });
});

describe("formatNpcForScriptorium — identity and tags", () => {
  it("lists the location only when the NPC is placed at a location that has a name", () => {
    const placed = formatNpcForScriptorium(npc({ location_id: "loc-1" }), "Baldur's Gate").content;
    expect(placed).toContain("<strong>Location</strong> Baldur's Gate");
    expect(formatNpcForScriptorium(npc({ location_id: null }), "Baldur's Gate").content).not.toContain("Location");
    expect(formatNpcForScriptorium(npc({ location_id: "loc-1" }), null).content).not.toContain("Location");
  });

  it("tags the document with the npc kind and the race, lowercased and once", () => {
    expect(formatNpcForScriptorium(npc({ race: "Human", tags: ["Smith"] })).tags).toEqual(["npc", "smith", "human"]);
    expect(formatNpcForScriptorium(npc({ race: "Human", tags: ["human"] })).tags).toEqual(["npc", "human"]);
  });
});

describe("formatSpellForScriptorium", () => {
  function spell(patch: Partial<Spell> = {}): Spell {
    return {
      name: "Fire Bolt",
      level: 0,
      school: "evocation",
      casting_time: "1 action",
      casting_time_custom: null,
      range: "120 feet",
      range_custom: null,
      components: ["V", "S"],
      material: null,
      duration: "Instantaneous",
      duration_custom: null,
      concentration: false,
      ritual: false,
      description: "You hurl a mote of fire.",
      higher_levels: null,
      classes: [],
      tags: [],
      source: null,
      ...patch,
    } as unknown as Spell;
  }
  const html = (patch: Partial<Spell> = {}) => formatSpellForScriptorium(spell(patch)).content;

  it("uses the written value, and only swaps in the custom one when the choice is 'Special'", () => {
    const plain = html({ casting_time_custom: "ignored", range_custom: "ignored", duration_custom: "ignored" });
    expect(plain).toContain("<strong>Casting Time</strong> 1 action");
    expect(plain).toContain("<strong>Range</strong> 120 feet");
    expect(plain).toContain("<strong>Duration</strong> Instantaneous");
    expect(plain).not.toContain("ignored");
    const special = html({
      casting_time: "Special",
      casting_time_custom: "1 hour",
      range: "Special",
      range_custom: "Self (10-mile radius)",
      duration: "Special",
      duration_custom: "Until dispelled",
    });
    expect(special).toContain("<strong>Casting Time</strong> 1 hour");
    expect(special).toContain("<strong>Range</strong> Self (10-mile radius)");
    expect(special).toContain("<strong>Duration</strong> Until dispelled");
  });

  it("names the material only when the spell has a material component", () => {
    expect(html({ components: ["V", "S", "M"], material: "a pinch of sulfur" })).toContain(
      "<strong>Components</strong> V, S, M (a pinch of sulfur)",
    );
    expect(html({ components: ["V", "S"], material: "a pinch of sulfur" })).not.toContain("sulfur");
  });

  it("marks concentration and ritual", () => {
    expect(html({ concentration: true, duration: "1 minute" })).toContain("Concentration, 1 minute");
    expect(html({ concentration: false, duration: "1 minute" })).not.toContain("Concentration");
    expect(html({ ritual: true })).toContain("Ritual");
    expect(html({ ritual: false })).not.toContain("Ritual");
  });

  it("breaks the description at each line and adds the higher-level and class sections when present", () => {
    const full = html({ description: "One.\nTwo.", higher_levels: "More dice.", classes: ["Wizard", "Sorcerer"] });
    expect(full).toContain("<p>One.</p>\n<p>Two.</p>");
    expect(full).toContain("<h2>At Higher Levels</h2>\n<p>More dice.</p>");
    expect(full).toContain("<strong>Spell Lists</strong> Wizard, Sorcerer");
    const bare = html();
    expect(bare).not.toContain("At Higher Levels");
    expect(bare).not.toContain("Spell Lists");
  });
});

describe("formatItemForScriptorium — rows", () => {
  function item(patch: Record<string, unknown> = {}): Item {
    return {
      name: "Wand of Sparks",
      item_type: "gear",
      rarity: "rare",
      subtype: null,
      image_url: null,
      description: null,
      cost: null,
      weight: null,
      damage_rolls: [],
      armor_class: null,
      properties: [],
      requires_attunement: false,
      attunement_requirements: null,
      charges: null,
      recharge: null,
      tags: [],
      source: null,
      ...patch,
    } as unknown as Item;
  }
  const html = (patch: Record<string, unknown> = {}, spells: Spell[] = []) =>
    formatItemForScriptorium(item(patch), spells).content;

  it("leaves 'Mundane' off the type line and ignores magic-only rows on a mundane item", () => {
    const mundane = html({
      rarity: "mundane",
      requires_attunement: true,
      charges: 3,
      recharge: "dawn",
    });
    expect(mundane).not.toContain("Mundane");
    expect(mundane).not.toContain("Attunement");
    expect(mundane).not.toContain("Charges");
    expect(html({ rarity: "rare" })).toContain("Rare");
  });

  it("states attunement with its requirement, and charges with how they come back", () => {
    const magic = html({
      requires_attunement: true,
      attunement_requirements: "by a wizard",
      charges: 7,
      recharge: "1d6 at dawn",
    });
    expect(magic).toContain("<strong>Attunement</strong> Required (by a wizard)");
    expect(magic).toContain("<strong>Charges</strong> 7 · 1d6 at dawn");
    const plain = html({ requires_attunement: true, charges: 7 });
    expect(plain).toContain("<strong>Attunement</strong> Required</p>");
    expect(plain).toContain("<strong>Charges</strong> 7</p>");
  });

  it("lists damage with each roll's type, and cost and weight when given", () => {
    const weapon = html({
      damage_rolls: [{ dice: "1d8", type: "slashing" }, { dice: "1d6" }],
      cost: "15 gp",
      weight: 3,
    });
    expect(weapon).toContain("<strong>Damage</strong> 1d8 slashing + 1d6</p>");
    expect(weapon).toContain("<strong>Cost</strong> 15 gp");
    expect(weapon).toContain("<strong>Weight</strong> 3 lb.");
    expect(html()).not.toContain("Cost");
  });

  it("names the spells a magic item holds", () => {
    const fireball = { name: "Fireball", level: 3 } as unknown as Spell;
    expect(html({}, [fireball])).toContain("<strong>Spells</strong> Fireball (3rd-Level)");
  });
});

describe("formatLocationForScriptorium", () => {
  function location(patch: Record<string, unknown> = {}): Location {
    return {
      name: "Dun Rill",
      location_type: "city",
      description: null,
      notes: null,
      tags: [],
      ...patch,
    } as unknown as Location;
  }
  const doc = (content: unknown[]) => JSON.stringify({ type: "doc", content });

  it("turns the rich-text description into HTML, escaping its text and keeping its structure", () => {
    const { content } = formatLocationForScriptorium(
      location({
        description: doc([
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Gates & walls" }] },
          { type: "paragraph", content: [{ type: "text", text: "a<b", marks: [{ type: "bold" }] }] },
          {
            type: "orderedList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] }],
          },
        ]),
      }),
    );
    expect(content).toContain("<h3>Gates &amp; walls</h3>");
    expect(content).toContain("<p><strong>a&lt;b</strong></p>");
    expect(content).toContain("<ol><li><p>First</p>\n</li></ol>");
  });

  it("flattens the DM notes onto one line and leaves the section out when there are none", () => {
    expect(formatLocationForScriptorium(location({ notes: "one\ntwo" })).content).toContain("<p>one two</p>");
    expect(formatLocationForScriptorium(location()).content).not.toContain("Notes");
  });
});

describe("formatQuestForScriptorium", () => {
  const quest = {
    title: "The Bounty",
    status: "active",
    summary: null,
    started_at: "2026-10-27T18:30:00.000Z",
    resolved_at: null,
    tags: [],
  } as unknown as Quest;
  const objective = (description: string, status: string) =>
    ({ description, status }) as unknown as QuestObjective;

  it("marks a finished objective with a tick, a failed one with a cross, and an open one with neither", () => {
    const { content } = formatQuestForScriptorium(quest, [
      objective("Find the ledger", "complete"),
      objective("Keep the peace", "failed"),
      objective("Reach the gate", "pending"),
    ]);
    expect(content).toContain("<li>Find the ledger \u2713</li>");
    expect(content).toContain("<li>Keep the peace \u2717</li>");
    expect(content).toContain("<li>Reach the gate</li>");
  });

  it("prints dates as a day, without the time", () => {
    expect(formatQuestForScriptorium(quest).content).toContain("<strong>Started</strong> 2026-10-27</p>");
  });

  it("names the giver and the place only when known, and the summary and objectives only when present", () => {
    const bare = formatQuestForScriptorium(quest).content;
    expect(bare).not.toContain("Quest Giver");
    expect(bare).not.toContain("Summary");
    expect(bare).not.toContain("Objectives");
    const full = formatQuestForScriptorium({ ...quest, summary: "Find them." }, [objective("x", "pending")], "Mira", "Dun Rill").content;
    expect(full).toContain("<strong>Quest Giver</strong> Mira");
    expect(full).toContain("<strong>Location</strong> Dun Rill");
    expect(full).toContain("<h2>Summary</h2>");
    expect(full).toContain("<h2>Objectives</h2>");
  });
});
