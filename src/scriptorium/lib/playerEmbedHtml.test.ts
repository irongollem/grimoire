import { describe, expect, it } from "vitest";
import {
  playerItemHtml,
  playerLocationHtml,
  playerMonsterHtml,
  playerNpcHtml,
  playerQuestHtml,
} from "./playerEmbedHtml";
import type { Item } from "@/types/item.types";
import type { PlayerVisibleMonster } from "@/types/monster.types";

describe("playerNpcHtml", () => {
  it("is absent when the name is not revealed", () => {
    expect(playerNpcHtml({ name: null, portrait_url: "https://x/p.png", race: "Elf", occupation: null })).toBeNull();
  });
  it("emits the name, portrait and species line only", () => {
    const html = playerNpcHtml({
      name: "Mira <b>",
      portrait_url: "https://x/p.png",
      race: "Elf",
      occupation: "Smith",
    });
    expect(html).toContain("<h1>Mira &lt;b&gt;</h1>");
    expect(html).toContain('data-art-kind="picture"');
    expect(html).toContain("<em>Elf · Smith</em>");
  });
  it("escapes the species and occupation line", () => {
    const html = playerNpcHtml({ name: "Mira", portrait_url: null, race: "Elf <i>", occupation: "Smith & Co" });
    expect(html).toContain("<em>Elf &lt;i&gt; · Smith &amp; Co</em>");
  });
  it("omits unrevealed parts entirely", () => {
    const html = playerNpcHtml({ name: "Mira", portrait_url: null, race: null, occupation: null });
    expect(html).toBe("<h1>Mira</h1>\n");
  });
});

describe("playerMonsterHtml", () => {
  const monster = {
    id: "m1",
    name: "Owlbear",
    size: "large",
    monster_type: "monstrosity",
    image_url: "https://x/o.png",
    cutout_url: null,
    notes: "SECRET DM NOTE",
    description: "SECRET LORE",
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
  } as unknown as PlayerVisibleMonster;

  it("shows only name, picture and type line without revealed stats, never touching the stat block", () => {
    const html = playerMonsterHtml(monster, false, "onednd2024");
    expect(html).toContain("<h1>Owlbear</h1>");
    expect(html).toContain("large monstrosity");
    expect(html).not.toContain("sc-statblock");
    expect(html).not.toContain("SECRET");
  });
  it("shows the cutout art, and only the parts of the type line that exist", () => {
    const html = playerMonsterHtml(
      Object.assign({}, monster, { image_url: null, cutout_url: "https://x/cut.png", size: "", monster_type: "monstrosity" }),
      false,
      "onednd2024",
    );
    expect(html).toContain('data-art-kind="cutout"');
    expect(html).toContain("<em>monstrosity</em>");
  });
  it("shows the stat block when revealed, still without DM notes or lore", () => {
    const html = playerMonsterHtml(monster, true, "onednd2024");
    expect(html).toContain("sc-statblock");
    expect(html).not.toContain("SECRET");
  });
  it("falls back to the plain entry when stats are revealed but the projection withheld the block", () => {
    const html = playerMonsterHtml({ ...monster, stat_block: null }, true, "onednd2024");
    expect(html).not.toContain("sc-statblock");
  });
});

describe("playerLocationHtml and playerQuestHtml", () => {
  it("holds the description back until it is shared", () => {
    const base = { name: "Dun Rill", location_type: "city" as const, description: null as string | null };
    expect(playerLocationHtml({ ...base, description: "hidden text", is_description_shared: false })).not.toContain(
      "hidden text",
    );
    expect(playerLocationHtml({ ...base, description: "shown text", is_description_shared: true })).toContain(
      "shown text",
    );
  });
  it("shows a quest with no summary as its title alone", () => {
    expect(playerQuestHtml({ title: "Find it", summary: null })).toBe("<h1>Find it</h1>\n");
  });
  it("never shows a player an item's curse or the DM's notes", () => {
    const item = {
      name: "Ring",
      item_type: "gear",
      rarity: "rare",
      subtype: null,
      image_url: null,
      description: "A plain band.",
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
      curse_description: "SECRET CURSE",
      dm_notes: "SECRET DM NOTE",
    } as unknown as Item;
    const html = playerItemHtml(item);
    expect(html).toContain("A plain band.");
    expect(html).not.toContain("SECRET");
  });
  it("shows a quest as title and summary", () => {
    expect(playerQuestHtml({ title: "Find <it>", summary: "A rumour." })).toBe(
      "<h1>Find &lt;it&gt;</h1>\n<p>A rumour.</p>\n",
    );
  });
});
