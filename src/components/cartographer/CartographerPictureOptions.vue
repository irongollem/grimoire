<template>
  <CartographerOptionsSlip :title="liningUp ? 'Line up the grid' : 'Base image'">
    <template v-if="liningUp && natural && draft">
      <PictureGridFields v-model="draft" v-model:box-mode="boxMode" :natural="natural" class="basis-full" />
      <div class="flex basis-full items-center gap-1.5">
        <AppButton variant="primary" size="sm" label="Done" @click="emit('done')" />
        <AppButton variant="ghost" fill="muted" size="sm" label="Cancel" @click="emit('cancel')" />
      </div>
    </template>
    <template v-else>
      <p v-if="hasPicture && !calibrated" class="basis-full text-caption text-ink-caution">
        Line up the grid to trace and draw over it.
      </p>
      <p v-else-if="!hasPicture" class="basis-full text-caption text-muted-foreground">
        A scan, a screenshot or a render. Add one and it sits under the drawing and the zones.
      </p>
      <MapPictureControls
        class="basis-full"
        :has-picture="hasPicture"
        :moving="moving"
        :battle-map="battleMap"
        :busy="busy"
        @upload="emit('upload', $event)"
        @remove="emit('remove')"
        @line-up="emit('line-up')"
        @update:battle-map="emit('update:battleMap', $event)"
      />
    </template>
  </CartographerOptionsSlip>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import CartographerOptionsSlip from "@/components/cartographer/CartographerOptionsSlip.vue";
import PictureGridFields from "@/components/cartographer/PictureGridFields.vue";
import MapPictureControls from "@/components/locations/map/MapPictureControls.vue";
import type { ImageSize } from "@/lib/mapImport/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

defineProps<{
  hasPicture: boolean;
  calibrated: boolean;
  moving: boolean;
  battleMap: boolean;
  busy: boolean;
  liningUp: boolean;
  /** The picture's pixel size, known once it has loaded. */
  natural: ImageSize | null;
}>();

/** The grid as it is being lined up; written back only by Done. */
const draft = defineModel<GridCalibration | null>("draft", { default: null });
const boxMode = defineModel<boolean>("boxMode", { default: false });

const emit = defineEmits<{
  upload: [file: File];
  remove: [];
  "line-up": [];
  done: [];
  cancel: [];
  "update:battleMap": [value: boolean];
}>();
</script>
