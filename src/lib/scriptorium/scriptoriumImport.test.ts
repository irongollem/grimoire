// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  formatNpcForScriptorium,
  formatMonsterForScriptorium,
  formatEntityEmbedBodyHtml,
  estimateWideBandHeightPx,
} from "@/lib/scriptorium/scriptoriumImport";
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
    const trait = { name: "Trait", description: "Does a thing." };
    const many: Partial<MonsterStatBlock> = {
      special_abilities: [trait, trait, trait],
      actions: [trait, trait, trait, trait],
    };
    const { content } = formatMonsterForScriptorium(monster({ stat_block: { ...monster().stat_block, ...many } }));
    expect(content).toContain("sc-statblock--column");
    expect(content).not.toContain("sc-statblock--wide");
  });

  it("switches to the wide size once the stat block's own text passes the length threshold", () => {
    const long = { name: "Trait", description: LONG_DESCRIPTION };
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
          special_abilities: [{ name: "Keen Smell", description: "Advantage on smell checks." }],
          actions: [{ name: "Bite", description: "Melee attack." }],
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

describe("estimateWideBandHeightPx (#917)", () => {
  it("errs above the Sugarwell booklet's measured band heights, so the art beside them errs small", () => {
    // Characters -> printed band height, measured 27 Sep 2026 (A4).
    const measured: Array<[number, number]> = [
      [1116, 463],
      [1304, 532],
      [1439, 600],
      [1871, 734],
    ];
    for (const [chars, printed] of measured) {
      const estimate = estimateWideBandHeightPx(chars);
      expect(estimate).toBeGreaterThanOrEqual(printed);
      expect(estimate - printed).toBeLessThan(60);
    }
  });

  it("puts the estimate on the entry for the stylesheet", () => {
    const { content } = formatMonsterForScriptorium(
      monster({ description: "A brute." }),
    );
    expect(content).toMatch(/class="sc-statblock-entry[^"]*"[^>]*style="--sc-band-est: \d+px"/);
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
