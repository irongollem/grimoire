/**
 * Where a place opens: the Atlas, with that place selected.
 *
 * A place used to have two DM screens, the Atlas pane at `/locations?at=<id>`
 * and a separate full page at `/locations/:id`, and links went to either one
 * depending on who wrote them. The full page is gone (25 Sep 2026). Every link
 * to a place is built here, so there is one answer to "where does this go".
 *
 * `mode` opens the place in one of the Atlas pane's working states: the
 * Details form (`edit`), the site runner (`run`), or its Map tab (`map`).
 * There is no Build mode any more (#1125): a place's map is a tab, and editing
 * it is the full-screen editor at `/locations/:id/map` (`mapEditorRoute` can
 * also pick the layer it opens on). A string rather than a route object because several
 * callers hand it to places that take a plain href (search results, chat,
 * prepared marks).
 */
export type PlaceMode = "edit" | "map" | "run";

/** The layers the full-screen map editor can open on. `drawing`, `plan` and
 *  `picture` belong to a site, `picture` and `pins` to any other place. */
export type MapEditorLayer = "drawing" | "plan" | "picture" | "pins";

export function placeRoute(id: string, mode?: PlaceMode): string {
  if (mode === "map") return mapEditorRoute(id);
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
