import { describe, it, expect } from "vitest";
import { buildNpcSyncUpdate, type NpcSyncState } from "@/lib/npcEncounterSync";
import type { Npc } from "@/types/npc.types";

type NpcRec = Pick<Npc, "id" | "name" | "status" | "player_visible_to" | "player_visible_fields">;

function npc(over: Partial<NpcRec> & { id: string }): NpcRec {
  return {
    name: `NPC ${over.id}`,
    status: "alive",
    player_visible_to: [],
    player_visible_fields: [],
    ...over,
  };
}

function state(over: Partial<NpcSyncState> = {}): NpcSyncState {
  return { seen: false, died: false, ...over };
}

const PARTY = ["pm-1", "pm-2"];

describe("buildNpcSyncUpdate", () => {
  it("reveals a seen, living NPC (name + portrait), no status change", () => {
    const update = buildNpcSyncUpdate(npc({ id: "n1" }), PARTY, state({ seen: true }));
    expect(update!.status).toBeUndefined();
    expect(update!.player_visible_to).toEqual(PARTY);
    expect(new Set(update!.player_visible_fields)).toEqual(new Set(["name", "portrait"]));
  });

  it("marks a seen NPC that died dead and reveals it with the status field", () => {
    const update = buildNpcSyncUpdate(npc({ id: "n1" }), PARTY, state({ seen: true, died: true }));
    expect(update!.status).toBe("dead");
    expect(update!.player_visible_to).toEqual(PARTY);
    expect(new Set(update!.player_visible_fields)).toEqual(
      new Set(["name", "portrait", "status"]),
    );
  });

  it("marks a HIDDEN NPC that died dead but does NOT reveal it", () => {
    const update = buildNpcSyncUpdate(npc({ id: "n1" }), PARTY, state({ seen: false, died: true }));
    expect(update!.status).toBe("dead");
    expect(update!.player_visible_to).toBeUndefined();
    expect(update!.player_visible_fields).toBeUndefined();
  });

  it("does nothing for a hidden, living NPC", () => {
    const update = buildNpcSyncUpdate(npc({ id: "n1" }), PARTY, state());
    expect(update).toBeNull();
  });

  it("adds the status field when an already-shared, seen NPC newly dies", () => {
    const update = buildNpcSyncUpdate(
      npc({ id: "n1", player_visible_to: PARTY, player_visible_fields: ["name", "portrait"] }),
      PARTY,
      state({ seen: true, died: true }),
    );
    expect(update!.status).toBe("dead");
    expect(update!.player_visible_to).toBeUndefined(); // already shared
    expect(new Set(update!.player_visible_fields)).toEqual(
      new Set(["name", "portrait", "status"]),
    );
  });

  it("reveals an already-dead NPC (e.g. a hidden death later seen) with the status field", () => {
    const update = buildNpcSyncUpdate(
      npc({ id: "n1", status: "dead" }),
      PARTY,
      state({ seen: true, died: false }),
    );
    expect(update!.status).toBeUndefined(); // already dead — no restate
    expect(update!.player_visible_to).toEqual(PARTY);
    expect(new Set(update!.player_visible_fields)).toEqual(
      new Set(["name", "portrait", "status"]),
    );
  });

  it("widens an existing partial share instead of narrowing it", () => {
    const update = buildNpcSyncUpdate(
      npc({ id: "n1", player_visible_to: ["pm-1"], player_visible_fields: ["name"] }),
      PARTY,
      state({ seen: true }),
    );
    expect(new Set(update!.player_visible_to)).toEqual(new Set(["pm-1", "pm-2"]));
    expect(new Set(update!.player_visible_fields)).toEqual(new Set(["name", "portrait"]));
  });

  it("is idempotent: already dead + already fully revealed yields null", () => {
    const update = buildNpcSyncUpdate(
      npc({
        id: "n1",
        status: "dead",
        player_visible_to: PARTY,
        player_visible_fields: ["name", "portrait", "status"],
      }),
      PARTY,
      state({ seen: true, died: true }),
    );
    expect(update).toBeNull();
  });

  it("marks death with no party, without revealing", () => {
    const update = buildNpcSyncUpdate(npc({ id: "n1" }), [], state({ seen: true, died: true }));
    expect(update!.status).toBe("dead");
    expect(update!.player_visible_to).toBeUndefined();
    expect(update!.player_visible_fields).toBeUndefined();
  });
});
