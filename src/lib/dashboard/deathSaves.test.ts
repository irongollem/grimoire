import { describe, it, expect } from "vitest";
import { deriveDyingPartyMembers } from "./deathSaves";
import type { PartyMember } from "@/types/party.types";

/** Just the fields this module reads — the rest of `PartyMember` is
 *  irrelevant to the reduction, and spelling out a full character on every
 *  case would bury the one or two fields each test actually varies. */
function member(overrides: Partial<PartyMember> & { id: string }): PartyMember {
  return {
    name: overrides.id,
    current_hp: 10,
    death_save_successes: 0,
    death_save_failures: 0,
    portrait_url: null,
    portrait_focal_point: null,
    ...overrides,
  } as PartyMember;
}

describe("deriveDyingPartyMembers", () => {
  // The reason `trackedSaveCount` exists at all is that the counts arrive
  // through an unchecked cast. Both boundary checks must therefore read the
  // narrowed value: against a drifted column returning "3", a raw
  // `!== 3` keeps a stabilized character shouting and a raw `=== 3` never
  // marks a dead one dead.
  it("applies the stable and dead boundaries to the narrowed count, not the raw field", () => {
    const stabilized = member({
      id: "stable",
      current_hp: 0,
      death_save_successes: "3" as unknown as number,
    });
    // A non-numeric count is unknown, not three, so they are still listed —
    // but as `successes: null`, and crucially not as "3 successes".
    const [listed] = deriveDyingPartyMembers([stabilized]);
    expect(listed).toMatchObject({ id: "stable", successes: null });

    const felled = member({
      id: "felled",
      current_hp: 0,
      death_save_failures: "3" as unknown as number,
    });
    const [notDead] = deriveDyingPartyMembers([felled]);
    expect(notDead).toMatchObject({ id: "felled", failures: null, isDead: false });
  });
  it("returns nothing when nobody is at 0 HP or below", () => {
    const party = [
      member({ id: "a", current_hp: 12 }),
      member({ id: "b", current_hp: 1 }),
    ];
    expect(deriveDyingPartyMembers(party)).toEqual([]);
  });

  it("includes a member mid-saves with their exact tally", () => {
    const party = [
      member({ id: "a", current_hp: 0, death_save_successes: 1, death_save_failures: 2 }),
    ];
    const [result] = deriveDyingPartyMembers(party);
    expect(result).toMatchObject({ id: "a", successes: 1, failures: 2, isDead: false });
  });

  it("drops a member who has stabilized at 3 successes, even though HP is still 0", () => {
    const party = [
      member({ id: "a", current_hp: 0, death_save_successes: 3, death_save_failures: 1 }),
    ];
    expect(deriveDyingPartyMembers(party)).toEqual([]);
  });

  it("keeps a member who has failed 3 saves and marks them dead", () => {
    const party = [
      member({ id: "a", current_hp: 0, death_save_successes: 1, death_save_failures: 3 }),
    ];
    const [result] = deriveDyingPartyMembers(party);
    expect(result).toMatchObject({ id: "a", successes: 1, failures: 3, isDead: true });
  });

  it("reports null, not 0, for a member whose save counts were never recorded", () => {
    const party = [
      member({ id: "a", current_hp: 0 }),
    ];
    // Force the two fields to be genuinely absent — data the declared
    // `PartyMember` type promises cannot happen, but the reduction is
    // defensive about it anyway (see deathSaves.ts for why).
    const withMissingCounts = {
      ...party[0],
      death_save_successes: null,
      death_save_failures: undefined,
    } as unknown as PartyMember;

    const [result] = deriveDyingPartyMembers([withMissingCounts]);
    expect(result).toMatchObject({ id: "a", successes: null, failures: null, isDead: false });
  });

  it("ignores a member above 0 HP even if stale save counts are still on the row", () => {
    // Healed but not yet reset — current_hp is the single source of truth for
    // "dying", not the presence of leftover save counts.
    const party = [
      member({ id: "a", current_hp: 5, death_save_successes: 1, death_save_failures: 2 }),
    ];
    expect(deriveDyingPartyMembers(party)).toEqual([]);
  });

  it("sorts the dead ahead of the merely dying, then by closeness to death", () => {
    const party = [
      member({ id: "close", current_hp: 0, death_save_failures: 2 }),
      member({ id: "dead", current_hp: 0, death_save_failures: 3 }),
      member({ id: "fresh", current_hp: 0, death_save_failures: 0 }),
    ];
    expect(deriveDyingPartyMembers(party).map((m) => m.id)).toEqual(["dead", "close", "fresh"]);
  });
});
