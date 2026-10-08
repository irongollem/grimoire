<template>
  <div class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
    <template v-if="currentLevel">
      <AppButton
        variant="ghost"
        size="xs"
        :icon="IconCopy"
        label="Clone this level"
        class="self-start"
        :loading="isCloning"
        :disabled="isCloning"
        @click="onClone"
      />
      <p class="pl-6 text-caption-sm text-muted-foreground">Floor plan, rooms and ways out, never state or loot.</p>
    </template>

    <AppButton
      variant="ghost"
      size="xs"
      :icon="IconPencilLine"
      :label="`Draw level ${nextLevelNumber}`"
      class="self-start"
      :loading="isDrawing"
      :disabled="isDrawing"
      @click="onDraw"
    />
    <p class="pl-6 text-caption-sm text-muted-foreground">Opens Cartographer to draw it.</p>

    <PaywallModal v-model="showPaywall" resource="locations" />
  </div>
</template>

<script setup lang="ts">
/**
 * "Reuse" panel (#868, frame 06) — the two ways a new level starts from
 * something other than a blank page. Self-contained: it fetches the level
 * it might clone itself (rooms, regions, doors), the same convention
 * `LocationDetailSections` documents for why a caller-owned pane composes
 * several of these rather than threading their data through props.
 *
 * "Draw level N" does not pre-mark the stair cell the frame's caption
 * describes ("Opens Cartographer with the stair cell pre-marked") — the
 * Cartographer has no notion of a pre-placed object on a brand-new map yet,
 * so this opens a plain new drawing instead of a half-built promise.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { IconCopy, IconPencilLine } from "@/lib/icons";
import { useLocations } from "@/composables/locations/useLocations";
import { useAddSiteLevel } from "@/composables/locations/useAddSiteLevel";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useCloneSiteLevel } from "@/composables/locations/useCloneSiteLevel";
import { useToast } from "@/composables/useToast";
import { isQuotaExceeded } from "@/lib/quotaError";
import { isInteriorType } from "@/lib/locations/tiers";
import type { Location, LocationType } from "@/types/location.types";

const { containerId, containerCampaignId, levelType, currentLevel, nextLevelNumber } = defineProps<{
  /** Where a freshly drawn level is created as a child — the container site
   *  when there's no current level yet, or its parent when there is. */
  containerId: string;
  /** The container's own `campaign_id` — threaded through explicitly so a
   *  freshly drawn level lands in the SAME campaign as the site it's a level
   *  of, not whichever campaign happens to be active in the picker when the
   *  DM clicks "Draw level N". `null` is a legitimate value (a global site)
   *  and must survive, not get coerced back to "current campaign" by `??`. */
  containerCampaignId: string | null;
  /** The type new levels take — the container's own type, since a level is
   *  a sibling site of the same kind. */
  levelType: LocationType;
  /** The level "Clone this level" would copy, or null when the DM is
   *  viewing the container rather than standing on one of its levels. */
  currentLevel: Location | null;
  nextLevelNumber: number;
}>();

// ── Clone this level ─────────────────────────────────────────────────────────
const currentLevelId = computed(() => currentLevel?.id ?? "");
const { data: currentLevelChildren } = useLocations(currentLevelId);
// `rooms` (and `CloneLevelSource.rooms` below) is "this level's interior
// spaces" — room, and #886's `grounds` — not literally the `room` type;
// `planCloneLevel` copies each child's own `location_type` forward, so a
// wilds level's grounds clone as grounds, not as rooms.
const rooms = computed(() => (currentLevelChildren.value ?? []).filter((c) => isInteriorType(c.location_type)));
const { data: currentLevelRegions } = useLocationMapRegions(currentLevelId);
const roomIds = computed(() => rooms.value.map((r) => r.id));
const { data: currentLevelDoors } = useSiteDoors(roomIds);

const toast = useToast();
const { cloneLevel, isCloning } = useCloneSiteLevel();
const showPaywall = ref(false);

async function onClone() {
  if (!currentLevel) return;
  try {
    await cloneLevel({
      site: currentLevel,
      rooms: rooms.value,
      regions: currentLevelRegions.value ?? [],
      doors: currentLevelDoors.value ?? [],
    });
  } catch (e) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    toast.error(toast.fromError(e));
  }
}

// ── Draw level N ──────────────────────────────────────────────────────────────
// The same add the Build canvas's level picker makes (`useAddSiteLevel`):
// the new level opens in Build in place, ready to draw.
const { addLevel, isAdding: isDrawing } = useAddSiteLevel();

async function onDraw() {
  const outcome = await addLevel({ id: containerId, campaign_id: containerCampaignId, location_type: levelType }, nextLevelNumber);
  if (outcome === "quota") showPaywall.value = true;
}
</script>
