<template>
  <div class="px-4 pb-4 flex flex-col gap-4">
    <!-- Sigil + player summary -->
    <div class="flex items-start gap-3 pt-1">
      <button
        v-if="loc.image_url"
        type="button"
        class="w-14 shrink-0 rounded-md overflow-hidden aspect-3/4 cursor-zoom-in"
        @click="$emit('lightbox', loc.image_url!)"
      >
        <FocalImage
          :src="loc.image_url"
          :alt="loc.name"
          format="portrait"
          :focal-point="null"
        />
      </button>
      <p v-if="loc.player_summary" class="font-fell text-sm text-foreground italic flex-1">
        {{ loc.player_summary }}
      </p>
    </div>

    <!-- Map (suppressed for battle maps) -->
    <div v-if="loc.map_url && !loc.is_battle_map">
      <LocationMap
        :map-url="loc.map_url"
        :pins="playerPins"
        :children="[]"
        mode="view"
        :show-hidden-pins="false"
        :compact="!isFullSize"
        :shared-child-ids="sharedChildIds"
        @pin-click="$emit('pin-click', $event)"
        @pin-go="$emit('pin-go', $event)"
        @pin-watch="$emit('pin-watch', $event)"
      />
      <div class="flex items-center justify-between mt-1">
        <p v-if="!playerPins.length" class="font-fell text-xs text-muted-foreground italic">
          No pins placed yet.
        </p>
        <span v-else />
        <button
          type="button"
          class="font-cinzel text-2xs md:text-sm text-muted-foreground hover:text-foreground transition-colors tracking-wider"
          @click="$emit('toggle-map-size', loc.id)"
        >
          {{ isFullSize ? 'Compact' : 'Full size' }}
        </button>
      </div>
    </div>

    <!-- Full description (when shared) -->
    <div v-if="loc.is_description_shared && loc.description" class="border-t border-border pt-3">
      <p class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider mb-1">Description</p>
      <RichTextViewer :content="loc.description" />
    </div>

    <!-- Wares (store / tavern / inn when inventory shared) -->
    <div v-if="isStoreType && loc.is_inventory_shared" class="border-t border-border pt-3">
      <p class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider mb-2">Wares</p>
      <PlayerStoreWares :location-id="loc.id" />
    </div>

    <!-- Linked NPCs (when shared) -->
    <div v-if="loc.is_npcs_shared" class="border-t border-border pt-3">
      <p class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider mb-2">People in the Area</p>
      <div v-if="npcs.length" class="flex flex-col gap-1.5">
        <button
          v-for="npc in npcs"
          :key="npc.id"
          type="button"
          class="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 transition-colors text-left w-full"
          @click="$emit('open-npc', npc)"
        >
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-xs font-semibold text-foreground truncate">{{ getNpcDisplayName(npc) }}</p>
            <p v-if="npc.occupation || npc.race" class="font-fell text-xs text-muted-foreground italic truncate">
              {{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}
            </p>
          </div>
        </button>
      </div>
      <p v-else class="font-fell text-xs text-muted-foreground italic">No one here yet.</p>
    </div>

    <PlayerNotesWidget
      entity-type="location"
      :entity-id="loc.id"
      placeholder="Notes about this place…"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerStoreWares from "@/components/locations/PlayerStoreWares.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { STORE_LOCATION_TYPES } from "@/types/location.types";
import type { Location } from "@/types/location.types";
import type { Npc } from "@/types/npc.types";

const { loc, npcs = [], sharedChildIds, isFullSize = false } = defineProps<{
  loc: Location;
  npcs?: Npc[];
  sharedChildIds: Set<string>;
  isFullSize?: boolean;
}>();

defineEmits<{
  lightbox: [src: string];
  'toggle-map-size': [id: string];
  'pin-click': [childId: string];
  'pin-go': [childId: string];
  'pin-watch': [childId: string];
  'open-npc': [npc: Npc];
}>();

const isStoreType = computed(() => STORE_LOCATION_TYPES.has(loc.location_type));
const playerPins = computed(() => (loc.map_pins ?? []).filter((p) => p.visible_to_players));
</script>
