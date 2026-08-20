<template>
  <PageHeader title="Simulacrum" description="Every 3D miniature forged from a portrait, in one place.">
    <template #header-extra>
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative max-w-xs flex-1">
          <IconSearch class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <AppInput
            v-model="search"
            type="text"
            tone="default"
            size="body"
            placeholder="Search minis…"
            class="pl-7"
          />
        </div>

        <AppSelect v-model="filterFormat" tone="default" size="body" weight="normal">
          <option value="all">All formats</option>
          <option value="print">Print</option>
          <option value="vtt">VTT</option>
        </AppSelect>

        <AppSelect v-model="filterStatus" tone="default" size="body" weight="normal">
          <option value="all">All statuses</option>
          <option value="ready">Ready</option>
          <option value="in-progress">In progress</option>
          <option value="failed">Failed</option>
        </AppSelect>

        <AppButton
          v-if="hasActiveFilters"
          variant="subtle"
          size="sm"
          label="Clear"
          @click="ui.resetMinisFilters()"
        />
      </div>
    </template>

    <div v-if="query.isPending.value" class="flex justify-center py-16">
      <LoadingSpinner message="Gathering your minis…" />
    </div>

    <EmptyState
      v-else-if="filtered.length === 0"
      :title="minis.length === 0 ? 'No minis yet' : 'Nothing matches'"
      :description="minis.length === 0 ? emptyDescription : 'Try a different filter or clear your search.'"
    >
      <template #icon><VitruvianIcon class="text-5xl opacity-40" /></template>
      <template v-if="minis.length === 0 && isTeaser" #action>
        <RouterLink
          to="/minis/forge"
          class="text-label-lg font-semibold text-primary hover:underline"
        >Read the lore →</RouterLink>
      </template>
    </EmptyState>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 pt-1">
      <MiniCard v-for="mini in filtered" :key="mini.id" :mini="mini" />
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import PageHeader from "@/components/common/PageHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import VitruvianIcon from "@/components/common/VitruvianIcon.vue";
import MiniCard from "@/components/simulacrum/MiniCard.vue";
import { IconSearch } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useMinis } from "@/composables/useMinis";
import { useSimulacrumConfig } from "@/composables/useSimulacrumConfig";
import { MINI_STATUSES } from "@/types/mini.types";

const ui = useUiStore();
const { minisSearch, minisFilterFormat, minisFilterStatus, minisHasActiveFilters } = storeToRefs(ui);
const hasActiveFilters = minisHasActiveFilters;

const search = computed({
  get: () => minisSearch.value,
  set: (v) => { minisSearch.value = v; },
});
const filterFormat = computed({
  get: () => minisFilterFormat.value,
  set: (v) => { minisFilterFormat.value = v; },
});
const filterStatus = computed({
  get: () => minisFilterStatus.value,
  set: (v) => { minisFilterStatus.value = v; },
});

const { isTeaser } = useSimulacrumConfig();
const query = useMinis();
const minis = computed(() => query.data.value ?? []);

const IN_PROGRESS_STATUSES = MINI_STATUSES.filter((s) => s !== "ready" && s !== "failed");

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return minis.value.filter((m) => {
    if (q && !(m.label ?? "").toLowerCase().includes(q)) return false;
    if (filterFormat.value !== "all" && m.format !== filterFormat.value) return false;
    if (filterStatus.value === "ready" && m.status !== "ready") return false;
    if (filterStatus.value === "failed" && m.status !== "failed") return false;
    if (filterStatus.value === "in-progress" && !(IN_PROGRESS_STATUSES as string[]).includes(m.status)) return false;
    return true;
  });
});

const emptyDescription = computed(() =>
  isTeaser.value
    ? "The ritual to bind minis isn't complete yet — but you can register your interest."
    : "Forge your first mini from any NPC, monster or hero portrait.",
);
</script>
