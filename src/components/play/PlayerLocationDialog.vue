<template>
  <!-- Location quick-view — opened from @location chips in rich text -->
  <AppModal :open="open" size="md" align="sheet" @close="close">
    <ModalHeader
      :title="loc?.name ?? 'Location'"
      :subtitle="loc ? LOCATION_TYPE_LABELS[loc.location_type] : undefined"
      closeable
      @close="close"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div v-if="isLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>

      <p v-else-if="!loc" class="text-body text-muted-foreground italic px-4 py-10 text-center">
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
          <AppButton
            variant="link"
            size="inline-xs"
            label="View in Atlas →"
            @click="viewInAtlas"
          />
        </div>
      </template>
    </div>
  </AppModal>

  <!-- Nested NPC quick-view (from the "People in the Area" list) -->
  <Teleport to="body">
    <PlayerNpcLightbox :npc="selectedNpc" @close="selectedNpc = null" />
  </Teleport>

  <!-- Image lightbox -->
  <ImageLightbox :src="lightboxSrc" alt="Location image" @close="lightboxSrc = null" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useSharedLocations } from "@/composables/locations/useLocations";
import { useSharedNpcsByLocations } from "@/composables/npcs/useNpcs";
import { useMarkRead } from "@/composables/play/useReadItems";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { PlayerNpc } from "@/types/npc.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PlayerLocationDetailPanel from "@/components/play/PlayerLocationDetailPanel.vue";
import PlayerNpcLightbox from "@/components/play/PlayerNpcLightbox.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import ImageLightbox from "@/components/common/ImageLightbox.vue";

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
const npcs = computed<PlayerNpc[]>(() =>
  (sharedNpcs.value ?? []).filter((n) => n.location_id === loc.value?.id),
);

const isFullSize = ref(false);
const lightboxSrc = ref<string | null>(null);
const selectedNpc = ref<PlayerNpc | null>(null);

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
