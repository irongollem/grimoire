<template>
  <aside class="torn hearth-card overflow-hidden rounded-lg p-4" aria-label="Selected person">
    <PlayerNpcProfile :npc="npc" :place="place">
      <template #plate>
        <div class="aspect-3/4 w-48 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
          <FocalImage
            :src="portraitVisible ? portrait : null"
            :alt="name"
            format="portrait"
            :focal-point="focalPoint"
            :placeholder="PLACEHOLDER"
            :class="npc.status === 'dead' && 'grayscale opacity-70'"
          />
        </div>
      </template>
    </PlayerNpcProfile>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import PlayerNpcProfile from "@/components/play/people/PlayerNpcProfile.vue";
import { getNpcDisplayFocalPoint, getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { PlayerNpc } from "@/types/npc.types";

/** The selected person's page beside the ledger (tablets in landscape and up). */
const { npc, place = null } = defineProps<{ npc: PlayerNpc; place?: string | null }>();

const PLACEHOLDER = placeholderUrl("npc");
const portraitVisible = computed(() => npc.player_visible_fields.includes("portrait"));
const portrait = computed(() => getNpcDisplayPortrait(npc));
const focalPoint = computed(() => getNpcDisplayFocalPoint(npc));
const name = computed(() => (npc.player_visible_fields.includes("name") ? (getNpcDisplayName(npc) ?? "???") : "???"));
</script>
