<template>
  <!--
    What the viewer's character knows this thing is tied to (#1084), grouped the
    way the DM's sheet groups it. Only revealed ties arrive (the server decides),
    and there is deliberately no count or placeholder for the ones that did not:
    a gap would tell a player that something is being kept from them.
  -->
  <section v-if="groups.length" class="space-y-2" data-testid="player-connections">
    <p class="text-label-lg font-semibold text-muted-foreground">{{ title }}</p>
    <div v-for="group in groups" :key="group.id" class="space-y-1.5" :data-group="group.id">
      <p class="text-eyebrow font-bold uppercase text-muted-foreground">{{ GROUP_LABEL[group.id] }}</p>
      <ConnectionSlip
        v-for="row in group.rows"
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
import ConnectionSlip from "@/components/common/entity/ConnectionSlip.vue";
import { usePlayerConnections } from "@/composables/connections/usePlayerConnections";
import { CONNECTION_GROUP_ORDER, connectionWord, groupFor, type ConnectionGroup } from "@/lib/worldLinks/connections";
import { toldText } from "@/components/player/people/toldText";
import type { Connection } from "@/types/connections.types";

const { kind, id, title = "Connections you know of", skipOtherId = null } = defineProps<{
  kind: LinkKind;
  id: string;
  title?: string;
  /** An end already shown elsewhere on the page (the viewer's own character on a person). */
  skipOtherId?: string | null;
}>();

const GROUP_LABEL: Record<ConnectionGroup, string> = {
  people: "People",
  factions: "Factions",
  places: "Places",
  deities: "Deities",
  items: "Items",
  quests: "Quests",
};

const { data } = usePlayerConnections(
  () => kind,
  () => id,
);

const groups = computed(() => {
  const rows = (data.value ?? []).filter((r) => r.other_id !== skipOtherId);
  return CONNECTION_GROUP_ORDER.map((group) => ({
    id: group,
    rows: rows.filter((r) => groupFor(r.other_kind) === group),
  })).filter((g) => g.rows.length > 0);
});

const toldLine = (row: Connection) => toldText(row.told);
</script>
