<template>
  <PageHeader title="Simulacrum">
    <SimulacrumTeaser v-if="isTeaser" />
    <SimulacrumWizard
      v-else-if="isLive && sourceTable && sourceId"
      :source-table="sourceTable"
      :source-id="sourceId"
      :resume-mini-id="resumeMiniId"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import SimulacrumTeaser from "@/components/simulacrum/SimulacrumTeaser.vue";
import SimulacrumWizard from "@/components/simulacrum/SimulacrumWizard.vue";
import { useSimulacrumConfig } from "@/composables/useSimulacrumConfig";
import type { MiniSourceTable } from "@/types/mini.types";

const MINI_SOURCE_TABLES: readonly MiniSourceTable[] = ["npcs", "monsters", "party_members"];

const route = useRoute();
const router = useRouter();
const { query: configQuery, mode, isTeaser, isLive } = useSimulacrumConfig();

const sourceTable = computed<MiniSourceTable | null>(() => {
  const v = route.query.source;
  return typeof v === "string" && (MINI_SOURCE_TABLES as string[]).includes(v) ? (v as MiniSourceTable) : null;
});
const sourceId = computed(() => (typeof route.query.id === "string" ? route.query.id : null));
const resumeMiniId = computed(() => (typeof route.query.mini === "string" ? route.query.mini : null));

// "hidden" mode: the module doesn't exist yet — bounce out. Gated on the
// config query actually resolving first, since `mode` defaults to "hidden"
// while loading — redirecting on that transient value would bounce a
// "teaser"/"live" campaign out before the real config ever arrives.
watch(
  [mode, () => configQuery.isPending.value],
  ([m, pending]) => {
    if (!pending && m === "hidden") router.replace("/minis");
  },
  { immediate: true },
);
</script>
