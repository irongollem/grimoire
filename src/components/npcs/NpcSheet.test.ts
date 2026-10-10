import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import NpcSheet from "./NpcSheet.vue";
import type { Npc, NpcListRow } from "@/types/npc.types";

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
    global: { stubs: { FocalImage: true, AiImageBadge: true, NpcTabContent: TabContentStub, DmNoteBox: DmNoteBoxStub } },
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
});
