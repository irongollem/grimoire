import { describe, expect, it } from "vitest";
import { groupIdsByLowerName } from "./seed-srd-spells";

describe("groupIdsByLowerName", () => {
  it("returns an empty map for no rows", () => {
    expect(groupIdsByLowerName([])).toEqual(new Map());
  });

  it("groups a single row under its lowercased name", () => {
    const map = groupIdsByLowerName([{ id: "srd_srd_fireball", name: "Fireball" }]);
    expect(map.get("fireball")).toEqual(["srd_srd_fireball"]);
  });

  it("collects multiple ids under the same name — the dual-edition case", () => {
    const rows = [
      { id: "srd_srd_fireball", name: "Fireball" },
      { id: "srd_srd_2024_fireball", name: "Fireball" },
    ];
    const map = groupIdsByLowerName(rows);
    expect(map.get("fireball")).toEqual(["srd_srd_fireball", "srd_srd_2024_fireball"]);
    expect(map.size).toBe(1);
  });

  it("is case-insensitive on the name key", () => {
    const rows = [
      { id: "a", name: "Acid Arrow" },
      { id: "b", name: "acid arrow" },
    ];
    expect(groupIdsByLowerName(rows).get("acid arrow")).toEqual(["a", "b"]);
  });

  it("keeps distinct names separate", () => {
    const rows = [
      { id: "a", name: "Fireball" },
      { id: "b", name: "Fire Bolt" },
    ];
    const map = groupIdsByLowerName(rows);
    expect(map.get("fireball")).toEqual(["a"]);
    expect(map.get("fire bolt")).toEqual(["b"]);
  });
});
