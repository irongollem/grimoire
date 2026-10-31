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
 * (`map`, the full-screen editor at `/locations/:id/map`; `mapEditorRoute` can
 * also pick the layer it opens on). There is no Build mode and no run layout
 * any more. A string rather than a route object because several callers hand
 * it to places that take a plain href (search results, chat, prepared marks).
 */
export type PlaceMode = "edit" | "map" | "explore";

/** The Play screen for a site: the party walking its map (#1125 decision 9). */
export function exploreRoute(id: string): string {
  return `/locations/${encodeURIComponent(id)}/explore`;
}

/** The layers the full-screen map editor can open on. `drawing`, `plan` and
 *  `picture` belong to a site, `picture` and `pins` to any other place. */
export type MapEditorLayer = "drawing" | "plan" | "picture" | "pins";

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

const SITE_LAYERS: readonly MapEditorLayer[] = ["drawing", "plan", "picture"];
const PLACE_LAYERS: readonly MapEditorLayer[] = ["picture", "pins"];

/** The layer the editor opens on: `?layer=` when this kind of place has it,
 *  otherwise the first (a site's Drawing, any other place's Picture). A site
 *  has no Pins layer and a town has no Drawing or Plan, so a stray value
 *  falls back rather than opening an editor with nothing under it. */
export function startLayer(raw: unknown, isSite: boolean): MapEditorLayer {
  const allowed = isSite ? SITE_LAYERS : PLACE_LAYERS;
  const found = allowed.find((layer) => layer === raw);
  return found ?? allowed[0];
}
