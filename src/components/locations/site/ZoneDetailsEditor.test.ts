// The Entrance zone's one setting (#1203): whether the party arrives there, or it is a way out only.
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ZoneDetailsEditor from "./ZoneDetailsEditor.vue";
import type { LocationMapRegion, ZonePayload } from "@/types/locationMapRegion.types";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  useUpdateLocationMapRegion: () => ({ mutate }),
  dmEdit: (update: Record<string, unknown>) => update,
}));
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncounters: () => ({ data: ref([]) }) }));
vi.mock("@/composables/dungeon-features/useTraps", () => ({ useTrapIndex: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeat: () => ({ data: ref(null) }),
  useQuestBeats: () => ({ data: ref([]) }),
}));

const entrance = (payload: ZonePayload): LocationMapRegion =>
  ({ id: "z1", region_role: "zone", zone_kind: "entrance", cells: [], zone_payload: payload }) as unknown as LocationMapRegion;

const savedPayload = (): ZonePayload => (mutate.mock.calls.at(-1)![0] as { update: { zone_payload: ZonePayload } }).update.zone_payload;

describe("ZoneDetailsEditor, a way in or out", () => {
  beforeEach(() => mutate.mockClear());

  it("unticking 'The party arrives here' saves a way out only, and keeps the zone's other settings", async () => {
    const wrapper = mount(ZoneDetailsEditor, { props: { zone: entrance({ visible_to_players: true }) } });
    const box = wrapper.find('input[type="checkbox"]');
    expect((box.element as HTMLInputElement).checked).toBe(true); // absent means the party arrives, as every entrance did
    await box.setValue(false);
    expect(savedPayload()).toEqual({ visible_to_players: true, party_arrives: false });
  });

  it("ticking it again clears the setting instead of storing a redundant true", async () => {
    const wrapper = mount(ZoneDetailsEditor, { props: { zone: entrance({ party_arrives: false }) } });
    const box = wrapper.find('input[type="checkbox"]');
    expect((box.element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.text()).toContain("A way out only");
    await box.setValue(true);
    expect(savedPayload().party_arrives).toBeUndefined();
  });
});
