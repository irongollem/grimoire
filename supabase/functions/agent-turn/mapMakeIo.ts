// The AI table makes a map for a place that has none (#1021 row 17). The rules of what is written and painted live
// here, behind small interfaces, so they are tested without a database or a provider; `index.ts` binds the real
// ones (`mapPaintIo.ts` holds the provider side).
//
// The order is the contract. The plan becomes a Cartographer drawing in code (`buildMap`), so the walls are exact;
// a plain picture is drawn from the same segments and is the place's map at once; the painting is a second, optional
// step that only ever replaces that plain picture, and only while the place still holds the drawing it was made for.
// The picture is never the source of the walls.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GridCalibration } from "../../../src/types/location.types.ts";
import type { MapLive } from "../../../src/types/mapLive.types.ts";
import { hasAnyMapLayer } from "../../../src/lib/locations/mapStack.ts";
import { MAX_ANCESTOR_STEPS, siteOf, type PlaceForMap } from "../../../src/lib/table/solo/placeMap.ts";
import { buildMap, type BuiltDoor, type BuiltRoom, type MapPlan } from "../_shared/agent/mapPlan.ts";
import { planPicturePng, type PlanPicture } from "../_shared/planPicture.ts";
import { buildMapStylePrompt } from "../_shared/mapStylePrompt.ts";
import type { CreditLogFields } from "../_shared/credits.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";

const MAP_COLUMNS = "id, parent_id, map_url, grid_calibration, map_layer_url, map_layer_stand_url, map_layer_calibration, plan_size, source_map_id";

/** The ceiling on what the rooms' own words add to the styler's prompt: a long plan must not crowd out its instructions. */
const PAINT_ABOUT_MAX = 600;

/**
 * Whether the place, or a place above it (the walk `siteOf` makes, read as it goes), has a map: a picture, a drawing or
 * a blank grid. The narrator is offered `make_map` only where this is false.
 */
export async function placeHasMap(client: SupabaseClient, campaignId: string, placeId: string): Promise<boolean> {
  const byId = new Map<string, PlaceForMap>();
  let id: string | null = placeId;
  for (let step = 0; step <= MAX_ANCESTOR_STEPS && id !== null && !byId.has(id); step++) {
    const { data, error } = await client.from("locations").select(MAP_COLUMNS).eq("id", id).eq("campaign_id", campaignId).maybeSingle();
    if (error) throw error;
    if (data === null) break;
    const place = data as unknown as PlaceForMap & { source_map_id: string | null };
    // A drawing bound to the place itself, even one never published (no picture yet), is the DM's map: the table must not
    // draw over it, and `make_place_map` would refuse it anyway. Seen live on the demo inn, 24 Nov 2026.
    if (place.id === placeId && place.source_map_id !== null) return true;
    byId.set(place.id, place);
    if (hasAnyMapLayer(place)) break;
    id = place.parent_id;
  }
  return siteOf(placeId, byId) !== null;
}

/**
 * The calibration of the PICTURE, not of the plan: the canvas is padded (to a size and aspect the styler accepts)
 * with the grid at its top-left, so the grid spans only part of the width. `buildMap`'s own calibration describes the
 * unpadded plan and would put every cell in the wrong place on this picture.
 */
export function pictureCalibration(picture: Pick<PlanPicture, "width" | "height" | "pxPerCell">): GridCalibration {
  return {
    cells_per_image_width: picture.width / picture.pxPerCell,
    origin_x_pct: 0,
    origin_y_pct: 0,
    origin_cell_x: 0,
    origin_cell_y: 0,
    image_height_over_width: picture.height / picture.width,
  };
}

/** What `make_place_map` is given. */
export interface PlaceMapWrite {
  placeId: string;
  requestId: string;
  url: string;
  calibration: GridCalibration;
  mapLive: MapLive;
  drawing: { name: string; darkness: string; layers: unknown; metadata: { made_by: "ai_table" } };
  rooms: BuiltRoom[];
  doors: BuiltDoor[];
}

export interface MakeMapIo {
  /** Stores the plain picture and answers its public URL. */
  upload(picture: PlanPicture): Promise<string>;
  /** Writes the map; `"exists"` when the place already has one (the DM made a map meanwhile). Throws on anything else. */
  write(write: PlaceMapWrite): Promise<{ drawingId: string } | "exists">;
  newRequestId(): string;
}

/** A map that was written, with what painting it needs. */
export interface MadeMap {
  placeId: string;
  /** The drawing `make_place_map` made: the painting replaces the picture only while the place still holds it. */
  drawingId: string;
  name: string;
  /** What stands where, in the narrator's words, for the styler's prompt. */
  about: string;
  picture: Pick<PlanPicture, "png" | "width" | "height">;
  calibration: GridCalibration;
}

/** Builds, draws, stores and writes the map. Null when the place already has one: never an error, the DM's map wins. */
export async function makeTableMap(io: MakeMapIo, input: { placeId: string; plan: MapPlan }): Promise<MadeMap | null> {
  const { placeId, plan } = input;
  const built = buildMap(plan);
  const picture = await planPicturePng(built.segments);
  const calibration = pictureCalibration(picture);
  const url = await io.upload(picture);
  const written = await io.write({
    placeId,
    requestId: io.newRequestId(),
    url,
    calibration,
    mapLive: built.mapLive,
    drawing: { name: plan.name, darkness: built.darkness, layers: built.layers, metadata: { made_by: "ai_table" } },
    rooms: built.rooms,
    doors: built.doors,
  });
  if (written === "exists") return null;
  const about = built.rooms.flatMap((r) => (r.about === null ? [] : [r.about])).join(" ").slice(0, PAINT_ABOUT_MAX);
  return { placeId, drawingId: written.drawingId, name: plan.name, about, picture, calibration };
}

/** `make_place_map` through the CALLER's client: `auth.uid()` is what lets it write, so never the service role. */
export async function writePlaceMap(client: SupabaseClient, write: PlaceMapWrite): Promise<{ drawingId: string } | "exists"> {
  const { data, error } = await client.rpc("make_place_map", {
    p_location_id: write.placeId,
    p_request_id: write.requestId,
    p_map_url: write.url,
    p_calibration: write.calibration,
    p_map_live: write.mapLive,
    p_drawing: write.drawing,
    p_rooms: write.rooms,
    p_doors: write.doors,
  });
  // 23505: the place has a map already. Not a failure: the DM's own map always wins.
  if (error) {
    if (error.code === "23505") return "exists";
    throw error;
  }
  const drawingId = (data as { source_map_id?: unknown } | null)?.source_map_id;
  if (typeof drawingId !== "string") throw new Error("make_place_map did not answer the drawing it made");
  return { drawingId };
}

/** A painted picture as the styler made it, already marked as AI. */
export interface Painted {
  bytes: Uint8Array;
  contentType: string;
  provenance: AiProvenance;
  log: CreditLogFields;
}

/** A provider ready to paint, its price settled. */
export interface Painter {
  /** Whole credits held across the call; 0 for the owner's own key. */
  cost: number;
  /** The owner's own key paid for it: a free line on the ledger. */
  isByok: boolean;
  generate(prompt: string, source: Blob): Promise<Painted>;
}

export interface PaintDeps {
  /** Null when there is nothing to paint with (no provider, an account that may not generate, a size the styler refuses). */
  painter(size: { width: number; height: number }): Promise<Painter | null>;
  /**
   * Holds `painter.cost` across `work`; `charge` queues the ledger line and is called only for a picture that was used.
   * False when the hold was refused (not enough credits): `work` did not run.
   */
  withHold(painter: Painter, work: (charge: (log: CreditLogFields) => void) => Promise<void>): Promise<boolean>;
  /** Stores the painted bytes (and registers their provenance); answers the public URL. */
  store(painted: Painted): Promise<string>;
  /** Puts the url on the place if it still holds the drawing; false when it does not (the DM replaced the map). */
  adopt(url: string): Promise<boolean>;
}

export type PaintOutcome = "painted" | "no_painter" | "refused" | "replaced";

/**
 * Paints a made map from its plain picture, billed as a styled map. Anything that stops it leaves the plain picture
 * in place, which is already a working map: it throws only for a failure the caller should log.
 */
export async function paintTableMap(deps: PaintDeps, made: MadeMap): Promise<PaintOutcome> {
  const painter = await deps.painter(made.picture);
  if (painter === null) return "no_painter";
  const prompt = buildMapStylePrompt("playable", made.name, made.about === "" ? null : made.about, null);
  const source = new Blob([made.picture.png.slice()], { type: "image/png" });
  let replaced = false;
  const ran = await deps.withHold(painter, async (charge) => {
    const painted = await painter.generate(prompt, source);
    const url = await deps.store(painted);
    // The picture was made and stored; whether it is the place's is decided only here, against the drawing.
    if (await deps.adopt(url)) charge(painted.log);
    else replaced = true;
  });
  if (!ran) return "refused";
  return replaced ? "replaced" : "painted";
}

/**
 * The painting becomes the place's picture only where the place still holds the drawing it was painted from: a map
 * the DM replaced meanwhile (a new drawing, another upload that cleared `source_map_id`) is not clobbered. The
 * calibration is not written: the painted picture has the plain one's size, so the grid stays where it was.
 */
export async function adoptPicture(admin: SupabaseClient, placeId: string, drawingId: string, url: string): Promise<boolean> {
  const { data, error } = await admin.from("locations").update({ map_url: url }).eq("id", placeId).eq("source_map_id", drawingId).select("id");
  if (error) throw error;
  return data !== null && data.length > 0;
}
