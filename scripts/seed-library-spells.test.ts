import { describe, expect, it } from "vitest";
import { resolveSpellArt } from "./seed-library-spells";

const art = (entry_id: string, image_url: string, portrait_focal_point: { x: number; y: number } | null = null) => ({
  entry_id,
  image_url,
  portrait_focal_point,
});

describe("resolveSpellArt", () => {
  it("returns nothing for no spells or no art", () => {
    expect(resolveSpellArt([], [art("a", "u")])).toEqual([]);
    expect(resolveSpellArt([{ id: "a", name: "Fireball" }], [])).toEqual([]);
  });

  it("gives a spell its own canonical art, focal point included", () => {
    const resolved = resolveSpellArt(
      [{ id: "srd_fireball", name: "Fireball" }],
      [art("srd_fireball", "fire.webp", { x: 1, y: 2 })],
    );
    expect(resolved).toEqual([{ id: "srd_fireball", image_url: "fire.webp", image_focal_point: { x: 1, y: 2 } }]);
  });

  it("gives a spell with no row of its own the art of a same-named spell, case-insensitively", () => {
    const resolved = resolveSpellArt(
      [
        { id: "srd_fireball", name: "Fireball" },
        { id: "srd_srd_fireball", name: "FIREBALL" },
      ],
      [art("srd_fireball", "fire.webp")],
    );
    expect(resolved.map((r) => [r.id, r.image_url])).toEqual([
      ["srd_fireball", "fire.webp"],
      ["srd_srd_fireball", "fire.webp"],
    ]);
  });

  it("never overwrites a spell's own art with a namesake's", () => {
    const resolved = resolveSpellArt(
      [
        { id: "a", name: "Veil" },
        { id: "b", name: "Veil" },
      ],
      [art("a", "veil-a.webp"), art("b", "veil-b.webp")],
    );
    expect(resolved.map((r) => r.image_url)).toEqual(["veil-a.webp", "veil-b.webp"]);
  });

  it("lets the lowest entry_id decide when several namesakes have art", () => {
    const resolved = resolveSpellArt(
      [
        { id: "b", name: "Orb" },
        { id: "a", name: "Orb" },
        { id: "c", name: "Orb" },
      ],
      [art("b", "orb-b.webp"), art("a", "orb-a.webp")],
    );
    expect(resolved.find((r) => r.id === "c")?.image_url).toBe("orb-a.webp");
  });

  it("leaves a spell with no art by id or name out of the result", () => {
    const resolved = resolveSpellArt(
      [
        { id: "a", name: "Orb" },
        { id: "z", name: "Lone" },
      ],
      [art("a", "orb.webp")],
    );
    expect(resolved.map((r) => r.id)).toEqual(["a"]);
  });
});
