import { describe, it, expect } from "vitest";
import { buildDowntimeQueue } from "./downtimeQueue";
import type { DowntimeDraw, DowntimeDrawStatus } from "@/types/downtime.types";
import type { PartyMember } from "@/types/party.types";

/** Just the fields the reduction reads — see deathSaves.test.ts for why a full
 *  character is not spelled out on every case. */
function draw(overrides: Partial<DowntimeDraw> & { id: string }): DowntimeDraw {
  return {
    campaign_id: "campaign-1",
    party_member_id: overrides.party_member_id ?? "member-1",
    activity_key: overrides.activity_key ?? "carouse",
    status: overrides.status ?? "pending",
    created_at: overrides.created_at ?? "2026-08-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-08-01T00:00:00Z",
    resolved_at: overrides.resolved_at ?? null,
    ...overrides,
  } as DowntimeDraw;
}

function member(overrides: Partial<PartyMember> & { id: string }): PartyMember {
  return {
    name: overrides.name ?? overrides.id,
    player_name: overrides.player_name ?? null,
    ...overrides,
  } as PartyMember;
}

describe("buildDowntimeQueue", () => {
  it("returns nothing for no draws", () => {
    expect(buildDowntimeQueue([], [])).toEqual([]);
  });

  it("keeps only pending draws out of every status", () => {
    const draws = (["pending", "resolved", "cancelled"] as DowntimeDrawStatus[]).map((status) =>
      draw({ id: status, status }),
    );
    const rows = buildDowntimeQueue(draws, [member({ id: "member-1" })]);
    expect(rows.map((r) => r.drawId)).toEqual(["pending"]);
  });

  it("sorts pending draws oldest-first regardless of input order", () => {
    const draws = [
      draw({ id: "newest", created_at: "2026-08-03T00:00:00Z" }),
      draw({ id: "oldest", created_at: "2026-08-01T00:00:00Z" }),
      draw({ id: "middle", created_at: "2026-08-02T00:00:00Z" }),
    ];
    const rows = buildDowntimeQueue(draws, [member({ id: "member-1" })]);
    expect(rows.map((r) => r.drawId)).toEqual(["oldest", "middle", "newest"]);
  });

  it("falls back to a removed-marker when the roster no longer has the character", () => {
    const rows = buildDowntimeQueue([draw({ id: "a", party_member_id: "gone" })], []);
    expect(rows[0]).toMatchObject({ characterName: "??? (removed)", playerName: null });
  });

  it("reports a null player name as null, not a guessed value, when the roster never recorded one", () => {
    const rows = buildDowntimeQueue(
      [draw({ id: "a", party_member_id: "member-1" })],
      [member({ id: "member-1", name: "Thistle", player_name: null })],
    );
    expect(rows[0]).toMatchObject({ characterName: "Thistle", playerName: null });
  });

  it("carries the player name through when the roster has one", () => {
    const rows = buildDowntimeQueue(
      [draw({ id: "a", party_member_id: "member-1" })],
      [member({ id: "member-1", name: "Thistle", player_name: "Jamie" })],
    );
    expect(rows[0]).toMatchObject({ characterName: "Thistle", playerName: "Jamie" });
  });

  it("resolves a known activity key to its printed title", () => {
    const rows = buildDowntimeQueue(
      [draw({ id: "a", activity_key: "carouse" })],
      [member({ id: "member-1" })],
    );
    expect(rows[0].activityTitle).toBe("Carouse");
  });

  it("falls back to the raw key when the catalogue no longer has the activity", () => {
    const rows = buildDowntimeQueue(
      [draw({ id: "a", activity_key: "retired-activity" })],
      [member({ id: "member-1" })],
    );
    expect(rows[0].activityTitle).toBe("retired-activity");
  });
});
