import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { defineComponent, ref } from "vue";
import type { CustomClass, SystemClass } from "@/levelup/customTypes";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const scope = vi.hoisted(() => ({ ruleset: "2014" as "2014" | "2024", deleted: [] as unknown[], disabled: [] as string[] }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/lib/storage", () => ({ deleteUnreferencedByPublicUrl: async (arg: unknown) => void scope.deleted.push(arg) }));
vi.mock("@/composables/rules/useRuleset", () => ({
  useRuleset: () => ({ ruleset: { get value() { return scope.ruleset; } } }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "camp-1", activeCampaign: { disabled_class_names: scope.disabled } }),
}));

import {
  canEditClass,
  customClassCopy,
  fetchClassRecord,
  isCustomClass,
  useAllCustomClasses,
  useCampaignSystemClasses,
  useCreateCustomClass,
  useCustomClassByName,
  useDeleteCustomClass,
} from "./useCustomClasses";

function run<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({ setup() { out = setup(); return () => null; } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return out;
}

const library = {
  id: "11111111-0000-4000-8000-000000000001",
  class_name: "Barbarian",
  hit_die: 12,
  primary_ability: "Strength",
  saving_throws: ["str", "con"],
  armor_proficiencies: [],
  weapon_proficiencies: [],
  subclass_level: 3,
  features: { "1": ["f1"] },
  spell_slots: null,
  spells_known: null,
  cantrips_known: null,
  slot_recovery: "long",
  caster_type: "none",
  prepared_ability: null,
  prepared_divisor: null,
  image_url: null,
  focal_point: null,
} as unknown as SystemClass;

describe("fetchClassRecord", () => {
  beforeEach(() => {
    fake.reset();
    scope.ruleset = "2014";
    scope.deleted = [];
    scope.disabled = [];
  });

  it("returns the homebrew row that holds the id, and not another class's", async () => {
    fake.seed("custom_classes", [
      { id: "c0", user_id: "u1", class_name: "Other" },
      { id: "c1", user_id: "u1", class_name: "Witch Hunter" },
    ]);
    expect(await fetchClassRecord("c1")).toEqual({ kind: "custom", cls: { id: "c1", user_id: "u1", class_name: "Witch Hunter" } });
  });

  it("falls through to system_classes when no homebrew row has the id", async () => {
    fake.seed("custom_classes", [{ id: "c1", user_id: "u1", class_name: "Witch Hunter" }]);
    fake.seed("system_classes", [{ ...library }, { ...library, id: "other-system" }]);
    expect(await fetchClassRecord(library.id)).toEqual({ kind: "library", cls: library });
  });

  it("throws a read error rather than treating it as a missing row", async () => {
    fake.seed("system_classes", [{ ...library }]);
    fake.failNext("custom_classes", { message: "boom" });
    await expect(fetchClassRecord(library.id)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("class lookups and writes", () => {
  beforeEach(() => {
    fake.reset();
    scope.ruleset = "2014";
    scope.deleted = [];
    scope.disabled = [];
  });

  it("looks a class up by name, preferring the user's own over a shared book's of the same name", async () => {
    fake.seed("custom_classes", [
      { id: "book", user_id: null, class_name: "Mechanist", source_document_key: "black-flag" },
      { id: "mine", user_id: "u1", class_name: "Mechanist", source_document_key: null },
      { id: "elsewhere", user_id: "u1", class_name: "Artificer", source_document_key: null },
    ]);
    const hit = run(() => useCustomClassByName(ref("Mechanist")));
    await flushPromises();
    expect(hit.data.value?.id).toBe("mine");
  });

  it("falls back to a book's class when the user has none of that name, and to null when nothing matches", async () => {
    fake.seed("custom_classes", [{ id: "book", user_id: null, class_name: "Mechanist", source_document_key: "black-flag" }]);
    const book = run(() => useCustomClassByName(ref("Mechanist")));
    const none = run(() => useCustomClassByName(ref("Nobody")));
    await flushPromises();
    expect(book.data.value?.id).toBe("book");
    expect(none.data.value).toBeNull();
  });

  it("lists the classes of this edition, and ones with no edition, but not the other edition's", async () => {
    fake.seed("custom_classes", [
      { id: "now", user_id: "u1", class_name: "B Now", ruleset: "2014" },
      { id: "either", user_id: "u1", class_name: "A Either", ruleset: null },
      { id: "later", user_id: "u1", class_name: "C Later", ruleset: "2024" },
    ]);
    const all = run(() => useAllCustomClasses());
    await flushPromises();
    expect(all.data.value?.map((c) => c.id)).toEqual(["either", "now"]);
  });

  it("looks a class up by name only within this edition, so a 2024 twin is not offered to a 2014 table", async () => {
    fake.seed("custom_classes", [
      { id: "twin-2024", user_id: "u1", class_name: "Mechanist", ruleset: "2024", source_document_key: null },
      { id: "twin-2014", user_id: "u1", class_name: "Mechanist", ruleset: "2014", source_document_key: "black-flag" },
    ]);
    const hit = run(() => useCustomClassByName(ref("Mechanist")));
    await flushPromises();
    expect(hit.data.value?.id).toBe("twin-2014");
  });

  it("stamps a new class with the signed-in user", async () => {
    const create = run(() => useCreateCustomClass());
    await create.mutateAsync({ ...customClassCopy(library), class_name: "Mine" });
    expect(fake.rows("custom_classes")).toMatchObject([{ class_name: "Mine", user_id: "u1" }]);
  });

  it("deleting removes the class and then its art, but keeps the art when the delete fails", async () => {
    fake.seed("custom_classes", [{ id: "c1", user_id: "u1", class_name: "A", image_url: "https://cdn.test/a.webp" }, { id: "c2", user_id: "u1", class_name: "B" }]);
    const del = run(() => useDeleteCustomClass());
    fake.failNext("custom_classes", { message: "denied" });
    await expect(del.mutateAsync({ id: "c1", image_url: "https://cdn.test/a.webp" })).rejects.toMatchObject({ message: "denied" });
    expect(scope.deleted).toEqual([]);
    await del.mutateAsync({ id: "c1", image_url: "https://cdn.test/a.webp" });
    expect(fake.rows("custom_classes").map((r) => r.id)).toEqual(["c2"]);
    expect(scope.deleted).toEqual([{ urls: ["https://cdn.test/a.webp"] }]);
  });

  it("offers the edition's system classes, minus the ones the DM disabled, while keeping the full list for existing characters", async () => {
    fake.seed("system_classes", [
      { ...library, id: "s1", class_name: "Barbarian", ruleset: "2014" },
      { ...library, id: "s2", class_name: "Bard", ruleset: "2014" },
      { ...library, id: "s3", class_name: "Bard 2024", ruleset: "2024" },
    ]);
    scope.disabled = ["Barbarian"];
    const classes = run(() => useCampaignSystemClasses());
    await flushPromises();
    expect(classes.data.value.map((c) => c.class_name)).toEqual(["Bard"]);
    expect(classes.all.value?.map((c) => c.class_name)).toEqual(["Barbarian", "Bard"]);
  });
});

describe("isCustomClass and customClassCopy", () => {
  it("tells a library row (no owner) from a homebrew one", () => {
    expect(isCustomClass(library)).toBe(false);
    expect(isCustomClass({ ...library, user_id: "u1" } as unknown as CustomClass)).toBe(true);
  });

  it("copies a library class as an unscoped homebrew draft", () => {
    expect(customClassCopy(library)).toMatchObject({
      class_name: "Barbarian (copy)",
      campaign_id: null,
      hit_die: 12,
      source: null,
      features: { "1": ["f1"] },
    });
  });
});

describe("canEditClass", () => {
  const own = { ...library, user_id: "u1" } as unknown as CustomClass;
  const shared = { ...library, user_id: null } as unknown as CustomClass;
  const someoneElses = { ...library, user_id: "dm" } as unknown as CustomClass;
  const dm = { userId: "u1", isAdmin: false };
  const admin = { userId: "a1", isAdmin: true };

  it("lets the owner edit their homebrew and nobody else", () => {
    expect(canEditClass(own, dm)).toBe(true);
    expect(canEditClass(someoneElses, dm)).toBe(false);
    expect(canEditClass(own, { userId: null, isAdmin: false })).toBe(false);
    // Being admin opens the shared book classes, not a DM's own homebrew.
    expect(canEditClass(someoneElses, admin)).toBe(false);
  });

  it("keeps a shared book class read-only except for the admin", () => {
    expect(canEditClass(shared, dm)).toBe(false);
    expect(canEditClass(shared, admin)).toBe(true);
  });

  it("never lets anyone edit a system class", () => {
    expect(canEditClass(library, admin)).toBe(false);
  });
});
