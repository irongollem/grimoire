<template>
  <ListPageLayout title="Pantheon" description="Gods, deities, and divine beings of your campaign world">
    <template #actions>
      <ListActionButton
        v-if="hasSetting"
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        v-if="deities?.length"
        :icon="IconReveal"
        :label="revealStatus === 'done' ? 'All Revealed' : 'Reveal All'"
        :disabled="revealMutation.isPending.value"
        @click="handleRevealAll"
      />
      <ListActionButton
        :icon="IconFire"
        label="Pantheons"
        mobile-label="Pantheons"
        to="/pantheons"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Deity"
        mobile-label="Deity"
        variant="primary"
        @click="handleNew"
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
    >
      <template #icon><IconNavPantheon class="h-16 w-16" /></template>
    </EmptyState>

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
              :src="deity.portrait_url"
              :focal-point="deity.portrait_focal_point ?? null"
              :alt="deity.name"
              format="landscape"
              placeholder="/assets/placeholders/deity.webp"
              class="w-full h-full"
            />
            <!-- Alignment badge -->
            <span
              v-if="deity.alignment"
              class="absolute top-1.5 right-1.5 font-cinzel text-[0.5625rem] tracking-wider bg-black/60 text-white px-1.5 py-0.5 rounded"
            >{{ deity.alignment }}</span>
            <!-- Player visible indicator -->
            <IconReveal
              v-if="deity.player_visible_to?.length"
              class="absolute top-1.5 left-1.5 h-3 w-3 text-elven-green"
            />
          </div>

          <div class="p-3 flex flex-col gap-1.5 flex-1">
            <p class="font-cinzel text-sm font-bold text-foreground truncate">{{ deity.name }}</p>
            <p v-if="deity.titles" class="font-fell text-xs text-muted-foreground italic truncate">{{ deity.titles }}</p>

            <!-- Pantheon -->
            <p v-if="deity.pantheon?.name" class="font-cinzel text-2xs text-muted-foreground tracking-wider">
              {{ deity.pantheon.name }}
            </p>

            <!-- Domains -->
            <div v-if="deity.domains?.length" class="flex flex-wrap gap-1 mt-auto pt-1">
              <span
                v-for="domain in deity.domains.slice(0, 3)"
                :key="domain"
                class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[0.5625rem] text-primary tracking-wider"
              >{{ domain }}</span>
              <span
                v-if="deity.domains.length > 3"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[0.5625rem] text-muted-foreground"
              >+{{ deity.domains.length - 3 }}</span>
            </div>
          </div>
        </RouterLink>
      </div>
    </template>
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="deities" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconAdd, IconFire, IconLoading, IconNavPantheon, IconPopulate, IconReveal } from '@/lib/icons';
import { useAllDeities, useAllPantheons, usePopulateDeities, useRevealAllDeities } from "@/composables/useDeities";
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
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/useCreateGate";

const ui = useUiStore();
const campaign = useCampaignStore();
const { data: deities, isLoading } = useAllDeities();
const { data: pantheons } = useAllPantheons();

const { showPaywall, handleNew, gateQuotaError } = useCreateGate("deities", "/deities/new");

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

const revealMutation = useRevealAllDeities();
const revealStatus = ref<"idle" | "done">("idle");

async function handleRevealAll() {
  revealStatus.value = "idle";
  await revealMutation.mutateAsync();
  revealStatus.value = "done";
}

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
    if (gateQuotaError(e)) return; // free-tier cap hit → show paywall, not a raw error
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}
</script>
