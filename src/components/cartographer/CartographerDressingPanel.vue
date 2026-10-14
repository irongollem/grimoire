<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <label class="block text-eyebrow text-muted-foreground">Dressing</label>
      <!-- Library books (epic #1062): opt-in per campaign, as Dungeon Craft's are. -->
      <SourcesPickerPanel
        title="Dressing Sources"
        cue-key="dressing"
        description="Enabled sources add their props to the Dressing tool. Nothing to download."
        empty-message="No dressing sources available yet."
        :available-sources="availableSources"
        :is-loading="sourcesLoading"
      >
        <template #trigger="{ open: pickerOpen, toggle }">
          <AppButton
            variant="subtle"
            size="icon-sm"
            :active="pickerOpen"
            :icon="IconLibrary"
            class="shrink-0"
            tooltip="Manage Dressing sources for this campaign"
            @click="toggle"
          />
        </template>
      </SourcesPickerPanel>
    </div>

    <p class="text-caption-sm text-muted-foreground italic leading-relaxed">
      {{ brushId
        ? "Click the map to place. Q / E turn it, Esc puts it down."
        : "Pick a prop to place it, or click a placed prop to move it." }}
    </p>

    <!-- A picker of candidates to place, not a filter over a list on the page:
         CLAUDE.md's Sanctioned Exceptions keep it out of the UI store. -->
    <AppInput
      v-model="search"
      size="body-xs"
      placeholder="Search props…"
    />

    <ListSkeleton v-if="isLoading" variant="tiles" :columns="1" :count="4" />
    <p v-else-if="offered.length === 0" class="text-caption-sm text-muted-foreground italic">
      Switch on a dressing book from the book icon to place props.
    </p>
    <p v-else-if="sections.length === 0" class="text-caption-sm text-muted-foreground italic">
      No props match.
    </p>
    <template v-else>
      <section v-for="section in sections" :key="section.key" class="space-y-1">
        <h4 class="text-eyebrow text-muted-foreground">{{ section.label }}</h4>
        <div class="grid grid-cols-2 gap-1">
          <AppButton
            v-for="prop in section.props"
            :key="prop.id"
            variant="ghost"
            fill="muted"
            size="caption"
            class="flex-col gap-1 min-h-18"
            :active="brushId === prop.id"
            :aria-pressed="brushId === prop.id"
            :tooltip="brushId === prop.id ? `Put ${prop.name} down` : `Place ${prop.name}`"
            @click="emit('update:brushId', brushId === prop.id ? null : prop.id)"
          >
            <span class="flex h-12 w-full items-center justify-center">
              <img
                v-if="prop.image_url"
                :src="prop.image_url"
                alt=""
                crossorigin="anonymous"
                loading="lazy"
                class="max-h-full max-w-full object-contain"
              />
              <span
                v-else
                class="rounded-sm border border-border bg-muted-foreground/20"
                :style="footprintBox(prop)"
                aria-hidden="true"
              ></span>
            </span>
            <span class="w-full truncate text-label">{{ prop.name }}</span>
            <span class="text-label text-muted-foreground">{{ prop.footprint_w }}×{{ prop.footprint_h }}</span>
          </AppButton>
        </div>
      </section>
    </template>

    <div v-if="selected" class="space-y-2 border-t border-border pt-2">
      <label class="block text-eyebrow text-muted-foreground">Selected</label>
      <p class="text-caption text-foreground">{{ selected.name }}</p>
      <RotationControl :model-value="selected.rotation" @update:model-value="emit('rotateSelected', $event)" />
      <AppButton
        variant="destructive"
        size="caption"
        block
        :icon="IconDelete"
        label="Delete"
        tooltip="Delete the selected prop (Delete)"
        @click="emit('deleteSelected')"
      />
    </div>
    <RotationControl v-else :model-value="brushRotation" @update:model-value="emit('update:brushRotation', $event)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import SourcesPickerPanel from "@/components/common/settings/SourcesPickerPanel.vue";
import RotationControl from "@/components/cartographer/RotationControl.vue";
import { useLibraryDressing } from "@/composables/cartographer/useLibraryDressing";
import { useAvailableLibraryDressingSources } from "@/composables/library/useEnabledSources";
import { IconDelete, IconLibrary } from "@/lib/icons";
import { DRESSING_GROUPS, type LibraryDressing } from "@/types/dressing.types";

const { brushId, brushRotation, selected } = defineProps<{
  /** The prop picked as the brush, null when none is. */
  brushId: string | null;
  /** Rotation a newly placed prop gets, shown while nothing is selected. */
  brushRotation: number;
  /** The selected placed prop, or null: its name from the catalog and its rotation. */
  selected: { name: string; rotation: number } | null;
}>();

const emit = defineEmits<{
  "update:brushId": [id: string | null];
  "update:brushRotation": [degrees: number];
  rotateSelected: [degrees: number];
  deleteSelected: [];
}>();

const { data: libraryProps, isLoading } = useLibraryDressing();
const { data: availableSources, isLoading: sourcesLoading } = useAvailableLibraryDressingSources();

const search = ref("");

const offered = computed<LibraryDressing[]>(() => libraryProps.value ?? []);

const sections = computed(() => {
  const needle = search.value.trim().toLowerCase();
  const matches = needle
    ? offered.value.filter((p) => p.name.toLowerCase().includes(needle) || p.tags.some((t) => t.toLowerCase().includes(needle)))
    : offered.value;
  return DRESSING_GROUPS.map((group) => ({
    ...group,
    props: matches.filter((p) => p.group_key === group.key),
  })).filter((section) => section.props.length > 0);
});

/** A footprint-shaped box for a prop whose art is not painted yet, scaled so the longer side fills the thumbnail. */
function footprintBox(prop: LibraryDressing): Record<string, string> {
  const longest = Math.max(prop.footprint_w, prop.footprint_h);
  return {
    width: `${(prop.footprint_w / longest) * 100}%`,
    height: `${(prop.footprint_h / longest) * 100}%`,
  };
}
</script>
