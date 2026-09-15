// ── "Start drawing" / "Open" for a site's own Drawing layer (#884, S5) ──────
//
// `SiteMapLayersPanel`'s Drawing row emits `open-drawing` rather than routing
// itself — a later story mounts the Cartographer inline, and only the caller
// will know where to put it — but both callers (`AtlasSiteMapMode`,
// `LocationSheet`) need the exact same two-way branch: open the existing
// drawing, or create one first. Rather than duplicate that branch verbatim in
// two files (the thing this codebase's own component-extraction rule exists
// to stop), it lives here once.
//
// Mirrors `SiteLevelReusePanel`'s "Draw level N" (create, then open) with one
// deliberate difference. That flow pushes `/cartographer/new?publishTo=<id>`
// and lets the FIRST SAVE create the row — `useMapPublish` only offers to
// publish once a real map id exists, and at `/cartographer/new` there isn't
// one yet, so the offer waits for actual content. A site's own Drawing
// already has an obvious name (the site's own), so this pre-creates the row
// instead of leaving it "Untitled Map" for the DM to rename — which means a
// real map id exists the instant the Cartographer opens. `publishTo` is
// deliberately left off the navigation for exactly that reason: carrying it
// would open the Publish modal over a still-blank canvas, since the trigger
// is "a map exists and `publishTo` is present," not "a map has been drawn."
// The DM publishes from inside the Cartographer once there is something to
// publish, same as any map opened from the plain `/cartographer/:id` route.
import { useRouter } from "vue-router";
import { useCreateDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import type { Location } from "@/types/location.types";

export function useOpenSiteDrawing() {
  const router = useRouter();
  const createDungeonMap = useCreateDungeonMap();

  async function openDrawing(site: Pick<Location, "id" | "name" | "source_map_id">): Promise<void> {
    if (site.source_map_id) {
      router.push(`/cartographer/${site.source_map_id}`);
      return;
    }
    const created = await createDungeonMap.mutateAsync({ name: site.name });
    router.push(`/cartographer/${created.id}`);
  }

  return { openDrawing };
}
