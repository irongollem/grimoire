<template>
  <!-- Hit points kept within reach: the readout and the amount/Damage/Heal
       controls, pinned to the top of the sheet's scroller once the header's own
       row has scrolled away. Zero height in the page flow, so it appearing never
       moves the content under the thumb. -->
  <div class="sticky top-0 z-20 mb-0 h-0">
    <div
      v-if="visible"
      class="absolute inset-x-0 top-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-b-lg border-x border-b border-border bg-card px-3 py-1.5 shadow-md"
      role="group"
      aria-label="Hit points"
    >
      <div class="flex items-baseline gap-1.5">
        <span class="text-title font-bold leading-none" :class="hpColor">{{ displayHp }}</span>
        <span class="text-body text-muted-foreground">/ {{ displayMaxHp }} HP</span>
        <span v-if="member.temp_hp" class="text-label text-tone-info">+{{ member.temp_hp }} temp</span>
      </div>
      <PlayerHpControls :member="member" :wildshape="wildshape" compact />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { hpTextClass } from "@/components/player/hpDisplay";
import PlayerHpControls from "@/components/player/PlayerHpControls.vue";
import type { PartyMember } from "@/types/party.types";
import type { WildshapeState } from "@/types/encounter.types";

const { member, wildshape } = defineProps<{
  member: PartyMember;
  wildshape?: WildshapeState;
  /** Whether the header's own hit point row is out of sight. */
  visible: boolean;
}>();

const displayHp = computed(() => wildshape?.beast_hp ?? member.current_hp);
const displayMaxHp = computed(() => wildshape?.beast_max_hp ?? member.max_hp);
const hpColor = computed(() => hpTextClass(displayHp.value, displayMaxHp.value));
</script>
