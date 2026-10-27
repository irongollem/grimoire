import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "me" } as { id: string } | null, isAppAdmin: false, canonicalWrites: [] as unknown[] }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isAppAdmin() { return session.isAppAdmin; } }) }));
vi.mock("./writeCanonicalLibraryArt", async () => {
  const actual = await vi.importActual<typeof import("./writeCanonicalLibraryArt")>("./writeCanonicalLibraryArt");
  return { ...actual, writeCanonicalLibraryArt: async (_config: unknown, entry: unknown) => void session.canonicalWrites.push(entry) };
});

import { mergeLibrarySpellArtLayers, useLibrarySpellArtEntry, useUpsertLibrarySpellArt } from "./useLibrarySpellArt";

describe("mergeLibrarySpellArtLayers", () => {
  it("returns canonical art for an entry_id with no private override", () => {
    const result = mergeLibrarySpellArtLayers(
      [{ entry_id: "fireball", image_url: "canonical.webp", portrait_focal_point: null }],
      [],
    );
    expect(result).toEqual({ fireball: { image_url: "canonical.webp", portrait_focal_point: null } });
  });

  it("returns a private override for an entry_id with no canonical art", () => {
    const result = mergeLibrarySpellArtLayers(
      [],
      [{ entry_id: "fireball", image_url: "mine.webp", portrait_focal_point: { x: 0.5, y: 0.5 } }],
    );
    expect(result).toEqual({ fireball: { image_url: "mine.webp", portrait_focal_point: { x: 0.5, y: 0.5 } } });
  });

  it("the user's own art always wins over canonical art for the same entry_id", () => {
    const result = mergeLibrarySpellArtLayers(
      [{ entry_id: "fireball", image_url: "canonical.webp", portrait_focal_point: null }],
      [{ entry_id: "fireball", image_url: "mine.webp", portrait_focal_point: { x: 0.2, y: 0.8 } }],
    );
    expect(result).toEqual({ fireball: { image_url: "mine.webp", portrait_focal_point: { x: 0.2, y: 0.8 } } });
  });

  it("an override that only moves the focal point keeps the canonical picture, field by field (#917)", () => {
    const result = mergeLibrarySpellArtLayers(
      [{ entry_id: "fireball", image_url: "canonical.webp", portrait_focal_point: { x: 0.5, y: 0.5 } }],
      [{ entry_id: "fireball", image_url: null, portrait_focal_point: { x: 0.2, y: 0.8 } }],
    );
    expect(result).toEqual({ fireball: { image_url: "canonical.webp", portrait_focal_point: { x: 0.2, y: 0.8 } } });
  });
});

const spellArt = (entry_id: string, over: Record<string, unknown> = {}) => ({ entry_id, image_url: null, portrait_focal_point: null, ...over });

function run<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({ setup() { out = setup(); return () => null; } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return out;
}

describe("a spell's art over the database", () => {
  beforeEach(() => {
    fake.reset();
    session.user = { id: "me" };
    session.isAppAdmin = false;
    session.canonicalWrites = [];
  });

  it("shows my override over the canonical art for the spell, and never another user's override or another spell's art", async () => {
    fake.seed("library_spell_art_canonical", [spellArt("fireball", { image_url: "canonical.webp" }), spellArt("haste", { image_url: "haste.webp" })]);
    fake.seed("library_spell_art", [
      spellArt("fireball", { user_id: "me", image_url: "mine.webp" }),
      spellArt("fireball", { user_id: "someone-else", image_url: "theirs.webp" }),
    ]);
    const art = run(() => useLibrarySpellArtEntry("fireball"));
    await flushPromises();
    expect(art.data.value).toEqual({ image_url: "mine.webp", portrait_focal_point: null });
  });

  it("signed out, shows the canonical art alone; a failed read is an error, not 'no art'", async () => {
    session.user = null;
    fake.seed("library_spell_art_canonical", [spellArt("fireball", { image_url: "canonical.webp" })]);
    fake.seed("library_spell_art", [spellArt("fireball", { user_id: "someone-else", image_url: "theirs.webp" })]);
    const signedOut = run(() => useLibrarySpellArtEntry("fireball"));
    await flushPromises();
    expect(signedOut.data.value?.image_url).toBe("canonical.webp");

    session.user = { id: "me" };
    fake.failNext("library_spell_art", { message: "denied" });
    const failing = run(() => useLibrarySpellArtEntry("haste"));
    await flushPromises();
    expect(failing.error.value?.message).toBe("denied");

    fake.failNext("library_spell_art_canonical", { message: "down" });
    const failingCanonical = run(() => useLibrarySpellArtEntry("haste"));
    await flushPromises();
    expect(failingCanonical.error.value?.message).toBe("down");
  });

  it("reads nothing until it is enabled", async () => {
    run(() => useLibrarySpellArtEntry("fireball", false));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  function mutation() {
    return run(() => useUpsertLibrarySpellArt());
  }

  it("a DM's edit is their own private override, replacing their earlier one and nobody else's", async () => {
    fake.seed("library_spell_art", [
      spellArt("fireball", { user_id: "someone-else", image_url: "theirs.webp" }),
      spellArt("fireball", { user_id: "me", image_url: "old.webp" }),
    ]);
    await mutation().mutateAsync({ entry_id: "fireball", image_url: "new.webp" });
    const rows = fake.rows("library_spell_art");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.user_id === "me")).toMatchObject({ image_url: "new.webp" });
    expect(rows.find((r) => r.user_id === "someone-else")).toMatchObject({ image_url: "theirs.webp" });
    expect(session.canonicalWrites).toEqual([]);
  });

  it("an admin's edit goes to the canonical art and leaves their private overrides alone", async () => {
    session.isAppAdmin = true;
    await mutation().mutateAsync({ entry_id: "fireball", image_url: "canonical.webp" });
    expect(session.canonicalWrites).toEqual([{ entry_id: "fireball", image_url: "canonical.webp" }]);
    expect(fake.rows("library_spell_art")).toEqual([]);
  });
});
