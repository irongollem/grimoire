<template>
  <AppModal :open="open" size="lg" @close="cancel">
    <ModalHeader title="Set Map Scale" closeable @close="cancel" />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
      <p class="text-body text-muted-foreground leading-relaxed">
        Drag the two handles onto two places whose distance you know, such as two cities or the
        ends of a road. Then type how far apart they are. Measuring a route on this map uses that
        to work out distance and travel time.
      </p>

      <TwoPointImagePicker v-model:a="pointA" v-model:b="pointB" :map-url="mapUrl" @ready="onImageReady" />

      <div class="flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1">
          <span class="text-label-lg font-semibold text-muted-foreground">DISTANCE BETWEEN HANDLES</span>
          <AppInput
            v-model.number="distance"
            type="number"
            min="0"
            step="any"
            tone="filled"
            size="body"
            :block="false"
            class="w-32"
          />
        </label>
        <div class="flex flex-col gap-1">
          <span class="text-label-lg font-semibold text-muted-foreground">UNIT</span>
          <SegmentedControl v-model="unit" :options="UNIT_OPTIONS" size="md" />
        </div>
        <p v-if="built.error && distance !== null" class="text-body text-destructive">
          {{ built.error }}
        </p>
      </div>
    </div>

    <div class="flex items-center justify-between gap-2 px-5 py-4 border-t border-border shrink-0">
      <AppButton
        v-if="existing"
        variant="link"
        tone="danger"
        size="md"
        label="Clear scale"
        :disabled="saving"
        @click="clear"
      />
      <span v-else />
      <div class="flex items-center gap-2">
        <AppButton variant="subtle" size="md" label="Cancel" @click="cancel" />
        <AppButton
          variant="primary"
          size="md"
          :disabled="!built.scale || saving"
          :label="saving ? 'Saving…' : 'Save Scale'"
          @click="save"
        />
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * Sets how far apart two points on a world, region or city map are (#932). The
 * DM marks two places and types the distance; a route measured later is turned
 * into miles or kilometres from that one pair. The map picks its own unit.
 *
 * The two-handle picker is shared with `GridCalibrationDialog`. This dialog
 * only owns the distance, the unit and the Clear action; saving is the
 * caller's, so it can show a failure and keep the dialog open.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import TwoPointImagePicker from "@/components/locations/map/TwoPointImagePicker.vue";
import { buildMapScale, DISTANCE_UNITS, DISTANCE_UNIT_LABELS, type ImagePoint } from "@/lib/locations/mapScale";
import type { DistanceUnit } from "@/rules/travelPace";
import type { MapScale } from "@/types/location.types";

const { open, mapUrl, existing = null, saving = false } = defineProps<{
  open: boolean;
  /** The caller's write is in flight; it closes the dialog when it lands. */
  saving?: boolean;
  mapUrl: string | null;
  existing?: MapScale | null;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [scale: MapScale];
  clear: [];
}>();

const UNIT_OPTIONS = DISTANCE_UNITS.map((value) => ({ value, label: DISTANCE_UNIT_LABELS[value] }));

const DEFAULT_A: ImagePoint = { x: 0.3, y: 0.5 };
const DEFAULT_B: ImagePoint = { x: 0.7, y: 0.5 };

const pointA = ref<ImagePoint>({ ...DEFAULT_A });
const pointB = ref<ImagePoint>({ ...DEFAULT_B });
const distance = ref<number | null>(null);
const unit = ref<DistanceUnit>("mi");

/** Seeds the form from the saved scale, or blank. Run on open and again when
 *  the picture has loaded, which is when the handles first have a place. */
function seed() {
  pointA.value = existing ? { ...existing.a } : { ...DEFAULT_A };
  pointB.value = existing ? { ...existing.b } : { ...DEFAULT_B };
  distance.value = existing?.distance ?? null;
  unit.value = existing?.unit ?? "mi";
}

watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    seed();
  },
  { immediate: true },
);

function onImageReady() {
  seed();
}

const built = computed(() =>
  buildMapScale({ a: pointA.value, b: pointB.value, distance: distance.value, unit: unit.value }),
);

function cancel() {
  emit("cancel");
}

function save() {
  if (!built.value.scale) return;
  emit("save", built.value.scale);
}

function clear() {
  emit("clear");
}
</script>
