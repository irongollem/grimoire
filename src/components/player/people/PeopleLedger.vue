<template>
  <div class="@container space-y-6">
    <component
      :is="group.title ? HearthSection : 'div'"
      v-for="group in groups"
      :key="group.key"
      v-bind="group.title ? { title: group.title } : {}"
    >
      <template v-if="group.title" #end>
        <span v-if="group.within" class="text-caption italic text-muted-foreground">in {{ group.within }}</span>
        <span v-if="group.end" class="text-caption font-semibold text-foreground">{{ group.end }}</span>
        <span v-else class="text-caption font-semibold text-foreground">{{ group.people.length }}</span>
      </template>

      <!-- Two columns once the ledger has the width (a portrait tablet), so a row
           is not 50rem of air between a name and its relationship. `grid-cols-1`
           and `min-w-0` are load-bearing: a grid track and a grid item both grow
           to their content by default, so the longest untruncated subtitle
           pushed every row's padding and relationship past the scroll box. -->
      <ul v-if="view === 'ledger'" class="torn hearth-card grid grid-cols-1 divide-y divide-border/60 rounded-lg @2xl:grid-cols-2 @2xl:divide-y-0">
        <li v-for="npc in group.people" :key="npc.id" class="min-w-0 @2xl:border-b @2xl:border-border/60 @2xl:odd:border-r">
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
import HearthSection from "@/components/player/hearth/HearthSection.vue";
import PeopleLedgerRow from "@/components/player/people/PeopleLedgerRow.vue";
import PlayerNpcCard from "@/components/player/PlayerNpcCard.vue";
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
