<template>
  <div class="flex shrink-0 flex-col gap-2 border-b border-border bg-background px-4 py-3">
    <div class="flex items-center gap-2">
      <h1 class="text-heading-sm font-bold text-foreground">World web</h1>
      <ManualHelpLink page="world-web" />
      <AppButton
        v-if="mode === 'focus'"
        variant="outline"
        size="sm"
        class="ml-auto"
        :icon="IconNetwork"
        label="Whole web"
        @click="emit('whole')"
      />
    </div>

    <ListFilterBar :has-active-filters="ui.hasActiveFilters" @clear="ui.resetWorldWebFilters()">
      <ListSearchInput v-model="ui.worldWebSearch" :inline="false" placeholder="Find…" class="md:max-w-44" />

      <!-- Kind chips, with how many of each are on the web. A kind with none is not offered unless it is switched off. -->
      <div class="flex min-w-0 max-w-full gap-1.5 overflow-x-auto max-md:w-full" role="group" aria-label="Kinds on the web">
        <AppButton
          v-for="chip in chips"
          :key="chip.kind"
          variant="chip"
          size="md"
          :active="!ui.worldWebHiddenKinds.includes(chip.kind)"
          class="shrink-0"
          @click="ui.toggleKind(chip.kind)"
        >
          {{ chip.label }}
          <span class="text-muted-foreground">{{ counts.get(chip.kind) ?? 0 }}</span>
        </AppButton>
      </div>

      <template v-if="mode === 'web'">
        <!-- Group by: records gather in a hull instead of drawing as spokes. -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-label font-bold uppercase tracking-wide text-muted-foreground">Group by</span>
          <SegmentedControl
            :model-value="ui.worldWebGroupKind"
            :options="GROUP_OPTIONS"
            size="md"
            @update:model-value="ui.setGroup($event)"
          />
          <EntityCombobox
            v-if="ui.worldWebGroupKind"
            v-model="groupId"
            :options="groupChoices"
            :placeholder="GROUP_PLACEHOLDER[ui.worldWebGroupKind]"
            class="min-w-44"
          />
        </div>

        <ListFilterSelect v-model="family" aria-label="Kind of tie">
          <option value="">Any tie</option>
          <option v-for="f in TIE_FAMILIES.filter((x) => x !== 'record')" :key="f" :value="f">{{ TIE_FAMILY_LABELS[f] }}</option>
        </ListFilterSelect>
      </template>

      <EntityCombobox
        :model-value="''"
        :options="focusOptions"
        placeholder="Focus on…"
        class="min-w-40"
        @update:model-value="(key) => key && emit('focus', key)"
      />
    </ListFilterBar>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ListFilterBar from "@/components/common/list/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/list/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import { IconNetwork } from "@/lib/icons";
import { KIND_CHIPS, type GroupKind, type WebKind } from "@/lib/worldWeb/kinds";
import type { GroupOption } from "@/lib/worldWeb/groups";
import { TIE_FAMILIES, TIE_FAMILY_LABELS, type TieFamily } from "@/lib/worldWeb/ties";
import { useWorldUiStore } from "@/stores/ui/world";

const { mode, counts, groupOptions, focusOptions } = defineProps<{
  mode: "web" | "focus";
  /** Nodes per kind on the web at rest. */
  counts: ReadonlyMap<WebKind, number>;
  groupOptions: Record<GroupKind, readonly GroupOption[]>;
  /** Everything that can be focused: id is a node key. */
  focusOptions: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  focus: [key: string];
  whole: [];
}>();

const ui = useWorldUiStore();

const GROUP_OPTIONS = [
  { value: "", label: "None" },
  { value: "faction", label: "Faction" },
  { value: "location", label: "Place" },
  { value: "deity", label: "Deity" },
] as const;

const GROUP_PLACEHOLDER: Record<GroupKind, string> = {
  faction: "Which faction…",
  location: "Which place…",
  deity: "Which deity…",
};

const chips = computed(() =>
  KIND_CHIPS.filter((c) => (counts.get(c.kind) ?? 0) > 0 || ui.worldWebHiddenKinds.includes(c.kind)),
);

const groupChoices = computed(() => {
  const kind = ui.worldWebGroupKind;
  return kind ? groupOptions[kind].map((g) => ({ id: g.id, name: `${g.name} (${g.count})` })) : [];
});

const groupId = computed({
  get: () => ui.worldWebGroupId,
  set: (id: string) => ui.setGroup(ui.worldWebGroupKind, id),
});

const family = computed<string>({
  get: () => ui.worldWebTieFamily,
  set: (value) => { ui.worldWebTieFamily = value as TieFamily | ""; },
});
</script>
