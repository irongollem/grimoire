import { describe, expect, it } from "vitest";
import type { CampaignSearchHit } from "@edge-shared/campaignSearch.ts";
import { GROUP_CAP, mergeSearchGroups, type SearchGroup } from "./mergeSearchHits";

const kw = (type: string, label: string, ids: string[]): SearchGroup => ({
  type,
  label,
  items: ids.map((id) => ({ id, name: `kw ${id}`, route: `/${type}/${id}`, matchedBy: "name" as const })),
});
const sem = (kind: CampaignSearchHit["kind"], id: string, distance: number): CampaignSearchHit => ({
  kind, id, name: `sem ${id}`, descriptor: `about ${id}`, distance,
});

describe("mergeSearchGroups", () => {
  it("returns keyword groups untouched when meaning found nothing", () => {
    const groups = [kw("npc", "NPCs", ["a"]), kw("note", "Notes", ["b"])];
    expect(mergeSearchGroups(groups, [])).toBe(groups);
  });

  it("builds groups from meaning alone, nearest group first", () => {
    const out = mergeSearchGroups([], [sem("npc", "n1", 0.4), sem("location", "l1", 0.1), sem("location", "l2", 0.3)]);
    expect(out.map((g) => g.type)).toEqual(["location", "npc"]);
    expect(out[0]?.items.map((i) => i.id)).toEqual(["l1", "l2"]);
    expect(out[0]?.items[0]).toMatchObject({ matchedBy: "meaning", descriptor: "about l1", route: "/locations?at=l1" });
  });

  it("puts keyword hits first, then unseen meaning hits by distance", () => {
    const out = mergeSearchGroups([kw("npc", "NPCs", ["a", "b"])], [sem("npc", "z", 0.5), sem("npc", "c", 0.1)]);
    expect(out[0]?.items.map((i) => i.id)).toEqual(["a", "b", "c", "z"]);
  });

  it("drops a meaning hit whose id the keyword tier already has", () => {
    const out = mergeSearchGroups([kw("npc", "NPCs", ["a"])], [sem("npc", "a", 0.1)]);
    expect(out[0]?.items).toHaveLength(1);
    expect(out[0]?.items[0]?.matchedBy).toBe("name");
  });

  it("dedupes repeated meaning ids", () => {
    const out = mergeSearchGroups([], [sem("note", "n", 0.2), sem("note", "n", 0.3)]);
    expect(out[0]?.items).toHaveLength(1);
  });

  it("caps a group at six", () => {
    const hits = Array.from({ length: 9 }, (_, i) => sem("quest", `q${i}`, i / 10));
    const out = mergeSearchGroups([kw("quest", "Quests", ["k1", "k2"])], hits);
    expect(out[0]?.items).toHaveLength(GROUP_CAP);
    expect(out[0]?.items.map((i) => i.id)).toEqual(["k1", "k2", "q0", "q1", "q2", "q3"]);
  });

  it("keeps keyword groups in the fixed order ahead of meaning-only groups", () => {
    const out = mergeSearchGroups(
      [kw("note", "Notes", ["n"]), kw("npc", "NPCs", ["a"])],
      [sem("location", "l", 0.01)],
    );
    expect(out.map((g) => g.type)).toEqual(["npc", "note", "location"]);
  });

  it("maps item and library_item to the Vault, monster kinds to the Bestiary", () => {
    const out = mergeSearchGroups([], [
      sem("item", "i1", 0.1), sem("library_item", "sword", 0.2), sem("monster", "m1", 0.3), sem("library_monster", "owlbear", 0.4),
    ]);
    expect(out.map((g) => [g.label, g.items.map((i) => i.route)])).toEqual([
      ["Vault", ["/vault/i1", "/vault/sword"]],
      ["Bestiary", ["/monsters/m1", "/monsters/owlbear"]],
    ]);
  });

  it("routes factions to their detail page", () => {
    const out = mergeSearchGroups([], [sem("faction", "f1", 0.1)]);
    expect(out[0]).toMatchObject({ label: "Factions" });
    expect(out[0]?.items[0]?.route).toBe("/factions/f1");
  });

  it("does not mutate its inputs", () => {
    const groups = [kw("npc", "NPCs", ["a"])];
    mergeSearchGroups(groups, [sem("npc", "b", 0.1)]);
    expect(groups[0]?.items).toHaveLength(1);
  });
});
