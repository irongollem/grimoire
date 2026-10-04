import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
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
  moveParty: vi.fn((_request: unknown) => Promise.resolve(true)),
  updateLocation: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  aiEnabled: { value: false },
  canSpend: vi.fn(() => true),
  fill: vi.fn(),
  allLocations: { value: [] as Array<Record<string, unknown>> },
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return mocks.aiEnabled.value; },
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
  }),
}));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref([]) }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({ canSpend: mocks.canSpend, gateQuotaError: () => false }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 3 }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ textMultiplierFor: () => 1 }) }));
vi.mock("@/ai/useRoomFill", () => ({
  useRoomFill: () => ({ isGenerating: ref(false), error: ref(null), clearError: vi.fn(), fill: mocks.fill }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: ref(false) }));

vi.mock("@/composables/locations/useLocations", () => ({
  useUpdateLocation: () => ({ mutate: mocks.updateLocation, isPending: ref(false) }),
  useAllLocations: () => ({ data: mocks.allLocations }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useLootPlacements: () => ({ data: mocks.loot }) }));
vi.mock("@/composables/locations/useMoveParty", () => ({
  useMoveParty: () => ({ moveParty: mocks.moveParty, isMoving: { value: false } }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));

const stubs = { RouterLink: true, RichTextEditor: true, GenerationCostBadge: true };

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
    mocks.moveParty.mockClear();
    mocks.updateLocation.mockClear();
    mocks.fill.mockReset();
    mocks.aiEnabled.value = false;
  });

  it("sends the DM to Build when there are no rooms yet", () => {
    const wrapper = mount(SiteRoomList, { props: baseProps([]), global: { stubs: { ...stubs, RouterLink: RouterLinkStub } } });
    expect(wrapper.text()).toContain("No rooms yet");
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.props("to")).toBe("/locations?at=site-1&build=true");
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
    await flushPromises();
    expect(mocks.moveParty).toHaveBeenCalledWith(expect.objectContaining({ roomId: "room-b", currentRoomId: "room-a" }));
    expect(wrapper.emitted("move")).toEqual([["room-b"]]);
  });

  // A room the door graph leaves out is still a row that moves the party
  // (`useMoveParty` asks first); it used to be a link to the room's Atlas
  // page, which stranded a DM who clicked the wrong room first.
  it("hands an unreachable room to the move as well, and never links away", async () => {
    const rooms = [room({ id: "room-a" }), room({ id: "room-b", name: "Antechamber" })];
    const reachable = new Set(["room-a"]);
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms, { currentRoomId: "room-a", reachable }), global: { stubs } });
    const buttons = wrapper.findAllComponents({ name: "AppButton" });
    expect(buttons.every((button) => button.props("to") === undefined)).toBe(true);
    await buttons.find((button) => button.text().includes("Antechamber"))!.trigger("click");
    await flushPromises();
    expect(mocks.moveParty).toHaveBeenCalledWith({ roomId: "room-b", roomName: "Antechamber", currentRoomId: "room-a", reachable });
    expect(wrapper.emitted("move")).toEqual([["room-b"]]);
  });

  it("does not announce a move the DM declined", async () => {
    mocks.moveParty.mockResolvedValueOnce(false);
    const rooms = [room({ id: "room-a" }), room({ id: "room-b", name: "Antechamber" })];
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms, { currentRoomId: "room-a", reachable: new Set(["room-a"]) }), global: { stubs } });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.text().includes("Antechamber"))!.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("move")).toBeUndefined();
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
    const wrapper = mount(SiteRoomList, {
      props: baseProps(rooms, { currentRoomId: "room-a", reachable: new Set(["room-a"]), runCaptions: true }),
      global: { stubs },
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

  it("prefers 'Secret door, undiscovered' over a plain reachable caption, with a badge", () => {
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
    expect(wrapper.text()).toContain("Secret door, undiscovered");
    expect(wrapper.find('[title="Reachable only through an undiscovered secret door"]').exists()).toBe(true);
  });

  it("renders an unwritten room dashed, keeping its name as the title, with a Fill button that opens an inline editor", async () => {
    const rooms = [room({ id: "room-a", name: "Nave of Ash", description: null })];
    const wrapper = mount(SiteRoomList, { props: baseProps(rooms), global: { stubs } });
    expect(wrapper.text()).toContain("Nave of Ash");
    expect(wrapper.text()).toContain("Unwritten: write it or roll it");

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

  describe("Roll it with AI", () => {
    const generated = {
      description: tiptap("A flooded shrine."),
      ai_provenance: { generatorType: "room_generation", provider: "openai", model: "m", generatedAt: "t", edited: false },
    };

    async function openFill(wrapper: ReturnType<typeof mount>) {
      await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Fill")!.trigger("click");
    }
    const byLabel = (wrapper: ReturnType<typeof mount>, label: string) =>
      wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === label)!;

    it("offers nothing when AI is off for the campaign", async () => {
      const wrapper = mount(SiteRoomList, { props: baseProps([room({ description: null })]), global: { stubs } });
      await openFill(wrapper);
      expect(wrapper.text()).not.toContain("Roll it with AI");
    });

    it("puts the roll into the editor and saves provenance as generated when untouched", async () => {
      mocks.aiEnabled.value = true;
      mocks.fill.mockResolvedValue(generated);
      const wrapper = mount(SiteRoomList, { props: baseProps([room({ description: null })]), global: { stubs } });
      await openFill(wrapper);
      await byLabel(wrapper, "Roll it with AI").trigger("click");
      await flushPromises();
      expect(mocks.fill).toHaveBeenCalledWith(expect.objectContaining({ steer: "" }));
      expect(wrapper.findComponent({ name: "RichTextEditor" }).props("modelValue")).toBe(generated.description);
      await byLabel(wrapper, "Save").trigger("click");
      expect(mocks.updateLocation).toHaveBeenCalledWith(
        { id: "room-a", update: { description: generated.description, ai_provenance: generated.ai_provenance } },
        expect.anything(),
      );
    });

    it("marks the provenance edited when the DM changed the roll before saving", async () => {
      mocks.aiEnabled.value = true;
      mocks.fill.mockResolvedValue(generated);
      const wrapper = mount(SiteRoomList, { props: baseProps([room({ description: null })]), global: { stubs } });
      await openFill(wrapper);
      await byLabel(wrapper, "Roll it with AI").trigger("click");
      await flushPromises();
      wrapper.findComponent({ name: "RichTextEditor" }).vm.$emit("update:modelValue", tiptap("Changed."));
      await flushPromises();
      await byLabel(wrapper, "Save").trigger("click");
      expect(mocks.updateLocation).toHaveBeenCalledWith(
        { id: "room-a", update: { description: tiptap("Changed."), ai_provenance: { ...generated.ai_provenance, edited: true } } },
        expect.anything(),
      );
    });

    it("does not roll when the credit gate refuses", async () => {
      mocks.aiEnabled.value = true;
      mocks.canSpend.mockReturnValueOnce(false);
      const wrapper = mount(SiteRoomList, { props: baseProps([room({ description: null })]), global: { stubs } });
      await openFill(wrapper);
      await byLabel(wrapper, "Roll it with AI").trigger("click");
      expect(mocks.fill).not.toHaveBeenCalled();
    });
  });
});
