import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

interface InvokeCall {
  fn: string;
  body: Record<string, unknown>;
}

const mocks = vi.hoisted(() => ({
  invokeCalls: [] as InvokeCall[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          order: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
    functions: {
      invoke: vi.fn(async (fn: string, opts: { body: Record<string, unknown> }) => {
        mocks.invokeCalls.push({ fn, body: opts.body });
        return { data: { ok: true }, error: null };
      }),
    },
    // `getPublicUrl` reaches for this when no asset CDN is configured, which is
    // the case under vitest. What the host is does not matter to these tests —
    // the path and the cache-busting query do.
    storage: {
      from: vi.fn((bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
      })),
    },
  },
}));

import { describeLibraryPackError, libraryPackObjectPath, libraryTileUrl, useLibraryTilePacks } from "./useLibraryTilePacks";
import type { LibraryTilePack } from "@/cartographer/userPack.types";

/** Mounts the composable inside a real component so its `useQuery` has a
 *  query client to attach to — same helper shape as useUnembeddedContent.test.ts. */
function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: ReturnType<typeof useLibraryTilePacks>;
  mount(
    defineComponent({
      setup() {
        api = useLibraryTilePacks();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api };
}

const WEBP_HEADER = [82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80];

beforeEach(() => {
  mocks.invokeCalls = [];
});

afterEach(() => vi.unstubAllGlobals());

describe("libraryPackObjectPath", () => {
  it("keys objects by the pack row's uuid and version", () => {
    expect(libraryPackObjectPath({ id: "3f1b0c2e-0000-4000-8000-000000000001", pack_version: 2 }, "floor/0.webp"))
      .toBe("3f1b0c2e-0000-4000-8000-000000000001/v2/floor/0.webp");
  });

  // The slug must not appear. Library packs are authored in the open and their
  // bytes are readable by URL through the CDN, so a name-derived path would put
  // an unannounced pack one guess away — see the docblock on the function.
  it("never derives the path from the pack's slug", () => {
    const path = libraryPackObjectPath({ id: "3f1b0c2e-0000-4000-8000-000000000001", pack_version: 1 }, "wall/h/0.webp");
    expect(path).not.toContain("haunted-manor");
    expect(path.split("/")[0]).toBe("3f1b0c2e-0000-4000-8000-000000000001");
  });
});

describe("libraryTileUrl", () => {
  const pack = { id: "3f1b0c2e-0000-4000-8000-000000000001", pack_version: 1 } as LibraryTilePack;

  // The CDN serves these `immutable` for a month, and a replaced tile keeps its
  // path — so the stamp is the only thing that tells a browser the door it
  // cached yesterday is not the door stored there now.
  it("cache-keys on the slot's own rev when it has one", () => {
    const url = libraryTileUrl(pack, { url: "doorClosedH/0.webp", rev: 1758529974000 });

    expect(url).toContain("/3f1b0c2e-0000-4000-8000-000000000001/v1/doorClosedH/0.webp");
    expect(url.endsWith("?v=1758529974000")).toBe(true);
  });

  it("falls back to the pack version for a tile written before revs existed", () => {
    expect(libraryTileUrl(pack, { url: "floor/0.webp" }).endsWith("?v=1")).toBe(true);
  });

  it("gives two revisions of one slot different URLs", () => {
    const before = libraryTileUrl(pack, { url: "doorClosedH/0.webp", rev: 1758529974000 });
    const after = libraryTileUrl(pack, { url: "doorClosedH/0.webp", rev: 1758529999000 });

    expect(before).not.toBe(after);
  });
});

describe("useLibraryTilePacks — update", () => {
  it("sends only the supplied fields, omitting undefined ones from the wire", async () => {
    const { api } = open();
    await flushPromises();

    await api().update.mutateAsync({ packRowId: "pack-1", name: "New Name" });

    expect(mocks.invokeCalls.at(-1)).toEqual({
      fn: "tile-pack-generator",
      body: { action: "update_library_pack", pack_id: "pack-1", name: "New Name" },
    });
  });

  it("sends content_source_key: null for an explicit clear, but omits the key entirely when left undefined", async () => {
    const { api } = open();
    await flushPromises();

    await api().update.mutateAsync({ packRowId: "pack-1", contentSourceKey: null });
    expect(mocks.invokeCalls.at(-1)!.body).toEqual({
      action: "update_library_pack",
      pack_id: "pack-1",
      content_source_key: null,
    });

    await api().update.mutateAsync({ packRowId: "pack-1", name: "Renamed" });
    const secondCall = mocks.invokeCalls.at(-1)!.body;
    expect(secondCall).not.toHaveProperty("content_source_key");
  });

  it("sends every supplied field at once, translated to its wire key", async () => {
    const { api } = open();
    await flushPromises();

    await api().update.mutateAsync({
      packRowId: "pack-1",
      name: "Moon Vault",
      description: "A vault under the moon",
      licenseKeys: ["cc0"],
      contentSourceKey: "grimoire-art",
      sortOrder: 3,
    });

    expect(mocks.invokeCalls.at(-1)!.body).toEqual({
      action: "update_library_pack",
      pack_id: "pack-1",
      name: "Moon Vault",
      description: "A vault under the moon",
      license_keys: ["cc0"],
      content_source_key: "grimoire-art",
      sort_order: 3,
    });
  });
});

describe("useLibraryTilePacks — uploadTile", () => {
  it("rejects a wrong-size tile without invoking the edge function", async () => {
    const { api } = open();
    await flushPromises();
    vi.stubGlobal("createImageBitmap", async () => ({ width: 64, height: 64, close: () => undefined }));
    const file = new Blob([new Uint8Array(WEBP_HEADER)], { type: "image/webp" });

    await expect(api().uploadTile.mutateAsync({
      packRowId: "pack-1",
      slot: { category: "floor", variant: 0 },
      file,
    })).rejects.toThrow();

    expect(mocks.invokeCalls).toHaveLength(0);
  });

  it("rejects a non-WebP blob without invoking the edge function", async () => {
    const { api } = open();
    await flushPromises();
    const file = new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])], { type: "image/png" });

    await expect(api().uploadTile.mutateAsync({
      packRowId: "pack-1",
      slot: { category: "floor", variant: 0 },
      file,
    })).rejects.toThrow();

    expect(mocks.invokeCalls).toHaveLength(0);
  });

  it("sends a byte-accurate base64 payload and the slot for a valid tile", async () => {
    const { api } = open();
    await flushPromises();
    vi.stubGlobal("createImageBitmap", async () => ({ width: 128, height: 128, close: () => undefined }));
    const bytes = new Uint8Array([...WEBP_HEADER, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    const file = new Blob([bytes], { type: "image/webp" });

    await api().uploadTile.mutateAsync({
      packRowId: "pack-1",
      slot: { category: "wallJoint", side: "L_NE", variant: 2 },
      file,
    });

    const call = mocks.invokeCalls.at(-1)!;
    expect(call.fn).toBe("tile-pack-generator");
    expect(call.body).toMatchObject({
      action: "upload_library_tile",
      pack_id: "pack-1",
      slot: { category: "wallJoint", side: "L_NE", variant: 2 },
    });
    const decoded = Uint8Array.from(atob(call.body.image_b64 as string), (char) => char.charCodeAt(0));
    expect([...decoded]).toEqual([...bytes]);
  });

  it("omits the slot's side when the slot has none", async () => {
    const { api } = open();
    await flushPromises();
    vi.stubGlobal("createImageBitmap", async () => ({ width: 128, height: 128, close: () => undefined }));
    const file = new Blob([new Uint8Array(WEBP_HEADER)], { type: "image/webp" });

    await api().uploadTile.mutateAsync({
      packRowId: "pack-1",
      slot: { category: "floor", variant: 0 },
      file,
    });

    const slot = mocks.invokeCalls.at(-1)!.body.slot as Record<string, unknown>;
    expect(slot).not.toHaveProperty("side");
  });
});

describe("useLibraryTilePacks — generateMissing", () => {
  it("omits slot_ids when none are given", async () => {
    const { api } = open();
    await flushPromises();

    await api().generateMissing.mutateAsync({ packRowId: "pack-1" });

    expect(mocks.invokeCalls.at(-1)!.body).toEqual({ action: "generate_library_pack", pack_id: "pack-1" });
  });

  it("passes slot_ids through when given", async () => {
    const { api } = open();
    await flushPromises();

    await api().generateMissing.mutateAsync({ packRowId: "pack-1", slotIds: ["floor:0", "wall:0"] });

    expect(mocks.invokeCalls.at(-1)!.body).toEqual({
      action: "generate_library_pack",
      pack_id: "pack-1",
      slot_ids: ["floor:0", "wall:0"],
    });
  });
});

describe("describeLibraryPackError", () => {
  const codes = [
    "admin_required",
    "pack_not_found",
    "invalid_pack_id",
    "invalid_pack_concept",
    "invalid_license_keys",
    "invalid_content_source",
    "invalid_sort_order",
    "no_changes",
    "invalid_slot",
    "image_too_large",
    "invalid_image",
    "generation_already_running",
    "nothing_to_generate",
    "unknown_slot_id",
    "pack_incomplete",
    "unpublish_before_deleting",
    "cancel_generation_before_deleting",
  ];

  it("returns a distinct, non-empty sentence for every known code", () => {
    const messages = codes.map((code) => describeLibraryPackError(new Error(code)));
    for (const message of messages) expect(message.length).toBeGreaterThan(0);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("says how many required slots are still blank when the error carries the counts", () => {
    const error = Object.assign(new Error("pack_incomplete"), { required: 20, requiredDrawn: 14 });
    expect(describeLibraryPackError(error)).toContain("6");
  });

  it("falls back to the generic sentence when pack_incomplete carries no counts", () => {
    expect(describeLibraryPackError(new Error("pack_incomplete"))).not.toContain("undefined");
  });

  it("falls back to the raw message for an unknown code", () => {
    expect(describeLibraryPackError(new Error("some_new_code"))).toBe("some_new_code");
  });
});
