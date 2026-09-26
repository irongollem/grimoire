import { describe, it, expect } from "vitest";
import {
  formatNpcForScriptorium,
  formatMonsterForScriptorium,
  formatEntityEmbedBodyHtml,
} from "@/lib/scriptorium/scriptoriumImport";
import type { Npc } from "@/types/npc.types";
import type { Monster, MonsterStatBlock } from "@/types/monster.types";

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

describe("formatNpcForScriptorium — portrait", () => {
  it("renders the portrait as a centered block, never a float", () => {
    const { content } = formatNpcForScriptorium(npc());
    expect(content).toContain("https://example.com/adewale.webp");
    expect(content).toMatch(/display:block;margin:8px auto/);
    expect(content).not.toMatch(/float:\s*right/);
  });

  it("places the portrait after the name heading", () => {
    const { content } = formatNpcForScriptorium(npc());
    expect(content.indexOf("<h1>")).toBeLessThan(content.indexOf("<img"));
  });

  it("omits the portrait when the NPC has none", () => {
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

  it("switches to the wide size once combined trait/action entries pass the threshold", () => {
    const trait = { name: "Trait", description: "Does a thing." };
    const many: Partial<MonsterStatBlock> = {
      special_abilities: [trait, trait, trait],
      actions: [trait, trait, trait, trait],
    };
    const { content } = formatMonsterForScriptorium(monster({ stat_block: { ...monster().stat_block, ...many } }));
    expect(content).toContain("sc-statblock--wide");
    expect(content).not.toContain("sc-statblock--column");
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
  it("opens with a real, TOC-visible h2 entry heading naming the creature", () => {
    const { content } = formatMonsterForScriptorium(monster());
    expect(content).toMatch(/^<h2 class="sc-statblock-entry-heading">Owlbear<\/h2>/);
  });

  it("places the portrait outside the stat block frame, classed for the showArt toggle", () => {
    const { content } = formatMonsterForScriptorium(monster({ image_url: "https://example.com/owlbear.webp" }));
    expect(content).toContain('class="sc-entity-art"');
    // The art tag lands after the whole frame's content (name through the
    // CR line), not nested somewhere inside it.
    const nameIndex = content.indexOf("sc-statblock-name");
    const crIndex = content.indexOf("<strong>CR</strong>");
    const artIndex = content.indexOf("sc-entity-art");
    expect(nameIndex).toBeGreaterThan(-1);
    expect(crIndex).toBeGreaterThan(nameIndex);
    expect(artIndex).toBeGreaterThan(crIndex);
  });

  it("omits the art figure entirely when the monster has no image", () => {
    const { content } = formatMonsterForScriptorium(monster({ image_url: null }));
    expect(content).not.toContain("sc-entity-art");
    expect(content).not.toContain("<img");
  });

  it("inserts a column-break between the stat block and the lore/art for a column-size entry", () => {
    const { content } = formatMonsterForScriptorium(
      monster({ image_url: "https://example.com/owlbear.webp", description: '{"type":"doc","content":[]}' }),
    );
    expect(content).toContain("sc-statblock--column");
    expect(content).toContain('<div class="sc-column-break" data-type="column-break"></div>');
  });

  it("omits the column-break when there is no lore or art to send to the next column", () => {
    const { content } = formatMonsterForScriptorium(monster({ image_url: null, description: null }));
    expect(content).not.toContain("sc-column-break");
  });

  it("omits the column-break for a wide entry (it already spans both columns)", () => {
    const trait = { name: "Trait", description: "Does a thing." };
    const many: Partial<MonsterStatBlock> = {
      special_abilities: [trait, trait, trait],
      actions: [trait, trait, trait, trait],
    };
    const { content } = formatMonsterForScriptorium(
      monster({
        image_url: "https://example.com/owlbear.webp",
        stat_block: { ...monster().stat_block, ...many },
      }),
    );
    expect(content).toContain("sc-statblock--wide");
    expect(content).not.toContain("sc-column-break");
  });
});
