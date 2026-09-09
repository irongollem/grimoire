// What the drawing means, live, plus the Structure tools that edit it (#868).
//
// `structure.ts` derives a `DerivedStructure` from a `DungeonMap` — pure and
// framework-free. This composable is the seam between that pure model and
// the editor: it holds the reactive derivation, the rail panel's read
// model (`spaceRows`, `selectedSpaceInspector`), the Zone tool's ephemeral
// paint state, and the few mutations (`renameSpace`, `paintZoneAt`,
// `eraseZoneAt`) that write back into `layers`/`metadata`. Everything that
// doesn't need a Vue ref lives in a plain exported function below so it can
// be tested without mounting anything — see `useCartographerStructure.test.ts`.
//
// Link resolution (`useEncounters`/`useTraps`/`useDungeonFeatures`/`useNotes`)
// happens in here rather than being threaded down from the view: the editor
// already calls three of these four for glyph resolution, and TanStack Query
// dedupes the identical query key, so this costs a cache hit, not a request.

import { computed, ref, type Ref } from "vue";
import {
  cellKey,
  type CellKey,
  type CellMetadata,
  type DungeonMap,
  type DungeonMapLayers,
} from "@/types/dungeonMap.types";
import { ZONE_KIND_LABELS, type ZoneKind } from "@/types/locationMapRegion.types";
import { deriveStructure, spaceContaining, structureDelta } from "@/cartographer/structure";
import type { DerivedLink, DerivedSpace, DerivedStructure } from "@/cartographer/structure.types";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useTraps } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatures } from "@/composables/dungeon-features/useDungeonFeatures";
import { useNotes } from "@/composables/notes/useNotes";

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
  /** Zones with at least one cell inside this space. */
  zoneCount: number;
  isSelected: boolean;
}

export function buildSpaceRows(structure: DerivedStructure, selectedSpaceKey: string | null): SpaceRow[] {
  return structure.spaces.map((space, i) => {
    const isSelected = space.key === selectedSpaceKey;
    const zoneCount = structure.zones.filter((z) => z.cells.some((c) => space.cells.includes(c))).length;
    return {
      key: space.key,
      displayName: space.name ?? `Region ${i + 1}`,
      hasName: space.name !== null,
      provenance: isSelected ? "selected" : space.name !== null ? "annotation" : "unnamed",
      cellCount: space.cells.length,
      zoneCount,
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

const WAY_KIND_LABEL: Record<"door" | "arch", [singular: string, plural: string]> = {
  door: ["door", "doors"],
  arch: ["arch", "arches"],
};

/** "1 door → Reliquary · 1 arch → Nave" — grouped by (kind, destination) so
 *  two doors to the same room read as one entry with a count. */
export function buildWaysSummary(space: DerivedSpace, structure: DerivedStructure): string {
  const byName = new Map<string, { kind: "door" | "arch"; count: number; name: string }>();
  const spacesByKey = new Map(structure.spaces.map((s, i) => [s.key, s.name ?? `Region ${i + 1}`]));
  for (const way of structure.ways) {
    const otherKey = way.fromKey === space.key ? way.toKey : way.toKey === space.key ? way.fromKey : null;
    if (otherKey === null) continue;
    const otherName = spacesByKey.get(otherKey) ?? "an unmapped region";
    const groupKey = `${way.kind}:${otherName}`;
    const existing = byName.get(groupKey);
    if (existing) existing.count++;
    else byName.set(groupKey, { kind: way.kind, count: 1, name: otherName });
  }
  if (byName.size === 0) return "No ways out yet.";
  return [...byName.values()]
    .map(({ kind, count, name }) => {
      const [singular, plural] = WAY_KIND_LABEL[kind];
      return `${count} ${count === 1 ? singular : plural} → ${name}`;
    })
    .join(" · ");
}

export interface LinkResolvers {
  encounters: Map<string, string>;
  traps: Map<string, string>;
  features: Map<string, string>;
  notes: Map<string, string>;
}

/** "Encounter 'Thing in the Cistern'" per linked cell in the space, falling
 *  back to "Encounter linked" when the id no longer resolves (scoped away,
 *  deleted) — the link still publishes, so it still deserves a row. */
export function buildLinkedSummary(links: readonly DerivedLink[], spaceKey: string, resolvers: LinkResolvers): string[] {
  const rows: string[] = [];
  for (const link of links) {
    if (link.spaceKey !== spaceKey) continue;
    const m = link.metadata;
    if (m.encounter_id) rows.push(labelFor("Encounter", m.encounter_id, resolvers.encounters));
    if (m.trap_id) rows.push(labelFor("Trap", m.trap_id, resolvers.traps));
    if (m.feature_id) rows.push(labelFor("Feature", m.feature_id, resolvers.features));
    if (m.note_id) rows.push(labelFor("Note", m.note_id, resolvers.notes));
  }
  return rows;
}

function labelFor(kind: string, id: string, names: Map<string, string>): string {
  const name = names.get(id);
  return name ? `${kind} '${name}'` : `${kind} linked`;
}

export function paintZoneCell(
  layers: DungeonMapLayers,
  x: number,
  y: number,
  zoneId: string,
  kind: ZoneKind,
  label: string | null,
): boolean {
  const zone = layers.zone ?? (layers.zone = {});
  const k = cellKey(x, y);
  const existing = zone[k];
  if (existing?.zone_id === zoneId && existing?.kind === kind && existing?.label === label) return false;
  zone[k] = { zone_id: zoneId, kind, label };
  return true;
}

export function eraseZoneCell(layers: DungeonMapLayers, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (!layers.zone?.[k]) return false;
  const next = { ...layers.zone };
  delete next[k];
  layers.zone = next;
  return true;
}

export { ZONE_KIND_LABELS };

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

  // Link-name resolution — same composables + scope option the view already
  // uses for glyphs (`includeAllScopes`: a link must keep resolving even
  // after its target is scoped out of the active campaign).
  const { data: encountersData } = useEncounters();
  const { data: trapsData } = useTraps(() => ({ includeAllScopes: true }));
  const { data: featuresData } = useDungeonFeatures(() => ({ includeAllScopes: true }));
  const { data: notesData } = useNotes();
  const linkResolvers = computed<LinkResolvers>(() => ({
    encounters: new Map((encountersData.value ?? []).map((e) => [e.id, e.name])),
    traps: new Map((trapsData.value ?? []).map((t) => [t.id, t.name])),
    features: new Map((featuresData.value ?? []).map((f) => [f.id, f.name])),
    notes: new Map((notesData.value ?? []).map((n) => [n.id, n.title])),
  }));

  const selectedSpaceInspector = computed(() => {
    const space = selectedSpace.value;
    if (!space) return null;
    const sourceCell = findNameSourceCell(space, layers.value.annotation);
    const zonesInside = structure.value.zones.filter((z) => z.cells.some((c) => space.cells.includes(c)));
    return {
      key: space.key,
      name: space.name,
      hasName: space.name !== null,
      sourceCell,
      cellCount: space.cells.length,
      waysSummary: buildWaysSummary(space, structure.value),
      zones: zonesInside.map((z) => ({
        kind: z.kind,
        kindLabel: ZONE_KIND_LABELS[z.kind],
        label: z.label,
      })),
      linked: buildLinkedSummary(structure.value.links, space.key, linkResolvers.value),
    };
  });

  function selectSpaceAt(x: number, y: number): void {
    selectedSpaceKey.value = spaceContaining(cellKey(x, y), structure.value.spaces)?.key ?? null;
  }

  /** The frame's "Re-detect from floor layer" button. The derivation is
   *  already live off `layers`/`metadata` — there is nothing stale to
   *  recompute — so this exists for the affordance the frame asks for and to
   *  clear a selection that no longer points at anything useful. */
  function redetect(): void {
    selectedSpaceKey.value = null;
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

  // ── Zone tool state ────────────────────────────────────────────────────
  const zoneKind = ref<ZoneKind>("terrain");
  const zoneLabel = ref("");
  const zoneMode = ref<"new" | "continue">("new");
  const currentZoneId = ref<string | null>(null);

  function startNewZone(): void {
    zoneMode.value = "new";
  }

  function ensureZoneId(): string {
    if (zoneMode.value === "new" || !currentZoneId.value) {
      currentZoneId.value = crypto.randomUUID();
      zoneMode.value = "continue";
    }
    return currentZoneId.value;
  }

  function paintZoneAt(x: number, y: number): boolean {
    return paintZoneCell(layers.value, x, y, ensureZoneId(), zoneKind.value, zoneLabel.value.trim() || null);
  }

  function eraseZoneAt(x: number, y: number): boolean {
    return eraseZoneCell(layers.value, x, y);
  }

  return {
    structure,
    selectedSpaceKey,
    selectedSpace,
    spaceRows,
    selectedSpaceInspector,
    selectSpaceAt,
    redetect,
    renameSpace,
    changedSinceLastPublish,
    zoneKind,
    zoneLabel,
    zoneMode,
    startNewZone,
    paintZoneAt,
    eraseZoneAt,
  };
}
