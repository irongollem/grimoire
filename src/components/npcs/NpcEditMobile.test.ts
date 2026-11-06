import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NpcEditMobile from "./NpcEditMobile.vue";


let statBlocksOffered = true;
vi.mock("@/composables/rules/useGameSystem", () => ({
  useGameSystem: () => ({ offers: () => statBlocksOffered }),
}));

function mountMobile() {
  return mount(NpcEditMobile, {
    props: {
      form: { name: "Elowen", tags: [], size: "Medium" } as never,
      statBlock: {} as never,
      hasStatBlock: true,
      artTab: "true-form",
      locationOptions: [],
    },
    global: { stubs: { StatBlockEditor: true, NpcIdentitySection: true, NpcLoreTab: true, EntityImageBlock: true, MobileEditBar: true, TagInput: true, AccordionSection: true, RelationshipWheel: true, EntityCombobox: true, DmNoteBox: true } },
  });
}

describe("NpcEditMobile — stat block card follows the game system (#934)", () => {
  // Bug caught: the phone form keeping a 5e Stat Block card in a Generic campaign
  // after the desktop form lost its Combat tab.
  it("shows the Stat Block card only where the system has stat blocks", () => {
    statBlocksOffered = true;
    expect(mountMobile().text()).toContain("Stat Block");
    statBlocksOffered = false;
    expect(mountMobile().text()).not.toContain("Stat Block");
  });
});
