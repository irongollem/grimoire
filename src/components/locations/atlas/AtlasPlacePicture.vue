<template>
  <section v-if="location.book_nook_id || location.image_url" class="mb-4 space-y-2" aria-label="Picture" data-testid="place-picture">
    <div class="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
      <BookNookPlayer v-if="nook" :scene="nook.scene" :still="nook.still_url ?? location.image_url" screen="wide" />
      <img v-else-if="location.image_url" :src="location.image_url" :alt="location.name" class="size-full object-cover" />

      <template v-if="nook">
        <span
          class="absolute bottom-2 left-2 rounded bg-card/90 px-1.5 py-0.5 text-eyebrow font-semibold text-foreground backdrop-blur-sm"
          data-testid="nook-label"
        >
          Book Nook
        </span>
        <AppButton
          variant="ghost"
          size="sm"
          :class="[CARD_OVERLAY_SCRIM, 'absolute right-2 top-2 text-white hover:text-white']"
          :icon="IconEdit"
          label="Edit picture"
          :to="`/book-nook/${nook.id}`"
        />
      </template>
    </div>

    <AppButton
      v-if="nook"
      variant="outline"
      size="sm"
      :icon="IconMonitor"
      label="Table screen"
      @click="openTableScreen"
    />
    <AppButton
      v-else-if="!location.book_nook_id && location.image_url"
      variant="outline"
      size="sm"
      :icon="IconNavBookNook"
      label="Bring it to life"
      :loading="starting"
      @click="startFromPicture(location)"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * The first thing on a place's Overview: its picture at the pane's width (#1142, frame 02). A place that shows a
 * nook plays it quietly under a paper label, with the way into the studio and, because a place without a site
 * map has no other way there, the Table screen. A still picture offers to become a nook, already shown here.
 *
 * The DM's copy of the nook is read by id (`useNookForPlace`), not through the player's rpc, so an unrevealed
 * place still shows its nook to the DM who made it. It plays only while on screen (`BookNookPlayer`).
 */
import { computed } from "vue";
import BookNookPlayer from "@/components/bookNook/BookNookPlayer.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/controls/appButtonVariants";
import { useStartNook } from "@/composables/bookNook/useStartNook";
import { useNookForPlace } from "@/composables/bookNook/useShowNookAtPlace";
import { IconEdit, IconMonitor, IconNavBookNook } from "@/lib/icons";
import type { Location } from "@/types/location.types";

const { location } = defineProps<{ location: Location }>();

const { data } = useNookForPlace(computed(() => location));
const nook = computed(() => (location.book_nook_id ? (data.value ?? null) : null));
const { starting, startFromPicture } = useStartNook();

function openTableScreen() {
  window.open(`/locations/${location.id}/table`, "_blank", "noopener,noreferrer");
}
</script>
