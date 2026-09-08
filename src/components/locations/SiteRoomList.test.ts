import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteRoomList from "./SiteRoomList.vue";
import { unwrittenRoomIds } from "@/lib/quests/siteHandoff";
import type { Location } from "@/types/location.types";

function tiptap(text: string): string {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}

function room(overrides: Partial<Location> = {}): Location {
  return {
    id: "room-a",
    name: "The flooded shaft",
    location_type: "room",
    description: tiptap("Athletics DC 12"),
    ...overrides,
  } as Location;
}

const mocks = vi.hoisted(() => ({
  loot: { value: [] as Array<Record<string, unknown>> },
  setLocation: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  updateLocation: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
}));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useUpdateLocation: () => ({ mutate: mocks.updateLocation, isPending: ref(false) }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useLootPlacements: () => ({ data: mocks.loot }) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useSetCampaignLocation: () => ({ mutate: mocks.setLocation, isPending: { value: false } }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));

const stubs = { RouterLink: true, RichTextEditor: true };

function baseProps(rooms: Location[], overrides: Partial<InstanceType<typeof SiteRoomList>["$props"]> = {}) {
  return {
    siteId: "site-1",
    rooms,
    currentRoomId: null,
    reachable: null,
    stateOf: () => undefined,
    unwrittenIds: unwrittenRoomIds(rooms),
    ...overrides,
  };
}

describe("SiteRoomList", () => {
  beforeEach(() => {
    mocks.loot.value = [];
    mocks.setLocation.mockClear();
    mocks.updateLocation.mockClear();
  });

  it("points at the site's own sheet when there are no rooms yet", () => {
    const wrapper = mount(SiteRoomList, { props: baseProps([]), global: { stubs } });
    expect(wrapper.text()).toContain("No rooms yet");
  });

  it("numbers rooms in the order given, with a caption from the room's own description", () => {
    const rooms = [room({ id: "room-a", name: "The flooded shaft", description: tiptap("Athletics DC 12") }), room({ id: "room-b", name: "Antechamber" })];
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms), global: { stubs } });
    expect(wrapper.text()).toContain("The flooded shaft");
    expect(wrapper.text()).toContain("Athletics DC 12");
    expect(wrapper.text()).toContain("Antechamber");
  });

  it("appends 'cleared' to the caption once the room's cleared fact is asserted true", () => {
    const rooms = [room({ id: "room-a" })];
    const wrapper = mount(SiteRoomList, {
      props: baseProps(rooms, { stateOf: (id, fact) => (id === "room-a" && fact === "cleared" ? { value: true } as never : undefined) }),
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Athletics DC 12 · cleared");
  });

  it("shows a loot chip only for a room with held loot", () => {
    mocks.loot.value = [{ location_id: "room-a", delivery_state: "held" }];
    const rooms = [room({ id: "room-a" }), room({ id: "room-b" })];
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms), global: { stubs } });
    expect(wrapper.find('[title="Loot held here"]').exists()).toBe(true);
  });

  it("moves the party into a reachable room on click", async () => {
    const rooms = [room({ id: "room-a" }), room({ id: "room-b", name: "Antechamber" })];
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms, { currentRoomId: "room-a", reachable: new Set(["room-a", "room-b"]) }), global: { stubs } });
    const target = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.text().includes("Antechamber"));
    await target!.trigger("click");
    expect(mocks.setLocation).toHaveBeenCalledWith(
      { id: "c1", locationId: "room-b" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(wrapper.emitted("move")).toEqual([["room-b"]]);
  });

  it("does not move the party into an unreachable room, linking to its sheet instead", async () => {
    const rooms = [room({ id: "room-a" }), room({ id: "room-b", name: "Antechamber" })];
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms, { currentRoomId: "room-a", reachable: new Set(["room-a"]) }), global: { stubs } });
    // Rendered as a RouterLink once `to` is set — the stub swallows its
    // default slot, so it has to be found by its `to` prop rather than text.
    const target = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("to") === "/locations/room-b");
    expect(target).toBeTruthy();
    await target!.trigger("click");
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });

  it("renders an unwritten room dashed, with a Fill button that opens an inline editor", async () => {
    const rooms = [room({ id: "room-a", description: null })];
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms), global: { stubs } });
    expect(wrapper.text()).toContain("Unwritten");
    expect(wrapper.text()).toContain("Prep gap — write it or roll it");

    const fillButton = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.text() === "Fill");
    await fillButton!.trigger("click");
    expect(wrapper.findComponent({ name: "RichTextEditor" }).exists()).toBe(true);

    const saveButton = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.text() === "Save");
    await saveButton!.trigger("click");
    expect(mocks.updateLocation).toHaveBeenCalledWith(
      { id: "room-a", update: { description: null } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(wrapper.emitted("fill")).toEqual([["room-a"]]);
  });
});
