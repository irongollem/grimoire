import { describe, it, expect } from "vitest";
import {
  formatNpcForScriptorium,
  formatEntityEmbedBodyHtml,
} from "@/lib/scriptorium/scriptoriumImport";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";

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
    expect(html).toContain("CR 3");
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
