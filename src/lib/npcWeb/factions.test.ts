import { describe, expect, it } from "vitest";

import { MAX_PIPS, factionBadgesByNode, pipOffsets } from "./factions";

function row(npcId: string, factionName: string, status = "Active", emblem: string | null = null) {
  return {
    npc_id: npcId,
    faction_id: `f-${factionName}`,
    status,
    faction: { id: `f-${factionName}`, name: factionName, emblem_url: emblem },
  };
}

const byNpc = (r: { npc_id: string }) => `npc:${r.npc_id}`;

describe("factionBadgesByNode", () => {
  it("groups memberships onto their node key", () => {
    const badges = factionBadgesByNode([row("a", "Harbormasters"), row("b", "Zhentarim")], byNpc);

    expect([...badges.keys()].sort()).toEqual(["npc:a", "npc:b"]);
    expect(badges.get("npc:a")!.pips[0].factionName).toBe("Harbormasters");
  });

  // Order has to come from the data, not from row insertion order, or the badges
  // shuffle between renders on an unrelated refetch.
  it("sorts by name so badge order is stable across refetches", () => {
    const forward = factionBadgesByNode([row("a", "Zhentarim"), row("a", "Harpers")], byNpc);
    const reversed = factionBadgesByNode([row("a", "Harpers"), row("a", "Zhentarim")], byNpc);

    expect(forward.get("npc:a")!.pips.map((p) => p.factionName)).toEqual(["Harpers", "Zhentarim"]);
    expect(reversed.get("npc:a")!.pips.map((p) => p.factionName)).toEqual(["Harpers", "Zhentarim"]);
  });

  // The cap exists to stop emblems crowding the edges around a node, so what
  // survives it must be what describes the NPC *now*.
  it("keeps active memberships ahead of former ones when capping", () => {
    const badges = factionBadgesByNode(
      [
        row("a", "Alpha", "Expelled"),
        row("a", "Beta", "Defected"),
        row("a", "Gamma", "Retired"),
        row("a", "Zeta", "Active"),
      ],
      byNpc,
    );

    const pips = badges.get("npc:a")!.pips;
    expect(pips).toHaveLength(MAX_PIPS);
    expect(pips[0].factionName).toBe("Zeta");
    expect(pips[0].active).toBe(true);
    expect(badges.get("npc:a")!.overflow).toBe(1);
  });

  it("reports no overflow when everything fits", () => {
    const badges = factionBadgesByNode([row("a", "Harpers"), row("a", "Zhentarim")], byNpc);
    expect(badges.get("npc:a")!.overflow).toBe(0);
  });

  // A former tie is the kind of thing this view exists to surface, so it is
  // faded rather than dropped — the graph must not disagree with the sheet.
  it("keeps former memberships, marked inactive", () => {
    const badges = factionBadgesByNode([row("a", "Harpers", "Expelled")], byNpc);
    expect(badges.get("npc:a")!.pips[0].active).toBe(false);
  });

  it("falls back to an initial when a faction has no emblem", () => {
    const withEmblem = factionBadgesByNode([row("a", "Harpers", "Active", "https://x/y.webp")], byNpc);
    const without = factionBadgesByNode([row("b", "zhentarim")], byNpc);

    expect(withEmblem.get("npc:a")!.pips[0].emblemUrl).toBe("https://x/y.webp");
    expect(without.get("npc:b")!.pips[0].initial).toBe("Z");
  });

  it("survives a membership whose faction embed came back empty", () => {
    const orphan = { npc_id: "a", faction_id: "f", status: "Active", faction: null as never };
    expect(() => factionBadgesByNode([orphan], byNpc)).not.toThrow();
    expect(factionBadgesByNode([orphan], byNpc).size).toBe(0);
  });
});

describe("pipOffsets", () => {
  // Upper-right: the label sits below the node and edges leave in every
  // direction, so that quadrant is the one reliably free of both.
  it("places emblems up and to the right of the node", () => {
    const [first] = pipOffsets(1, 18, 6);
    expect(first.x).toBeGreaterThan(0);
    expect(first.y).toBeLessThan(0);
  });

  it("spaces them so they do not overlap", () => {
    const offsets = pipOffsets(3, 18, 6);
    expect(offsets).toHaveLength(3);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i].x - offsets[i - 1].x).toBeGreaterThanOrEqual(12);
    }
    expect(new Set(offsets.map((o) => o.y)).size).toBe(1);
  });

  it("scales its start with the node it hangs off", () => {
    expect(pipOffsets(1, 22, 6)[0].x).toBeGreaterThan(pipOffsets(1, 18, 6)[0].x);
  });
});
