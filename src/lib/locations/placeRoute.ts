import type { EditorLayer } from "@/cartographer/keymap";

/**
 * Where a place opens: the Atlas, with that place selected.
 *
 * A place used to have two DM screens, the Atlas pane at `/locations?at=<id>`
 * and a separate full page at `/locations/:id`, and links went to either one
 * depending on who wrote them. The full page is gone (25 Sep 2026). Every link
 * to a place is built here, so there is one answer to "where does this go".
 *
 * `mode` opens the place in one of its working states: the Details form
 * (`edit`, in the Atlas pane), exploring a site (`explore`, the full-screen
 * Play screen at `/locations/:id/explore`, #1125 decision 9), or its map
 * (`map`, the full-screen editor at `/locations/:id/map`, which only a site or a
 * battle map has; `mapEditorRoute` can also pick the layer it opens on). There
 * is no Build mode and no run layout any more. A string rather than a route object because several callers hand
 * it to places that take a plain href (search results, chat, prepared marks).
 */
export type PlaceMode = "edit" | "map" | "explore";

/** The Play screen for a site: the party walking its map (#1125 decision 9). */
export function exploreRoute(id: string): string {
  return `/locations/${encodeURIComponent(id)}/explore`;
}

/** The tabs the full-screen map editor can open on, as the address spells them (`?layer=`). The editor is the
 *  Cartographer workbench, for a site or a battle map; an ordinary place edits on its Atlas Map tab instead. */
export type MapEditorLayer = "base" | "drawing" | "zoning";

export function placeRoute(id: string, mode?: PlaceMode): string {
  if (mode === "map") return mapEditorRoute(id);
  if (mode === "explore") return exploreRoute(id);
  const at = `/locations?at=${encodeURIComponent(id)}`;
  return mode ? `${at}&${mode}=true` : at;
}

/** The full-screen map editor for a place (#1125), optionally opening on one
 *  of its layers. */
export function mapEditorRoute(id: string, layer?: MapEditorLayer): string {
  const path = `/locations/${encodeURIComponent(id)}/map`;
  return layer ? `${path}?layer=${layer}` : path;
}

const LAYERS: readonly MapEditorLayer[] = ["drawing", "zoning", "base"];

/** The workbench's own name for an address layer (it keeps its code names: picture, drawing, plan). */
export function editorLayerOf(layer: MapEditorLayer): EditorLayer {
  if (layer === "base") return "picture";
  return layer === "zoning" ? "plan" : "drawing";
}

/** The layer the editor opens on: `?layer=` when it names one, otherwise the Drawing. A stray value
 *  (the retired `pins`, a typo) falls back rather than opening an editor with nothing under it. */
export function startLayer(raw: unknown): MapEditorLayer {
  return LAYERS.find((layer) => layer === raw) ?? LAYERS[0];
}
