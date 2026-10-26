<template>
  <!--
    What the viewer's character knows this thing is tied to (#1084), grouped the
    way the DM's sheet groups it. Only revealed ties arrive (the server decides),
    and there is deliberately no count or placeholder for the ones that did not:
    a gap would tell a player that something is being kept from them.
  -->
  <section v-if="isLoading || isError || groups.length" class="space-y-2" data-testid="player-connections">
    <p class="text-label-lg font-semibold text-muted-foreground">{{ title }}</p>
    <ListSkeleton v-if="isLoading" variant="rows" :count="2" />
    <p v-else-if="isError" class="text-body text-destructive">Could not load the connections.</p>
    <div v-for="group in groups" :key="group.group" class="space-y-1.5" :data-group="group.group">
      <p class="text-eyebrow font-bold uppercase text-muted-foreground">{{ CONNECTION_GROUP_TITLES[group.group] }}</p>
      <ConnectionSlip
        v-for="row in group.items"
        :key="`${row.source}:${row.row_id}:${row.outward}`"
        :name="row.other_name"
        :image="row.other_image"
        :image-format="row.other_kind === 'faction' ? 'token' : 'portrait'"
        :pc="row.other_kind === 'party_member'"
        :tags="[{ label: connectionWord(row, kind) }]"
        :notes="toldLine(row)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import ConnectionSlip from "@/components/common/entity/ConnectionSlip.vue";
import { usePlayerConnections } from "@/composables/connections/usePlayerConnections";
import { CONNECTION_GROUP_TITLES, connectionWord, groupByKind } from "@/lib/worldLinks/connections";
import { toldText } from "@/components/player/people/toldText";
import type { Connection } from "@/types/connections.types";

const { kind, id, title = "Connections you know of", skipOtherId = null } = defineProps<{
  kind: LinkKind;
  id: string;
  title?: string;
  /** An end already shown elsewhere on the page (the viewer's own character on a person). */
  skipOtherId?: string | null;
}>();

const { data, isLoading, isError } = usePlayerConnections(
  () => kind,
  () => id,
);

const groups = computed(() =>
  groupByKind((data.value ?? []).filter((r) => r.other_id !== skipOtherId), (r) => r.other_kind),
);

const toldLine = (row: Connection) => toldText(row.told);
</script>
