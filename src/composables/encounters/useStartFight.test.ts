// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

const h = vi.hoisted(() => ({ mutateAsync: vi.fn(), push: vi.fn(), error: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/composables/encounters/useEncounters", () => ({ useCreateEncounter: () => ({ mutateAsync: h.mutateAsync }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: h.error, fromError: (e: unknown) => String(e) }) }));

import { useStartFight } from "./useStartFight";

function setup() {
  return effectScope().run(() => useStartFight())!;
}

describe("useStartFight", () => {
  beforeEach(() => vi.clearAllMocks());

  // #1125 decision 9: the fight is anchored where the party stands, so the Play screen seats them from exploring.
  it("creates an empty encounter at the place and opens it on the Play screen", async () => {
    h.mutateAsync.mockResolvedValue({ id: "e9" });
    await setup().startFightAt("crypt", "Crypt fight");
    expect(h.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: "Crypt fight", location_id: "crypt", combatants: [] }));
    expect(h.push).toHaveBeenCalledWith("/encounters/e9/run");
  });

  it("tells the DM when the encounter could not be made, and goes nowhere", async () => {
    h.mutateAsync.mockRejectedValue(new Error("offline"));
    const fight = setup();
    await fight.startFightAt("crypt", "Crypt fight");
    expect(h.error).toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
    expect(fight.starting.value).toBe(false);
  });
});
