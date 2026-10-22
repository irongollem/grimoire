<template>
  <div class="torn min-h-[28rem] p-2" data-testid="house-player-lineage">
    <FamilyTree
      :source="source"
      :members="visible"
      :folds="lineage.folds"
      :married-in="lineage.marriedIn"
      @select="noop"
    />
  </div>
</template>

<script setup lang="ts">
/** A House the party knows, drawn from the people on their ledger only (frame 08). No line of succession, no editing. */
import { computed } from "vue";
import FamilyTree from "@/components/kinship/FamilyTree.vue";
import { usePlayerKinGraph } from "@/composables/kinship/useKinGraph";
import { houseLineage } from "@/lib/kinship/house";
import type { Faction } from "@/types/faction.types";
import type { PersonKey } from "@/types/kinship.types";

const { faction, members } = defineProps<{ faction: Pick<Faction, "descent">; members: PersonKey[] }>();

const source = usePlayerKinGraph();
const lineage = computed(() => houseLineage(source.graph.value, new Set(members), faction.descent ?? "either"));
const visible = computed(() => lineage.value.members);

// A player's cards go nowhere: people open from the ledger, not from a house.
function noop(): void {}
</script>
