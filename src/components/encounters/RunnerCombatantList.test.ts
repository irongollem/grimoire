// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunnerCombatantList from "./RunnerCombatantList.vue";
import type { RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import type { CharacterMemorial } from "@/types/memorial.types";

const mocks = vi.hoisted(() => ({
  combatants: [] as unknown[],
  party: [] as unknown[],
  memorials: undefined as unknown[] | undefined,
}));

vi.mock("@/stores/encounterRun", () => ({
  useEncounterRunStore: () => ({ sortedCombatants: mocks.combatants }),
}));
vi.mock("@/composables/useBreakpoint", () => ({ useIsMobile: () => ({ value: false }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { value: mocks.party } }) }));
vi.mock("@/composables/memorials/useMemorials", () => ({
  useCampaignMemorials: () => ({ data: { value: mocks.memorials } }),
}));

const stubs = {
  RunnerCombatantRow: true,
  RunnerCombatantCard: true,
  SetDownDialog: { name: "SetDownDialog", props: ["open", "mode", "member"], template: "<div data-testid='dialog' :data-open='open' />" },
  AppButton: { props: ["label"], template: "<button>{{ label }}</button>" },
};

const downed = {
  instance_id: "i1",
  type: "player",
  name: "Chicory",
  party_member_id: "pm1",
  death_saves: { successes: 0, failures: 3 },
} as unknown as RunCombatant;

describe("RunnerCombatantList fallen offer", () => {
  beforeEach(() => {
    mocks.combatants = [downed];
    mocks.party = [{ id: "pm1", name: "Chicory" } as PartyMember];
    mocks.memorials = [];
  });

  it("offers to mark a party member with three failed saves and opens the dialog for them", async () => {
    const w = mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } });
    expect(w.find("[data-testid=fallen-offer]").exists()).toBe(true);
    expect(w.find("[data-testid=dialog]").attributes("data-open")).toBe("false");
    await w.find("[data-testid=offer-mark]").trigger("click");
    const dialog = w.findComponent({ name: "SetDownDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("mode")).toBe("fallen");
    expect(dialog.props("member")).toMatchObject({ id: "pm1" });
  });

  it("makes no offer once a memorial is in effect, or while memorials are loading", () => {
    mocks.memorials = [{ party_member_id: "pm1", restored_at: null } as CharacterMemorial];
    expect(mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } }).find("[data-testid=fallen-offer]").exists()).toBe(false);
    mocks.memorials = undefined;
    expect(mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } }).find("[data-testid=fallen-offer]").exists()).toBe(false);
  });

  const mountList = () => mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } });
  const offerShown = () => mountList().find("[data-testid=fallen-offer]").exists();

  it("waits for the third failed save", () => {
    mocks.combatants = [{ ...downed, death_saves: { successes: 1, failures: 2 } }];
    expect(offerShown()).toBe(false);
  });

  it("drops the offer when the DM says not yet", async () => {
    const w = mountList();
    await w.find("[data-testid=offer-dismiss]").trigger("click");
    expect(w.find("[data-testid=fallen-offer]").exists()).toBe(false);
  });

  it("is not stopped by a restored memorial or by another character's memorial", () => {
    mocks.memorials = [{ party_member_id: "pm1", restored_at: "2026-10-01T00:00:00Z" } as CharacterMemorial];
    expect(offerShown()).toBe(true);
    mocks.memorials = [{ party_member_id: "pm2", restored_at: null } as CharacterMemorial];
    expect(offerShown()).toBe(true);
  });

  it("offers nothing for a monster, or a player who is not in the party", () => {
    mocks.combatants = [{ ...downed, type: "monster" } as RunCombatant];
    expect(offerShown()).toBe(false);
    mocks.combatants = [{ ...downed, party_member_id: "stranger" }];
    expect(offerShown()).toBe(false);
  });
});
