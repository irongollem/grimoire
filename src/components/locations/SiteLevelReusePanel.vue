<template>
  <div class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
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
      <p class="pl-6 text-caption-sm text-muted-foreground">Floor plan, rooms and ways out — never state or loot.</p>
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
import { useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { IconCopy, IconPencilLine } from "@/lib/icons";
import { useCreateLocation, useLocations } from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useCloneSiteLevel } from "@/composables/locations/useCloneSiteLevel";
import { useToast } from "@/composables/useToast";
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
const rooms = computed(() => (currentLevelChildren.value ?? []).filter((c) => c.location_type === "room"));
const { data: currentLevelRegions } = useLocationMapRegions(currentLevelId);
const roomIds = computed(() => rooms.value.map((r) => r.id));
const { data: currentLevelDoors } = useSiteDoors(roomIds);

const { cloneLevel, isCloning } = useCloneSiteLevel();

async function onClone() {
  if (!currentLevel) return;
  await cloneLevel({
    site: currentLevel,
    rooms: rooms.value,
    regions: currentLevelRegions.value ?? [],
    doors: currentLevelDoors.value ?? [],
  });
}

// ── Draw level N ──────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();
const createLocation = useCreateLocation();
const isDrawing = ref(false);

async function onDraw() {
  isDrawing.value = true;
  try {
    const newLevel = await createLocation.mutateAsync({
      parent_id: containerId,
      campaign_id: containerCampaignId,
      name: `Level ${nextLevelNumber}`,
      location_type: levelType,
      description: null,
      notes: null,
      tags: [],
      image_url: null,
      map_url: null,
      map_pins: [],
      is_map_shared: false,
      player_visible_to: [],
      player_summary: null,
      is_description_shared: false,
      is_npcs_shared: false,
      is_inventory_shared: false,
      npc_owner_id: null,
      related_location_ids: [],
      source_map_id: null,
      is_battle_map: false,
      grid_calibration: null,
      era_start: null,
      era_end: null,
      audio_theme: null,
    });
    router.push(`/cartographer/new?publishTo=${newLevel.id}`);
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    isDrawing.value = false;
  }
}
</script>
