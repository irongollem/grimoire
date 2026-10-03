import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SourcesPickerPanel from "./SourcesPickerPanel.vue";

const mocks = vi.hoisted(() => ({
  campaignRows: [] as { source_slug: string }[],
  userRows: [] as { source_slug: string }[],
  campaignEnable: vi.fn(),
  campaignDisable: vi.fn(),
  userEnable: vi.fn(),
  userDisable: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, fromError: (e: unknown, fb: string) => `${fb}` + (e instanceof Error ? ` ${e.message}` : "") }),
}));

vi.mock("@/composables/library/useEnabledSources", () => ({
  STANDALONE_LIBRARY_SLUGS: ["srd-2014", "srd-2024"],
  useEnabledSources: () => ({ data: ref(mocks.campaignRows) }),
  useUserEnabledSources: () => ({ data: ref(mocks.userRows) }),
  useEnableSource: () => ({ isPending: ref(false), mutate: mocks.campaignEnable }),
  useDisableSource: () => ({ isPending: ref(false), mutate: mocks.campaignDisable }),
  useEnableUserSource: () => ({ isPending: ref(false), mutate: mocks.userEnable }),
  useDisableUserSource: () => ({ isPending: ref(false), mutate: mocks.userDisable }),
}));

const SOURCES = [
  { source: "srd-2014", source_title: "SRD 2014", count: 40 },
  { source: "toh", source_title: "Tome of Heroes", count: 12 },
];

function mountPicker(scope?: "campaign" | "player") {
  return mount(SourcesPickerPanel, {
    props: {
      variant: "sheet",
      scope,
      description: "d",
      emptyMessage: "none",
      availableSources: SOURCES,
      isLoading: false,
    },
    global: { stubs: { RouterLink: true } },
  });
}

describe("SourcesPickerPanel", () => {
  beforeEach(() => {
    mocks.campaignRows = [];
    mocks.userRows = [];
    vi.clearAllMocks();
  });

  it("toggles the campaign's books by default", async () => {
    mocks.campaignRows = [{ source_slug: "toh" }];
    const w = mountPicker();
    const boxes = w.findAll("input[type=checkbox]");
    expect(boxes.map((b) => (b.element as HTMLInputElement).checked)).toEqual([false, true]);
    await boxes[0]!.setValue(true);
    expect(mocks.campaignEnable).toHaveBeenCalledWith({ source_slug: "srd-2014", source_title: "SRD 2014" }, expect.anything());
    await boxes[1]!.setValue(false);
    expect(mocks.campaignDisable).toHaveBeenCalledWith("toh", expect.anything());
    expect(mocks.userEnable).not.toHaveBeenCalled();
    expect(w.text()).not.toContain("always on");
  });

  it("shows both SRDs checked, disabled and marked always on in player scope", () => {
    const w = mountPicker("player");
    const boxes = w.findAll("input[type=checkbox]");
    // srd-2024 is not in the library list, so it is added; order: missing first, then listed.
    expect(w.text()).toContain("SRD 2024");
    const locked = boxes.filter((b) => (b.element as HTMLInputElement).disabled);
    expect(locked).toHaveLength(2);
    expect(locked.every((b) => (b.element as HTMLInputElement).checked)).toBe(true);
    expect(w.text().match(/always on/g)).toHaveLength(2);
  });

  it("toggles the player's own books in player scope", async () => {
    mocks.userRows = [];
    const w = mountPicker("player");
    const toh = w.findAll("input[type=checkbox]").find((b) => !(b.element as HTMLInputElement).disabled)!;
    await toh.setValue(true);
    expect(mocks.userEnable).toHaveBeenCalledWith({ source_slug: "toh", source_title: "Tome of Heroes" }, expect.anything());
    expect(mocks.campaignEnable).not.toHaveBeenCalled();
  });

  it("tells the player when a toggle fails", async () => {
    const w = mountPicker("player");
    const toh = w.findAll("input[type=checkbox]").find((b) => !(b.element as HTMLInputElement).disabled)!;
    await toh.setValue(true);
    const options = mocks.userEnable.mock.calls[0]![1] as { onError: (e: unknown) => void };
    options.onError(new Error("boom"));
    expect(mocks.toastError).toHaveBeenCalledWith("Couldn't change the books. boom");
  });
});
