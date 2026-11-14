<template>
  <div class="space-y-1.5">
    <div class="flex min-w-0 items-center gap-2 rounded-md border border-border p-2 text-caption">
      <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconQuest class="h-3.5 w-3.5" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-label-lg font-bold text-foreground">Kind</p>
        <p class="truncate text-muted-foreground">{{ QUEST_BEAT_KINDS.join(' · ') }}</p>
      </div>
      <AppSelect v-model="kind" class="w-36 shrink-0" aria-label="Kind">
        <option v-for="option in kindOptions" :key="option" :value="option">{{ questBeatKindLabel(option) }}</option>
      </AppSelect>
    </div>

    <div class="flex min-w-0 items-center gap-2 rounded-md border border-border p-2 text-caption">
      <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconLocation class="h-3.5 w-3.5" /></span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-label-lg font-bold text-foreground">{{ stagedLocationName || "Not staged" }}</p>
        <p class="truncate text-muted-foreground">staged at · {{ stagedSiteCaption }}</p>
      </div>
      <EntityCombobox
        v-if="editingLocation"
        v-model="stagedLocationIdInternal"
        class="w-48 shrink-0"
        :options="locationOptions"
        placeholder="Where does this beat happen?"
      >
        <template #option="{ opt }">
          <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 0.75}rem` }">{{ opt.name }}</span>
        </template>
      </EntityCombobox>
      <AppButton v-else label="Change" size="xs" variant="subtle" @click="editingLocation = true" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Kind and staged location, each saved immediately — the beat page's "Beat"
 * identity editor. Visibility is not here any more: the "What players read" track
 * owns it (#1194). Extracted so it can mount from both the
 * desktop column and the phone "Beat" fold (#872, review fix 2): before this,
 * the block was `hidden lg:grid`-ed away below `lg`, which cost the DM the
 * ability to change any of the three on a phone. `QuestOpenedPrep`
 * JS-gates which copy actually mounts (`useBelow("lg")`) rather than mounting
 * both — the `EntityCombobox` here owns a `Teleport`, and two live copies of
 * the same dropdown is a different bug, not a safety margin.
 *
 * The location toggle is local rather than lifted to the parent: only one
 * copy of this component is ever mounted at a time. Selecting a value both
 * saves (via the parent's `kind`/`staged-location-id` models, which still own
 * the actual mutation and its no-op guard) and closes the toggle.
 */
import { computed, ref, watch } from "vue";
import { QUEST_BEAT_KINDS, type QuestBeat } from "@/types/quest.types";
import { questBeatKindLabel } from "@/lib/quests/presentation";
import type { LocationSummary } from "@/types/location.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { IconLocation, IconQuest } from "@/lib/icons";

type LocationOption = LocationSummary & { depth: number };

const { beat, kindOptions, locationOptions, stagedLocationName, stagedSiteCaption } = defineProps<{
  beat: QuestBeat;
  kindOptions: string[];
  locationOptions: LocationOption[];
  stagedLocationName: string;
  stagedSiteCaption: string;
}>();
const kind = defineModel<string>("kind", { required: true });
const stagedLocationId = defineModel<string>("stagedLocationId", { required: true });

const editingLocation = ref(false);
watch(() => beat.id, () => { editingLocation.value = false; });

const stagedLocationIdInternal = computed<string>({
  get: () => stagedLocationId.value,
  set: (next) => { editingLocation.value = false; stagedLocationId.value = next; },
});
</script>
