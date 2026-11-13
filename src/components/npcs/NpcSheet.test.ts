import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent } from "vue";
import { useLowArt } from "@/composables/useLowArt";
import NpcSheet from "./NpcSheet.vue";
import type { Npc, NpcListRow } from "@/types/npc.types";

const asked = vi.hoisted(() => [] as (string | null)[]);

vi.mock("@/composables/locations/useLocations", () => ({
  // Answers only for the id the sheet asks for, as `useLocation` does: a place the sheet
  // did not ask by id (the old every-place read) never reaches it.
  useLocation: (id: () => string | null) => ({
    data: computed(() => {
      const asking = id();
      asked.push(asking);
      return asking === "l1" ? { id: "l1", name: "Sugarspun" } : undefined;
    }),
  }),
}));

const TabContentStub = defineComponent({
  props: { npc: { type: Object, required: true }, full: { type: Object, default: undefined } },
  template: '<div data-testid="tabs" :data-has-full="full !== undefined" />',
});
const DmNoteBoxStub = defineComponent({
  props: { id: { type: String, required: true }, type: String, label: String },
  template: '<div data-testid="note-box" :data-id="id" />',
});

const row = { id: "n1", name: "Maera", status: "alive", relationship: "ally", tags: [], disguise_name: null, disguise_portrait_url: null } as unknown as NpcListRow;

function mountSheet(full?: Npc) {
  return mount(NpcSheet, {
    props: { npc: row, full },
    global: { stubs: { FocalImage: true, NpcTabContent: TabContentStub, DmNoteBox: DmNoteBoxStub } },
  });
}

describe("NpcSheet", () => {
  it("paints the header and badges from the list row alone, handing the tabs no record (#999)", () => {
    const sheet = mountSheet();
    expect(sheet.text()).toContain("alive");
    expect(sheet.get('[data-testid="tabs"]').attributes("data-has-full")).toBe("false");
  });

  it("starts the DM note read from the id alone, without waiting for the record", () => {
    const sheet = mountSheet();
    expect(sheet.get('[data-testid="note-box"]').attributes("data-id")).toBe("n1");
  });

  it("hands the tabs the full record once it lands", async () => {
    const sheet = mountSheet();
    await sheet.setProps({ full: { ...row, appearance: "x", personality: null, backstory: null, notes: null } as Npc });
    expect(sheet.get('[data-testid="tabs"]').attributes("data-has-full")).toBe("true");
  });

  describe("low art", () => {
    const { setLowArt } = useLowArt();
    afterEach(() => {
      setLowArt(false);
    });
    const withPicture = {
      ...row,
      portrait_url: "https://cdn/maera.webp",
      location_id: "l1",
      tags: ["innkeeper"],
    } as unknown as NpcListRow;
    const mountLow = (npc: NpcListRow) =>
      mount(NpcSheet, {
        props: { npc },
        global: { stubs: { FocalImage: true, NpcTabContent: TabContentStub, DmNoteBox: DmNoteBoxStub } },
      });

    // Bug: the NPC sheet keeps its 13 rem portrait column (and fetches the portrait) in low art.
    it("drops the portrait column and its picture", () => {
      setLowArt(true);
      const sheet = mountLow(withPicture);
      expect(sheet.findComponent({ name: "FocalImage" }).exists()).toBe(false);
      expect(sheet.find("img").exists()).toBe(false);
    });

    // Bug: what sat under the portrait (status, place, tags) vanishes with the column.
    it("carries the status, place and tags on a fact line, with a Portrait button for the NPC's own picture", () => {
      setLowArt(true);
      const text = mountLow(withPicture).text();
      expect(text).toContain("alive");
      expect(text).toContain("Sugarspun");
      expect(text).toContain("innkeeper");
      expect(text).toContain("Portrait");
    });

    // Bug: a Portrait button that opens nothing, for an NPC that has no picture of its own.
    it("shows no Portrait button when the NPC has no picture", () => {
      setLowArt(true);
      expect(mountLow(row).text()).not.toContain("Portrait");
    });

    // Bug: the sheet read every place of the active campaign to name one, and named nothing
    // for an NPC opened from another campaign.
    it("asks for its own place by id, and for none with low art off", () => {
      asked.length = 0;
      mountLow(withPicture);
      expect(asked.every((id) => id === null)).toBe(true);
      asked.length = 0;
      setLowArt(true);
      mountLow(withPicture);
      expect(asked).toContain("l1");
    });

    it("keeps the portrait column with low art off", () => {
      expect(mountLow(withPicture).findComponent({ name: "FocalImage" }).exists()).toBe(true);
    });
  });
});
