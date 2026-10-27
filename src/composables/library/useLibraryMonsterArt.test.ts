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
  mergeLibraryMonsterArtLayers,
  useUpsertLibraryMonsterArt,
  withLibraryArt,
  withLibraryArtAll,
} from "./useLibraryMonsterArt";

describe("mergeLibraryMonsterArtLayers", () => {
  it("returns canonical art for an entry_id with no private override", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical.webp", cutout_url: null, portrait_focal_point: null }],
      [],
    );
    expect(result).toEqual({ goblin: { image_url: "canonical.webp", cutout_url: null, portrait_focal_point: null } });
  });

  it("returns a private override for an entry_id with no canonical art", () => {
    const result = mergeLibraryMonsterArtLayers(
      [],
      [{ entry_id: "goblin", image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.5, y: 0.5 } }],
    );
    expect(result).toEqual({
      goblin: { image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.5, y: 0.5 } },
    });
  });

  it("the user's own art always wins over canonical art for the same entry_id", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical.webp", cutout_url: null, portrait_focal_point: null }],
      [{ entry_id: "goblin", image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.2, y: 0.8 } }],
    );
    expect(result).toEqual({
      goblin: { image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.2, y: 0.8 } },
    });
  });

  it("keeps the canonical picture when the own row only overrides the cutout (per-field merge, #917)", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical.webp", cutout_url: null, portrait_focal_point: null }],
      [{ entry_id: "goblin", image_url: null, cutout_url: "mine-cut.webp", portrait_focal_point: null }],
    );
    expect(result.goblin).toEqual({ image_url: "canonical.webp", cutout_url: "mine-cut.webp", portrait_focal_point: null });
  });

  it("keeps the canonical cutout when the own row only overrides the picture", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical.webp", cutout_url: "canonical-cut.webp", portrait_focal_point: null }],
      [{ entry_id: "goblin", image_url: "mine.webp", cutout_url: null, portrait_focal_point: null }],
    );
    expect(result.goblin).toEqual({ image_url: "mine.webp", cutout_url: "canonical-cut.webp", portrait_focal_point: null });
  });
});

describe("withLibraryArt", () => {
  const row = {
    image_url: "row-picture.webp",
    cutout_url: "row-cutout.webp",
    portrait_focal_point: { x: 0.1, y: 0.1 },
  } as unknown as Parameters<typeof withLibraryArt>[0];

  it("returns the row unchanged when there is no art entry", () => {
    expect(withLibraryArt(row, undefined)).toBe(row);
  });

  it("overrides every field the art entry sets", () => {
    const result = withLibraryArt(row, {
      image_url: "art-picture.webp",
      cutout_url: "art-cutout.webp",
      portrait_focal_point: { x: 0.9, y: 0.9 },
    });
    expect(result.image_url).toBe("art-picture.webp");
    expect(result.cutout_url).toBe("art-cutout.webp");
    expect(result.portrait_focal_point).toEqual({ x: 0.9, y: 0.9 });
  });

  it("falls back to the row's own value for a field the art entry leaves null", () => {
    const result = withLibraryArt(row, { image_url: null, cutout_url: "art-cutout.webp", portrait_focal_point: null });
    expect(result.image_url).toBe("row-picture.webp");
    expect(result.cutout_url).toBe("art-cutout.webp");
    expect(result.portrait_focal_point).toEqual({ x: 0.1, y: 0.1 });
  });
});

describe("withLibraryArtAll", () => {
  const rows = [
    { id: "srd_srd_adult_brass_dragon", image_url: "brass.webp", cutout_url: null, portrait_focal_point: null },
    { id: "srd_srd_goblin", image_url: "goblin.webp", cutout_url: null, portrait_focal_point: { x: 50, y: 30 } },
  ] as unknown as Parameters<typeof withLibraryArtAll>[0];

  it("gives a list row the focal point a DM set on its library art, keeping the canonical picture", () => {
    const result = withLibraryArtAll(rows, {
      srd_srd_adult_brass_dragon: { image_url: null, cutout_url: null, portrait_focal_point: { x: 23, y: 17 } },
    });
    expect(result[0].image_url).toBe("brass.webp");
    expect(result[0].portrait_focal_point).toEqual({ x: 23, y: 17 });
    expect(result[1]).toBe(rows[1]);
  });

  it("returns the rows unchanged while the art map has not loaded", () => {
    expect(withLibraryArtAll(rows, undefined)).toEqual(rows);
  });
});

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
