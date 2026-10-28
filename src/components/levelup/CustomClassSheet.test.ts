import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CustomClass, SystemClass } from "@/levelup/customTypes";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  del: vi.fn(),
  duplicate: vi.fn(),
  confirm: vi.fn(),
  features: [] as Array<{ id: string; name: string }>,
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
const viewer = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, isAppAdmin: false }));
vi.mock("@/composables/library/useSourceTitles", async () => {
  const { sourceLabel } = await import("@/lib/library/sourceLabel");
  const titles = new Map<string, string>();
  return {
    useSourceTitles: () => ({ labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, titles) }),
  };
});
vi.mock("@/stores/auth", () => ({ useAuthStore: () => viewer }));
vi.mock("@/composables/rules/useFeatures", () => ({ useAllFeatures: () => ({ data: ref(mocks.features) }) }));
vi.mock("@/composables/rules/useCustomClasses", async (orig) => ({
  ...(await orig<typeof import("@/composables/rules/useCustomClasses")>()),
  useDeleteCustomClass: () => ({ mutateAsync: mocks.del }),
  useDuplicateClass: () => ({ duplicate: mocks.duplicate, isPending: ref(false) }),
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
    expect(w.text()).toContain("Read only");
    expect(w.text()).toContain("Duplicate to customise");
    expect(w.text()).not.toContain("Edit");
    expect(w.text()).not.toContain("Delete");
  });

  it("shows Edit and Delete for a homebrew class", () => {
    const custom = { ...base, user_id: "u1", campaign_id: null } as unknown as CustomClass;
    const w = mount(CustomClassSheet, { props: { cls: custom } });
    expect(w.text()).toContain("Edit");
    expect(w.text()).toContain("Delete");
    expect(w.text()).not.toContain("Read only");
  });

  it("keeps a shared book class read-only for a DM, with Duplicate", () => {
    const shared = { ...base, user_id: null, campaign_id: null } as unknown as CustomClass;
    const w = mount(CustomClassSheet, { props: { cls: shared } });
    expect(w.text()).toContain("Read only");
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

describe("CustomClassSheet actions", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.del.mockReset().mockResolvedValue(undefined);
    mocks.duplicate.mockReset();
    mocks.confirm.mockReset();
    mocks.features = [];
  });
  const homebrew = { ...base, user_id: "u1", campaign_id: null } as unknown as CustomClass;
  const press = async (w: ReturnType<typeof mount>, label: string) => {
    await w.findAll("button").find((b) => b.text().includes(label))!.trigger("click");
    await flushPromises();
  };

  it("keeps the class and stays put when the delete confirmation is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    await press(mount(CustomClassSheet, { props: { cls: homebrew } }), "Delete");
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("deletes a confirmed class and goes back to the class list", async () => {
    mocks.confirm.mockResolvedValue(true);
    await press(mount(CustomClassSheet, { props: { cls: homebrew } }), "Delete");
    expect(mocks.del).toHaveBeenCalledWith(homebrew);
    expect(mocks.push).toHaveBeenCalledWith("/codex/classes");
  });

  it("duplicating a library class opens the copy for editing", async () => {
    mocks.duplicate.mockResolvedValue({ id: "copy-9" });
    const lib = base as unknown as SystemClass;
    await press(mount(CustomClassSheet, { props: { cls: lib } }), "Duplicate to customise");
    expect(mocks.duplicate).toHaveBeenCalledWith(lib);
    expect(mocks.push).toHaveBeenCalledWith("/levelup/classes/copy-9");
  });

  it("shows the spellcasting card only for a class with a slot table, with its recovery", () => {
    const none = mount(CustomClassSheet, { props: { cls: homebrew } });
    expect(none.text()).not.toContain("Spellcasting");
    const caster = { ...homebrew, spell_slots: { "1": [2] }, caster_type: "prepared", slot_recovery: "short" } as unknown as CustomClass;
    const w = mount(CustomClassSheet, { props: { cls: caster } });
    expect(w.text()).toContain("Prepared caster");
    expect(w.text()).toContain("Short rest recovery");
    const long = mount(CustomClassSheet, { props: { cls: { ...caster, slot_recovery: "long" } as unknown as CustomClass } });
    expect(long.text()).toContain("Long rest recovery");
  });

  it("lists features by name under their levels in order, and falls back to the id for an unknown one", () => {
    mocks.features = [{ id: "f-rage", name: "Rage" }];
    const cls = { ...homebrew, features: { "5": ["f-rage"], "1": ["f-mystery"] } } as unknown as CustomClass;
    const text = mount(CustomClassSheet, { props: { cls } }).text();
    expect(text).toContain("Rage");
    expect(text).toContain("f-mystery");
    expect(text.indexOf("f-mystery")).toBeLessThan(text.indexOf("Rage"));
  });
});
