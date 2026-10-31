<template>
  <!-- The Map menu's body (canvas frame 07): what belongs to the map itself rather than to
       the tool in hand, so the bar stays at nine controls. The tile set is not here: it lives
       at the foot of the tool rail, like a colour swatch. -->
  <div class="space-y-3">
    <div class="space-y-1">
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
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import CampaignScopeField from "@/components/common/entity/CampaignScopeField.vue";
import { IconClipboard, IconDelete, IconDownload, IconImage, IconSplitCell, IconWand, type AppIcon } from "@/lib/icons";
import type { MapMenuAction } from "@/cartographer/tools";
import type { DarknessLevel } from "@/types/dungeonMap.types";

const { menuActions } = defineProps<{
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
  "update:darkness": [level: DarknessLevel];
  "update:campaignId": [id: string | null];
  "update:showReference": [show: boolean];
  toggleSpaces: [];
  menuAction: [id: MapMenuAction];
  /** The menu has done its job (an action was taken): the bar closes it. */
  done: [];
}>();

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
