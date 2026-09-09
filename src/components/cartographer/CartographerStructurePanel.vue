<template>
  <aside class="lg:w-56 shrink-0 bg-card border border-border rounded-lg p-3 space-y-4">
    <!-- Spaces on this map -->
    <div>
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="text-eyebrow text-muted-foreground">Spaces on this map ({{ spaceRows.length }})</span>
        <AppButton variant="ghost" fill="muted" size="xs" label="Re-detect" @click="$emit('redetect')" />
      </div>
      <p class="text-caption-sm text-muted-foreground italic mb-2">
        Detected by flood fill over the floor layer, cut at closed doors and solid blocks. A region here is a proposal until you publish — nothing on this panel writes to the Atlas.
      </p>
      <div v-if="spaceRows.length > 0" class="space-y-0.5">
        <AppButton
          v-for="row in spaceRows"
          :key="row.key"
          variant="menu"
          size="caption"
          block
          class="items-start py-1.5"
          :active="row.isSelected"
          @click="$emit('selectSpace', row.key)"
        >
          <template #icon>
            <component
              :is="row.hasName ? IconCheck : IconCircle"
              class="h-3.5 w-3.5 mt-0.5 shrink-0"
              :class="row.hasName ? 'text-emerald-500' : 'text-muted-foreground/50'"
            />
          </template>
          <span class="min-w-0 flex-1 text-left">
            <span class="block truncate font-medium">{{ row.displayName }}</span>
            <span class="block text-caption-sm text-muted-foreground">
              {{ PROVENANCE_LABEL[row.provenance] }} · {{ row.cellCount }} cell{{ row.cellCount === 1 ? "" : "s" }}<template v-if="row.zoneCount"> · {{ row.zoneCount }} zone{{ row.zoneCount === 1 ? "" : "s" }} inside</template>
            </span>
          </span>
        </AppButton>
      </div>
      <p v-else class="text-caption-sm text-muted-foreground italic">Paint a floor to detect a space.</p>
    </div>

    <!-- Selected space: the room-level inspector -->
    <div v-if="selectedSpaceInspector" class="border-t border-border pt-3">
      <label class="flex items-center gap-1.5 text-eyebrow text-muted-foreground mb-1">
        <IconSplitCell class="h-3.5 w-3.5" />
        {{ selectedSpaceInspector.name ?? "Unnamed region" }}
      </label>
      <AppInput
        v-model.lazy="nameDraft"
        placeholder="Name this room…"
        size="body-xs"
        class="mb-2"
      />
      <p v-if="selectedSpaceInspector.sourceCell" class="text-caption-sm text-muted-foreground mb-2">
        From annotation at {{ selectedSpaceInspector.sourceCell }}.
      </p>
      <dl class="space-y-1 text-caption-sm">
        <div>
          <dt class="text-muted-foreground inline">Ways out — </dt>
          <dd class="inline text-foreground">{{ selectedSpaceInspector.waysSummary }}</dd>
        </div>
        <div v-for="zone in selectedSpaceInspector.zones" :key="`${zone.kind}:${zone.label ?? ''}`">
          <dt class="text-muted-foreground inline">Zone — </dt>
          <dd class="inline text-foreground">{{ zone.label ? `${zone.label} · ${zone.kindLabel}` : zone.kindLabel }}</dd>
        </div>
        <div v-for="link in selectedSpaceInspector.linked" :key="link">
          <dt class="text-muted-foreground inline">Linked — </dt>
          <dd class="inline text-foreground">{{ link }}</dd>
        </div>
      </dl>
    </div>

    <!-- Published to -->
    <div v-if="publishedSites.length > 0" class="border-t border-border pt-3">
      <span class="text-eyebrow text-muted-foreground mb-1 block">Published to</span>
      <ul class="space-y-1.5">
        <li v-for="site in publishedSites" :key="site.id" class="flex items-start gap-2 text-caption-sm">
          <IconLocation class="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <RouterLink :to="{ path: '/locations', query: { at: site.id } }" class="min-w-0 flex-1 transition-colors hover:text-primary">
            <span class="block truncate text-foreground">{{ site.name }}</span>
            <span class="block text-muted-foreground">
              rev {{ site.map_published_rev ?? 0 }} · {{ timeAgo(site.updated_at) }}<template v-if="behind(site) > 0"> · {{ behind(site) }} behind</template>
            </span>
          </RouterLink>
        </li>
      </ul>
      <p class="text-caption-sm text-muted-foreground italic mt-1.5">
        One drawing may serve several places — a reused gatehouse is one map published twice. The place owns the rooms and the state; the map owns the picture.
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { IconCheck, IconCircle, IconLocation, IconSplitCell } from "@/lib/icons";
import { timeAgo } from "@/lib/utils";
import type { SpaceRow } from "@/composables/cartographer/useCartographerStructure";
import type { PublishedSite } from "@/composables/cartographer/usePublishedSites";
import type { ZoneKind } from "@/types/locationMapRegion.types";

export interface SpaceInspectorZone {
  kind: ZoneKind;
  kindLabel: string;
  label: string | null;
}

export interface SelectedSpaceInspector {
  key: string;
  name: string | null;
  sourceCell: string | null;
  waysSummary: string;
  zones: SpaceInspectorZone[];
  linked: string[];
}

const PROVENANCE_LABEL: Record<SpaceRow["provenance"], string> = {
  selected: "Selected",
  annotation: "From annotation",
  unnamed: "Unnamed — annotate it or name it here",
};

const props = defineProps<{
  spaceRows: SpaceRow[];
  selectedSpaceInspector: SelectedSpaceInspector | null;
  publishedSites: PublishedSite[];
  mapRev: number;
}>();

const emit = defineEmits<{
  selectSpace: [key: string];
  renameSpace: [name: string];
  redetect: [];
}>();

function behind(site: PublishedSite): number {
  return props.mapRev - (site.map_published_rev ?? 0);
}

// Lazy-commit rename: `AppInput`'s `.lazy` modifier only writes on change/blur,
// so this never fires the rename mid-keystroke — see `structure.ts`'s
// `nameFromAnnotation`, which the rename ultimately edits.
const nameDraft = ref(props.selectedSpaceInspector?.name ?? "");
watch(
  () => props.selectedSpaceInspector,
  (inspector) => { nameDraft.value = inspector?.name ?? ""; },
);
watch(nameDraft, (name) => emit("renameSpace", name));
</script>
