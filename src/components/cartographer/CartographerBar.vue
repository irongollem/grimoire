<template>
  <header class="flex h-12 shrink-0 items-center gap-2 overflow-x-auto rounded-lg border border-border bg-card px-2">
    <!-- The workbench's one bar: 3rem, so the map is what the screen is for. The host
         fills the two ends (a way back and the map's name; Delete / Cancel / Save);
         what belongs to the map itself sits between them. -->
    <slot name="start" />
    <slot name="layer" />

    <span class="h-6 w-px shrink-0 bg-border" aria-hidden="true"></span>

    <!-- Tile set: the set's name with a swatch of its floor; the others, and the note
         about slots still on placeholders, are in the menu. -->
    <CartographerPopover label="Tile set" width-class="w-64">
      <template #trigger="{ open, toggle }">
        <AppButton
          variant="subtle"
          size="sm"
          class="max-w-48"
          :active="open"
          aria-haspopup="dialog"
          :aria-expanded="open"
          tooltip="Tile set"
          :icon-right="IconChevronDown"
          @click="toggle"
        >
          <template #icon>
            <CartographerPackSwatch :runtime="packRuntime" />
          </template>
          <span class="truncate max-sm:hidden">{{ packName }}</span>
        </AppButton>
      </template>
      <template #default="{ close }">
        <div class="space-y-1">
          <AppButton
            v-for="p in packs"
            :key="p.pack_id"
            variant="menu"
            size="caption"
            block
            :active="currentPackId === p.pack_id"
            @click="pickPack(p.pack_id, close)"
          >
            <span class="flex-1 truncate">{{ p.name }}</span>
            <span
              v-if="loadedPackIds.has(p.pack_id)"
              class="text-label shrink-0"
              :class="currentPackId === p.pack_id ? 'text-muted-foreground' : 'text-muted-foreground/50'"
            >v{{ p.pack_version }}</span>
            <BannerLoader v-else class="h-3" />
          </AppButton>
        </div>
        <p v-if="validationMissing > 0" class="text-caption-sm text-ink-caution mt-2">
          {{ validationMissing }} slot(s) missing. Using placeholders.
        </p>
        <p class="text-caption-sm text-muted-foreground italic mt-2">
          Switching sets changes future strokes only. Existing cells keep their stored set.
        </p>
      </template>
    </CartographerPopover>

    <SegmentedControl
      :model-value="darkness"
      :options="DARKNESS_OPTIONS"
      size="xs"
      class="shrink-0"
      @update:model-value="emit('update:darkness', $event)"
    />

    <AppButton
      variant="subtle"
      size="sm"
      class="shrink-0"
      :active="spacesOpen"
      :aria-pressed="spacesOpen"
      :icon="IconSplitCell"
      :label="`Spaces ${spaceCount}`"
      collapse-label-on-mobile
      :tooltip="`Spaces on this map (${spaceCount})`"
      @click="emit('toggleSpaces')"
    />

    <CartographerPopover label="Map settings" width-class="w-72">
      <template #trigger="{ open, toggle }">
        <AppButton
          variant="subtle"
          size="icon-sm"
          :active="open"
          :icon="IconSettings"
          aria-haspopup="dialog"
          :aria-expanded="open"
          aria-label="Map settings"
          tooltip="Map settings"
          @click="toggle"
        />
      </template>
      <div class="space-y-3">
        <CampaignScopeField
          :model-value="campaignId"
          @update:model-value="emit('update:campaignId', $event)"
        />
        <AppCheckbox
          v-if="referenceAvailable"
          :model-value="showReference"
          label="Show the Picture underneath as a reference"
          size="sm"
          @update:model-value="emit('update:showReference', $event)"
        />
      </div>
    </CartographerPopover>

    <span class="h-6 w-px shrink-0 bg-border" aria-hidden="true"></span>

    <AppButton
      variant="ghost"
      fill="muted"
      size="icon-sm"
      class="shrink-0"
      :disabled="!canUndo"
      tooltip="Undo (Ctrl+Z)"
      aria-label="Undo"
      :icon="IconUndo"
      @click="emit('undo')"
    />
    <AppButton
      variant="ghost"
      fill="muted"
      size="icon-sm"
      class="shrink-0"
      :disabled="!canRedo"
      tooltip="Redo (Ctrl+Shift+Z)"
      aria-label="Redo"
      :icon="IconRedo"
      @click="emit('redo')"
    />

    <span class="ml-auto shrink-0 text-caption text-muted-foreground" aria-live="polite">{{ saveState }}</span>

    <slot name="end" />
  </header>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import CampaignScopeField from "@/components/common/entity/CampaignScopeField.vue";
import CartographerPackSwatch from "@/components/cartographer/CartographerPackSwatch.vue";
import CartographerPopover from "@/components/cartographer/CartographerPopover.vue";
import { IconChevronDown, IconRedo, IconSettings, IconSplitCell, IconUndo } from "@/lib/icons";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DarknessLevel } from "@/types/dungeonMap.types";

interface BarPack {
  pack_id: string;
  pack_version: number;
  name: string;
}

defineProps<{
  packs: readonly BarPack[];
  currentPackId: string;
  loadedPackIds: Set<string>;
  packRuntime: TilePackRuntime | null;
  /** What the bar calls the current set; never the raw id while it is unresolved. */
  packName: string;
  validationMissing: number;
  darkness: DarknessLevel;
  campaignId: string | null;
  spaceCount: number;
  spacesOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The host's save state ("Saving…", "Unsaved changes"); absent says nothing. */
  saveState?: string;
  /** Whether the site's Picture can go underneath, and whether it does. */
  referenceAvailable: boolean;
  showReference: boolean;
}>();

const emit = defineEmits<{
  "update:currentPackId": [id: string];
  "update:darkness": [level: DarknessLevel];
  "update:campaignId": [id: string | null];
  "update:showReference": [show: boolean];
  toggleSpaces: [];
  undo: [];
  redo: [];
}>();

// The rules' three levels of light, short enough for a bar; the tooltip says the rest.
const DARKNESS_OPTIONS: SegmentedOption<DarknessLevel>[] = [
  { value: "daylight", label: "Day", tooltip: "Daylight: bright light everywhere." },
  { value: "dim", label: "Dim", tooltip: "Dim light everywhere, as at twilight." },
  { value: "dark", label: "Dark", tooltip: "Darkness wherever no light reaches." },
];

function pickPack(id: string, close: () => void): void {
  emit("update:currentPackId", id);
  close();
}
</script>
