import { mount } from "@vue/test-utils";
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

import {
  fetchLibraryMonsterArtEntries,
  fetchLibraryMonsterArtEntry,
  useUpsertLibraryMonsterArt,
} from "./useLibraryMonsterArt";

const artRow = (entry_id: string, over: Record<string, unknown> = {}) => ({
  entry_id,
  image_url: null,
  cutout_url: null,
  portrait_focal_point: null,
  ...over,
});

describe("reading a monster's art over the database", () => {
  beforeEach(() => {
    fake.reset();
    session.user = { id: "me" };
    session.isAppAdmin = false;
    session.canonicalWrites = [];
  });

  it("merges the canonical art with MY override for one monster, and never another user's override of it", async () => {
    fake.seed("library_monster_art_canonical", [
      artRow("goblin", { image_url: "canonical.webp" }),
      artRow("owlbear", { image_url: "owlbear.webp" }),
    ]);
    fake.seed("library_monster_art", [
      artRow("goblin", { user_id: "me", cutout_url: "my-cut.webp" }),
      artRow("goblin", { user_id: "someone-else", image_url: "theirs.webp" }),
    ]);
    fake.calls.length = 0;
    expect(await fetchLibraryMonsterArtEntry("goblin")).toEqual({
      image_url: "canonical.webp",
      cutout_url: "my-cut.webp",
      portrait_focal_point: null,
    });
    // A detail page names its monster in the request (#972); it must not download every monster's art to find one.
    expect(fake.calls.find((c) => c.target === "library_monster_art_canonical")?.filters).toEqual([
      { op: "eq", column: "entry_id", value: "goblin" },
    ]);
  });

  it("reads only the asked-for monsters, with my overrides alone", async () => {
    fake.seed("library_monster_art_canonical", [artRow("goblin", { image_url: "g.webp" }), artRow("owlbear", { image_url: "o.webp" })]);
    fake.seed("library_monster_art", [
      artRow("goblin", { user_id: "me", image_url: "my-g.webp" }),
      artRow("goblin", { user_id: "someone-else", image_url: "theirs.webp" }),
    ]);
    const map = await fetchLibraryMonsterArtEntries(["goblin"]);
    expect(Object.keys(map)).toEqual(["goblin"]);
    expect(map.goblin.image_url).toBe("my-g.webp");
  });

  it("asks for nothing when no monster is named", async () => {
    expect(await fetchLibraryMonsterArtEntries([])).toEqual({});
    expect(fake.calls).toEqual([]);
  });

  it("signed out, shows the canonical art alone", async () => {
    session.user = null;
    fake.seed("library_monster_art_canonical", [artRow("goblin", { image_url: "canonical.webp" })]);
    fake.seed("library_monster_art", [artRow("goblin", { user_id: "someone-else", image_url: "theirs.webp" })]);
    expect((await fetchLibraryMonsterArtEntry("goblin"))?.image_url).toBe("canonical.webp");
  });

  it("a failed read of either layer is an error, not 'no art'", async () => {
    fake.failNext("library_monster_art", { message: "denied" });
    await expect(fetchLibraryMonsterArtEntry("goblin")).rejects.toMatchObject({ message: "denied" });
    fake.failNext("library_monster_art", { message: "denied" });
    await expect(fetchLibraryMonsterArtEntries(["goblin"])).rejects.toMatchObject({ message: "denied" });
    fake.failNext("library_monster_art_canonical", { message: "down" });
    await expect(fetchLibraryMonsterArtEntries(["goblin"])).rejects.toMatchObject({ message: "down" });
  });
});

describe("saving a monster's art", () => {
  beforeEach(() => {
    fake.reset();
    session.user = { id: "me" };
    session.isAppAdmin = false;
    session.canonicalWrites = [];
  });

  function mutation() {
    let out!: ReturnType<typeof useUpsertLibraryMonsterArt>;
    mount(
      defineComponent({ setup() { out = useUpsertLibraryMonsterArt(); return () => null; } }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    );
    return out;
  }

  it("a DM's edit is their own private override, replacing their earlier one and nobody else's", async () => {
    fake.seed("library_monster_art", [
      artRow("goblin", { user_id: "someone-else", image_url: "theirs.webp" }),
      artRow("goblin", { user_id: "me", image_url: "old.webp" }),
    ]);
    await mutation().mutateAsync({ entry_id: "goblin", image_url: "new.webp" });
    const rows = fake.rows("library_monster_art");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.user_id === "me")).toMatchObject({ image_url: "new.webp" });
    expect(rows.find((r) => r.user_id === "someone-else")).toMatchObject({ image_url: "theirs.webp" });
    expect(session.canonicalWrites).toEqual([]);
  });

  it("an admin's edit goes to the canonical art and leaves their private overrides alone", async () => {
    session.isAppAdmin = true;
    await mutation().mutateAsync({ entry_id: "goblin", image_url: "canonical.webp" });
    expect(session.canonicalWrites).toEqual([{ entry_id: "goblin", image_url: "canonical.webp" }]);
    expect(fake.rows("library_monster_art")).toEqual([]);
  });
});
