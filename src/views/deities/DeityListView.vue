<template>
  <ListPageLayout title="Pantheon" description="Gods, deities, and divine beings of your campaign world">
    <template #actions>
      <ListActionButton
        v-if="hasSetting"
        :icon="IconPopulate"
        :loading="populateMutation.isPending.value"
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
        v-if="campaign.isAiEnabled"
        :icon="IconGenerate"
        label="Generate"
        @click="generatorsUi.deityGeneratorOpen = true"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Deity"
        mobile-label="Deity"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="deitiesUi.deitiesHasActiveFilters"
        @clear="deitiesUi.resetDeitiesFilters()"
      >
        <ListSearchInput v-model="deitiesUi.deitiesSearch" placeholder="Filter deities…" />
        <ListFilterSelect v-model="deitiesUi.deitiesFilterDomain" aria-label="Domain filter">
          <option value="">All domains</option>
          <option v-for="d in CLERIC_DOMAINS" :key="d" :value="d">{{ d }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="deitiesUi.deitiesFilterPantheon" aria-label="Pantheon filter">
          <option value="">All pantheons</option>
          <option v-for="p in pantheons" :key="p.id" :value="p.id">{{ p.name }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <ListSkeleton
      v-if="isLoading"
      :variant="isMobile ? layout : 'grid'"
      :count="isMobile ? 7 : 12"
    />

    <EmptyState
      v-else-if="!filtered.length"
      title="No deities yet"
      description="Create the gods and divine beings that shape your campaign world."
    >
      <template #icon><IconNavPantheon class="h-16 w-16" /></template>
    </EmptyState>

    <!--
      Below `md`, the same swap NpcList and MonsterList make: a portrait grid
      card is too wide for a phone, so the list becomes `EntityMobileCard` with
      the rows/gallery toggle. The deity grid had no mobile form at all and
      rendered the desktop card at every width.

      One thing is genuinely lost in the swap and is not an oversight:
      `EntityMobileCard` is a `RouterLink` wrapper, so it cannot hold a button —
      hence the read-only "shared" eye rather than a working reveal. That is the
      same trade the NPC and monster lists already make.
    -->
    <template v-else-if="isMobile">
      <MobileEntityMetaRow
        v-model:layout="layout"
        :shown="filtered.length"
        :total="deities?.length ?? 0"
        plural="deities"
      />
      <!-- Windowed: only the rows near the viewport are mounted. -->
      <EntityMobileGrid :items="filtered" :item-key="deityKey" :layout="layout">
          <template #default="{ item: deity }">
        <EntityMobileCard
          :layout="layout"
          :to="`/deities/${deity.id}`"
          :title="deity.name"
          :subtitle="deity.titles ?? undefined"
          :image-url="deity.portrait_url"
          :focal-point="deity.portrait_focal_point ?? null"
          :placeholder="placeholderUrl('deity')"
          :badge-text="deity.alignment ?? undefined"
          :shared="deity.player_visible_to.length > 0"
        />
          </template>
      </EntityMobileGrid>
    </template>

    <template v-else>
      <VirtualGrid
        :items="filtered"
        :item-key="deityKey"
        :columns="desktopColumns"
        :estimate-row-height="GRID_ROW_PX"
      >
        <template #default="{ item: deity }">
        <EntityGridCard
          :to="`/deities/${deity.id}`"
          :title="deity.name"
          :image-url="deity.portrait_url"
          :focal-point="deity.portrait_focal_point ?? null"
          :placeholder="placeholderUrl('deity')"
          :badge-text="deity.alignment"
        >
          <template #actions-start>
            <div @click.prevent.stop>
              <AudienceRevealControl
                :name="deity.name"
                :visible-to="deity.player_visible_to"
                form="overlay"
                @change="(next) => revealDeity(deity.id, next)"
              />
            </div>
          </template>

          <template #body>
            <p class="truncate text-heading-xs font-bold text-foreground">{{ deity.name }}</p>
            <p v-if="deity.titles" class="truncate text-caption italic text-muted-foreground">{{ deity.titles }}</p>

            <p v-if="deity.pantheon?.name" class="text-label text-muted-foreground">
              {{ deity.pantheon.name }}
            </p>

            <div v-if="deity.domains?.length" class="mt-auto flex flex-wrap gap-1 pt-1">
              <span
                v-for="domain in deity.domains.slice(0, 3)"
                :key="domain"
                class="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-label text-primary"
              >{{ domain }}</span>
              <span
                v-if="deity.domains.length > 3"
                class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
              >+{{ deity.domains.length - 3 }}</span>
            </div>
          </template>
        </EntityGridCard>
        </template>
      </VirtualGrid>
    </template>
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="deities" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useIsMobile } from "@/composables/useBreakpoint";
import { IconAdd, IconFire, IconGenerate, IconNavPantheon, IconPopulate, IconReveal } from '@/lib/icons';
import { useAllDeities, useAllPantheons, usePopulateDeities, useRevealAllDeities, useUpdateDeity } from "@/composables/deities/useDeities";
import { CLERIC_DOMAINS } from "@/types/deity.types";
import { useAppUiStore } from "@/stores/ui/app";
import { useDeitiesUiStore } from "@/stores/ui/deities";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import { useSettingContent } from "@/composables/campaign/useSettingContent";
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ListFilterBar from "@/components/common/list/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/list/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import EntityMobileCard from "@/components/common/entity/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/entity/MobileEntityMetaRow.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useCreateGate } from "@/composables/billing/useCreateGate";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import EntityMobileGrid from "@/components/common/entity/EntityMobileGrid.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const appUi = useAppUiStore();
const deitiesUi = useDeitiesUiStore();
const generatorsUi = useGeneratorUiStore();
const campaign = useCampaignStore();
const { data: deities, isLoading } = useAllDeities();
const { data: pantheons } = useAllPantheons();
const { mutate: updateDeity } = useUpdateDeity();

function revealDeity(id: string, playerVisibleTo: string[]) {
  updateDeity({ id, update: { player_visible_to: playerVisibleTo } });
}

const { showPaywall, handleNew, gateQuotaError } = useCreateGate("deities", "/deities/new");

// The populate button only appears once the setting's seed content has arrived.
const { data: settingContent } = useSettingContent(() => campaign.activeCampaign?.calendar_id);
const hasSetting = computed(() => {
  const s = settingContent.value;
  return !!(s?.pantheons.length || s?.deities.length);
});

const filtered = computed(() => {
  const q = deitiesUi.deitiesSearch.trim().toLowerCase();
  return (deities.value ?? []).filter((d) => {
    if (deitiesUi.deitiesFilterDomain && !d.domains.includes(deitiesUi.deitiesFilterDomain)) return false;
    if (deitiesUi.deitiesFilterPantheon && d.pantheon_id !== deitiesUi.deitiesFilterPantheon) return false;
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

const isMobile = useIsMobile();
const layout = computed({
  get: () => appUi.entityListLayout,
  set: (v: "rows" | "gallery") => {
    appUi.entityListLayout = v;
  },
});

// The whole filtered list is in hand, so only the scroll position needs
// restoring; VirtualGrid windows what is mounted.
useScrollRestore("deities");

// Desktop row height before a row is measured (px); the phone layouts' live in
// EntityMobileGrid. Derived in the default Vellum theme: 2 border + 144 artwork
// + 24 body padding (p-3) + 79 body (name 20, titles 17, pantheon 11, domain
// chips 19 incl. pt-1, three gap-1 gaps) = 249.
const GRID_ROW_PX = 249;

// Mirrors the grid classes this list used to carry:
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
const desktopColumns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const deityKey = (deity: { id: string }) => deity.id;

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
