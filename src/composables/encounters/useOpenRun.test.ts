import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEncounterRunStore } from "@/stores/encounterRun";
const net = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: net.invoke } } }));

import { foughtEncounter, sendLeftBehind } from "@/composables/encounters/useOpenRun";

const encounter = { name: "Ambush", party_member_ids: ["a", "b", "c"] };

describe("foughtEncounter", () => {
  it("leaves the DM's own fight with its whole party when there is no solo member", () => {
    expect(foughtEncounter(encounter, null)).toBe(encounter);
  });

  it("fields only the solo character, not the encounter's whole party", () => {
    const fought = foughtEncounter(encounter, "b");
    expect(fought.party_member_ids).toEqual(["b"]);
    expect(fought.name).toBe("Ambush");
  });

  it("fields a solo character the encounter did not list, rather than nobody", () => {
    expect(foughtEncounter(encounter, "z").party_member_ids).toEqual(["z"]);
  });

  it("does not mutate the saved encounter it narrows", () => {
    foughtEncounter(encounter, "b");
    expect(encounter.party_member_ids).toEqual(["a", "b", "c"]);
  });
});

describe("sendLeftBehind", () => {
  function fightWithUnsent() {
    setActivePinia(createPinia());
    const store = useEncounterRunStore();
    store.startFight(
      { encounterId: "enc-old", encounterName: "Old", factions: [], events: [], traps: [] },
      { combatants: [{ instance_id: "ogre", type: "monster", name: "ogre", faction_id: "f", initiative: 10, hp: 20, max_hp: 30, ac: "12", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0 }], round: 1, activeIndex: 0, eventsFired: [], lairFiredRounds: [], version: 1 },
    );
    store.adjustHp("ogre", -4);
    return store;
  }

  it("fails if the unsent changes of the last fight are not sent to that fight before another opens", async () => {
    net.invoke.mockReset();
    net.invoke.mockResolvedValue({ data: {}, error: null });
    const store = fightWithUnsent();
    const failed = vi.fn();
    await sendLeftBehind(store, "enc-new", failed);
    expect(net.invoke).toHaveBeenCalledTimes(1);
    expect(net.invoke.mock.calls[0][1].body).toMatchObject({ encounterId: "enc-old", commands: [{ type: "adjust_hp" }] });
    expect(failed).not.toHaveBeenCalled();
  });

  it("fails if changes that could not be sent are dropped without telling the DM", async () => {
    net.invoke.mockReset();
    net.invoke.mockResolvedValue({ data: null, error: { message: "Failed to send a request", context: new TypeError("fetch failed") } });
    const store = fightWithUnsent();
    const failed = vi.fn();
    await sendLeftBehind(store, "enc-new", failed);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("fails if opening the same fight again sends its own changes to itself", async () => {
    net.invoke.mockReset();
    const store = fightWithUnsent();
    await sendLeftBehind(store, "enc-old", vi.fn());
    expect(net.invoke).not.toHaveBeenCalled();
  });
});
