<template>
  <!-- Location quick-view — opened from @location chips in rich text -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
        @click.self="close"
        @keydown.escape="close"
      >
        <div class="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
          <div class="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
            <span
              class="h-2 w-2 rounded-full shrink-0"
              :style="{ backgroundColor: loc ? LOCATION_TYPE_COLORS[loc.location_type] : 'transparent' }"
            />
            <h2 class="font-cinzel text-sm font-semibold text-foreground flex-1 truncate">
              {{ loc?.name ?? 'Location' }}
            </h2>
            <span v-if="loc" class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider shrink-0">
              {{ LOCATION_TYPE_LABELS[loc.location_type] }}
            </span>
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
              @click="close"
            >
              <IconClose class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div v-if="isLoading" class="flex justify-center py-16">
              <LoadingSpinner />
            </div>

            <p v-else-if="!loc" class="font-fell text-sm text-muted-foreground italic px-4 py-10 text-center">
              This place hasn't been shared with you yet.
            </p>

            <template v-else>
              <PlayerLocationDetailPanel
                :loc="loc"
                :npcs="npcs"
                :shared-child-ids="sharedChildIds"
                :shared-children="sharedChildren"
                :is-full-size="isFullSize"
                @lightbox="lightboxSrc = $event"
                @toggle-map-size="isFullSize = !isFullSize"
                @pin-click="goToChild"
                @pin-go="goToChild"
                @pin-watch="goToChild"
                @open-npc="selectedNpc = $event"
              />
              <div class="px-4 pb-4">
                <button
                  type="button"
                  class="font-cinzel text-2xs md:text-sm text-primary tracking-wider hover:opacity-80 transition-opacity"
                  @click="viewInAtlas"
                >
                  View in Atlas →
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Nested NPC quick-view (from the "People in the Area" list) -->
  <Teleport to="body">
    <PlayerPartyNpcLightbox :npc="selectedNpc" @close="selectedNpc = null" />
  </Teleport>

  <!-- Image lightbox -->
  <Teleport to="body">
    <div
      v-if="lightboxSrc"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
      @click="lightboxSrc = null"
    >
      <img :src="lightboxSrc" class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { IconClose } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useSharedLocations } from "@/composables/useLocations";
import { useSharedNpcsByLocations } from "@/composables/useNpcs";
import { useMarkRead } from "@/composables/useReadItems";
import { LOCATION_TYPE_COLORS, LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { Npc } from "@/types/npc.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PlayerLocationDetailPanel from "@/components/play/PlayerLocationDetailPanel.vue";
import PlayerPartyNpcLightbox from "@/components/play/PlayerPartyNpcLightbox.vue";

const ui = useUiStore();
const router = useRouter();
const { mutate: markRead } = useMarkRead();

const { data: locations, isLoading } = useSharedLocations();

const open = computed(() => ui.playerLocationDialogId !== null);
const loc = computed(() =>
  (locations.value ?? []).find((l) => l.id === ui.playerLocationDialogId) ?? null,
);

const sharedChildIds = computed(() => new Set((locations.value ?? []).map((l) => l.id)));
const sharedChildren = computed(() => new Map((locations.value ?? []).map((l) => [l.id, l])));

// Fetch the location's shared NPCs only when the DM has shared them.
const npcLocationIds = computed(() =>
  loc.value?.is_npcs_shared ? [loc.value.id] : [],
);
const { data: sharedNpcs } = useSharedNpcsByLocations(npcLocationIds);
const npcs = computed<Npc[]>(() =>
  (sharedNpcs.value ?? []).filter((n) => n.location_id === loc.value?.id),
);

const isFullSize = ref(false);
const lightboxSrc = ref<string | null>(null);
const selectedNpc = ref<Npc | null>(null);

// Reset per-location view state and mark the place read whenever the dialog
// opens on a (newly) resolved location.
watch(
  () => loc.value?.id,
  (id) => {
    if (!id) return;
    isFullSize.value = false;
    markRead({ entityType: "location", entityId: id });
  },
);

function goToChild(childId: string) {
  // Pins reference child locations — if the child is also shared, swap the
  // dialog to it; otherwise leave the current view in place.
  if (locations.value?.some((l) => l.id === childId)) {
    ui.openPlayerLocationDialog(childId);
  }
}

function viewInAtlas() {
  const id = ui.playerLocationDialogId;
  close();
  if (id) void router.push({ path: "/play/atlas", query: { open: id } });
}

function close() {
  ui.closePlayerLocationDialog();
  lightboxSrc.value = null;
  selectedNpc.value = null;
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
