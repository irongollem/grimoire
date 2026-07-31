import { describe, it, expect } from "vitest";
import { formatNpcForScriptorium } from "@/lib/scriptoriumImport";
import type { Npc } from "@/types/npc.types";

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
