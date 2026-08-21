<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <span
        class="text-label-lg font-semibold text-muted-foreground"
        >Map</span
      >
      <label
        v-if="mapUrl && !isNew"
        class="inline-flex items-center gap-2 cursor-pointer"
        title="Share map with players"
      >
        <span class="text-label-lg text-muted-foreground"
          >Share with players</span
        >
        <button
          type="button"
          class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
          :class="isMapShared ? 'bg-primary' : 'bg-muted-foreground/30'"
          @click="$emit('update:isMapShared', !isMapShared)"
        >
          <span
            class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
            :class="isMapShared ? 'translate-x-3.5' : 'translate-x-0.5'"
          />
        </button>
      </label>
    </div>

    <!-- No map: full drop zone -->
    <ImageUpload
      v-if="!mapUrl"
      :model-value="null"
      aspect="landscape"
      placeholder="Upload a map…"
      bucket="location-images"
      @update:model-value="$emit('update:mapUrl', $event)"
    />

    <!-- Has map: interactive map + compact controls -->
    <template v-else>
      <LocationMap
        v-if="!isNew && children"
        :map-url="mapUrl"
        :pins="mapPins"
        :children="mapPinnableChildren"
        mode="edit"
        :show-hidden-pins="true"
        :compact="mapCompact"
        @update:pins="$emit('update:mapPins', $event)"
        @pin-click="router.push(`/locations/${$event}`)"
      />
      <div class="flex items-center gap-2">
        <AppButton
          variant="ghost"
          size="inline-xs"
          :disabled="isMapUploading"
          :label="isMapUploading ? 'Uploading…' : 'Change map'"
          @click="mapFileInput?.click()"
        />
        <span class="text-muted-foreground/40 text-xs">·</span>
        <AppButton
          variant="ghost"
          size="inline-xs"
          :tooltip="mapCompact ? 'Show full size' : 'Compact map'"
          :label="mapCompact ? 'Full size' : 'Compact'"
          @click="mapCompact = !mapCompact"
        />
        <span class="text-muted-foreground/40 text-xs">·</span>
        <AppButton
          variant="link"
          tone="danger"
          size="inline-xs"
          label="Remove"
          @click="onClearMap"
        />
        <template v-if="sourceMapId">
          <span class="text-muted-foreground/40 text-xs">·</span>
          <AppButton
            variant="link"
            size="inline-xs"
            :to="`/cartographer/${sourceMapId}`"
            label="Edit in Cartographer"
          />
        </template>
        <template v-if="locationId">
          <span class="text-muted-foreground/40 text-xs">·</span>
          <AppCheckbox
            :model-value="isBattleMap"
            size="sm"
            label-role="label"
            label="Battle map"
            class="group inline-flex gap-1"
            label-class="group-hover:text-foreground transition-colors"
            :title="isBattleMap ? 'This map is a tactical battle map: hidden from the player atlas, available in the VTT.' : 'Mark this map as a tactical battle map (hidden from the player atlas; enables VTT + fog).'"
            @update:model-value="$emit('update:isBattleMap', $event)"
          />
          <template v-if="isBattleMap">
            <span class="text-muted-foreground/40 text-xs">·</span>
            <AppButton
              :variant="gridCalibration ? 'ghost' : 'link'"
              size="inline-xs"
              :tooltip="gridCalibration ? 'Re-calibrate the 5-ft grid' : 'Set the 5-ft grid scale for the VTT'"
              :label="gridCalibration ? 'Re-calibrate grid' : 'Calibrate grid'"
              @click="$emit('open-calibration')"
            />
          </template>
        </template>
        <input
          ref="mapFileInput"
          type="file"
          accept="image/*"
          class="sr-only"
          @change="onMapFileChange"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import ImageUpload from '@/components/common/ImageUpload.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCheckbox from '@/components/common/AppCheckbox.vue';
import LocationMap from '@/components/locations/LocationMap.vue';
import { useImageUpload } from '@/composables/useImageUpload';
import type { Location, MapPin as MapPinType, GridCalibration } from '@/types/location.types';

const {
  locationId = null,
  mapUrl,
  mapPins,
  isMapShared,
  isBattleMap,
  isNew = false,
  children = [],
  mapPinnableChildren = [],
  sourceMapId = null,
  gridCalibration = null,
} = defineProps<{
  locationId: string | null;
  mapUrl: string | null;
  mapPins: MapPinType[];
  isMapShared: boolean;
  isBattleMap: boolean;
  isNew?: boolean;
  children?: Location[];
  mapPinnableChildren?: Location[];
  sourceMapId?: string | null;
  gridCalibration?: GridCalibration | null;
}>();

const emit = defineEmits<{
  'update:mapUrl': [value: string | null];
  'update:mapPins': [value: MapPinType[]];
  'update:isMapShared': [value: boolean];
  'update:isBattleMap': [value: boolean];
  'open-calibration': [];
}>();

const router = useRouter();
const mapCompact = ref(true);
const mapFileInput = ref<HTMLInputElement | null>(null);

const {
  isUploading: isMapUploading,
  upload: uploadMapFile,
  remove: removeMapFile,
} = useImageUpload('location-images');

async function onMapFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const oldUrl = mapUrl;
  const url = await uploadMapFile(file);
  if (url) {
    emit('update:mapUrl', url);
    if (oldUrl) await removeMapFile(oldUrl);
  }
  (e.target as HTMLInputElement).value = '';
}

async function onClearMap() {
  if (mapUrl) await removeMapFile(mapUrl);
  emit('update:mapUrl', null);
  emit('update:mapPins', []);
}
</script>
