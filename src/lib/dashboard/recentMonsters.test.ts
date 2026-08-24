import { describe, it, expect } from "vitest";
import { deriveRecentMonsters, RECENT_MONSTERS_LIMIT, type BestiaryMonsterInput, type DiscoveredMonsterInput } from "./recentMonsters";

const monster = (id: string, name: string, overrides: Partial<BestiaryMonsterInput> = {}): BestiaryMonsterInput => ({
  id,
  name,
  image_url: `/monsters/${id}.webp`,
  portrait_focal_point: null,
  ...overrides,
});

const discovery = (
  monsterId: string,
  discoveredAt: string | null | undefined,
  overrides: Partial<DiscoveredMonsterInput> = {},
): DiscoveredMonsterInput => ({
  monster_id: monsterId,
  library_monster_id: null,
  discovered_at: discoveredAt,
  ...overrides,
});

describe("deriveRecentMonsters", () => {
  it("returns nothing when the campaign has discovered nothing", () => {
    expect(deriveRecentMonsters([], [monster("m1", "Owlbear")])).toEqual([]);
  });

  it("returns nothing when there are monsters but no discoveries", () => {
    const monsters = [monster("m1", "Owlbear"), monster("m2", "Beholder")];
    expect(deriveRecentMonsters([], monsters)).toEqual([]);
  });

  it("orders discoveries newest-first", () => {
    const monsters = [monster("m1", "Owlbear"), monster("m2", "Beholder"), monster("m3", "Mimic")];
    const discoveries = [
      discovery("m1", "2026-08-01T10:00:00Z"),
      discovery("m2", "2026-08-20T10:00:00Z"),
      discovery("m3", "2026-08-10T10:00:00Z"),
    ];
    const rows = deriveRecentMonsters(discoveries, monsters);
    expect(rows.map((r) => r.id)).toEqual(["m2", "m3", "m1"]);
  });

  it("caps the result at the limit, keeping the newest", () => {
    const monsters = Array.from({ length: 15 }, (_, i) => monster(`m${i}`, `Monster ${i}`));
    // Ascending timestamps, so m14 is newest and m0 is oldest.
    const discoveries = monsters.map((m, i) =>
      discovery(m.id, `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
    );
    const rows = deriveRecentMonsters(discoveries, monsters);
    expect(rows).toHaveLength(RECENT_MONSTERS_LIMIT);
    expect(rows[0]?.id).toBe("m14");
    expect(rows.map((r) => r.id)).not.toContain("m0");
  });

  it("honors an explicit limit override", () => {
    const monsters = [monster("m1", "Owlbear"), monster("m2", "Beholder"), monster("m3", "Mimic")];
    const discoveries = [
      discovery("m1", "2026-08-01T10:00:00Z"),
      discovery("m2", "2026-08-20T10:00:00Z"),
      discovery("m3", "2026-08-10T10:00:00Z"),
    ];
    const rows = deriveRecentMonsters(discoveries, monsters, 2);
    expect(rows.map((r) => r.id)).toEqual(["m2", "m3"]);
  });

  it("drops a discovery whose monster is no longer in the bestiary, rather than rendering it nameless", () => {
    const monsters = [monster("m1", "Owlbear")];
    const discoveries = [
      discovery("m1", "2026-08-01T10:00:00Z"),
      discovery("deleted-monster", "2026-08-20T10:00:00Z"),
    ];
    const rows = deriveRecentMonsters(discoveries, monsters);
    expect(rows.map((r) => r.id)).toEqual(["m1"]);
  });

  it("drops a discovery with a null discovered_at instead of coercing it to epoch zero", () => {
    const monsters = [monster("m1", "Owlbear"), monster("m2", "Beholder")];
    const discoveries = [
      discovery("m1", "2026-08-01T10:00:00Z"),
      discovery("m2", null),
    ];
    const rows = deriveRecentMonsters(discoveries, monsters);
    expect(rows.map((r) => r.id)).toEqual(["m1"]);
  });

  it("drops a discovery with an absent discovered_at field the same way as an explicit null", () => {
    const monsters = [monster("m1", "Owlbear"), monster("m2", "Beholder")];
    const discoveries: DiscoveredMonsterInput[] = [
      discovery("m1", "2026-08-01T10:00:00Z"),
      { monster_id: "m2", library_monster_id: null },
    ];
    const rows = deriveRecentMonsters(discoveries, monsters);
    expect(rows.map((r) => r.id)).toEqual(["m1"]);
  });

  it("resolves a library discovery through library_monster_id when monster_id is null", () => {
    const monsters = [monster("srd_owlbear", "Owlbear")];
    const discoveries = [
      { monster_id: null, library_monster_id: "srd_owlbear", discovered_at: "2026-08-01T10:00:00Z" },
    ];
    const rows = deriveRecentMonsters(discoveries, monsters);
    expect(rows).toEqual([
      {
        id: "srd_owlbear",
        name: "Owlbear",
        imageUrl: "/monsters/srd_owlbear.webp",
        portraitFocalPoint: null,
        discoveredAt: "2026-08-01T10:00:00Z",
      },
    ]);
  });

  it("drops a discovery with no monster reference at all", () => {
    const monsters = [monster("m1", "Owlbear")];
    const discoveries = [
      { monster_id: null, library_monster_id: null, discovered_at: "2026-08-01T10:00:00Z" },
    ];
    expect(deriveRecentMonsters(discoveries, monsters)).toEqual([]);
  });

  it("carries the portrait focal point through when set", () => {
    const monsters = [monster("m1", "Owlbear", { portrait_focal_point: { x: 0.3, y: 0.7 } })];
    const discoveries = [discovery("m1", "2026-08-01T10:00:00Z")];
    const rows = deriveRecentMonsters(discoveries, monsters);
    expect(rows[0]?.portraitFocalPoint).toEqual({ x: 0.3, y: 0.7 });
  });
});
