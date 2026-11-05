// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const m = vi.hoisted(() => ({
  fromPicture: vi.fn(),
  fromUpload: vi.fn(),
  fromPainted: vi.fn(),
  ai: true,
}));
vi.mock("@/composables/bookNook/useStartNook", async () => {
  const { ref } = await import("vue");
  return {
    useStartNook: () => ({
      starting: ref(false),
      error: ref(null),
      paintCost: ref(6),
      startFromPicture: m.fromPicture,
      startFromUpload: m.fromUpload,
      startFromPainted: m.fromPainted,
    }),
  };
});
vi.mock("@/composables/locations/useLocations", async () => {
  const { ref } = await import("vue");
  return {
    useAllLocations: () => ({
      data: ref([
        { id: "p1", name: "The Stag", image_url: "https://cdn.example.invalid/a.webp" },
        { id: "p2", name: "The Bare Hill", image_url: null },
      ]),
    }),
  };
});
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return m.ai; } }) }));

import NewNookDialog from "./NewNookDialog.vue";

const Combo = {
  props: ["modelValue", "options"],
  emits: ["update:modelValue"],
  template: "<div data-testid='combo'>{{ options.map((o) => o.id).join(',') }}<button data-testid='pick' @click=\"$emit('update:modelValue', options[0].id)\" /></div>",
};
const stubs = {
  AppModal: { template: "<div><slot /></div>" },
  ModalHeader: true,
  EntityCombobox: Combo,
  AppButton: {
    props: ["label", "disabled"],
    emits: ["click"],
    template: "<button :disabled='disabled' :data-label='label' @click=\"$emit('click')\">{{ label }}</button>",
  },
  SegmentedControl: { props: ["modelValue", "options"], template: "<div />" },
  AppInput: true,
};

function mountOpen() {
  return mount(NewNookDialog, { props: { open: true }, global: { stubs } });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ai = true;
  m.fromPicture.mockResolvedValue("n1");
});

describe("NewNookDialog", () => {
  it("offers only places that have a picture, and starts from the one picked", async () => {
    const d = mountOpen();
    expect(d.get("[data-testid=combo]").text()).toBe("p1");
    const start = () => d.findAll("button").find((b) => b.attributes("data-label") === "Start nook")!;
    expect(start().attributes("disabled")).toBeDefined();
    await d.get("[data-testid=pick]").trigger("click");
    await start().trigger("click");
    await flushPromises();
    expect(m.fromPicture).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
    expect(d.emitted("close")).toHaveLength(1);
  });

  it("stays open when the start fails", async () => {
    m.fromPicture.mockResolvedValue(null);
    const d = mountOpen();
    await d.get("[data-testid=pick]").trigger("click");
    await d.findAll("button").find((b) => b.attributes("data-label") === "Start nook")!.trigger("click");
    await flushPromises();
    expect(d.emitted("close")).toBeUndefined();
  });
});
