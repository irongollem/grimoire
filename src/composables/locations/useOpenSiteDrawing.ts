// ── "Start drawing" for a site's own Drawing layer (#884, S5; reworked S11) ──
//
// `SiteMapLayersPanel`'s Drawing row emits `open-drawing` rather than acting
// itself — both callers (`AtlasSiteMapMode`, `LocationSheet`) need the exact
// same branch, and the component-extraction rule this codebase already
// follows says that lives once, here, rather than twice.
//
// Before #884 S11 this navigated to `/cartographer/:id` — the Cartographer
// was a separate page. It no longer is: `AtlasSiteMapMode`/`LocationSheet`
// mount `MapWorkbench` directly in Build mode, and hand it `source_map_id`'s
// own row (or `null`) as its `map` prop. So a site that already has a
// drawing is *already showing it* the moment this fires — there is nothing
// left to open, and this is a no-op. A site with none yet needs one CREATED
// so the embedded workbench has a real row to autosave onto (mirroring
// `useSiteDrawingEditor`'s own create-on-first-edit path, but immediate
// rather than deferred to the first paint stroke — "Start drawing" is a
// deliberate click, not an incidental one) — named after the site, same as
// before, so it never sits as "Untitled Map" for the DM to rename.
import { useCreateDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import type { Location } from "@/types/location.types";

export function useOpenSiteDrawing() {
  const createDungeonMap = useCreateDungeonMap();
  const updateLocation = useUpdateLocation();

  async function openDrawing(site: Pick<Location, "id" | "name" | "source_map_id">): Promise<void> {
    if (site.source_map_id) return; // already showing in the embedded workbench
    const created = await createDungeonMap.mutateAsync({ name: site.name });
    await updateLocation.mutateAsync({ id: site.id, update: { source_map_id: created.id } });
  }

  return { openDrawing };
}
