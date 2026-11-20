<template>
  <div class="h-full min-h-0">
    <p v-if="error" class="px-4 py-6 text-center text-body text-destructive">
      The web could not be read. Reload the page to try again.
    </p>
    <WorldWebScreen
      v-else
      :ties="allTies ?? NO_TIES"
      :people="NO_PEOPLE"
      :loading="isLoading"
      :focus-key="focusKey"
      :home-key="homeKey"
      readonly
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The World web a player reads (#1084 board 09): focus-first, drawn from nothing
 * but `get_player_world_ties`. A link shows only when the DM revealed it to their
 * character and they can see both ends; a record follows the rules its own sheet
 * has. No editing, no DM notes, and no count of what is hidden.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import WorldWebScreen from "@/components/world/WorldWebScreen.vue";
import { useViewerMemberId } from "@/composables/connections/usePlayerConnections";
import { usePlayerWorldTies } from "@/composables/world/useWorldTies";
import { usePlayerLocationRoads } from "@/composables/locations/usePlayerLocationRoads";
import { useSharedLocations } from "@/composables/locations/useLocations";
import { roadTies } from "@/lib/worldWeb/roadTies";
import { isWebKind, nodeKey, parseNodeKey } from "@/lib/worldWeb/kinds";
import type { WebEntity } from "@/lib/worldWeb/model";
import type { WorldTie } from "@/lib/worldWeb/ties";

const NO_TIES: readonly WorldTie[] = [];
const NO_PEOPLE: readonly WebEntity[] = [];

const route = useRoute();
const { data: ties, isLoading, error } = usePlayerWorldTies();
// Roads the character knows are lines between the places they can see (#1222); one that arrives later is one more line.
const { data: roads } = usePlayerLocationRoads();
const { data: places } = useSharedLocations();
const allTies = computed<readonly WorldTie[] | undefined>(() => {
  if (ties.value === undefined) return undefined;
  if (!roads.value || !places.value || roads.value.length === 0) return ties.value;
  const ends = new Map(places.value.map((p) => [p.id, { name: p.name, image: p.image_url }]));
  return [...ties.value, ...roadTies(roads.value, ends)];
});
const viewerId = useViewerMemberId();

const homeKey = computed(() => (viewerId.value ? nodeKey("party_member", viewerId.value) : null));

const focusKey = computed(() => {
  const raw = route.query.focus;
  const value = typeof raw === "string" ? raw : null;
  const ref = value ? parseNodeKey(value) : null;
  return ref && isWebKind(ref.kind) ? nodeKey(ref.kind, ref.id) : null;
});
</script>
