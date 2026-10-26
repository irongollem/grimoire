import { describe, expect, it } from "vitest";
import { legacyTiesToLinks, remapLinkEnds } from "./worldLinkTransfer";

const link = (from: [string, string], to: [string, string]): Record<string, unknown> => ({
  from_kind: from[0],
  [`from_${from[0]}_id`]: from[1],
  to_kind: to[0],
  [`to_${to[0]}_id`]: to[1],
});

describe("remapLinkEnds", () => {
  it("rewrites both ends and nulls every other end column", () => {
    const ends = remapLinkEnds(link(["npc", "n1"], ["faction", "f1"]), (kind, id) => `new-${kind}-${id}`);
    expect(ends).toMatchObject({ from_kind: "npc", from_npc_id: "new-npc-n1", to_kind: "faction", to_faction_id: "new-faction-f1" });
    expect(ends?.from_faction_id).toBeNull();
    expect(ends?.to_npc_id).toBeNull();
  });

  it("returns null when either end did not come over", () => {
    const resolve = (kind: string, id: string) => (id === "n1" ? `new-${kind}` : null);
    expect(remapLinkEnds(link(["npc", "n1"], ["faction", "f1"]), resolve)).toBeNull();
    expect(remapLinkEnds(link(["faction", "f1"], ["npc", "n1"]), resolve)).toBeNull();
  });
});

describe("legacyTiesToLinks", () => {
  it("turns a directed bond round into the stored direction", () => {
    const [mentor, apprentice] = legacyTiesToLinks({
      npc_relationships: [
        { npc_id: "a", related_npc_id: "b", relationship_type: "mentor", notes: " taught her " },
        { npc_id: "c", related_npc_id: "d", relationship_type: "apprentice", notes: null },
      ],
    });
    expect(mentor).toMatchObject({ from_npc_id: "b", to_npc_id: "a", type: "mentor_of", note: "taught her" });
    expect(apprentice).toMatchObject({ from_npc_id: "c", to_npc_id: "d", type: "mentor_of" });
  });

  it("merges a symmetric bond written once each way and keeps both notes", () => {
    const links = legacyTiesToLinks({
      npc_relationships: [
        { npc_id: "a", related_npc_id: "b", relationship_type: "friend", notes: "from a" },
        { npc_id: "b", related_npc_id: "a", relationship_type: "friend", notes: "from b" },
      ],
    });
    expect(links).toHaveLength(1);
    expect(links[0].note).toBe("from a / from b");
  });

  it("makes an NPC-to-PC note the line that PC reads, revealed to that PC", () => {
    const [l] = legacyTiesToLinks({
      npc_pc_notes: [{ npc_id: "n", party_member_id: "pc", relationship_type: "apprentice", notes: "your student" }],
    });
    expect(l).toMatchObject({
      from_kind: "party_member",
      from_party_member_id: "pc",
      to_npc_id: "n",
      type: "mentor_of",
      told: "your student",
      note: "",
      player_visible_to: ["pc"],
    });
  });

  it("turns faction stances, places and holdings into links of the mildest type", () => {
    const links = legacyTiesToLinks({
      faction_relations: [{ faction_id: "f1", target_faction_id: "f2", relation_type: "rival", notes: "feud" }],
      faction_locations: [{ faction_id: "f1", location_id: "l1", notes: null }],
      faction_items: [
        { faction_id: "f1", item_id: "i1", notes: null },
        { faction_id: "f1", item_id: null, library_item_id: "srd_x" },
      ],
    });
    expect(links.map((x) => x.type)).toEqual(["rival", "operates_in", "holds"]);
    expect(links[2]).toMatchObject({ to_kind: "item", to_item_id: "i1" });
  });

  it("falls back to the mildest word when a type is outside the catalogue", () => {
    const links = legacyTiesToLinks({
      npc_relationships: [{ npc_id: "a", related_npc_id: "b", relationship_type: "nonsense" }],
      faction_relations: [{ faction_id: "f1", target_faction_id: "f2", relation_type: "nonsense" }],
    });
    expect(links.map((x) => x.type)).toEqual(["contact", "neutral"]);
  });
});
