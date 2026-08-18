<template>
  <ListPageLayout title="Factions" description="Guilds, cults, governments, and other organisations">
    <template #title-suffix>
      <ManualHelpLink page="factions" />
    </template>

    <template #actions>
      <ListActionButton
        v-if="hasSetting"
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.factionGeneratorOpen = true"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Faction"
        mobile-label="Faction"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.factionsHasActiveFilters"
        @clear="ui.resetFactionsFilters()"
      >
        <ListSearchInput v-model="ui.factionsSearch" placeholder="Filter factions…" />
        <ListFilterSelect v-model="ui.factionsFilterType" aria-label="Faction type filter">
          <option value="">All types</option>
          <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!factions?.length"
      title="No factions yet"
      description="Create guilds, cults, governments and other organisations."
    >
      <template #icon><IconNavFactions class="h-16 w-16" /></template>
    </EmptyState>

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <!--
          A div with an absolutely-positioned link overlay rather than a
          RouterLink wrapper: the reveal control is a button, and a button
          inside an anchor is invalid markup that swallows its own clicks.
          Same shape as NpcList and NoteCard.
        -->
        <div
          v-for="faction in filtered"
          :key="faction.id"
          class="group relative flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-4"
        >
          <RouterLink :to="`/factions/${faction.id}`" class="absolute inset-0 z-2" />

          <div class="shrink-0 h-12 w-12 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
            <FocalImage v-if="faction.emblem_url" :src="faction.emblem_url" format="square" :render-width="200" />
            <IconShield v-else class="h-5 w-5 text-muted-foreground/40" />
          </div>

          <div class="min-w-0 flex-1">
            <p class="font-cinzel text-sm font-bold text-foreground truncate">{{ faction.name }}</p>
            <p v-if="faction.faction_type" class="text-label text-muted-foreground mt-0.5">
              {{ faction.faction_type }}
            </p>
            <div v-if="faction.tags.length" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="tag in faction.tags.slice(0, 3)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
              >{{ tag }}</span>
            </div>
          </div>

          <!--
            Reveal sits with the chevron, not on the title line: inside the text
            block it was vertically adrift from the only other control in the
            row. One group rather than two row children, so the pair costs the
            row a single `gap-3` — split, the extra gap came straight out of the
            names, which truncated a word earlier for it.
          -->
          <div class="flex shrink-0 items-center gap-1">
            <div class="relative z-10" @click.prevent.stop>
              <AudienceRevealControl
                :name="faction.name"
                :visible-to="faction.player_visible_to"
                form="inline"
                @change="(next) => revealFaction(faction.id, next)"
              />
            </div>
            <IconChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </div>
    </template>
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="factions" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconChevronRight, IconGenerate, IconLoading, IconNavFactions, IconPopulate, IconShield } from '@/lib/icons';
import { useAllFactions, usePopulateFactions, useUpdateFaction } from "@/composables/useFactions";
import { FACTION_TYPES } from "@/types/faction.types";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/useCreateGate";

const ui = useUiStore();
const campaign = useCampaignStore();
const { data: factions, isLoading } = useAllFactions();
const { mutate: updateFaction } = useUpdateFaction();

function revealFaction(id: string, playerVisibleTo: string[]) {
  updateFaction({ id, update: { player_visible_to: playerVisibleTo } });
}

const { showPaywall, handleNew, gateQuotaError } = useCreateGate("factions", "/factions/new");

const hasSetting = computed(() => !!getSetting(campaign.activeCampaign?.calendar_id ?? ""));

const filtered = computed(() => {
  const q = ui.factionsSearch.trim().toLowerCase();
  return (factions.value ?? []).filter((f) => {
    if (ui.factionsFilterType && f.faction_type !== ui.factionsFilterType) return false;
    if (q && !f.name.toLowerCase().includes(q) && !f.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

const populateMutation = usePopulateFactions();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} faction${populatedCount.value !== 1 ? "s" : ""}`;
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Setting";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const count = await populateMutation.mutateAsync();
    populatedCount.value = count;
    populateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    if (gateQuotaError(e)) return; // free-tier cap hit → show paywall, not a raw error
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}
</script>
