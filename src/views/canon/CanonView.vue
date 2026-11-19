<template>
  <PageHeader owns-phone-bar title="Canon" description="The world's larger shape: what is true, what you keep back, and how it feels to play.">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <CanonContents class="lg:sticky lg:top-0 lg:shrink-0" :active="active" :counts="counts" @select="goTo" />

      <div class="flex min-w-0 max-w-3xl flex-1 flex-col gap-8">
        <ListSkeleton v-if="isLoading || campaign === null" variant="rows" :count="4" />
        <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load the canon.</p>
        <template v-else>
          <PremiseSection :campaign="campaign" :entries="entries" />
          <TruthsSection :truths="truths" :selected-id="selected?.id ?? null" @select="select" />
          <!-- Below a desktop there is no side column: the selected truth opens under its part. -->
          <TruthDetail v-if="selected && !wide" :key="selected.id" :entry="selected" @delete="removeSelected" />
        </template>
      </div>
    </div>

    <template v-if="selected && wide" #sidebar>
      <TruthDetail :key="selected.id" :entry="selected" @delete="removeSelected" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * The DM's Canon page (#1226, story 2): the premise and the truths, with a contents column for the parts later
 * stories add. `?entry=<id>` is the link to one entry (search results and the world web point there), and also the
 * page's own selection, so a reload or a shared link keeps the truth that is open.
 */
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/list/PageHeader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import CanonContents from "@/components/canon/CanonContents.vue";
import PremiseSection from "@/components/canon/PremiseSection.vue";
import TruthDetail from "@/components/canon/TruthDetail.vue";
import TruthsSection from "@/components/canon/TruthsSection.vue";
import { CANON_SECTIONS, sectionCounts, type CanonSectionId } from "@/components/canon/canonParts";
import { useCanonEntries, useDeleteCanonEntry } from "@/composables/canon/useCanonEntries";
import { useAbove } from "@/composables/useBreakpoint";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";

const route = useRoute();
const router = useRouter();
const campaign = computed(() => useCampaignStore().activeCampaign);
const wide = useAbove("lg");

const { data, isLoading, isError } = useCanonEntries();
const entries = computed(() => data.value ?? []);
const truths = computed(() => entries.value.filter((e) => e.part === "truth"));
const counts = computed(() => sectionCounts(entries.value));

// Opening `?entry=<id>` brings that truth into view, once per id and only after the list has loaded.
let scrolledTo: string | null = null;

const entryParam = computed(() => (typeof route.query.entry === "string" ? route.query.entry : null));
const selected = computed(() => truths.value.find((t) => t.id === entryParam.value) ?? null);

function select(id: string) {
  scrolledTo = id; // the DM is already looking at it: no scroll
  void router.replace({ query: { ...route.query, entry: id } });
}

const { mutateAsync: destroy } = useDeleteCanonEntry();
const { confirm } = useConfirm();

async function removeSelected() {
  const target = selected.value;
  if (!target) return;
  const ok = await confirm(`Delete this truth? "${target.title}" and its connections are removed.`, {
    title: "Delete this truth",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  try {
    await destroy(target.id);
  } catch {
    return; // The mutation has already told the DM (toast); the truth stays open.
  }
  // The page is the list: deleting leaves the truth's place empty and the selection cleared, nowhere else.
  void router.replace({ query: { ...route.query, entry: undefined } });
}

const active = ref<CanonSectionId>(CANON_SECTIONS[0].id);

function goTo(id: CanonSectionId) {
  active.value = id;
  document.getElementById(`canon-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

watch([selected, isLoading], async ([truth]) => {
  if (!truth || truth.id === scrolledTo) return;
  scrolledTo = truth.id;
  active.value = "truths";
  await nextTick();
  document.getElementById(`canon-entry-${truth.id}`)?.scrollIntoView({ block: "center" });
}, { immediate: true });
</script>
