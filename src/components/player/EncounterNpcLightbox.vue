<template>
  <EntityLightbox
    :open="!!npc"
    :portrait-src="npc?.player_visible_fields.includes('portrait') ? display.portrait : null"
    :portrait-alt="npc?.player_visible_fields.includes('name') ? display.name : '???'"
    :focal-point="display.focalPoint"
    @close="$emit('close')"
  >
    <div>
      <div class="flex items-start justify-between gap-3">
        <h2 class="font-cinzel text-lg font-bold text-foreground">
          {{ npc?.player_visible_fields.includes('name') ? display.name : '???' }}
        </h2>
        <NpcRatingStars v-if="npc" :npc-id="npc.id" size="lg" class="shrink-0 pt-1" />
      </div>
      <div v-if="npc" class="flex flex-wrap gap-2 mt-1">
        <span
          v-if="npc.player_visible_fields.includes('relationship')"
          class="px-2 py-0.5 rounded text-xs font-cinzel font-bold tracking-wider uppercase text-white"
          :style="{ backgroundColor: relColor(npc.relationship) + 'CC' }"
        >{{ npc.relationship }}</span>
        <span
          v-if="npc.player_visible_fields.includes('status')"
          class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted font-cinzel text-xs tracking-wider"
        >
          <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: statusColor(npc.status) }" />
          {{ npc.status }}
        </span>
      </div>
      <p v-if="npc?.player_visible_fields.includes('race') && npc.race" class="mt-1 font-fell text-sm text-muted-foreground italic">{{ npc.race }}</p>
      <p v-if="npc?.player_visible_fields.includes('occupation') && npc.occupation" class="font-fell text-sm text-muted-foreground">{{ npc.occupation }}</p>
    </div>
    <div v-if="myNpcPcNote" class="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
      <div class="px-3 py-2 border-b border-primary/20">
        <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-widest text-primary/70">YOUR CONNECTION</p>
      </div>
      <div class="px-3 py-2.5">
        <RichTextViewer :content="myNpcPcNote" />
      </div>
    </div>
    <PlayerNotesWidget v-if="npc" entity-type="npc" :entity-id="npc.id" placeholder="Your observations about this character…" />
  </EntityLightbox>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import NpcRatingStars from "@/components/play/NpcRatingStars.vue";
import { useMyNpcPcNote } from "@/composables/useNpcPcNotes";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import { NPC_RELATIONSHIP_COLORS, type Npc, type NpcRelationship, type NpcStatus } from "@/types/npc.types";

const { npc } = defineProps<{ npc: Npc | null }>();
defineEmits<{ close: [] }>();

const npcId = computed(() => npc?.id ?? "");
const { data: myNpcPcNote } = useMyNpcPcNote(npcId);

const display = computed(() => ({
  name:       npc ? getNpcDisplayName(npc)       : "???",
  portrait:   npc ? getNpcDisplayPortrait(npc)   : null,
  focalPoint: npc ? getNpcDisplayFocalPoint(npc) : null,
}));

const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e", dead: "#ef4444", missing: "#f59e0b", unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) { return NPC_RELATIONSHIP_COLORS[rel] ?? "#6b7280"; }
function statusColor(s: NpcStatus)      { return STATUS_COLORS[s] ?? "#6b7280"; }
</script>
