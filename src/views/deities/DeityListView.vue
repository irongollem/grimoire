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
        variant="primary"
        :icon="IconAdd"
        label="New Deity"
        mobile-label="Deity"
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
      <div :class="layout === 'gallery' ? 'grid grid-cols-2 gap-3 pb-2' : 'flex flex-col gap-2 pb-2'">
        <EntityMobileCard
          v-for="deity in visibleItems"
          :key="deity.id"
          :layout="layout"
          :to="`/deities/${deity.id}`"
          :title="deity.name"
          :subtitle="deity.titles ?? undefined"
          :image-url="deity.portrait_url"
          :focal-point="deity.portrait_focal_point ?? null"
          placeholder="/assets/placeholders/deity.webp"
          :badge-text="deity.alignment ?? undefined"
          :shared="deity.player_visible_to.length > 0"
        />
      </div>
    </template>

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <EntityGridCard
          v-for="deity in visibleItems"
          :key="deity.id"
          :to="`/deities/${deity.id}`"
          :title="deity.name"
          :image-url="deity.portrait_url"
          :focal-point="deity.portrait_focal_point ?? null"
          placeholder="/assets/placeholders/deity.webp"
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
            <p class="truncate font-cinzel text-sm font-bold text-foreground">{{ deity.name }}</p>
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
                class="rounded bg-muted px-1.5 py-0.5 font-cinzel text-2xs text-muted-foreground"
              >+{{ deity.domains.length - 3 }}</span>
            </div>
          </template>
        </EntityGridCard>
      </div>
    </template>

    <div ref="sentinelRef" />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="deities" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { IconAdd, IconFire, IconLoading, IconNavPantheon, IconPopulate, IconReveal } from '@/lib/icons';
import { useAllDeities, useAllPantheons, usePopulateDeities, useRevealAllDeities, useUpdateDeity } from "@/composables/useDeities";
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
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import EntityGridCard from "@/components/common/EntityGridCard.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/useCreateGate";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";

const ui = useUiStore();
const campaign = useCampaignStore();
const { data: deities, isLoading } = useAllDeities();
const { data: pantheons } = useAllPantheons();
const { mutate: updateDeity } = useUpdateDeity();

function revealDeity(id: string, playerVisibleTo: string[]) {
  updateDeity({ id, update: { player_visible_to: playerVisibleTo } });
}

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

const isMobile = useMediaQuery("(max-width: 767px)");
const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => {
    ui.entityListLayout = v;
  },
});

const { savedCount, linkCount } = useScrollRestore("deities");
// `sentinelRef` must stay destructured — the template binds it as a plain
// `ref="sentinelRef"` string, which is never typechecked, so dropping it leaves
// the ref null, the observer unattached, and the grid silently capped at 48
// with lint, typecheck and build all green. Same note as NpcList.
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

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
