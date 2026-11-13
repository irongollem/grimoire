// @vitest-environment happy-dom
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));

import { reportHandledError } from "@/lib/observability/sentry";
import { loadPaintAssets } from "./assets/loadPaintAssets";
import type { BrushFileDeps } from "./brushes/brushFiles";
import { STOCK_BRUSHES } from "./brushes/stockBrushes";
import { rowFromPreset } from "./brushes/userBrushes";
import { useUserBrushes, type NewBrush } from "./useUserBrushes";

const tipImg = { width: 2, height: 2, alpha: new Uint8Array([0, 255, 255, 0]) };
const stockPreset = STOCK_BRUSHES[0];
const withOwnTip = (name: string): NewBrush => ({
  preset: { ...stockPreset, id: "import:1:tip", name, tip: { ...stockPreset.tip, source: { kind: "image", id: "import:1:tip" } } },
  tip: tipImg,
  grain: null,
  source: "abr",
  setName: "Grass",
});

function files(over: Partial<BrushFileDeps> = {}) {
  let n = 0;
  const removed: string[][] = [];
  const deps: BrushFileDeps = {
    encodeTip: async () => new Blob(["t"]),
    encodeGrain: async () => new Blob(["g"]),
    upload: async () => `https://cdn/u1/brush-${++n}.webp`,
    remove: async (urls) => {
      removed.push([...urls]);
    },
    ...over,
  };
  return { deps, removed };
}

function mountIt(deps: BrushFileDeps) {
  let api!: ReturnType<typeof useUserBrushes>;
  const assets = loadPaintAssets({ decode: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }) });
  mount(defineComponent({ setup() { api = useUserBrushes(assets, deps); return () => null; } }), {
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  return { api, assets };
}

const settingsOf = (p: typeof stockPreset) => rowFromPreset(p).preset;
const seedRow = (over: Record<string, unknown>) => ({
  id: "r", user_id: "u1", name: "n", preset: settingsOf(stockPreset), tip_url: null, grain_url: null, source: "made", set_name: null, created_at: "2026-01-01", updated_at: "", ...over,
});

beforeEach(() => fake.reset());

describe("useUserBrushes reading", () => {
  it("asks for the signed-in painter's rows only, and shows none of another's", async () => {
    // Fails on: leaving the owner to RLS, which a wider policy (an admin read) turns into everyone's brushes.
    fake.seed("paint_brushes", [seedRow({ id: "mine" }), seedRow({ id: "theirs", user_id: "u2" })]);
    const { api } = mountIt(files().deps);
    await flushPromises();
    expect(api.brushes.value.map((b) => b.preset.id)).toEqual(["mine"]);
    const read = fake.calls.find((c) => c.op === "select");
    expect(read?.filters).toEqual(expect.arrayContaining([expect.objectContaining({ column: "user_id", value: "u1" })]));
  });

  it("surfaces a failed read instead of showing an empty list", async () => {
    // Fails on: destructuring only `data`, so a failure looks like "no brushes yet".
    fake.failNext("paint_brushes", { message: "boom" });
    const { api } = mountIt(files().deps);
    await flushPromises();
    expect(api.error.value).toBeInstanceOf(Error);
    expect(api.brushes.value).toEqual([]);
  });

  it("skips a row that is not a whole brush", async () => {
    // Fails on: a corrupt row throwing the whole library away or painting with it.
    fake.seed("paint_brushes", [seedRow({ id: "ok" }), seedRow({ id: "bad", preset: { v: 1 } })]);
    const { api } = mountIt(files().deps);
    await flushPromises();
    expect(api.brushes.value.map((b) => b.preset.id)).toEqual(["ok"]);
  });
});

describe("useUserBrushes writing", () => {
  it("imports many brushes in one insert, with their set and source, and teaches the store their pictures", async () => {
    // Fails on: one insert per brush (a 100-brush set), a lost set name, or a tip the engine cannot read.
    const { deps } = files();
    const { api, assets } = mountIt(deps);
    await flushPromises();
    const made = await api.importMany([withOwnTip("A"), withOwnTip("B")]);
    expect(made).toHaveLength(2);
    expect(fake.calls.filter((c) => c.op === "insert")).toHaveLength(1);
    const rows = fake.rows("paint_brushes");
    expect(rows).toMatchObject([{ name: "A", source: "abr", set_name: "Grass", user_id: "u1" }, { name: "B" }]);
    const id = rows[0].id as string;
    expect(assets.tip(`user:${id}:tip`)).toEqual(tipImg);
    expect(api.brushes.value).toHaveLength(2);
  });

  it("removes the files already uploaded when a later upload fails, and writes no row", async () => {
    // Fails on: a half-failed import leaving orphaned tip files nobody can ever delete.
    let n = 0;
    const { deps, removed } = files({
      upload: async () => {
        if (++n === 3) throw new Error("storage down");
        return `https://cdn/u1/brush-${n}.webp`;
      },
    });
    const { api } = mountIt(deps);
    await flushPromises();
    await expect(api.importMany([withOwnTip("A"), withOwnTip("B"), withOwnTip("C")])).rejects.toThrow("storage down");
    expect(fake.rows("paint_brushes")).toHaveLength(0);
    expect(removed.flat().sort()).toEqual(["https://cdn/u1/brush-1.webp", "https://cdn/u1/brush-2.webp"]);
  });

  it("removes the uploaded files when the insert itself fails", async () => {
    // Fails on: files left behind by a refused insert.
    const { deps, removed } = files();
    const { api } = mountIt(deps);
    await flushPromises();
    fake.failNext("paint_brushes", { message: "refused" });
    await expect(api.create(withOwnTip("A"))).rejects.toThrow("refused");
    expect(removed.flat()).toHaveLength(1);
  });

  it("uploads at most four pictures at once", async () => {
    // Fails on: firing every upload of a big set together.
    let running = 0;
    let peak = 0;
    const { deps } = files({
      upload: async () => {
        peak = Math.max(peak, ++running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return "https://cdn/x.webp";
      },
    });
    const { api } = mountIt(deps);
    await flushPromises();
    await api.importMany(Array.from({ length: 10 }, (_, i) => withOwnTip(`b${i}`)));
    expect(peak).toBe(4);
  });

  it("deletes the row and its tip and grain files", async () => {
    // Fails on: deleting the row but orphaning its files, or deleting another painter's brush.
    fake.seed("paint_brushes", [seedRow({ id: "r1", tip_url: "https://cdn/t.webp" }), seedRow({ id: "r2", user_id: "u2" })]);
    const { deps, removed } = files();
    const { api } = mountIt(deps);
    await flushPromises();
    await api.remove("r1");
    await api.remove("r2");
    expect(fake.rows("paint_brushes").map((r) => r.id)).toEqual(["r2"]);
    expect(removed).toEqual([["https://cdn/t.webp"]]);
  });

  it("still resolves, and reports, when the files cannot be removed after the row is gone", async () => {
    // Fails on: letting the sweep's rejection fail a delete that already happened, so the painter sees a failure and a retry finds no row.
    fake.seed("paint_brushes", [seedRow({ id: "r1", tip_url: "https://cdn/t.webp" })]);
    const { api } = mountIt(files({ remove: async () => { throw new Error("r2 down"); } }).deps);
    await flushPromises();
    await expect(api.remove("r1")).resolves.toBeUndefined();
    expect(fake.rows("paint_brushes")).toEqual([]);
    expect(reportHandledError).toHaveBeenCalledWith(expect.any(Error), "useUserBrushes.remove");
  });

  it("writes the settings of a brush and renames it", async () => {
    fake.seed("paint_brushes", [seedRow({ id: "r1" })]);
    const { api } = mountIt(files().deps);
    await flushPromises();
    await api.update({ id: "r1", preset: { ...stockPreset, smoothing: 0.77 } });
    await api.rename({ id: "r1", name: "  Renamed  " });
    expect(fake.rows("paint_brushes")[0]).toMatchObject({ name: "Renamed", preset: { smoothing: 0.77 } });
    await expect(api.rename({ id: "r1", name: "  " })).rejects.toThrow();
  });
});
