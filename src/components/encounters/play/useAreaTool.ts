import { computed, ref, type Ref } from "vue";
import {
  coveredCells,
  creaturesInside,
  originOnToken,
  snapAreaOrigin,
  type AreaCreature,
  type AreaPoint,
  type AreaShape,
  type AreaTemplate,
} from "@/lib/battlemap/areaTemplates";

/**
 * The Area tool's pointer (#1125 frame 11): a sphere or cube follows the pointer and a click sets it down; a cone or
 * line starts from the selected token (or, with none, from the first click) and is aimed by the pointer. Setting one
 * down picks the creatures inside, which the map selects so Damage all and the rest act on them.
 */
export function useAreaTool(input: {
  shape: Ref<AreaShape>;
  feet: Ref<number>;
  /** The selected token, the origin of a cone or line when there is one. */
  token: () => { position: AreaPoint; footprint: number } | null;
  creatures: () => readonly AreaCreature[];
  /** The creatures a placed area picked, in map order (empty when none). */
  pick: (ids: string[]) => void;
}) {
  const hovering = ref<AreaPoint | null>(null);
  /** A cone's or line's point of origin set by a first click, when no token is selected. */
  const anchor = ref<AreaPoint | null>(null);
  const placed = ref<AreaTemplate | null>(null);

  const isRay = computed(() => input.shape.value === "cone" || input.shape.value === "line");

  function preview(at: AreaPoint): AreaTemplate | null {
    const shape = input.shape.value;
    const feet = input.feet.value;
    if (!isRay.value) return { shape, feet, origin: snapAreaOrigin(shape, feet, at) };
    const token = input.token();
    if (token) return { shape, feet, origin: originOnToken(token, at), aim: at };
    return anchor.value ? { shape, feet, origin: anchor.value, aim: at } : null;
  }

  const shown = computed<AreaTemplate | null>(() => {
    if (placed.value) return placed.value;
    return hovering.value ? preview(hovering.value) : null;
  });
  const covered = computed(() => (shown.value ? coveredCells(shown.value) : new Set<string>()));
  const inside = computed(() => (shown.value ? creaturesInside(covered.value, input.creatures()) : []));

  function hover(at: AreaPoint | null) {
    hovering.value = at;
  }

  function click(at: AreaPoint) {
    placed.value = null;
    if (isRay.value && !input.token() && !anchor.value) {
      anchor.value = snapAreaOrigin(input.shape.value, input.feet.value, at);
      return;
    }
    const t = preview(at);
    if (!t) return;
    placed.value = t;
    anchor.value = null;
    input.pick(creaturesInside(coveredCells(t), input.creatures()));
  }

  function clear() {
    placed.value = null;
    anchor.value = null;
    hovering.value = null;
  }

  return { shown, placed, covered, inside, hover, click, clear };
}
