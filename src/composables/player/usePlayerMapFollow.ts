// Phone: zoom to a playable size once, then keep the token of whoever is up in the middle (you, on your turn).
// Each move of that token pans again; a player's own pan stays until the next move or turn.
import { watch, type Ref } from "vue";
import { panToCentre } from "@/components/player/playerMapMove";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import type { RunCombatant } from "@/types/encounter.types";

const PHONE_CELL_PX = 56;

export function usePlayerMapFollow(input: {
  isPhone: Ref<boolean>;
  follow: Ref<boolean>;
  imageReady: Ref<boolean>;
  cellPx: Ref<number>;
  hostW: Ref<number>;
  hostH: Ref<number>;
  gridOrigin: Ref<{ x: number; y: number }>;
  scale: Ref<number>;
  panX: Ref<number>;
  panY: Ref<number>;
  followTarget: Ref<RunCombatant | null>;
}) {
  const { isPhone, follow, imageReady, cellPx, hostW, hostH, gridOrigin, scale, panX, panY, followTarget } = input;
  let zoomed = false;
  watch(
    () => [isPhone.value, follow.value, imageReady.value, cellPx.value > 0, hostW.value > 0, followTarget.value?.instance_id, followTarget.value?.position?.x, followTarget.value?.position?.y],
    () => {
      const t = followTarget.value;
      if (!isPhone.value || !follow.value || !imageReady.value || cellPx.value <= 0 || !t?.position) return;
      if (!zoomed) {
        scale.value = scale.value * (PHONE_CELL_PX / cellPx.value);
        zoomed = true;
      }
      const pan = panToCentre({
        hostW: hostW.value,
        hostH: hostH.value,
        origin: gridOrigin.value,
        cellPx: cellPx.value,
        pan: { x: panX.value, y: panY.value },
        at: t.position,
        footprint: combatantFootprint(t),
      });
      panX.value = pan.x;
      panY.value = pan.y;
    },
    { immediate: true },
  );
}
