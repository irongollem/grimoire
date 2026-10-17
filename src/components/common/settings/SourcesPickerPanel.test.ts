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

vi.mock("@/composables/library/useSourceTitles", async () => {
  const { sourceLabel } = await import("@/lib/library/sourceLabel");
  const titles = new Map([["srd-2014", "SRD 5.1"], ["srd-2024", "SRD 5.2"]]);
  return {
    useSourceTitles: () => ({ labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, titles) }),
  };
});
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
    expect(w.text()).toContain("SRD 5.2");
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

  describe("popover placement", () => {
    it("opens on the page, outside the card that holds its trigger, and closes on a tap elsewhere", async () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const w = mount(SourcesPickerPanel, {
        attachTo: host,
        props: { scope: "campaign", title: "Dressing Sources", description: "d", emptyMessage: "none", availableSources: SOURCES, isLoading: false },
        slots: { trigger: `<template #trigger="{ toggle }"><button data-test="t" @click="toggle" /></template>` },
        global: { stubs: { RouterLink: true, MobileSheet: true } },
      });
      await w.find("[data-test=t]").trigger("click");
      await w.vm.$nextTick();
      // A panel inside the card would be painted over by the next card's stacking context
      // (the Dressing picker hid behind the Spaces panel); on the body nothing can cover it.
      const panel = document.body.querySelector<HTMLElement>("[data-slip]");
      expect(panel).not.toBeNull();
      expect(host.contains(panel)).toBe(false);
      expect(panel!.style.position).toBe("fixed");
      expect(panel!.textContent).toContain("Dressing Sources");
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await w.vm.$nextTick();
      expect(document.body.querySelector("[data-slip]")).toBeNull();
      w.unmount();
      host.remove();
    });
  });

  describe("more-to-explore cue", () => {
    function mountPopover(cueKey: string) {
      return mount(SourcesPickerPanel, {
        props: { scope: "campaign", description: "d", emptyMessage: "none", availableSources: SOURCES, isLoading: false, cueKey },
        slots: {
          trigger: `<template #trigger="{ toggle, hasCue }"><button data-test="t" :data-cue="hasCue" @click="toggle" /></template>`,
        },
        global: { stubs: { RouterLink: true, MobileSheet: true } },
      });
    }

    beforeEach(() => localStorage.clear());

    it("shows the dot while an unenabled source is unseen, and clears it once opened", async () => {
      const w = mountPopover("monsters");
      expect(w.find("[data-test=t]").attributes("data-cue")).toBe("true");
      expect(w.find("[title='More library content to explore']").exists()).toBe(true);
      await w.find("[data-test=t]").trigger("click");
      expect(w.find("[data-test=t]").attributes("data-cue")).toBe("false");
      expect(w.find("[title='More library content to explore']").exists()).toBe(false);
    });

    it("shows no dot when every listed source is enabled", () => {
      mocks.campaignRows = [{ source_slug: "srd-2014" }, { source_slug: "toh" }];
      expect(mountPopover("spells").find("[data-test=t]").attributes("data-cue")).toBe("false");
    });

    it("marks sources seen when the sheet variant mounts", () => {
      mountPicker();
      const w = mount(SourcesPickerPanel, {
        props: { variant: "sheet", description: "d", emptyMessage: "none", availableSources: SOURCES, isLoading: false, cueKey: "items" },
        global: { stubs: { RouterLink: true } },
      });
      expect(JSON.parse(localStorage.getItem("library-source-cue-seen") ?? "{}")).toEqual({ items: ["srd-2014", "toh"] });
      w.unmount();
    });

    it("shows no dot without a cueKey", () => {
      const w = mount(SourcesPickerPanel, {
        props: { description: "d", emptyMessage: "none", availableSources: SOURCES, isLoading: false },
        slots: { trigger: `<template #trigger="{ hasCue }"><i data-test="t" :data-cue="hasCue" /></template>` },
        global: { stubs: { RouterLink: true, MobileSheet: true } },
      });
      expect(w.find("[data-test=t]").attributes("data-cue")).toBe("false");
    });
  });
});
