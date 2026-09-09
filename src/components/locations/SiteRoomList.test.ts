import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteRoomList from "./SiteRoomList.vue";
import { unwrittenRoomIds } from "@/lib/quests/siteHandoff";
import { IconShieldCheck } from "@/lib/icons";
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

  it("keeps a cleared room at full weight with a shield glyph, and only dims an unreachable one (frame 08)", () => {
    // Room b is unreachable, so its `AppButton` renders through the
    // `to`-driven `RouterLink` — whose stub swallows the default slot (see
    // the test above for the same caveat) — so the rows are told apart by
    // position, in the order the `rooms` prop gives them, rather than text.
    const rooms = [room({ id: "room-a" }), room({ id: "room-b", name: "Antechamber" })];
    const wrapper = mount(SiteRoomList, {
      props: baseProps(rooms, {
        currentRoomId: "elsewhere",
        reachable: new Set(["room-a"]),
        runCaptions: true,
        stateOf: (id, fact) => (id === "room-a" && fact === "cleared" ? { value: true } as never : undefined),
      }),
      global: { stubs },
    });
    const rows = wrapper.findAll(".rounded-lg.border");
    expect(rows).toHaveLength(2);
    const [clearedRow, unreachableRow] = rows;
    expect(clearedRow!.classes()).not.toContain("opacity-70");
    expect(clearedRow!.classes()).not.toContain("opacity-55");
    expect(clearedRow!.findComponent(IconShieldCheck).exists()).toBe(true);
    expect(unreachableRow!.classes()).toContain("opacity-55");
    expect(unreachableRow!.findComponent(IconShieldCheck).exists()).toBe(false);
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

  it("keeps the plain description caption when runCaptions is off, even with reachability data present", () => {
    const rooms = [room({ id: "room-a" }), room({ id: "room-b", name: "Antechamber" })];
    const wrapper = mount(SiteRoomList, {
      props: baseProps(rooms, { currentRoomId: "room-a", reachable: new Set(["room-a"]) }),
      global: { stubs },
    });
    expect(wrapper.text()).not.toContain("Not reachable from here");
    expect(wrapper.text()).toContain("Athletics DC 12");
  });

  it("switches to reachability captions once runCaptions is on", () => {
    const rooms = [room({ id: "room-a" }), room({ id: "room-b", name: "Antechamber" })];
    // An unreachable room renders its title through a real RouterLink
    // (`linkTo` points at its sheet), and the plain `RouterLink: true` stub
    // used elsewhere in this file swallows slot content — so this test needs
    // a stub that keeps it, to actually see the room's caption.
    const linkStubs = { RouterLink: { template: "<a><slot /></a>" }, RichTextEditor: true };
    const wrapper = mount(SiteRoomList, {
      props: baseProps(rooms, { currentRoomId: "room-a", reachable: new Set(["room-a"]), runCaptions: true }),
      global: { stubs: linkStubs },
    });
    expect(wrapper.text()).toContain("Party here");
    expect(wrapper.text()).toContain("Not reachable from here");
  });

  it("appends the active zone note to the current room's caption", () => {
    const rooms = [room({ id: "room-a" })];
    const wrapper = mount(SiteRoomList, {
      props: baseProps(rooms, { currentRoomId: "room-a", runCaptions: true, zoneNotes: new Map([["room-a", "ash-fall zone"]]) }),
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Party here · ash-fall zone active");
  });

  it("prefers 'Secret door — undiscovered' over a plain reachable caption, with a badge", () => {
    const rooms = [room({ id: "room-a" }), room({ id: "room-b", name: "Abbot's Cell" })];
    const wrapper = mount(SiteRoomList, {
      props: baseProps(rooms, {
        currentRoomId: "room-a",
        reachable: new Set(["room-a", "room-b"]),
        runCaptions: true,
        secretUndiscoveredIds: new Set(["room-b"]),
      }),
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Secret door — undiscovered");
    expect(wrapper.find('[title="Reachable only through an undiscovered secret door"]').exists()).toBe(true);
  });

  it("renders an unwritten room dashed, keeping its name as the title, with a Fill button that opens an inline editor", async () => {
    const rooms = [room({ id: "room-a", name: "Nave of Ash", description: null })];
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms), global: { stubs } });
    expect(wrapper.text()).toContain("Nave of Ash");
    expect(wrapper.text()).toContain("Unwritten — write it or roll it");

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
