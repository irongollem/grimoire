// The cell the Link and Annotate tools have picked, as the options slip shows and edits it: its label, the
// note / encounter / trap / feature it links, and a read-only summary of what stands there. Split out of
// MapWorkbench.vue (#1135); the workbench still owns `layers`, `metadata` and `selectedCell`.

import { computed, type Ref } from "vue";
import { useNotes } from "@/composables/notes/useNotes";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useTrapIndex } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatureIndex } from "@/composables/dungeon-features/useDungeonFeatures";
import { cellKey, type CellKey, type CellMetadata, type DungeonMapLayers, type EdgeSegType } from "@/types/dungeonMap.types";
import { resolveCellGlyphs } from "@/cartographer/glyphs";
import { wallAt } from "@/cartographer/wallGraph";

export function useWorkbenchCellSelection(inputs: {
  layers: Ref<DungeonMapLayers>;
  metadata: Ref<Record<CellKey, CellMetadata>>;
  selectedCell: Ref<[number, number] | null>;
  /** The setters here are not routed through the canvas editor's own `markDirty()`, so they bump the host's. */
  markDirty: () => void;
}) {
  const { layers, metadata, selectedCell, markDirty } = inputs;

  // M4 — Entity options for the link picker
  const { data: notesData } = useNotes();
  const { data: encountersData } = useEncounters();
  const noteOptions = computed(() =>
    (notesData.value ?? []).map((n) => ({ id: n.id, name: (n as { id: string; title: string }).title })),
  );
  const encounterOptions = computed(() =>
    (encountersData.value ?? []).map((e) => ({ id: e.id, name: e.name })),
  );

  // #804 — hazard/feature glyph resolution. `includeAllScopes` because a cell's
  // trap_id/feature_id must keep resolving even after its target is scoped out
  // of the active campaign, same rule useLocationPlacements documents.
  // Pickers offer the scoped pick list (library shadowed by own rows); what a cell
  // already holds resolves through byId with every scope, so it keeps rendering
  // after its target is scoped out of the active campaign or shadowed by a copy.
  const { data: pickTrapsData } = useTrapIndex();
  const { data: pickFeaturesData } = useDungeonFeatureIndex();
  const { byId: trapsById } = useTrapIndex(() => ({ includeAllScopes: true }));
  const { byId: featuresById } = useDungeonFeatureIndex(() => ({ includeAllScopes: true }));
  // The picker offers the scoped list plus whatever the selected cell already
  // holds, so an out-of-scope or shadowed value still displays and stays selectable.
  function withCurrent(
    picked: ReadonlyArray<{ id: string; name: string }>,
    current: { id: string; name: string } | undefined,
  ): { id: string; name: string }[] {
    const options = picked.map((r) => ({ id: r.id, name: r.name }));
    if (current && !options.some((o) => o.id === current.id)) options.push({ id: current.id, name: current.name });
    return options;
  }
  const trapOptions = computed(() =>
    withCurrent(pickTrapsData.value ?? [], trapsById.value.get(linkedTrapId.value)),
  );
  const featureOptions = computed(() =>
    withCurrent(pickFeaturesData.value ?? [], featuresById.value.get(linkedFeatureId.value)),
  );
  const cellGlyphs = computed(() => resolveCellGlyphs(metadata.value, trapsById.value, featuresById.value));

  // Writable computeds for the Link tool's pickers
  const linkedNoteId = computed({
    get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.note_id ?? "") : ""),
    set: (id: string) => {
      if (!selectedCell.value) return;
      const k = cellKey(...selectedCell.value);
      metadata.value[k] = { ...metadata.value[k], note_id: id || undefined };
      markDirty();
    },
  });
  const linkedEncounterId = computed({
    get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.encounter_id ?? "") : ""),
    set: (id: string) => {
      if (!selectedCell.value) return;
      const k = cellKey(...selectedCell.value);
      metadata.value[k] = { ...metadata.value[k], encounter_id: id || undefined };
      markDirty();
    },
  });
  const linkedTrapId = computed({
    get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.trap_id ?? "") : ""),
    set: (id: string) => {
      if (!selectedCell.value) return;
      const k = cellKey(...selectedCell.value);
      metadata.value[k] = { ...metadata.value[k], trap_id: id || undefined };
      markDirty();
    },
  });
  const linkedFeatureId = computed({
    get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.feature_id ?? "") : ""),
    set: (id: string) => {
      if (!selectedCell.value) return;
      const k = cellKey(...selectedCell.value);
      metadata.value[k] = { ...metadata.value[k], feature_id: id || undefined };
      markDirty();
    },
  });

  // Annotation text for the selected cell — updates layers live, undo pushed on blur
  const annotationText = computed({
    get: () => (selectedCell.value ? (layers.value.annotation[cellKey(...selectedCell.value)]?.text ?? "") : ""),
    set: (v: string) => {
      if (!selectedCell.value) return;
      const k = cellKey(...selectedCell.value);
      if (!v.trim()) {
        const next = { ...layers.value.annotation };
        delete next[k];
        layers.value.annotation = next;
      } else {
        layers.value.annotation[k] = { text: v.trim() };
      }
      markDirty();
    },
  });

  // ── Select tool ─────────────────────────────────────────────────
  // A read-only summary of the selected cell for the Select tool's options.
  // Computed here, not in the options: they are presentation-only
  // everywhere else in this file (annotationText/linkedNoteId etc. are the
  // same "MapWorkbench computes, the panel just renders" shape), and only
  // MapWorkbench holds `layers` plus the id->name option lists a link name
  // needs to resolve. E/S edges read from the NEIGHBOURING cell's W/N per the
  // "NW ownership" rule (context/features/cartographer.md, "Edge ownership
  // rule") — a cell only ever stores its own N/W.
  function edgeSegAt(x: number, y: number, side: "N" | "E" | "S" | "W") {
    return wallAt(layers.value, x, y, side);
  }

  const selectedCellFloor = computed(() => {
    if (!selectedCell.value) return false;
    const [x, y] = selectedCell.value;
    return !!layers.value.floor[cellKey(x, y)]?.floor;
  });

  const selectedCellSolid = computed(() => {
    if (!selectedCell.value) return false;
    const [x, y] = selectedCell.value;
    return !!layers.value.solidBlock[cellKey(x, y)];
  });

  const selectedCellEdges = computed(() => {
    if (!selectedCell.value) return [];
    const [x, y] = selectedCell.value;
    return (["N", "E", "S", "W"] as const)
      .map((side) => {
        const seg = edgeSegAt(x, y, side);
        return { side, kind: seg?.type, decal: seg?.decal };
      })
      .filter((e): e is { side: "N" | "E" | "S" | "W"; kind: EdgeSegType; decal: number | undefined } => !!e.kind);
  });

  const selectedCellObjectCategory = computed(() => {
    if (!selectedCell.value) return null;
    const [x, y] = selectedCell.value;
    return layers.value.object[cellKey(x, y)]?.category ?? null;
  });

  const selectedCellLinkedNames = computed(() => {
    if (!selectedCell.value) return [];
    const names: string[] = [];
    const noteName = noteOptions.value.find((o) => o.id === linkedNoteId.value)?.name;
    if (noteName) names.push(`Note: ${noteName}`);
    const encounterName = encounterOptions.value.find((o) => o.id === linkedEncounterId.value)?.name;
    if (encounterName) names.push(`Encounter: ${encounterName}`);
    const trapName = trapsById.value.get(linkedTrapId.value)?.name;
    if (trapName) names.push(`Trap: ${trapName}`);
    const featureName = featuresById.value.get(linkedFeatureId.value)?.name;
    if (featureName) names.push(`Feature: ${featureName}`);
    return names;
  });

  return {
    noteOptions, encounterOptions, trapOptions, featureOptions, cellGlyphs,
    linkedNoteId, linkedEncounterId, linkedTrapId, linkedFeatureId, annotationText,
    selectedCellFloor, selectedCellSolid, selectedCellEdges, selectedCellObjectCategory, selectedCellLinkedNames,
  };
}
