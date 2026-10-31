<template>
  <!-- The Map menu's body (canvas frame 07): what belongs to the map itself rather than to
       the tool in hand, so the bar stays at nine controls. The tile-set list is a second
       page of the same menu rather than a second popover. Mounted fresh on every open, so
       it always opens on the first page. -->
  <div v-if="page === 'packs'" class="space-y-1">
    <AppButton variant="menu" size="caption" block :icon="IconChevronLeft" label="Tile set" @click="page = 'menu'" />
    <AppButton
      v-for="p in packs"
      :key="p.pack_id"
      variant="menu"
      size="caption"
      block
      :active="currentPackId === p.pack_id"
      @click="emit('update:currentPackId', p.pack_id); page = 'menu'"
    >
      <span class="flex-1 truncate">{{ p.name }}</span>
      <span
        v-if="loadedPackIds.has(p.pack_id)"
        class="text-label shrink-0"
        :class="currentPackId === p.pack_id ? 'text-muted-foreground' : 'text-muted-foreground/50'"
      >v{{ p.pack_version }}</span>
      <BannerLoader v-else class="h-3" />
    </AppButton>
    <p v-if="validationMissing > 0" class="text-caption-sm text-ink-caution mt-2">
      {{ validationMissing }} slot(s) missing. Using placeholders.
    </p>
    <p class="text-caption-sm text-muted-foreground italic mt-2">
      Switching sets changes future strokes only. Existing cells keep their stored set.
    </p>
  </div>

  <div v-else class="space-y-3">
    <div class="space-y-1">
      <AppButton variant="menu" size="caption" block :icon-right="IconChevronRight" @click="page = 'packs'">
        <CartographerPackSwatch :runtime="packRuntime" />
        <span class="flex-1">Tile set</span>
        <span class="max-w-32 truncate text-muted-foreground">{{ packName }}</span>
      </AppButton>
      <div class="flex items-center justify-between gap-2 px-3 py-1">
        <span class="text-caption">Light</span>
        <SegmentedControl
          :model-value="darkness"
          :options="DARKNESS_OPTIONS"
          size="xs"
          @update:model-value="emit('update:darkness', $event)"
        />
      </div>
    </div>

    <div class="space-y-2 px-3">
      <CampaignScopeField :model-value="campaignId" @update:model-value="emit('update:campaignId', $event)" />
      <AppCheckbox
        v-if="referenceAvailable"
        :model-value="showReference"
        label="Show picture underneath"
        size="sm"
        @update:model-value="emit('update:showReference', $event)"
      />
    </div>

    <div class="space-y-1">
      <AppButton
        variant="menu"
        size="caption"
        block
        :active="spacesOpen"
        :icon="IconSplitCell"
        @click="emit('toggleSpaces'); emit('done')"
      >
        <span class="flex-1">Spaces on this map</span>
        <span class="text-muted-foreground tabular-nums">{{ spaceCount }}</span>
      </AppButton>
    </div>

    <template v-for="(group, index) in hostGroups" :key="index">
      <hr class="border-border" />
      <div class="space-y-1">
        <AppButton
          v-for="item in group"
          :key="item.id"
          variant="menu"
          size="caption"
          block
          :tone="item.id === 'delete' ? 'danger' : undefined"
          :icon="item.icon"
          @click="emit('menuAction', item.id); emit('done')"
        >
          <span class="flex-1">{{ item.label }}</span>
          <span
            v-if="item.id === 'review' && reviewCount !== undefined && reviewCount > 0"
            class="rounded-full bg-primary/15 px-1.5 text-caption-sm tabular-nums text-foreground"
          >{{ reviewCount }}</span>
        </AppButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import CampaignScopeField from "@/components/common/entity/CampaignScopeField.vue";
import CartographerPackSwatch from "@/components/cartographer/CartographerPackSwatch.vue";
import { IconChevronLeft, IconChevronRight, IconClipboard, IconDelete, IconDownload, IconImage, IconSplitCell, IconWand, type AppIcon } from "@/lib/icons";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { MapMenuAction } from "@/cartographer/tools";
import type { DarknessLevel } from "@/types/dungeonMap.types";

interface MenuPack {
  pack_id: string;
  pack_version: number;
  name: string;
}

const { menuActions } = defineProps<{
  packs: readonly MenuPack[];
  currentPackId: string;
  loadedPackIds: Set<string>;
  packRuntime: TilePackRuntime | null;
  packName: string;
  validationMissing: number;
  darkness: DarknessLevel;
  campaignId: string | null;
  spaceCount: number;
  spacesOpen: boolean;
  referenceAvailable: boolean;
  showReference: boolean;
  /** Which host actions to offer; the host lists only the ones it handles. */
  menuActions: readonly MapMenuAction[];
  /** Changes waiting to be published to the site; a chip when above zero. */
  reviewCount?: number;
}>();

const emit = defineEmits<{
  "update:currentPackId": [id: string];
  "update:darkness": [level: DarknessLevel];
  "update:campaignId": [id: string | null];
  "update:showReference": [show: boolean];
  toggleSpaces: [];
  menuAction: [id: MapMenuAction];
  /** The menu has done its job (an action was taken): the bar closes it. */
  done: [];
}>();

const page = ref<"menu" | "packs">("menu");

// The rules' three levels of light, short enough for a menu row; the tooltip says the rest.
const DARKNESS_OPTIONS: SegmentedOption<DarknessLevel>[] = [
  { value: "daylight", label: "Day", tooltip: "Daylight: bright light everywhere." },
  { value: "dim", label: "Dim", tooltip: "Dim light everywhere, as at twilight." },
  { value: "dark", label: "Dark", tooltip: "Darkness wherever no light reaches." },
];

interface HostItem {
  id: MapMenuAction;
  label: string;
  icon: AppIcon;
}
// Rules between the groups: the AI and the site, then the files, then the one that destroys.
const HOST_GROUPS: HostItem[][] = [
  [
    { id: "style", label: "Style it with AI…", icon: IconWand },
    { id: "review", label: "Review changes to the site", icon: IconClipboard },
  ],
  [
    { id: "download", label: "Download a picture", icon: IconImage },
    { id: "export-vtt", label: "Export for another VTT (.dd2vtt)", icon: IconDownload },
  ],
  [{ id: "delete", label: "Delete map", icon: IconDelete }],
];

// A group the host offers nothing from draws no rule either.
const hostGroups = computed(() =>
  HOST_GROUPS.map((group) => group.filter((item) => menuActions.includes(item.id))).filter((group) => group.length > 0),
);
</script>
