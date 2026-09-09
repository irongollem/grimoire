<template>
  <div class="flex flex-col gap-4">
    <!-- Spaces -->
    <section>
      <div class="flex items-baseline justify-between gap-2 mb-1.5">
        <span class="text-eyebrow text-muted-foreground">Spaces</span>
        <span class="text-caption-sm text-muted-foreground">{{ spaceSummary }}</span>
      </div>
      <ul class="space-y-1">
        <li
          v-for="row in spaceRows"
          :key="row.key"
          class="border-l-2 pl-2.5 py-1 text-caption-sm"
          :class="BORDER_CLASS[row.tone]"
        >
          <span class="text-foreground">{{ row.text }}</span>
          <span class="block text-muted-foreground">{{ row.action }}</span>
        </li>
      </ul>
    </section>

    <!-- Zones -->
    <section v-if="zoneRows.length > 0">
      <div class="flex items-baseline justify-between gap-2 mb-1.5">
        <span class="text-eyebrow text-muted-foreground">Zones</span>
        <span class="text-caption-sm text-muted-foreground">{{ zoneSummary }}</span>
      </div>
      <ul class="space-y-1">
        <li
          v-for="row in zoneRows"
          :key="row.key"
          class="border-l-2 pl-2.5 py-1 text-caption-sm"
          :class="BORDER_CLASS[row.tone]"
        >
          <span class="text-foreground">{{ row.text }}</span>
          <span class="block text-muted-foreground">{{ row.action }}</span>
        </li>
      </ul>
    </section>

    <!-- Ways out -->
    <section>
      <div class="flex items-baseline justify-between gap-2 mb-1.5">
        <span class="text-eyebrow text-muted-foreground">Ways out</span>
        <span class="text-caption-sm text-muted-foreground">{{ waySummary }}</span>
      </div>
      <ul class="space-y-1">
        <li
          v-for="row in wayRows"
          :key="row.key"
          class="border-l-2 pl-2.5 py-1 text-caption-sm"
          :class="BORDER_CLASS[row.tone]"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-foreground">{{ row.text }}</span>
            <AppButton v-if="row.heldChip" variant="tinted" tone="primary" emphasis="soft" size="xs" :icon="IconStar" label="Keep mine" class="pointer-events-none shrink-0" />
          </div>
          <span class="block text-muted-foreground">{{ row.action }}</span>
          <EntityCombobox
            v-if="row.stairCellKey"
            :model-value="stairTargets[row.stairCellKey] ?? ''"
            :options="stairTargetOptions"
            placeholder="Pick a target…"
            class="mt-1.5"
            @update:model-value="(id) => $emit('pickStairTarget', row.stairCellKey!, id)"
          />
        </li>
      </ul>
    </section>

    <!-- Prepared here -->
    <section v-if="placementRows.length > 0">
      <div class="flex items-baseline justify-between gap-2 mb-1.5">
        <span class="text-eyebrow text-muted-foreground">Prepared here</span>
        <span class="text-caption-sm text-muted-foreground">{{ placementSummary }}</span>
      </div>
      <ul class="space-y-1">
        <li v-for="row in placementRows" :key="row.key" class="border-l-2 pl-2.5 py-1 text-caption-sm" :class="BORDER_CLASS[row.tone]">
          <span class="text-foreground">{{ row.text }}</span>
          <span class="block text-muted-foreground">{{ row.action }}</span>
        </li>
      </ul>
    </section>

    <div class="flex items-start gap-2 rounded-md border border-tone-caution/40 bg-tone-caution/10 px-3 py-2 text-caption-sm text-foreground">
      <IconWarning class="h-4 w-4 mt-0.5 text-tone-caution shrink-0" />
      <span><strong>Nothing is deleted.</strong> A room whose cells disappeared is marked orphaned and keeps its notes, loot, placements and state log. Removing it stays a deliberate act in the Rooms panel.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The three diff-row lists of the Publish to Atlas review (#868 S10, frame
 * 05) — Spaces, Ways out, Prepared here — plus the "nothing is deleted"
 * caution the frame pins under all three. Reads straight off `PublishPlan`;
 * `PublishPlanPreview` reads the same plan for the picture half.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconStar, IconWarning } from "@/lib/icons";
import { DOOR_KIND_LABELS } from "@/types/locationDoor.types";
import { ZONE_KIND_LABELS } from "@/types/locationMapRegion.types";
import { LOCATION_PLACEMENT_KIND_LABELS, placementKind, type LocationPlacement } from "@/types/locationPlacement.types";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import { createdRefKey, type PublishPlan, type ZoneChange } from "@/lib/locations/publish";
import type { CellKey } from "@/types/dungeonMap.types";

type Tone = "new" | "changed" | "gone" | "unchanged";

const BORDER_CLASS: Record<Tone, string> = {
  new: "border-tone-success",
  changed: "border-tone-caution",
  gone: "border-tone-danger",
  unchanged: "border-border/70 opacity-72",
};

const { plan, spaceNameById, stairTargetOptions, stairTargets } = defineProps<{
  plan: PublishPlan;
  /** Existing site children's names, for a change whose only handle on a
   *  room is an already-bound region's `space_location_id`. */
  spaceNameById: Map<string, string>;
  /** Nested sites of the target site — the only valid far end for a stair. */
  stairTargetOptions: { id: string; name: string }[];
  /** DM-resolved far ends for stairs the drawing left unresolved. */
  stairTargets: Record<CellKey, string>;
}>();

defineEmits<{
  pickStairTarget: [cellKey: CellKey, targetId: string];
}>();

function roomName(spaceLocationId: string | null, fallback: string | null): string {
  if (spaceLocationId) return spaceNameById.get(spaceLocationId) ?? fallback ?? "Unnamed region";
  return fallback ?? "Unnamed region";
}

// ── Spaces ───────────────────────────────────────────────────────────────

interface Row {
  key: string;
  tone: Tone;
  text: string;
  action: string;
  stairCellKey?: CellKey;
  /** Frame 05 shows "Keep mine" only on a row the DM's own edit is holding
   *  back — never on every changed-toned row (an unresolved stair is
   *  "changed" too, but there is nothing of the DM's to keep). */
  heldChip?: boolean;
}

const spaceRows = computed<Row[]>(() => {
  const rows: Row[] = [];
  const skipped: string[] = [];
  for (const change of plan.spaces) {
    if (change.kind === "create") {
      rows.push({
        key: `create:${change.space.key}`,
        tone: "new",
        text: `${change.proposedName} — New region, ${change.space.cells.length} cell${change.space.cells.length === 1 ? "" : "s"}${change.space.nameSource === "annotation" ? " · name from annotation" : ""}`,
        action: "→ Create room",
      });
    } else if (change.kind === "update") {
      const name = roomName(change.region.space_location_id, change.space.name);
      rows.push({
        key: `update:${change.region.id}`,
        tone: "changed",
        text: `${name} — ${change.before} → ${change.after} cells`,
        action: "→ Update shape",
      });
    } else if (change.kind === "held") {
      const name = roomName(change.region.space_location_id, change.space.name);
      rows.push({
        key: `held:${change.region.id}`,
        tone: "changed",
        text: `${name} — you've edited this shape by hand; the drawing has since changed`,
        action: "→ keep mine",
      });
    } else if (change.kind === "orphan") {
      const name = roomName(change.region.space_location_id, null);
      rows.push({
        key: `orphan:${change.region.id}`,
        tone: "gone",
        text: `${name} — gone from the drawing`,
        action: "→ orphaned — kept, not deleted",
      });
    } else {
      skipped.push(roomName(change.region.space_location_id, change.space.name));
    }
  }
  if (skipped.length > 0) {
    rows.push({
      key: "skip:all",
      tone: "unchanged",
      text: `${skipped.join(" · ")} — Unchanged`,
      action: "bindings and state kept → skip",
    });
  }
  return rows;
});

const spaceSummary = computed(() => {
  const created = plan.spaces.filter((c) => c.kind === "create").length;
  const changed = plan.spaces.filter((c) => c.kind === "update" || c.kind === "held").length;
  const unchanged = plan.spaces.filter((c) => c.kind === "skip").length;
  return `${created} new · ${changed} changed · ${unchanged} unchanged`;
});

// ── Zones ────────────────────────────────────────────────────────────────
//
// A zone binds nothing, so unlike a space's "held" case there is no DM edit
// to hold back — `ZoneChange` only ever matches by signature (unchanged), by
// kind+label (shape moved under an unchanged identity), or fails to match at
// all (new). Frame 05 lists zones beside spaces as "what the plan is made
// of", so the row shape mirrors `spaceRows` exactly, unchanged rows folded
// into one line the same way.

function zoneLabel(kind: ZoneChange["zone"]["kind"], label: string | null): string {
  return label ? `${ZONE_KIND_LABELS[kind]} '${label}'` : ZONE_KIND_LABELS[kind];
}

const zoneRows = computed<Row[]>(() => {
  const rows: Row[] = [];
  const skipped: string[] = [];
  for (const change of plan.zones) {
    const name = zoneLabel(change.zone.kind, change.zone.label);
    if (change.kind === "create") {
      const count = change.zone.cells.length;
      rows.push({
        key: `create:${change.zone.zoneId}`,
        tone: "new",
        text: `${name} — New zone, ${count} cell${count === 1 ? "" : "s"}`,
        action: "→ Create zone",
      });
    } else if (change.kind === "update") {
      const before = change.region?.cells.length ?? 0;
      const after = change.zone.cells.length;
      rows.push({
        key: `update:${change.region?.id ?? change.zone.zoneId}`,
        tone: "changed",
        text: `${name} — ${before} → ${after} cells`,
        action: "→ Update shape",
      });
    } else {
      skipped.push(name);
    }
  }
  if (skipped.length > 0) {
    rows.push({
      key: "skip:all-zones",
      tone: "unchanged",
      text: `${skipped.join(" · ")} — Unchanged`,
      action: "bindings and state kept → skip",
    });
  }
  return rows;
});

const zoneSummary = computed(() => {
  const created = plan.zones.filter((c) => c.kind === "create").length;
  const changed = plan.zones.filter((c) => c.kind === "update").length;
  const unchanged = plan.zones.filter((c) => c.kind === "skip").length;
  return `${created} new · ${changed} changed · ${unchanged} unchanged`;
});

// ── Ways out ─────────────────────────────────────────────────────────────

// A "created:<key>" ref has no room yet, but the space's own create change
// already carries the name the DM will see once it exists — frame 05 writes
// the proposed name straight into the arrow ("Nave of Ash → Abbot's Cell"),
// never a placeholder like "the new room".
const proposedNameByKey = computed(() => {
  const map = new Map<string, string>();
  for (const change of plan.spaces) {
    if (change.kind === "create") map.set(change.space.key, change.proposedName);
  }
  return map;
});

function endpointName(id: string): string {
  if (id.startsWith("created:")) {
    return proposedNameByKey.value.get(createdRefKey(id)) ?? "the new room";
  }
  return spaceNameById.get(id) ?? "an unmapped space";
}

const wayRows = computed<Row[]>(() => {
  const rows: Row[] = [];
  for (const change of plan.ways) {
    if (change.kind === "create") {
      rows.push({
        key: `create:${change.way.edgeKey}`,
        tone: "new",
        text: `${endpointName(change.fromSpaceId)} → ${endpointName(change.toSpaceId)}`,
        action: `${DOOR_KIND_LABELS[change.way.kind]} edge \`${change.way.edgeKey}\` → Create`,
      });
    } else if (change.kind === "update") {
      rows.push({
        key: `update:${change.door.id}`,
        tone: "changed",
        text: `${endpointName(change.door.from_location_id)} → ${endpointName(change.door.to_location_id)}`,
        action: `Now drawn as ${DOOR_KIND_LABELS[change.after].toLowerCase()} → Update`,
      });
    } else if (change.kind === "held") {
      rows.push({
        key: `held:${change.door.id}`,
        tone: "changed",
        text: `${endpointName(change.door.from_location_id)} → ${endpointName(change.door.to_location_id)}`,
        action: heldDoorReason(change.door),
        heldChip: true,
      });
    } else if (change.kind === "unresolved-stair") {
      rows.push({
        key: `stair:${change.stair.cellKey}`,
        tone: "changed",
        text: `Stair at (${change.stair.cellKey})`,
        action: "Lands on a level this map does not contain",
        stairCellKey: change.stair.cellKey,
      });
    } else if (change.kind === "create-stair") {
      rows.push({
        key: `create-stair:${change.stair.cellKey}`,
        tone: "new",
        text: `${endpointName(change.fromSpaceId)} → ${endpointName(change.toSpaceId)}`,
        action: "Stair → Create",
      });
    }
    // skip: an unchanged door is not worth a row.
  }
  return rows;
});

function heldDoorReason(door: { starts_locked: boolean; is_secret: boolean; lock_note: string | null; label: string }): string {
  if (door.starts_locked) return `You set this locked${door.lock_note ? ` ('${door.lock_note}')` : ""} — the map still says plain door`;
  if (door.is_secret) return "You marked this secret — the map still says plain door";
  if (door.label) return `You named this ('${door.label}') — the map still says plain door`;
  return "You've edited this by hand — the map has since changed";
}

const waySummary = computed(() => {
  const created = plan.ways.filter((c) => c.kind === "create" || c.kind === "create-stair").length;
  const held = plan.ways.filter((c) => c.kind === "held").length;
  return `${created} new · ${held} held`;
});

// ── Prepared here ────────────────────────────────────────────────────────

function placementLabel(placement: LocationPlacement): string {
  // `useMapPublish` always sources placements via `useSitePlacements`, whose
  // rows are joined to each target's display name — narrower here only
  // because `PublishInputs` (lib/locations/publish.ts) types them generically.
  const kind = placementKind(placement);
  const withEntity = placement as LocationPlacementWithEntity;
  const name = kind === "trap" ? withEntity.trap?.name : kind === "dungeon_feature" ? withEntity.dungeon_feature?.name : undefined;
  return `${LOCATION_PLACEMENT_KIND_LABELS[kind]} '${name ?? "?"}'`;
}

const placementRows = computed<Row[]>(() => {
  const rows: Row[] = [];
  for (const change of plan.placements) {
    if (change.kind === "reanchor") {
      rows.push({
        key: `reanchor:${change.placement.id}`,
        tone: "changed",
        text: placementLabel(change.placement),
        action: "→ Re-anchored to whichever room now holds its cell",
      });
    } else if (change.kind === "create") {
      rows.push({
        key: `create:${change.link.cellKey}:${change.target.id}`,
        tone: "new",
        text: `${LOCATION_PLACEMENT_KIND_LABELS[change.target.kind]} at (${change.link.cellKey})`,
        action: "→ Prepared here",
      });
    } else if (change.kind === "note") {
      // Encounter/note links never write a placement (encounters and notes
      // carry their own location column) — this row is purely informational,
      // so it never disappears from the review the way an unhandled kind
      // would have (the section itself used to vanish for a plan holding
      // only these).
      const label = change.link.metadata.encounter_id ? "Encounter" : "Note";
      rows.push({
        key: `note:${change.link.cellKey}`,
        tone: "unchanged",
        text: `${label} linked at cell ${change.link.cellKey}`,
        action: "lives on its own location; not written by publish",
      });
    }
  }
  return rows;
});

const placementSummary = computed(() => {
  const noted = plan.placements.filter((c) => c.kind === "note").length;
  const parts = [`${plan.summary.reanchored} moved`];
  if (noted > 0) parts.push(`${noted} reported`);
  return parts.join(" · ");
});
</script>
