import { createSupabaseFake } from "@/test/supabaseFake";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMapPlan } from "../_shared/agent/mapPlan.ts";
import { planPicturePng } from "../_shared/planPicture.ts";
import { buildMap } from "../_shared/agent/mapPlan.ts";
import {
  adoptPicture, makeTableMap, paintTableMap, pictureCalibration, placeHasMap, writePlaceMap,
  type MadeMap, type MakeMapIo, type PaintDeps, type Painter, type PlaceMapWrite,
} from "./mapMakeIo.ts";

const PLACE = "00000000-0000-4000-8000-0000000000a5";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";

function planOf(cols: number, rows: number) {
  const parsed = parseMapPlan({
    name: "The Honey Cellar", cols, rows, light: "dim",
    rooms: [
      { key: "a", name: "Cellar", x: 1, y: 1, w: 4, h: 3, about: "Barrels along the north wall." },
      { key: "b", name: "Stair", x: 5, y: 1, w: 2, h: 3, about: "Steps going up." },
    ],
    doors: [{ from: "a", to: "b" }, { from: "a", to: "outside", side: "south" }],
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.plan;
}

describe("pictureCalibration", () => {
  // Bug caught: the plan's own calibration (cells = columns) used for a padded picture, so every cell lands in the wrong place.
  it("is read from the padded picture, not from the plan", async () => {
    const plan = planOf(8, 6);
    const picture = await planPicturePng(buildMap(plan).segments);
    expect(picture.padRight + picture.padBottom).toBeGreaterThan(0);
    const calibration = pictureCalibration(picture);
    expect(calibration.cells_per_image_width).toBe(picture.width / picture.pxPerCell);
    expect(calibration.cells_per_image_width).not.toBe(plan.cols);
    expect(calibration.image_height_over_width).toBe(picture.height / picture.width);
    expect([calibration.origin_x_pct, calibration.origin_y_pct]).toEqual([0, 0]);
  });
});

describe("makeTableMap", () => {
  function io(over: Partial<MakeMapIo> = {}) {
    const writes: PlaceMapWrite[] = [];
    const uploads: Uint8Array[] = [];
    const fake: MakeMapIo = {
      upload: async (picture) => { uploads.push(picture.png); return "https://cdn.example/plain.webp"; },
      write: async (w) => { writes.push(w); return { drawingId: "drawing-9" }; },
      newRequestId: () => "request-1",
      ...over,
    };
    return { fake, writes, uploads };
  }

  // Bug caught: the plain picture's url or calibration, the exact walls and the rooms not all reaching one write.
  it("writes the picture's own calibration, the exact snapshot, the rooms and the doors, marked as the table's", async () => {
    const { fake, writes, uploads } = io();
    const made = await makeTableMap(fake, { placeId: PLACE, plan: planOf(8, 6) });
    expect(uploads).toHaveLength(1);
    const [write] = writes;
    expect(write.url).toBe("https://cdn.example/plain.webp");
    expect(write.requestId).toBe("request-1");
    expect(write.calibration.cells_per_image_width).not.toBe(8);
    expect(write.mapLive.walls.length + write.mapLive.doors.length).toBeGreaterThan(0);
    expect(write.drawing).toMatchObject({ name: "The Honey Cellar", darkness: "dim", metadata: { made_by: "ai_table" } });
    expect(write.rooms.map((r) => r.name)).toEqual(["Cellar", "Stair"]);
    expect(write.doors).toHaveLength(2);
    expect(made).toMatchObject({ placeId: PLACE, drawingId: "drawing-9", name: "The Honey Cellar", about: "Barrels along the north wall. Steps going up." });
  });

  // Bug caught: the DM's map made meanwhile counted as an error, or painted over.
  it("answers null when the place already has a map", async () => {
    const { fake } = io({ write: async () => "exists" });
    expect(await makeTableMap(fake, { placeId: PLACE, plan: planOf(10, 6) })).toBeNull();
  });
});

describe("writePlaceMap", () => {
  const write = { placeId: PLACE, requestId: "r", url: "u", calibration: { cells_per_image_width: 1, origin_x_pct: 0, origin_y_pct: 0 }, mapLive: {}, drawing: { name: "n", darkness: "dim", layers: {}, metadata: { made_by: "ai_table" } }, rooms: [], doors: [] } as unknown as PlaceMapWrite;
  const client = (answer: { data: unknown; error: { code: string } | null }) => ({ rpc: async () => answer }) as unknown as SupabaseClient;

  // Bug caught: 23505 thrown as a failure (a logged error and a lost map line) instead of a skip; or any error swallowed as a skip.
  it("reads only 23505 as the place already having a map, and throws every other error", async () => {
    expect(await writePlaceMap(client({ data: null, error: { code: "23505" } }), write)).toBe("exists");
    await expect(writePlaceMap(client({ data: null, error: { code: "42501" } }), write)).rejects.toMatchObject({ code: "42501" });
  });

  // Bug caught: painting later aimed at no drawing, so it could clobber any map.
  it("answers the drawing the database made, and refuses an answer without one", async () => {
    expect(await writePlaceMap(client({ data: { source_map_id: "d1" }, error: null }), write)).toEqual({ drawingId: "d1" });
    await expect(writePlaceMap(client({ data: { source_map_id: null }, error: null }), write)).rejects.toThrow(/drawing/);
  });

  // Bug caught: the write made with the service role, where auth.uid() is null and the function refuses everyone.
  it("calls make_place_map with every part of the write", async () => {
    let called: { fn: string; args: Record<string, unknown> } | null = null;
    const spy = { rpc: async (fn: string, args: Record<string, unknown>) => { called = { fn, args }; return { data: { source_map_id: "d" }, error: null }; } } as unknown as SupabaseClient;
    await writePlaceMap(spy, write);
    expect(called!.fn).toBe("make_place_map");
    expect(Object.keys(called!.args).sort()).toEqual(["p_calibration", "p_doors", "p_drawing", "p_location_id", "p_map_live", "p_map_url", "p_request_id", "p_rooms"]);
  });
});

describe("placeHasMap", () => {
  type Row = { id: string; parent_id: string | null; map_url: string | null; map_layer_url: string | null; plan_size: unknown; source_map_id: string | null };
  const row = (id: string, parent: string | null, over: Partial<Row> = {}): Row => ({ id, parent_id: parent, map_url: null, map_layer_url: null, plan_size: null, source_map_id: null, ...over });
  /** Answers each place by id, and only within the campaign asked. */
  const reads: string[] = [];
  const fake = (rows: Row[]) => ({
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          eq: (_k: string, campaign: string) => ({
            maybeSingle: async () => (reads.push(id), { data: campaign === CAMPAIGN ? (rows.find((r) => r.id === id) ?? null) : null, error: null }),
          }),
        }),
      }),
    }),
  }) as unknown as SupabaseClient;

  // Bug caught: only the place's own row read, so a room of a mapped dungeon was offered a second map.
  it("finds a map on a place above, and on the place itself", async () => {
    expect(await placeHasMap(fake([row("room", "site"), row("site", null, { map_url: "u" })]), CAMPAIGN, "room")).toBe(true);
    expect(await placeHasMap(fake([row("room", null, { map_layer_url: "u" })]), CAMPAIGN, "room")).toBe(true);
    expect(await placeHasMap(fake([row("room", null, { plan_size: { cols: 4, rows: 4 } })]), CAMPAIGN, "room")).toBe(true);
  });

  // Bug caught (seen live on the demo inn, 24 Nov 2026): a place with a drawing bound and never published read as
  // mapless, so the narrator drew a map that make_place_map then refused.
  it("counts a drawing bound to the place itself as its map, published or not", async () => {
    expect(await placeHasMap(fake([row("inn", null, { source_map_id: "drawing" })]), CAMPAIGN, "inn")).toBe(true);
  });

  // Bug caught: the walk going on up the tree after it found the map, one read of the database per ancestor for nothing.
  it("stops reading at the first place that has a map", async () => {
    reads.length = 0;
    await placeHasMap(fake([row("room", "site"), row("site", "top", { map_url: "u" }), row("top", null)]), CAMPAIGN, "room");
    expect(reads).toEqual(["room", "site"]);
  });

  // Bug caught: a mapless chain read as mapped, or a parent loop hanging the read.
  it("is false for a chain with no map, and ends on a parent loop", async () => {
    expect(await placeHasMap(fake([row("room", "site"), row("site", null)]), CAMPAIGN, "room")).toBe(false);
    expect(await placeHasMap(fake([row("a", "b"), row("b", "a")]), CAMPAIGN, "a")).toBe(false);
  });

  // Bug caught: an ancestor beyond the step limit read as the map (a mistake in the data is not a map).
  it("stops looking after six steps above", async () => {
    const chain = Array.from({ length: 9 }, (_, i) => row(`p${i}`, i < 8 ? `p${i + 1}` : null, i === 8 ? { map_url: "u" } : {}));
    expect(await placeHasMap(fake(chain), CAMPAIGN, "p0")).toBe(false);
  });
});

describe("paintTableMap", () => {
  const made: MadeMap = {
    placeId: PLACE, drawingId: "d1", plainUrl: "https://cdn.example/plain.webp", name: "The Honey Cellar", about: "Barrels.",
    picture: { png: new Uint8Array([1, 2, 3]), width: 64, height: 64 },
    calibration: { cells_per_image_width: 1, origin_x_pct: 0, origin_y_pct: 0 },
  };
  function deps(over: { painter?: Painter | null; held?: boolean; adopts?: boolean; generateThrows?: boolean } = {}) {
    const log: string[] = [];
    const charges: unknown[] = [];
    const painter: Painter | null = over.painter === undefined
      ? {
        cost: 4,
        generate: async (prompt, source) => {
          log.push(`generate:${source.size}:${prompt.includes("The Honey Cellar") && prompt.includes("Barrels.")}`);
          if (over.generateThrows) throw new Error("provider down");
          return { bytes: new Uint8Array([9]), contentType: "image/webp", provenance: { generatorType: "map_style", provider: "openai", model: "m", generatedAt: "t", edited: false }, log: { model: "m" } };
        },
      }
      : over.painter;
    const d: PaintDeps = {
      painter: async () => painter,
      withHold: async (_p, work) => {
        if (over.held === false) return false;
        await work((l) => charges.push(l));
        return true;
      },
      store: async () => { log.push("store"); return "https://cdn.example/painted.webp"; },
      adopt: async (url) => { log.push(`adopt:${url}`); return over.adopts ?? true; },
    };
    return { d, log, charges };
  }

  // Bug caught: painting attempted with no provider, spending or throwing where it should quietly keep the plain picture.
  it("stops, with the plain picture left, when there is nothing to paint with", async () => {
    const { d, log } = deps({ painter: null });
    expect(await paintTableMap(d, made)).toBe("no_painter");
    expect(log).toEqual([]);
  });

  // Bug caught: the styler called without the credits held, so the DM is given a free picture or the platform pays.
  it("generates nothing when the hold is refused", async () => {
    const { d, log } = deps({ held: false });
    expect(await paintTableMap(d, made)).toBe("refused");
    expect(log).toEqual([]);
  });

  // Bug caught: the plain picture sent without the plan, or the painting stored and never put on the place.
  it("paints from the plain picture with the map's name and rooms, stores it, adopts it and charges once", async () => {
    const { d, log, charges } = deps();
    expect(await paintTableMap(d, made)).toBe("painted");
    expect(log).toEqual(["generate:3:true", "store", "adopt:https://cdn.example/painted.webp"]);
    expect(charges).toHaveLength(1);
  });

  // Bug caught: a painting charged although the DM's replacement map meant it was thrown away.
  it("charges nothing for a painting the place did not take", async () => {
    const { d, charges } = deps({ adopts: false });
    expect(await paintTableMap(d, made)).toBe("replaced");
    expect(charges).toEqual([]);
  });

  // Bug caught: a failed generation swallowed, so the hold's release and the free ledger line never run.
  it("lets a failed generation throw out of the hold", async () => {
    const { d, charges } = deps({ generateThrows: true });
    await expect(paintTableMap(d, made)).rejects.toThrow("provider down");
    expect(charges).toEqual([]);
  });
});

describe("adoptPicture", () => {
  const at = { placeId: PLACE, drawingId: "d1", plainUrl: "https://cdn.example/plain.webp" };
  function placeHolding(over: Record<string, unknown> = {}) {
    const fake = createSupabaseFake();
    fake.seed("locations", [{ id: PLACE, source_map_id: "d1", map_url: at.plainUrl, ...over }]);
    return fake;
  }

  it("puts the painting where the place still holds the drawing and the plain picture", async () => {
    const fake = placeHolding();
    expect(await adoptPicture(fake.client as unknown as SupabaseClient, at, "https://cdn.example/painted.webp")).toBe(true);
    expect(fake.rows("locations")[0].map_url).toBe("https://cdn.example/painted.webp");
  });

  // Bug caught: the update keyed on the place alone, so a map the DM replaced meanwhile was overwritten by the painting.
  // #1271 review: an upload keeps `source_map_id`, so the drawing alone did not tell the DM's picture apart.
  it.each([
    ["a picture the DM uploaded meanwhile", { map_url: "https://cdn.example/dm-upload.webp" }, "https://cdn.example/dm-upload.webp"],
    ["a drawing that replaced it", { source_map_id: "d2" }, at.plainUrl],
  ])("leaves %s alone", async (_what, over, kept) => {
    const fake = placeHolding(over);
    expect(await adoptPicture(fake.client as unknown as SupabaseClient, at, "https://cdn.example/painted.webp")).toBe(false);
    expect(fake.rows("locations")[0].map_url).toBe(kept);
  });
});
