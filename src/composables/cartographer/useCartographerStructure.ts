// What the drawing means, live, plus the Structure tools that edit it (#868).
//
// `structure.ts` derives a `DerivedStructure` from a `DungeonMap` — pure and
// framework-free. This composable is the seam between that pure model and
// the editor: it holds the reactive derivation, the Space tool's read
// model (`spaceRows`), and the one mutation
// (`renameSpace`) that writes back into `layers`/`metadata`. Everything that
// doesn't need a Vue ref lives in a plain exported function below so it can
// be tested without mounting anything — see `useCartographerStructure.test.ts`.
//

import { computed, ref, type Ref } from "vue";
import {
  cellKey,
  type CellKey,
  type CellMetadata,
  type DungeonMap,
  type DungeonMapLayers,
} from "@/types/dungeonMap.types";
import { deriveStructure, spaceContaining, structureDelta } from "@/cartographer/structure";
import type { DerivedSpace, DerivedStructure } from "@/cartographer/structure.types";

// ── Pure helpers (no Vue) ───────────────────────────────────────────────────

export interface SpaceRow {
  key: string;
  /** The space's real name, or `"Region N"` (1-based, canonical order) when
   *  nothing has named it yet — same fallback the rail and the publish
   *  review both use so a DM never sees two different placeholder names. */
  displayName: string;
  hasName: boolean;
  provenance: "selected" | "annotation" | "unnamed";
  cellCount: number;
  isSelected: boolean;
}

export function buildSpaceRows(structure: DerivedStructure, selectedSpaceKey: string | null): SpaceRow[] {
  return structure.spaces.map((space, i) => {
    const isSelected = space.key === selectedSpaceKey;
    return {
      key: space.key,
      displayName: space.name ?? `Region ${i + 1}`,
      hasName: space.name !== null,
      provenance: isSelected ? "selected" : space.name !== null ? "annotation" : "unnamed",
      cellCount: space.cells.length,
      isSelected,
    };
  });
}

/** The cell whose annotation text is the space's name — mirrors
 *  `structure.ts`'s own `nameFromAnnotation` scan order exactly, so renaming
 *  always edits the same cell the name came from rather than adding a second. */
export function findNameSourceCell(space: DerivedSpace, annotation: DungeonMapLayers["annotation"]): CellKey | null {
  for (const cell of space.cells) {
    if (annotation[cell]?.text?.trim()) return cell;
  }
  return null;
}

/** Writes (or clears) the annotation that names a space. Targets the cell the
 *  name already came from, or the space's first cell for a space with none —
 *  a name in the Cartographer IS an annotation, so this is the only path
 *  that ever sets one for a space. Returns whether anything changed. */
export function applySpaceName(layers: DungeonMapLayers, space: DerivedSpace, name: string): boolean {
  const trimmed = name.trim();
  const targetCell = findNameSourceCell(space, layers.annotation) ?? space.cells[0];
  if (!targetCell) return false;
  const existing = layers.annotation[targetCell];
  // Compare trimmed-to-trimmed: an annotation carrying incidental whitespace
  // ("Nave  ") must not look different from the name it already displays as,
  // or merely selecting that space and letting the rename watcher round-trip
  // its own display value dirties the map with no actual edit.
  if ((existing?.text ?? "").trim() === trimmed) return false;
  if (!trimmed) {
    const next = { ...layers.annotation };
    delete next[targetCell];
    layers.annotation = next;
  } else {
    layers.annotation[targetCell] = { ...existing, text: trimmed };
  }
  return true;
}

// ── The composable ──────────────────────────────────────────────────────────

export function useCartographerStructure(
  layers: Ref<DungeonMapLayers>,
  metadata: Ref<Record<CellKey, CellMetadata>>,
  loadedMap: Ref<DungeonMap | null | undefined>,
) {
  const structure = computed(() => deriveStructure({ layers: layers.value, metadata: metadata.value }));
  const selectedSpaceKey = ref<string | null>(null);
  const selectedSpace = computed(
    () => structure.value.spaces.find((s) => s.key === selectedSpaceKey.value) ?? null,
  );
  const spaceRows = computed(() => buildSpaceRows(structure.value, selectedSpaceKey.value));

  function selectSpaceAt(x: number, y: number): void {
    selectedSpaceKey.value = spaceContaining(cellKey(x, y), structure.value.spaces)?.key ?? null;
  }

  function renameSpace(name: string): boolean {
    const space = selectedSpace.value;
    if (!space) return false;
    return applySpaceName(layers.value, space, name);
  }

  // The structure as of the map's own last-loaded/last-saved layers, for the
  // "N regions changed since last publish" caution. `loadedMap` is the
  // TanStack Query cache entry — it only moves on load/save, never per
  // keystroke, so this is exactly "as of last save", not "as of last publish"
  // (there is no separate publish-time snapshot to derive from yet).
  const publishedStructure = computed(() =>
    loadedMap.value ? deriveStructure({ layers: loadedMap.value.layers, metadata: loadedMap.value.metadata }) : null,
  );
  const changedSinceLastPublish = computed(() => {
    if (!publishedStructure.value) return null;
    const delta = structureDelta(publishedStructure.value, structure.value);
    return { ...delta, total: delta.changedSpaces + delta.newSpaces + delta.goneSpaces };
  });

  return {
    structure,
    selectedSpaceKey,
    selectedSpace,
    spaceRows,
    selectSpaceAt,
    renameSpace,
    changedSinceLastPublish,
  };
}
