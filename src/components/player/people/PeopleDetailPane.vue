<template>
  <!-- No scroll box of its own: the page grows to its content and sets the height
       of the ledger beside it, so the whole screen scrolls (the maintainer,
       14 Nov 2026). -->
  <aside class="torn hearth-card rounded-lg p-4" aria-label="Selected person">
    <PlayerNpcProfile :npc="npc" :place="place">
      <template #plate>
        <!-- Low art: no plate, the portrait waits behind a button when the NPC has one (#1179). -->
        <PortraitOnRequest v-if="lowArt" :src="portraitVisible ? portrait : null" :alt="name" />
        <div v-else class="aspect-3/4 w-48 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
          <FocalImage
            :src="portraitVisible ? portrait : null"
            :alt="name"
            format="portrait"
            :focal-point="focalPoint"
            :placeholder="PLACEHOLDER"
            :class="npc.status === 'dead' && 'grayscale opacity-70'"
            record
          />
        </div>
      </template>
    </PlayerNpcProfile>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import PortraitOnRequest from "@/components/common/media/PortraitOnRequest.vue";
import { useLowArt } from "@/composables/useLowArt";
import PlayerNpcProfile from "@/components/player/people/PlayerNpcProfile.vue";
import { getNpcDisplayFocalPoint, getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { PlayerNpc } from "@/types/npc.types";

/** The selected person's page beside the ledger (tablets in landscape and up). */
const { npc, place = null } = defineProps<{ npc: PlayerNpc; place?: string | null }>();

const { lowArt } = useLowArt();
const PLACEHOLDER = placeholderUrl("npc");
const portraitVisible = computed(() => npc.player_visible_fields.includes("portrait"));
const portrait = computed(() => getNpcDisplayPortrait(npc));
const focalPoint = computed(() => getNpcDisplayFocalPoint(npc));
const name = computed(() => (npc.player_visible_fields.includes("name") ? (getNpcDisplayName(npc) ?? "???") : "???"));
</script>
