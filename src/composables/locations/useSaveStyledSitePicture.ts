import { useMutation, useQueryClient } from "@tanstack/vue-query";
import type { GridCalibration } from "@/types/location.types";
import type { StyledPlay } from "@/cartographer/styledPlay";
import { useCreateDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { LOCATIONS_QUERY_KEY, updateLocation } from "@/composables/locations/useLocations";

// Its own module, not part of useLocations.ts: that file is read on every boot (the dashboard and the player
// portal), and this save needs the Cartographer's map writes, a 44 kB chunk only the styling screen should load.

/**
 * Saves an AI-styled render as a site's Picture from Atlas Build, replacing
 * whatever Drawing currently sits on top of it: the render "bubbles down"
 * to the Picture layer (epic #884, decision 1), and the tiles stop being
 * drawn. What the tiles *did* keeps working (8 Nov 2026): a wall is still a
 * wall to sight and light, the water still waves and a flame still flickers,
 * only unseen under the painting.
 *
 * So the save makes a new walls-only `dungeon_maps` row (`styledPlay.ts`:
 * the source's walls and doors with `visible: false`, plus its lights, in
 * the same cells), links it as the site's Drawing at its own rev, and writes
 * the snapshot built from the source Drawing with the tile-art redraws taken
 * out. The `dungeon_maps` insert comes first: if it fails nothing on the
 * location changes. The `locations` write is then one atomic update, not a
 * `useUpdateLocationPicture` write followed by a separate clear, which an
 * interruption could leave as a styled Picture under a Drawing still
 * published over it (see `MapStackImage.vue`'s `showsUnderlyingPicture`). No
 * bake is written (`map_layer_*` are cleared): the painting is the only image.
 *
 * The tile Drawing's own `dungeon_maps` row is NOT deleted or edited, only
 * unlinked, so it survives as an ordinary map in the Cartographer: the DM can
 * reopen it, draw corrections over the styled Picture (MapWorkbench's
 * reference ghost, keyed on the Picture's own `grid_calibration`) and style
 * again.
 *
 * `calibration` is a best-first-guess, not a guarantee: the caller derives
 * it from the input's own fitted geometry (`styledPictureCalibration`),
 * safe to write because the edge function requests exactly the size that
 * geometry was fitted to (`supabase/functions/style-map/index.ts`), but
 * the model itself can still shrink or grow the grid a little in its own
 * render. The Picture layer's "Line up the grid on the map" (`MapGridLineUp`)
 * stays available and opens seeded from whatever this wrote, exactly as it
 * does for any other Picture.
 */
export function useSaveStyledSitePicture() {
  const queryClient = useQueryClient();
  const createDungeonMap = useCreateDungeonMap();
  return useMutation({
    mutationFn: async ({ id, mapUrl, calibration, play }: { id: string; mapUrl: string; calibration: GridCalibration; play: StyledPlay }) => {
      const walls = await createDungeonMap.mutateAsync(play.drawing);
      return updateLocation(id, {
        map_url: mapUrl,
        grid_calibration: calibration,
        map_layer_url: null,
        map_layer_stand_url: null,
        map_layer_stand_live_url: null,
        map_layer_calibration: null,
        map_live: play.mapLive,
        source_map_id: walls.id,
        // The walls drawing is exactly what the snapshot came from, so the site is not behind it.
        map_published_rev: walls.rev,
      });
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [LOCATIONS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [LOCATIONS_QUERY_KEY, id] });
    },
  });
}
