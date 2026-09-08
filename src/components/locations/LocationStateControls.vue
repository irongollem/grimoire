<template>
  <div class="flex flex-wrap gap-2">
    <AppButton
      v-for="fact in LOCATION_STATE_FACTS"
      :key="fact"
      variant="tinted"
      size="sm"
      :tone="toneFor(fact)"
      :emphasis="emphasisFor(fact)"
      :active="stateOf(fact)?.value === true"
      :icon="ICONS[fact]"
      :label="LOCATION_STATE_FACT_LABELS[fact]"
      :tooltip="tooltipFor(fact)"
      :disabled="isPending"
      @click="toggle(fact)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Three durable-state toggles for a location — Explored / Cleared / Looted
 * (#787, epic #780). Self-contained and always-editable, same shape as
 * `LocationDoors` / `SiteRoomsPanel`: keyed off a scalar `locationId` prop
 * rather than a route param, so `AtlasPlacePane` can reuse one mounted
 * instance across selections.
 *
 * Deliberately NOT gated on location type — the migration comment is explicit
 * that a district can be cleared and a whole dungeon can be looted, not only
 * a room — so this mounts unconditionally in `LocationDetailSections`, same
 * as "Prepared Here".
 *
 * "Toggle" undersells what a click does: the log is append-only, so clicking
 * never edits or removes anything, it appends the opposite of whatever the
 * view currently answers (or `true`, from a cold start where nothing has been
 * asserted at all). That is what "undo" means here — re-clicking a fact a DM
 * marked true by mistake appends `false`, it does not erase the mistaken row.
 *
 * Three visual states, not two, because "never asserted" and "explicitly
 * marked false" are different claims and a DM re-clearing a room they once
 * marked un-cleared needs to be able to tell them apart at a glance:
 *
 *   - unknown        — tinted/neutral/outline: a plain bordered pill.
 *   - explicit false — tinted/danger/soft: a faint red pill.
 *   - explicit true  — tinted/success/strong, and `:active`: a solid green pill.
 *
 * The tooltip carries the provenance the pill's colour can't: who asserted
 * it and when, via `useMemberByUserId` (there is no other place in the app
 * that turns a bare `user_id` into a name) and `timeAgo`.
 */
import { computed, type Component } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import type { ButtonTone, ButtonEmphasis } from "@/components/common/appButtonVariants";
import { IconLoot, IconScan, IconShieldCheck } from "@/lib/icons";
import { timeAgo } from "@/lib/utils";
import { useToast } from "@/composables/useToast";
import { useMemberByUserId } from "@/composables/campaign/useCampaignMembers";
import { useLocationState, useAssertLocationState } from "@/composables/locations/useLocationState";
import {
  LOCATION_STATE_FACTS,
  LOCATION_STATE_FACT_LABELS,
  type LocationState,
  type LocationStateFact,
} from "@/types/locationState.types";

const { locationId } = defineProps<{ locationId: string }>();

const ICONS: Record<LocationStateFact, Component> = {
  explored: IconScan,
  cleared: IconShieldCheck,
  looted: IconLoot,
};

const locationIdRef = computed(() => locationId);
const { stateOf } = useLocationState(locationIdRef);
const { displayNameFor } = useMemberByUserId();
const toast = useToast();
const { mutate: assert, isPending } = useAssertLocationState();

function toneFor(fact: LocationStateFact): ButtonTone {
  const row = stateOf(fact);
  if (!row) return "neutral";
  return row.value ? "success" : "danger";
}

function emphasisFor(fact: LocationStateFact): ButtonEmphasis {
  const row = stateOf(fact);
  if (!row) return "outline";
  return row.value ? "strong" : "soft";
}

function tooltipFor(fact: LocationStateFact): string {
  const label = LOCATION_STATE_FACT_LABELS[fact];
  const row = stateOf(fact);
  if (!row) return `${label}: not yet asserted`;
  return `${provenanceVerdict(label, row)} — ${displayNameFor(row.asserted_by, "someone")} · ${timeAgo(row.asserted_at)}${row.asserted_note ? ` — "${row.asserted_note}"` : ""}`;
}

function provenanceVerdict(label: string, row: LocationState): string {
  return row.value ? label : `Not ${label.toLowerCase()}`;
}

function toggle(fact: LocationStateFact) {
  const row = stateOf(fact);
  const next = row ? !row.value : true;
  assert(
    { location_id: locationId, fact, value: next },
    { onError: (e) => toast.error(toast.fromError(e)) },
  );
}
</script>
