/**
 * Where a place opens: the Atlas, with that place selected.
 *
 * A place used to have two DM screens, the Atlas pane at `/locations?at=<id>`
 * and a separate full page at `/locations/:id`, and links went to either one
 * depending on who wrote them. The full page is gone (25 Sep 2026). Every link
 * to a place is built here, so there is one answer to "where does this go".
 *
 * `mode` opens the place in one of the Atlas pane's working states: the
 * Details form (`edit`), the site workbench (`build`), or the site runner
 * (`run`). A string rather than a route object because several callers hand
 * it to places that take a plain href (search results, chat, prepared marks).
 */
export type PlaceMode = "edit" | "build" | "run";

export function placeRoute(id: string, mode?: PlaceMode): string {
  const at = `/locations?at=${encodeURIComponent(id)}`;
  return mode ? `${at}&${mode}=true` : at;
}
