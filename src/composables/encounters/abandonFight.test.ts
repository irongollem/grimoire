import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const wire = vi.hoisted(() => ({ sendAlone: vi.fn() }));
vi.mock("@/lib/encounters/fightWire", () => ({ sendAlone: wire.sendAlone }));

import { useEncounterRunStore } from "@/stores/encounterRun";
import { abandonFight } from "./abandonFight";

beforeEach(() => {
  setActivePinia(createPinia());
  wire.sendAlone.mockReset();
});

describe("abandonFight", () => {
  it("fails if the encounter's Stop sends anything but abandon, or leaves the old run in the store for the next Run to show", async () => {
    wire.sendAlone.mockResolvedValue({});
    const store = useEncounterRunStore();
    store.encounterId = "e1";
    await abandonFight("e1");
    expect(wire.sendAlone).toHaveBeenCalledWith("e1", { type: "abandon" });
    expect(store.encounterId).toBeNull();
  });

  it("fails if stopping one encounter clears the run of another, or clears the run when the server refused", async () => {
    const store = useEncounterRunStore();
    store.encounterId = "other";
    wire.sendAlone.mockResolvedValue({});
    await abandonFight("e1");
    expect(store.encounterId).toBe("other");

    wire.sendAlone.mockRejectedValue(new Error("down"));
    store.encounterId = "e1";
    await expect(abandonFight("e1")).rejects.toThrow("down");
    expect(store.encounterId).toBe("e1");
  });
});
