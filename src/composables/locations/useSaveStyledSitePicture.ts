import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { GridCalibration, Location } from "@/types/location.types";
import type { StyledPlay } from "@/cartographer/styledPlay";
import { DUNGEON_MAPS_QUERY_KEY, dungeonMapInsertPayload } from "@/composables/cartographer/useDungeonMaps";
import { LOCATIONS_QUERY_KEY } from "@/composables/locations/useLocations";

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
 * out. Both writes are one database call, `save_styled_site_picture`
 * (#1169): two requests left a walls map linked to nothing when the second
 * failed, and a styled Picture half-written over a Drawing still published
 * over it (see `MapStackImage.vue`'s `showsUnderlyingPicture`) is what one
 * `locations` update already prevented. A retry of the same render sends the
 * same key, so a save that committed but lost its answer reuses its map
 * instead of making another. No bake is written (`map_layer_*` are cleared):
 * the painting is the only image.
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
  // One key per render: `play` is built once per styling result and kept while the DM decides, so a second press
  // of Save on the same render is a retry of the same save, and a new render is a new save.
  const requestKeys = new WeakMap<StyledPlay, string>();
  const keyFor = (play: StyledPlay) => {
    let key = requestKeys.get(play);
    if (!key) {
      key = crypto.randomUUID();
      requestKeys.set(play, key);
    }
    return key;
  };
  return useMutation({
    mutationFn: async ({ id, mapUrl, calibration, play }: { id: string; mapUrl: string; calibration: GridCalibration; play: StyledPlay }) => {
      const { data, error } = await supabase.rpc("save_styled_site_picture", {
        p_location_id: id,
        p_request_id: keyFor(play),
        p_map_url: mapUrl,
        p_calibration: calibration,
        p_map_live: play.mapLive,
        p_drawing: dungeonMapInsertPayload(play.drawing),
      });
      if (error) throw error;
      return data as Location;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [LOCATIONS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [LOCATIONS_QUERY_KEY, id] });
      queryClient.invalidateQueries({ queryKey: [DUNGEON_MAPS_QUERY_KEY] });
    },
  });
}
