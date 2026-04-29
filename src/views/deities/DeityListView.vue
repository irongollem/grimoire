<template>
  <ListPageLayout title="Pantheon" description="Gods, deities, and divine beings of your campaign world">
    <template #actions>
      <ListActionButton
        v-if="hasSetting"
        :icon="Sparkles"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="Flame"
        label="Pantheons"
        mobile-label="Pantheons"
        to="/pantheons"
      />
      <ListActionButton
        :icon="Plus"
        label="New Deity"
        mobile-label="Deity"
        variant="primary"
        to="/deities/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.deitiesHasActiveFilters"
        @clear="ui.resetDeitiesFilters()"
      >
        <ListSearchInput v-model="ui.deitiesSearch" placeholder="Filter deities…" />
        <ListFilterSelect v-model="ui.deitiesFilterDomain" aria-label="Domain filter">
          <option value="">All domains</option>
          <option v-for="d in CLERIC_DOMAINS" :key="d" :value="d">{{ d }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="ui.deitiesFilterPantheon" aria-label="Pantheon filter">
          <option value="">All pantheons</option>
          <option v-for="p in pantheons" :key="p.id" :value="p.id">{{ p.name }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length"
      title="No deities yet"
      description="Create the gods and divine beings that shape your campaign world."
    />

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <RouterLink
          v-for="deity in filtered"
          :key="deity.id"
          :to="`/deities/${deity.id}`"
          class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
        >
          <!-- Portrait thumbnail -->
          <div class="relative h-32 bg-muted overflow-hidden">
            <FocalImage
              v-if="deity.portrait_url"
              :src="deity.portrait_url"
              :focal-point="deity.portrait_focal_point ?? null"
              :alt="deity.name"
              format="landscape"
              class="w-full h-full"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center"
            >
              <Sun class="h-10 w-10 text-muted-foreground/30" />
            </div>
            <!-- Alignment badge -->
            <span
              v-if="deity.alignment"
              class="absolute top-1.5 right-1.5 font-cinzel text-[9px] tracking-wider bg-black/60 text-white px-1.5 py-0.5 rounded"
            >{{ deity.alignment }}</span>
            <!-- Player visible indicator -->
            <Eye
              v-if="deity.player_visible_to?.length"
              class="absolute top-1.5 left-1.5 h-3 w-3 text-elven-green"
            />
          </div>

          <div class="p-3 flex flex-col gap-1.5 flex-1">
            <p class="font-cinzel text-sm font-bold text-foreground truncate">{{ deity.name }}</p>
            <p v-if="deity.titles" class="font-fell text-xs text-muted-foreground italic truncate">{{ deity.titles }}</p>

            <!-- Pantheon -->
            <p v-if="deity.pantheon?.name" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
              {{ deity.pantheon.name }}
            </p>

            <!-- Domains -->
            <div v-if="deity.domains?.length" class="flex flex-wrap gap-1 mt-auto pt-1">
              <span
                v-for="domain in deity.domains.slice(0, 3)"
                :key="domain"
                class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[9px] text-primary tracking-wider"
              >{{ domain }}</span>
              <span
                v-if="deity.domains.length > 3"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[9px] text-muted-foreground"
              >+{{ deity.domains.length - 3 }}</span>
            </div>
          </div>
        </RouterLink>
      </div>
    </template>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Eye, Flame, Plus, Sparkles, Sun } from "lucide-vue-next";
import { useAllDeities, useAllPantheons, usePopulateDeities } from "@/composables/useDeities";
import { CLERIC_DOMAINS } from "@/types/deity.types";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";

const ui = useUiStore();
const campaign = useCampaignStore();
const { data: deities, isLoading } = useAllDeities();
const { data: pantheons } = useAllPantheons();

const hasSetting = computed(() => {
  const s = getSetting(campaign.activeCampaign?.calendar_id ?? "");
  return !!(s?.pantheons.length || s?.deities.length);
});

const filtered = computed(() => {
  const q = ui.deitiesSearch.trim().toLowerCase();
  return (deities.value ?? []).filter((d) => {
    if (ui.deitiesFilterDomain && !d.domains.includes(ui.deitiesFilterDomain)) return false;
    if (ui.deitiesFilterPantheon && d.pantheon_id !== ui.deitiesFilterPantheon) return false;
    if (q) {
      const haystack = [d.name, d.titles, d.portfolio, ...(d.alternate_names ?? []), ...(d.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
});

const populateMutation = usePopulateDeities();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCounts = ref<[number, number]>([0, 0]);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") {
    const [p, d] = populatedCounts.value;
    const parts: string[] = [];
    if (p) parts.push(`${p} pantheon${p !== 1 ? "s" : ""}`);
    if (d) parts.push(`${d} ${d !== 1 ? "deities" : "deity"}`);
    return `Updated ${parts.join(", ")}`;
  }
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Setting";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const counts = await populateMutation.mutateAsync();
    populatedCounts.value = counts;
    populateStatus.value = counts[0] === 0 && counts[1] === 0 ? "uptodate" : "done";
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}
</script>
