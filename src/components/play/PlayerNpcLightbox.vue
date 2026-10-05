<template>
  <EntityLightbox
    :open="!!npc"
    :portrait-src="npc?.player_visible_fields.includes('portrait') ? displayPortrait : null"
    :portrait-alt="npc?.player_visible_fields.includes('name') ? displayName : '???'"
    :focal-point="displayFocalPoint"
    @close="$emit('close')"
  >
    <PlayerNpcProfile v-if="npc" :npc="npc" :place="place" />
  </EntityLightbox>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import PlayerNpcProfile from "@/components/play/people/PlayerNpcProfile.vue";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import type { PlayerNpc } from "@/types/npc.types";

const { npc, place = null } = defineProps<{
  npc: PlayerNpc | null;
  /** The player-visible place, for callers that know it. */
  place?: string | null;
}>();

defineEmits<{ close: [] }>();

const displayName = computed(() => (npc ? getNpcDisplayName(npc) ?? "???" : "???"));
const displayPortrait = computed(() => (npc ? getNpcDisplayPortrait(npc) : null));
const displayFocalPoint = computed(() => (npc ? getNpcDisplayFocalPoint(npc) : null));
</script>
