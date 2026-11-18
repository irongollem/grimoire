<template>
  <div class="flex h-[calc(100vh-3.5rem)] flex-col">
    <SortFamilyLinksNotice class="mx-4 mt-2 shrink-0" />
    <p v-if="error" class="px-4 py-6 text-center text-body text-destructive">
      The web could not be read. Reload the page to try again.
    </p>
    <WorldWebScreen
      v-else
      class="min-h-0 flex-1"
      :ties="ties ?? NO_TIES"
      :people="people"
      :loading="loading"
      :focus-key="focusKey"
      :focal-points="focalPoints"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The World web (#1084), the DM's: every tie in the campaign, links and records,
 * drawn as a graph that opens on a focus when asked. It replaced the Relationship
 * Web, which knew only people. Everything it draws comes from `get_world_ties`;
 * the people are the NPCs and PCs the other pages already read.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import SortFamilyLinksNotice from "@/components/kinship/SortFamilyLinksNotice.vue";
import WorldWebScreen from "@/components/world/WorldWebScreen.vue";
import { useParty } from "@/composables/party/useParty";
import { useWorldPeople, useWorldTies } from "@/composables/world/useWorldTies";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useLocationRoads } from "@/composables/locations/useLocationRoads";
import { roadTies } from "@/lib/worldWeb/roadTies";
import { isWebKind, nodeKey, parseNodeKey } from "@/lib/worldWeb/kinds";
import type { WorldTie } from "@/lib/worldWeb/ties";

const NO_TIES: readonly WorldTie[] = [];

const route = useRoute();
const { data: linkTies, isLoading: tiesLoading, error: tiesError } = useWorldTies();
// Roads are read from their own table and drawn as lines between their places (#1222); the web keeps no copy.
// The web does not wait for them: a road that arrives a moment later is one more line.
const { data: roads } = useLocationRoads();
const { data: places } = useAllLocations();
const ties = computed<readonly WorldTie[] | undefined>(() => {
  if (linkTies.value === undefined) return undefined;
  if (!roads.value || !places.value || roads.value.length === 0) return linkTies.value;
  const ends = new Map(places.value.map((p) => [p.id, { name: p.name, image: p.image_url }]));
  return [...linkTies.value, ...roadTies(roads.value, ends)];
});
const { people, isLoading: peopleLoading } = useWorldPeople();
const { data: party } = useParty();

const loading = computed(() => tiesLoading.value || peopleLoading.value);
const error = computed(() => tiesError.value);

/** `?focus=npc:<id>` opens the web on one node: what "In the web" on a sheet links to. */
const focusKey = computed(() => {
  const raw = route.query.focus;
  const value = typeof raw === "string" ? raw : null;
  const ref = value ? parseNodeKey(value) : null;
  return ref && isWebKind(ref.kind) ? nodeKey(ref.kind, ref.id) : null;
});

const focalPoints = computed(() => {
  const points: Record<string, { x: number; y: number }> = {};
  for (const pc of party.value ?? []) {
    if (pc.portrait_focal_point) points[nodeKey("party_member", pc.id)] = pc.portrait_focal_point;
  }
  return points;
});
</script>
