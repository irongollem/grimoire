import { describe, expect, it } from "vitest";
import {
  playerLocationHtml,
  playerMonsterHtml,
  playerNpcHtml,
  playerQuestHtml,
} from "./playerEmbedHtml";
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
  it("shows a quest as title and summary", () => {
    expect(playerQuestHtml({ title: "Find <it>", summary: "A rumour." })).toBe(
      "<h1>Find &lt;it&gt;</h1>\n<p>A rumour.</p>\n",
    );
  });
});
