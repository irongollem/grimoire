<template>
  <AppModal :open="modelValue" size="xl" panel-class="max-h-[85vh]" @close="$emit('update:modelValue', false)">
    <ModalHeader
      title="Publish to Atlas"
      subtitle="Bake the picture and reconcile the structure behind it."
      :icon="IconUpload"
      closeable
      @close="$emit('update:modelValue', false)"
    >
      <template #actions>
        <template v-if="!showSitePicker">
          <span class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-caption-sm text-foreground">
            <IconLocation class="h-3.5 w-3.5 text-muted-foreground" />
            {{ siteContext.target?.name }}
          </span>
          <AppButton variant="subtle" size="xs" label="Change place…" @click="changingPlace = true" />
        </template>
        <EntityCombobox
          v-else
          :model-value="targetSiteId"
          :options="siteContext.options"
          placeholder="Search sites…"
          class="w-56"
          @update:model-value="onPickSite"
        />
      </template>
    </ModalHeader>

    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="flex flex-col lg:flex-row gap-4 px-5 py-4">
        <div class="lg:w-[27.5rem] shrink-0 flex flex-col gap-3">
          <PublishPlanPreview v-if="review.plan" :plan="review.plan" />
          <div v-if="review.bakedDims" class="rounded-md border border-border bg-muted/40 px-3 py-2 text-caption-sm text-muted-foreground">
            <span class="block text-eyebrow text-muted-foreground mb-1">Also written</span>
            Baked WebP → <code>location-maps/…</code> · <code>map_url</code> · <code>grid_calibration</code> = {{ review.bakedDims.cols }} cells wide,
            origin cell ({{ review.bakedDims.originCellX }}, {{ review.bakedDims.originCellY }}) from the bake padding ·
            <code>source_map_id</code> · <code>map_published_rev = {{ review.mapRev }}</code>.
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <p v-if="!targetSiteId" class="text-body text-muted-foreground italic">Pick a place to publish this map to.</p>
          <PublishPlanRows
            v-else-if="review.plan"
            :plan="review.plan"
            :space-name-by-id="siteContext.spaceNameById"
            :stair-target-options="siteContext.stairTargetOptions"
            :stair-targets="stairTargets"
            @pick-stair-target="(cellKey, id) => $emit('pickStairTarget', cellKey, id)"
          />
          <LoadingSpinner v-else />
        </div>
      </div>
      <p v-if="review.error" class="px-5 pb-3 text-caption text-destructive">{{ review.error }}</p>
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
      <p class="text-caption-sm text-muted-foreground">
        {{ footerWritesText }}<template v-if="siteContext.target?.map_published_rev"> · Undo is a re-publish of rev {{ siteContext.target.map_published_rev }}.</template>
      </p>
      <div class="flex gap-2 shrink-0">
        <AppButton variant="subtle" size="sm" label="Cancel" @click="$emit('update:modelValue', false)" />
        <AppButton
          variant="primary"
          size="sm"
          :disabled="!review.plan || review.publishing || changeCount === 0"
          :label="review.publishing ? 'Publishing…' : `Publish ${changeCount} change${changeCount === 1 ? '' : 's'}`"
          @click="$emit('publish')"
        />
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * Publish to Atlas review (#868 S10, frame 05) — the modal shell around
 * `PublishPlanPreview` (the picture) and `PublishPlanRows` (the words). All
 * state lives in `useMapPublish`, bundled as `siteContext` ("who am I
 * publishing to") and `review` ("what will happen") so the view wires two
 * objects rather than the eight fields inside them — this component only
 * renders their shape and forwards its events, per CartographerEditorView's
 * "mount the modal from a thin wrapper" instruction.
 */
import { computed, ref } from "vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PublishPlanPreview from "@/components/cartographer/PublishPlanPreview.vue";
import PublishPlanRows from "@/components/cartographer/PublishPlanRows.vue";
import { IconLocation, IconUpload } from "@/lib/icons";
import type { PublishSiteContext, PublishReview } from "@/composables/cartographer/useMapPublish";
import type { CellKey } from "@/types/dungeonMap.types";

const { modelValue, targetSiteId, siteContext, stairTargets, review } = defineProps<{
  modelValue: boolean;
  targetSiteId: string;
  siteContext: PublishSiteContext;
  stairTargets: Record<CellKey, string>;
  review: PublishReview;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:targetSiteId": [id: string];
  pickStairTarget: [cellKey: CellKey, targetId: string];
  publish: [];
}>();

const changingPlace = ref(false);
const showSitePicker = computed(() => changingPlace.value || !targetSiteId);

function onPickSite(id: string): void {
  emit("update:targetSiteId", id);
  changingPlace.value = false;
}

const changeCount = computed(() => {
  const plan = review.plan;
  if (!plan) return 0;
  const s = plan.summary;
  return s.newRooms + s.regionUpdates + s.newDoors + s.doorUpdates + s.reanchored;
});

const footerWritesText = computed(() => {
  const plan = review.plan;
  if (!plan) return "";
  const s = plan.summary;
  const parts: string[] = [];
  if (s.newRooms > 0) parts.push(`${s.newRooms} room${s.newRooms === 1 ? "" : "s"}`);
  if (s.regionUpdates > 0) parts.push(`${s.regionUpdates} region update${s.regionUpdates === 1 ? "" : "s"}`);
  const doorWrites = s.newDoors + s.doorUpdates;
  if (doorWrites > 0) parts.push(`${doorWrites} door${doorWrites === 1 ? "" : "s"}`);
  parts.push("1 image");
  return `Writes ${parts.join(", ")}.`;
});
</script>
