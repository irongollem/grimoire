<template>
  <div class="space-y-6">
    <component
      :is="group.title ? HearthSection : 'div'"
      v-for="group in groups"
      :key="group.key"
      v-bind="group.title ? { title: group.title } : {}"
    >
      <template v-if="group.title" #end>
        <span v-if="group.within" class="text-caption italic text-muted-foreground">in {{ group.within }}</span>
        <span class="text-caption font-semibold text-foreground">{{ group.people.length }}</span>
      </template>

      <ul v-if="view === 'ledger'" class="torn hearth-card divide-y divide-border/60 rounded-lg">
        <li v-for="npc in group.people" :key="npc.id">
          <PeopleLedgerRow
            :npc="npc"
            :rating="getRating(npc.id)"
            :is-new="isNew(npc.id, npc.updated_at)"
            :selected="npc.id === selectedId"
            @open="emit('open', npc.id)"
          />
        </li>
      </ul>
      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11.25rem,1fr))] sm:gap-4">
        <PlayerNpcCard
          v-for="npc in group.people"
          :key="npc.id"
          :npc="npc"
          :location="place(npc)?.name"
          :is-new="isNew(npc.id, npc.updated_at)"
          @click="emit('open', npc.id)"
        />
      </div>
    </component>
  </div>
</template>

<script setup lang="ts">
import HearthSection from "@/components/play/hearth/HearthSection.vue";
import PeopleLedgerRow from "@/components/play/people/PeopleLedgerRow.vue";
import PlayerNpcCard from "@/components/play/PlayerNpcCard.vue";
import type { PeopleGroup } from "@/lib/npcs/peopleLedger";
import type { PlayerNpc } from "@/types/npc.types";

/** The ledger's groups, as rows or as portrait cards. A group with no title is one plain list. */
defineProps<{
  groups: PeopleGroup[];
  view: "ledger" | "portraits";
  selectedId?: string | null;
  getRating: (npcId: string) => number;
  isNew: (npcId: string, updatedAt?: string) => boolean;
  place: (npc: PlayerNpc) => { name: string } | null;
}>();

const emit = defineEmits<{ open: [id: string] }>();
</script>
