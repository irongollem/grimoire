import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CustomClass, SystemClass } from "@/levelup/customTypes";

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));
const viewer = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, isAppAdmin: false }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => viewer }));
vi.mock("@/composables/rules/useFeatures", () => ({ useAllFeatures: () => ({ data: ref([]) }) }));
vi.mock("@/composables/rules/useCustomClasses", async (orig) => ({
  ...(await orig<typeof import("@/composables/rules/useCustomClasses")>()),
  useDeleteCustomClass: () => ({ mutateAsync: vi.fn() }),
  useDuplicateClass: () => ({ duplicate: vi.fn(), isPending: ref(false) }),
}));

import CustomClassSheet from "./CustomClassSheet.vue";

const base = {
  id: "i1",
  class_name: "Barbarian",
  hit_die: 12,
  primary_ability: null,
  saving_throws: [],
  armor_proficiencies: [],
  weapon_proficiencies: [],
  subclass_level: 3,
  features: {},
  spell_slots: null,
  spells_known: null,
  cantrips_known: null,
  slot_recovery: "long",
  caster_type: "none",
  prepared_ability: null,
  prepared_divisor: null,
  image_url: null,
  focal_point: null,
};

describe("CustomClassSheet", () => {
  it("hides Edit and Delete for a library class and offers Duplicate", () => {
    const w = mount(CustomClassSheet, { props: { cls: base as unknown as SystemClass } });
    expect(w.text()).toContain("Library · read only");
    expect(w.text()).toContain("Duplicate to customise");
    expect(w.text()).not.toContain("Edit");
    expect(w.text()).not.toContain("Delete");
  });

  it("shows Edit and Delete for a homebrew class", () => {
    const custom = { ...base, user_id: "u1", campaign_id: null } as unknown as CustomClass;
    const w = mount(CustomClassSheet, { props: { cls: custom } });
    expect(w.text()).toContain("Edit");
    expect(w.text()).toContain("Delete");
    expect(w.text()).not.toContain("Library · read only");
  });

  it("keeps a shared book class read-only for a DM, with Duplicate", () => {
    const shared = { ...base, user_id: null, campaign_id: null } as unknown as CustomClass;
    const w = mount(CustomClassSheet, { props: { cls: shared } });
    expect(w.text()).toContain("Library · read only");
    expect(w.text()).toContain("Duplicate to customise");
    expect(w.text()).not.toContain("Delete");
  });

  it("keeps another account's class read-only", () => {
    const theirs = { ...base, user_id: "dm", campaign_id: null } as unknown as CustomClass;
    const w = mount(CustomClassSheet, { props: { cls: theirs } });
    expect(w.text()).toContain("Read only");
    expect(w.text()).not.toContain("Delete");
  });
});
