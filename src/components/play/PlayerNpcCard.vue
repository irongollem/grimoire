<template>
  <div
    class="flex flex-col rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
    @click="$emit('click')"
  >
    <!-- Portrait -->
    <div class="relative aspect-3/4 bg-muted overflow-hidden shrink-0 group">
      <FocalImage
        v-if="npc.player_visible_fields.includes('portrait') && displayPortrait"
        :src="displayPortrait!"
        :alt="npc.player_visible_fields.includes('name') ? displayName : '???'"
        format="portrait"
        :focal-point="displayFocalPoint"
        class="group-hover:scale-105 transition-transform duration-300"
      />
      <img
        v-else-if="!npc.player_visible_fields.includes('portrait') && displayPortrait"
        src="/assets/npcs/mystery-figure.webp"
        alt="Identity hidden"
        class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
        <IconUser class="h-10 w-10" />
      </div>
      <EntityNewDot :is-new="isNew ?? false" class="absolute top-1.5 left-1.5 z-10" />
      <span
        v-if="npc.player_visible_fields.includes('relationship')"
        class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-cinzel font-bold tracking-wider uppercase text-white"
        :style="{ backgroundColor: relColor(npc.relationship) + 'EE' }"
      >{{ npc.relationship }}</span>
    </div>

    <!-- Info -->
    <div class="p-2.5 flex flex-col gap-0.5 flex-1">
      <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">
        {{ npc.player_visible_fields.includes('name') ? displayName : '???' }}
      </h3>
      <p v-if="npc.player_visible_fields.includes('status')" class="flex items-center gap-1 font-fell text-xs text-muted-foreground">
        <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: statusColor(npc.status) }" />
        {{ npc.status }}
      </p>
      <p v-if="npc.player_visible_fields.includes('race') && npc.race" class="font-fell text-xs text-muted-foreground italic truncate">
        {{ npc.race }}
      </p>
      <p v-if="npc.player_visible_fields.includes('occupation') && npc.occupation" class="font-fell text-xs text-muted-foreground truncate">
        {{ npc.occupation }}
      </p>
      <p v-if="location" class="font-fell text-xs text-muted-foreground truncate">📍 {{ location }}</p>

      <!-- Relevance stars — pinned to bottom -->
      <div class="flex items-center gap-0.5 pt-1 mt-auto" @click.stop>
        <button
          v-for="n in [1,2,3,4,5]"
          :key="n"
          type="button"
          class="text-base leading-none transition-colors"
          :class="n <= rating ? 'text-yellow-400' : 'text-muted-foreground/25 hover:text-yellow-400/60'"
          :title="n === 1 ? 'Not relevant' : n === 5 ? 'Very relevant' : `Relevance ${n}`"
          @click.stop="setRating(npc.id, n)"
        >★</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconUser } from '@/lib/icons';
import FocalImage from "@/components/common/FocalImage.vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import { usePlayerNpcRatings } from "@/composables/usePlayerNpcRatings";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";

const props = defineProps<{
  npc: Npc;
  location?: string;
  isNew?: boolean;
}>();

defineEmits<{ click: [] }>();

const { getRating, setRating, ratingTick } = usePlayerNpcRatings();

const displayName = computed(() => getNpcDisplayName(props.npc));
const displayPortrait = computed(() => getNpcDisplayPortrait(props.npc));
const displayFocalPoint = computed(() => getNpcDisplayFocalPoint(props.npc));

// Reactive rating for this specific NPC
const rating = computed(() => {
  void ratingTick.value;
  return getRating(props.npc.id);
});

const REL_COLORS: Record<NpcRelationship, string> = {
  ally: "#2563eb", neutral: "#6b7280", enemy: "#dc2626", unknown: "#9333ea",
};
const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e", dead: "#ef4444", missing: "#f59e0b", unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) { return REL_COLORS[rel] ?? "#6b7280"; }
function statusColor(s: NpcStatus) { return STATUS_COLORS[s] ?? "#6b7280"; }
</script>
