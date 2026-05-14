<template>
  <Transition name="fade">
    <div
      v-if="npc"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div class="relative shrink-0">
          <div v-if="npc.player_visible_fields.includes('portrait') && display.portrait" class="w-full h-72 overflow-hidden">
            <FocalImage
              :src="display.portrait!"
              :alt="npc.player_visible_fields.includes('name') ? display.name : '???'"
              format="portrait"
              :focal-point="display.focalPoint"
            />
          </div>
          <button
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="$emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
          <div>
            <div class="flex items-start justify-between gap-3">
              <h2 class="font-cinzel text-lg font-bold text-foreground">
                {{ npc.player_visible_fields.includes('name') ? display.name : '???' }}
              </h2>
              <div class="flex items-center gap-0.5 shrink-0 pt-1" @click.stop>
                <button
                  v-for="n in [1,2,3,4,5]"
                  :key="n"
                  type="button"
                  class="text-lg leading-none transition-colors"
                  :class="n <= getRating(npc.id) ? 'text-yellow-400' : 'text-muted-foreground/25 hover:text-yellow-400/60'"
                  :title="n === 1 ? 'Not relevant' : n === 5 ? 'Very relevant' : `Relevance ${n}`"
                  @click="setRating(npc.id, n)"
                >★</button>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-1">
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
            <p v-if="npc.player_visible_fields.includes('race') && npc.race" class="mt-1 font-fell text-sm text-muted-foreground italic">{{ npc.race }}</p>
            <p v-if="npc.player_visible_fields.includes('occupation') && npc.occupation" class="font-fell text-sm text-muted-foreground">{{ npc.occupation }}</p>
          </div>
          <div v-if="myNpcPcNote" class="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
            <div class="px-3 py-2 border-b border-primary/20">
              <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-widest text-primary/70">YOUR CONNECTION</p>
            </div>
            <div class="px-3 py-2.5">
              <RichTextViewer :content="myNpcPcNote" />
            </div>
          </div>
          <PlayerNotesWidget entity-type="npc" :entity-id="npc.id" placeholder="Your observations about this character…" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconClose } from "@/lib/icons";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import { usePlayerNpcRatings } from "@/composables/usePlayerNpcRatings";
import { useMyNpcPcNote } from "@/composables/useNpcPcNotes";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";

const { npc } = defineProps<{ npc: Npc | null }>();
defineEmits<{ close: [] }>();

const { getRating, setRating } = usePlayerNpcRatings();

const npcId = computed(() => npc?.id ?? "");
const { data: myNpcPcNote } = useMyNpcPcNote(npcId);

const display = computed(() => ({
  name:       npc ? getNpcDisplayName(npc)       : "???",
  portrait:   npc ? getNpcDisplayPortrait(npc)   : null,
  focalPoint: npc ? getNpcDisplayFocalPoint(npc) : null,
}));

const REL_COLORS: Record<NpcRelationship, string> = {
  ally: "#2563eb", neutral: "#6b7280", enemy: "#dc2626", unknown: "#9333ea",
};
const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e", dead: "#ef4444", missing: "#f59e0b", unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) { return REL_COLORS[rel] ?? "#6b7280"; }
function statusColor(s: NpcStatus)      { return STATUS_COLORS[s] ?? "#6b7280"; }
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to    { opacity: 0; }
</style>
