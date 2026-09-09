<template>
  <!-- Zones on this plan (#868, frame 07) — five kinds, one column, no new
       table: every `location_map_regions` row with `region_role === "zone"`.
       A zone never binds to a location; that absence is what makes it a
       zone rather than an unfinished space (`SiteMapRegionList` owns those).
       Only mounted in browse mode — see the call site in `LocationMap.vue`. -->
  <div class="flex flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-label-lg font-semibold text-muted-foreground">Zones on this plan</span>
      <span class="rounded-full bg-muted px-2 py-0.5 text-label font-semibold text-muted-foreground">{{ zones.length }}</span>
      <AppSelect v-model="newZoneKind" size="xs" tone="card" class="ml-auto">
        <option v-for="kind in ZONE_KINDS" :key="kind" :value="kind">{{ ZONE_KIND_LABELS[kind] }}</option>
      </AppSelect>
      <AppButton
        variant="ghost"
        size="inline-xs"
        :icon="IconAdd"
        label="Draw"
        :disabled="!canTrace"
        :tooltip="canTrace ? undefined : 'Calibrate the grid before tracing'"
        @click="addZone"
      />
    </div>

    <p v-if="!zones.length" class="text-caption text-muted-foreground italic">
      No zones yet — water, hazards, light and triggers all live here once traced.
    </p>

    <div v-else class="flex flex-col gap-1.5">
      <div
        v-for="zone in zones"
        :key="zone.id"
        class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: ZONE_KIND_FILL[zone.zone_kind!].stroke }"
            aria-hidden="true"
          />
          <PlacementNoteInput
            :model-value="zone.label"
            placeholder="Name this zone…"
            class="min-w-0 flex-1"
            @commit="commitLabel(zone, $event)"
          />
          <span class="shrink-0 text-caption text-muted-foreground">{{ zoneSummary(zone) }}</span>
          <AppButton
            variant="tinted"
            :tone="isPlayerVisible(zone) ? 'success' : 'neutral'"
            size="inline-xs"
            :label="isPlayerVisible(zone) ? 'Shown' : 'DM'"
            :tooltip="isPlayerVisible(zone) ? 'Visible to players' : 'DM only — click to show players'"
            @click="toggleVisible(zone)"
          />
          <AppButton
            variant="ghost"
            size="inline-xs"
            label="Trace"
            :active="activeRegionId === zone.id"
            :disabled="!canTrace"
            :tooltip="canTrace ? undefined : 'Calibrate the grid before tracing'"
            @click="toggleActive(zone.id)"
          />
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="expandedId === zone.id ? IconChevronUp : IconChevronDown"
            tooltip="Edit details"
            @click="expandedId = expandedId === zone.id ? null : zone.id"
          />
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconDelete"
            tooltip="Delete this zone"
            @click="removeZone(zone)"
          />
        </div>

        <!-- Payload editor — only the fields the kind actually reads
             (`ZonePayload`'s own docstring: these are hints for the
             renderer/run surface, never enforced). -->
        <div v-if="expandedId === zone.id" class="flex flex-wrap items-center gap-2 border-t border-border pt-1.5">
          <template v-if="zone.zone_kind === 'terrain'">
            <AppSelect
              :model-value="zone.zone_payload.movement_cost ?? 1"
              :model-modifiers="{ number: true }"
              size="xs"
              tone="card"
              @update:model-value="updatePayload(zone, { movement_cost: $event as number })"
            >
              <option v-for="cost in TERRAIN_MOVEMENT_COSTS" :key="cost.value" :value="cost.value">{{ cost.label }}</option>
            </AppSelect>
            <AppInput
              :model-value="zone.zone_payload.depth_ft ?? null"
              :model-modifiers="{ number: true, lazy: true }"
              type="number"
              tone="card"
              size="xs"
              placeholder="Depth (ft)"
              class="w-28"
              @update:model-value="updatePayload(zone, { depth_ft: ($event as number | null) ?? undefined })"
            />
          </template>

          <template v-else-if="zone.zone_kind === 'light'">
            <AppSelect
              :model-value="zone.zone_payload.light_level ?? 'dim'"
              size="xs"
              tone="card"
              @update:model-value="updatePayload(zone, { light_level: $event as ZonePayload['light_level'] })"
            >
              <option v-for="level in LIGHT_LEVELS" :key="level.value" :value="level.value">{{ level.label }}</option>
            </AppSelect>
          </template>

          <template v-else-if="zone.zone_kind === 'hazard'">
            <!-- `?? ''` is the same edit-boundary translation
                 `PlacementNoteInput` documents: `trap_id` is a genuinely
                 optional domain field, `EntityCombobox`'s model is not
                 nullable. `|| undefined` mirrors it back on the way out. -->
            <EntityCombobox
              :model-value="zone.zone_payload.trap_id ?? ''"
              :options="traps ?? []"
              placeholder="Link a trap…"
              class="w-48"
              @update:model-value="updatePayload(zone, { trap_id: $event || undefined })"
            />
          </template>

          <template v-else-if="zone.zone_kind === 'trigger'">
            <EntityCombobox
              :model-value="zone.zone_payload.encounter_id ?? ''"
              :options="encounters ?? []"
              placeholder="Prompt an encounter…"
              class="w-48"
              @update:model-value="updatePayload(zone, { encounter_id: $event || undefined })"
            />
            <!-- A zone can also name a beat (#868 S12): Run shows "Beat N is
                 staged on this floor — advance?" when the party enters it.
                 Quest first, then beat — there's no campaign-wide beat list
                 to search directly. `triggerQuestId` primes from the zone's
                 own `beat_id` the first time its editor opens, so reopening
                 one that already names a beat doesn't ask the DM to re-find
                 which quest it lives in. -->
            <EntityCombobox
              v-model="triggerQuestId"
              :options="questOptions"
              placeholder="Which quest…"
              class="w-40"
            />
            <EntityCombobox
              :model-value="zone.zone_payload.beat_id ?? ''"
              :options="triggerBeatOptions"
              :placeholder="triggerQuestId ? 'Prompt a beat…' : 'Choose a quest first…'"
              class="w-48"
              @update:model-value="updatePayload(zone, { beat_id: $event || undefined })"
            />
          </template>

          <span v-else class="text-caption text-muted-foreground italic">
            Geometry with no mechanics — the honest default for cover, a ritual circle, anything read-aloud only.
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The zone-CRUD half of the site map apparatus (#868, frame 07 "Zones") —
 * `SiteMapRegionList`'s sibling, mounted beside it by `LocationMap.vue`
 * (browse mode only). Same split that component already draws: this owns
 * creating, labelling, editing and deleting zones; `MapRegionsLayer.vue`
 * keeps everything about painting cells into whichever one is active.
 *
 * `activeRegionId` is lifted to the parent for the same reason as in
 * `SiteMapRegionList` — it also drives the map canvas's highlight and the
 * "Tracing X" banner above it, neither of which this component renders.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import PlacementNoteInput from "@/components/locations/PlacementNoteInput.vue";
import {
  useCreateLocationMapRegion,
  useDeleteLocationMapRegion,
  useUpdateLocationMapRegion,
} from "@/composables/locations/useLocationMapRegions";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useTraps } from "@/composables/dungeon-features/useTraps";
import { useQuests } from "@/composables/quests/useQuests";
import { useQuestBeat, useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconAdd, IconChevronDown, IconChevronUp, IconDelete } from "@/lib/icons";
import { emptyZoneInsert, isPlayerVisible, LIGHT_LEVELS, TERRAIN_MOVEMENT_COSTS, zoneSummary, ZONE_KIND_FILL } from "@/lib/locations/zones";
import { ZONE_KIND_LABELS, ZONE_KINDS } from "@/types/locationMapRegion.types";
import type { LocationMapRegion, ZoneKind, ZonePayload } from "@/types/locationMapRegion.types";

const { locationId, regions, activeRegionId, canTrace } = defineProps<{
  /** The site these zones belong to — `createRegion` needs it as
   *  `site_location_id`, same as `SiteMapRegionList`. */
  locationId: string;
  regions: LocationMapRegion[];
  activeRegionId: string | null;
  /** Whether the map has a grid to trace onto at all — see
   *  `SiteMapRegionList`'s prop of the same name. */
  canTrace: boolean;
}>();

const emit = defineEmits<{ "update:activeRegionId": [id: string | null] }>();

const { confirm } = useConfirm();
const { error: toastError, fromError } = useToast();
const { data: traps } = useTraps();
const { data: encounters } = useEncounters();

const zones = computed(() => regions.filter((r) => r.region_role === "zone"));

const newZoneKind = ref<ZoneKind>("marker");
const expandedId = ref<string | null>(null);

// ── Trigger zone's beat picker (#868 S12) — one quest/beat cursor, since only
//    one zone's payload editor is ever expanded at a time. ─────────────────
const { data: quests } = useQuests();
const questOptions = computed(() => (quests.value ?? []).map((quest) => ({ id: quest.id, name: quest.title })));
const triggerQuestId = ref("");
const expandedZoneBeatId = computed(() => (zones.value.find((zone) => zone.id === expandedId.value)?.zone_payload.beat_id) ?? "");
// Primes the quest picker from the beat the zone already names, the one time
// its editor opens with one already set — without this, reopening a
// configured trigger zone would ask the DM to re-find which quest it lives in
// even though the beat itself is already chosen.
const { data: primingBeat } = useQuestBeat(expandedZoneBeatId);
watch(expandedId, () => { triggerQuestId.value = ""; });
watch(primingBeat, (beat) => { if (beat && !triggerQuestId.value) triggerQuestId.value = beat.quest_id; });
const { data: triggerBeats } = useQuestBeats(triggerQuestId);
const triggerBeatOptions = computed(() => (triggerBeats.value ?? []).map((beat) => ({ id: beat.id, name: beat.title || "Untitled beat" })));

function toggleActive(id: string): void {
  emit("update:activeRegionId", activeRegionId === id ? null : id);
}

const createRegion = useCreateLocationMapRegion();
const updateRegion = useUpdateLocationMapRegion();
const deleteRegion = useDeleteLocationMapRegion();

async function addZone(): Promise<void> {
  try {
    const created = await createRegion.mutateAsync(emptyZoneInsert(locationId, newZoneKind.value));
    expandedId.value = created.id;
    emit("update:activeRegionId", created.id);
  } catch (e) {
    toastError(fromError(e));
  }
}

async function removeZone(zone: LocationMapRegion): Promise<void> {
  const label = zone.label || ZONE_KIND_LABELS[zone.zone_kind!];
  const ok = await confirm(`Delete "${label}"? This cannot be undone.`, { danger: true });
  if (!ok) return;
  if (activeRegionId === zone.id) emit("update:activeRegionId", null);
  if (expandedId.value === zone.id) expandedId.value = null;
  try {
    await deleteRegion.mutateAsync(zone.id);
  } catch (e) {
    toastError(fromError(e));
  }
}

function commitLabel(zone: LocationMapRegion, value: string): void {
  const next = value.trim();
  if (next === (zone.label ?? "")) return;
  updateRegion.mutate({ id: zone.id, update: { label: next === "" ? null : next } });
}

function toggleVisible(zone: LocationMapRegion): void {
  updatePayload(zone, { visible_to_players: !isPlayerVisible(zone) });
}

/** Merges into the existing payload rather than replacing it — a hazard's
 *  `trap_id` and a terrain's `movement_cost` are independent fields, and a
 *  field-at-a-time editor that replaced the object would drop whichever
 *  ones the visible control didn't just touch. */
function updatePayload(zone: LocationMapRegion, patch: Partial<ZonePayload>): void {
  updateRegion.mutate({ id: zone.id, update: { zone_payload: { ...zone.zone_payload, ...patch } } });
}
</script>
