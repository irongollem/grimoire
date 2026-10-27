import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import type { Background } from "@/types/background.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const scope = vi.hoisted(() => ({ ruleset: "2014" as "2014" | "2024", slugs: ["srd-2014"] as string[] | null, deleted: [] as unknown[] }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/lib/storage", () => ({ deleteUnreferencedByPublicUrl: async (arg: unknown) => void scope.deleted.push(arg) }));
vi.mock("@/composables/rules/useRuleset", () => ({
  useRuleset: () => ({ ruleset: { get value() { return scope.ruleset; } } }),
}));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: { get value() { return scope.slugs; } }, isLoading: ref(false) }),
}));

import {
  backgroundFromLibraryRow,
  isLibraryBackground,
  useBackgrounds,
  useBackgroundsByIds,
  useCreateBackground,
  useDeleteBackground,
} from "./useBackgrounds";

function row(overrides: Partial<Omit<Background, "user_id">>): Omit<Background, "user_id"> {
  return {
    id: "srd_srd_2014_acolyte",
    name: "Acolyte",
    description: null,
    skill_proficiencies: [],
    tool_proficiencies: [],
    languages: [],
    equipment: null,
    feature_name: null,
    feature_description: null,
    feat_grant_name: null,
    feat_grant_description: null,
    asi_ability_trio: null,
    origin_feat: null,
    suggested_characteristics: null,
    tags: [],
    source: "srd-2014",
    image_url: null,
    focal_point: null,
    created_at: "2026-10-05T00:00:00Z",
    updated_at: "2026-10-05T00:00:00Z",
    source_document_key: "srd-2014",
    source_record_key: "srd-2014_acolyte",
    ...overrides,
  } as Omit<Background, "user_id">;
}

describe("isLibraryBackground", () => {
  it("is true for a library slug and false for a custom uuid", () => {
    expect(isLibraryBackground({ id: "srd_srd_2014_acolyte" })).toBe(true);
    expect(isLibraryBackground({ id: "97300000-0000-4000-8000-0000000000b1" })).toBe(false);
  });
});

describe("backgroundFromLibraryRow", () => {
  it("gives a library row no owner", () => {
    expect(backgroundFromLibraryRow(row({})).user_id).toBe("");
  });
});

const UUID_A = "97300000-0000-4000-8000-0000000000b1";
const UUID_B = "97300000-0000-4000-8000-0000000000b2";

function run<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({ setup() { out = setup(); return () => null; } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return out;
}

const libRow = (over: Partial<Omit<Background, "user_id">>, ruleset: "2014" | "2024") => ({ ...row(over), ruleset });
const custom = (id: string, name: string, over: Record<string, unknown> = {}) => ({ ...row({ id, name, source: null, source_document_key: null, source_record_key: null }), user_id: "u1", ...over });

describe("the backgrounds on offer", () => {
  beforeEach(() => {
    fake.reset();
    scope.ruleset = "2014";
    scope.slugs = ["srd-2014"];
    scope.deleted = [];
  });

  it("lists the library's backgrounds from the enabled books in this edition, with the user's own, by name", async () => {
    fake.seed("library_backgrounds", [
      libRow({ id: "srd_srd_2014_sage", name: "Sage", source: "srd-2014" }, "2014"),
      libRow({ id: "srd_srd_2024_sage", name: "Sage 2024", source: "srd-2014" }, "2024"),
      libRow({ id: "kobold_scout", name: "Scout", source: "kobold-press" }, "2014"),
    ]);
    fake.seed("backgrounds", [custom(UUID_A, "Bard's Apprentice")]);
    const bgs = run(() => useBackgrounds());
    await flushPromises();
    expect(bgs.data.value.map((b) => b.name)).toEqual(["Bard's Apprentice", "Sage"]);
  });

  it("the user's own backgrounds: the other edition stays out and one with no edition fits both", async () => {
    scope.slugs = [];
    fake.seed("backgrounds", [
      custom(UUID_A, "Current", { ruleset: "2014" }),
      custom(UUID_B, "Either", { ruleset: null }),
      custom("97300000-0000-4000-8000-0000000000b3", "Other edition", { ruleset: "2024" }),
    ]);
    const bgs = run(() => useBackgrounds());
    await flushPromises();
    expect(bgs.data.value.map((b) => b.name)).toEqual(["Current", "Either"]);
    scope.ruleset = "2024";
    const later = run(() => useBackgrounds());
    await flushPromises();
    expect(later.data.value.map((b) => b.name)).toEqual(["Either", "Other edition"]);
  });

  it("reads no library rows while no book is enabled", async () => {
    scope.slugs = [];
    fake.seed("library_backgrounds", [libRow({ id: "srd_srd_2014_sage", name: "Sage", source: "srd-2014" }, "2014")]);
    const bgs = run(() => useBackgrounds());
    await flushPromises();
    expect(bgs.data.value).toEqual([]);
    expect(fake.calls.some((c) => c.target === "library_backgrounds")).toBe(false);
  });

  it("waits for the enabled books rather than reading the library unfiltered", async () => {
    scope.slugs = null;
    run(() => useBackgrounds());
    await flushPromises();
    expect(fake.calls.some((c) => c.target === "library_backgrounds")).toBe(false);
  });
});

describe("backgrounds a character already has", () => {
  beforeEach(() => {
    fake.reset();
    scope.ruleset = "2014";
  });

  it("finds each by id in the table it lives in, whatever edition and book is on, and reads only that table", async () => {
    scope.ruleset = "2014";
    fake.seed("library_backgrounds", [
      libRow({ id: "srd_srd_2024_acolyte", name: "Acolyte 2024", source: "srd-2024" }, "2024"),
      libRow({ id: "srd_srd_2014_sage", name: "Sage", source: "srd-2014" }, "2014"),
    ]);
    fake.seed("backgrounds", [custom(UUID_A, "Mine"), custom(UUID_B, "Not asked for")]);
    const found = run(() => useBackgroundsByIds(["srd_srd_2024_acolyte", UUID_A, null, undefined]));
    await flushPromises();
    expect([...found.data.value.keys()].sort()).toEqual([UUID_A, "srd_srd_2024_acolyte"].sort());
  });

  it("asks for nothing when no character has a background", async () => {
    run(() => useBackgroundsByIds([null, undefined]));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it.each([
    ["a library slug", "srd_srd_2014_sage", "library_backgrounds"],
    ["a custom uuid", UUID_A, "backgrounds"],
  ])("sends %s only to the table it lives in", async (_label, id, table) => {
    run(() => useBackgroundsByIds([id]));
    await flushPromises();
    expect(fake.calls.map((c) => c.target)).toEqual([table]);
  });
});

describe("saving and deleting backgrounds", () => {
  beforeEach(() => {
    fake.reset();
    scope.deleted = [];
  });

  it("stamps the new background with the signed-in user", async () => {
    const create = run(() => useCreateBackground());
    const { id: _id, created_at: _c, updated_at: _u, ...insert } = row({ id: UUID_A, name: "Mine" });
    await create.mutateAsync({ ...insert });
    expect(fake.rows("backgrounds")).toMatchObject([{ name: "Mine", user_id: "u1" }]);
  });

  it("deleting removes the row and then its art, once nothing else uses it", async () => {
    fake.seed("backgrounds", [custom(UUID_A, "Mine", { image_url: "https://cdn.test/a.webp" }), custom(UUID_B, "Other")]);
    const del = run(() => useDeleteBackground());
    await del.mutateAsync(custom(UUID_A, "Mine", { image_url: "https://cdn.test/a.webp" }) as unknown as Background);
    expect(fake.rows("backgrounds").map((r) => r.id)).toEqual([UUID_B]);
    expect(scope.deleted).toEqual([{ urls: ["https://cdn.test/a.webp"] }]);
  });

  it("keeps the art when the row could not be deleted", async () => {
    fake.seed("backgrounds", [custom(UUID_A, "Mine", { image_url: "https://cdn.test/a.webp" })]);
    fake.failNext("backgrounds", { message: "denied" });
    const del = run(() => useDeleteBackground());
    await expect(del.mutateAsync(custom(UUID_A, "Mine", { image_url: "https://cdn.test/a.webp" }) as unknown as Background)).rejects.toMatchObject({ message: "denied" });
    expect(scope.deleted).toEqual([]);
  });
});
