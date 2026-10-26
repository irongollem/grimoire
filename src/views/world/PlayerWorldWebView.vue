<template>
  <div class="h-full min-h-0">
    <p v-if="error" class="px-4 py-6 text-center text-body text-destructive">
      The web could not be read. Reload the page to try again.
    </p>
    <WorldWebScreen
      v-else
      :ties="ties ?? NO_TIES"
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
import { isWebKind, nodeKey, parseNodeKey } from "@/lib/worldWeb/kinds";
import type { WebEntity } from "@/lib/worldWeb/model";
import type { WorldTie } from "@/lib/worldWeb/ties";

const NO_TIES: readonly WorldTie[] = [];
const NO_PEOPLE: readonly WebEntity[] = [];

const route = useRoute();
const { data: ties, isLoading, error } = usePlayerWorldTies();
const viewerId = useViewerMemberId();

const homeKey = computed(() => (viewerId.value ? nodeKey("party_member", viewerId.value) : null));

const focusKey = computed(() => {
  const raw = route.query.focus;
  const value = typeof raw === "string" ? raw : null;
  const ref = value ? parseNodeKey(value) : null;
  return ref && isWebKind(ref.kind) ? nodeKey(ref.kind, ref.id) : null;
});
</script>
