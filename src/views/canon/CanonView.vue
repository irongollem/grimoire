<template>
  <PageHeader owns-phone-bar title="Canon" description="The world's larger shape: what is true, what you keep back, how it feels to play, and what has happened.">
    <template #actions>
      <AppButton to="/canon/import" variant="outline" size="md" :icon="IconUpload" label="Bring in a book" />
    </template>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <CanonContents class="lg:sticky lg:top-0 lg:shrink-0" :active="active" :counts="counts" @select="goTo" />

      <div
        class="@container flex min-w-0 flex-1 flex-col gap-8"
        :class="selectedBackstoryMember ? 'max-w-5xl [&>:not(.canon-backstories)]:max-w-3xl' : 'max-w-3xl'"
      >
        <ListSkeleton v-if="isLoading || campaign === null" variant="rows" :count="4" />
        <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load the canon.</p>
        <template v-else>
          <PremiseSection :campaign="campaign" :entries="entries" />
          <TruthsSection :truths="truths" :selected-id="selected?.id ?? null" @select="select" />
          <!-- Below a desktop there is no side column: the selected truth opens under its part. -->
          <TruthDetail v-if="selectedTruth && !wide" :key="selectedTruth.id" :entry="selectedTruth" @delete="removeSelected" />
          <ForcesSection :forces="forces" :selected-id="selectedForce?.id ?? null" @select="select" />
          <ForceDetail v-if="selectedForce && !wide" :key="selectedForce.id" :entry="selectedForce" @delete="removeSelected" />
          <SecretsSection :secrets="secrets" :questions="questions" :selected-id="selectedSecret?.id ?? null" @select="select" />
          <SecretDetail v-if="selectedSecret && !wide" :key="selectedSecret.id" :entry="selectedSecret" @delete="removeSelected" />
          <WorldWorksSection />
          <LoreSection :lore="lore" :selected-id="selectedLore?.id ?? null" @select="select" />
          <LoreDetail v-if="selectedLore && !wide" :key="selectedLore.id" :entry="selectedLore" @delete="removeSelected" />
          <div
            class="canon-backstories grid min-w-0 items-start gap-4"
            :class="selectedBackstoryMember ? '@4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @4xl:gap-6' : ''"
          >
            <BackstoriesSection :party="party" :entries="backstories" :passages="allPassages ?? []" :selected-id="selectedBackstoryMember?.id ?? null" @select="selectBackstory" />
            <BackstoryDetail v-if="selectedBackstoryMember" :key="selectedBackstoryMember.id" :member="selectedBackstoryMember" />
          </div>
          <ChronicleSection :lore="lore" :forces="forces" />
          <TableAddedSection :truth-count="truths.length" />
          <!-- The header holds Bring in a book from a tablet up; a phone's header is the page's own bar. -->
          <AppButton to="/canon/import" variant="outline" size="md" :icon="IconUpload" label="Bring in a book" class="self-start md:hidden" />
        </template>
      </div>
    </div>

    <template v-if="selected && wide" #sidebar>
      <TruthDetail v-if="selectedTruth" :key="selectedTruth.id" :entry="selectedTruth" @delete="removeSelected" />
      <ForceDetail v-else-if="selectedForce" :key="selectedForce.id" :entry="selectedForce" @delete="removeSelected" />
      <SecretDetail v-else-if="selectedSecret" :key="selectedSecret.id" :entry="selectedSecret" @delete="removeSelected" />
      <LoreDetail v-else-if="selectedLore" :key="selectedLore.id" :entry="selectedLore" @delete="removeSelected" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * The DM's Canon page (#1226): the premise, the truths, what is moving, the secrets and the open questions, how the world works, the lore, the chronicle and what the table added, with a
 * contents column. `?entry=<id>` is the link to one entry (search results and the world web point there), and also the
 * page's own selection, so a reload or a shared link keeps the truth or secret that is open.
 */
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/list/PageHeader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BackstoriesSection from "@/components/canon/BackstoriesSection.vue";
import BackstoryDetail from "@/components/canon/BackstoryDetail.vue";
import ChronicleSection from "@/components/canon/ChronicleSection.vue";
import TableAddedSection from "@/components/canon/TableAddedSection.vue";
import CanonContents from "@/components/canon/CanonContents.vue";
import ForceDetail from "@/components/canon/ForceDetail.vue";
import ForcesSection from "@/components/canon/ForcesSection.vue";
import LoreDetail from "@/components/canon/LoreDetail.vue";
import LoreSection from "@/components/canon/LoreSection.vue";
import PremiseSection from "@/components/canon/PremiseSection.vue";
import SecretDetail from "@/components/canon/SecretDetail.vue";
import SecretsSection from "@/components/canon/SecretsSection.vue";
import TruthDetail from "@/components/canon/TruthDetail.vue";
import TruthsSection from "@/components/canon/TruthsSection.vue";
import WorldWorksSection from "@/components/canon/WorldWorksSection.vue";
import { CANON_SECTIONS, sectionCounts, type CanonSectionId } from "@/lib/canon/canonParts";
import { unreviewedCount } from "@/lib/canon/canonTableFacts";
import { useCanonEntries, useDeleteCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useChronicle } from "@/composables/canon/useChronicle";
import { useParty } from "@/composables/party/useParty";
import { useTableFacts } from "@/composables/canon/useTableFacts";
import { IconUpload } from "@/lib/icons";
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
const forces = computed(() => entries.value.filter((e) => e.part === "force"));
const secrets = computed(() => entries.value.filter((e) => e.part === "secret"));
const lore = computed(() => entries.value.filter((e) => e.part === "lore"));
const questions = computed(() => entries.value.filter((e) => e.part === "question"));
const backstories = computed(() => entries.value.filter((e) => e.part === "backstory"));
const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const { data: allPassages } = useCanonPassages();
// The Chronicle counts the sessions with a chronicle entry written; What the table added, the lines still to review.
const { written } = useChronicle();
const tableRecord = useTableFacts();
const counts = computed(() => ({
  ...sectionCounts(entries.value),
  // One backstory per character, opened or not: the contents column counts the characters.
  backstories: party.value.length,
  chronicle: written.value,
  table: unreviewedCount(tableRecord.facts.data.value ?? []),
}));

// Opening `?entry=<id>` brings that truth into view, once per id and only after the list has loaded.
let scrolledTo: string | null = null;

const entryParam = computed(() => (typeof route.query.entry === "string" ? route.query.entry : null));
const selectedTruth = computed(() => truths.value.find((t) => t.id === entryParam.value) ?? null);
const selectedSecret = computed(() => secrets.value.find((t) => t.id === entryParam.value) ?? null);
const selectedForce = computed(() => forces.value.find((t) => t.id === entryParam.value) ?? null);
const selectedLore = computed(() => lore.value.find((t) => t.id === entryParam.value) ?? null);
const selected = computed(() => selectedTruth.value ?? selectedForce.value ?? selectedSecret.value ?? selectedLore.value);

// A backstory is chosen by its character: `?backstory=<party member id>`, or `?entry=<its entry>` (search and the world
// web point at the entry, which a character may not have yet).
const selectedBackstoryMember = computed(() => {
  const queried = typeof route.query.backstory === "string" ? route.query.backstory : null;
  const viaEntry = backstories.value.find((e) => e.id === entryParam.value)?.party_member_id ?? null;
  const id = queried ?? viaEntry;
  return id === null ? null : party.value.find((m) => m.id === id) ?? null;
});

function select(id: string) {
  scrolledTo = id; // the DM is already looking at it: no scroll
  void router.replace({ query: { ...route.query, entry: id, backstory: undefined } });
}
function selectBackstory(memberId: string) {
  void router.replace({ query: { ...route.query, backstory: memberId, entry: undefined } });
}

const { mutateAsync: destroy } = useDeleteCanonEntry();
const { confirm } = useConfirm();

async function removeSelected() {
  const target = selected.value;
  if (!target) return;
  const noun = target.part === "secret" ? "secret" : target.part === "force" ? "force" : target.part === "lore" ? "lore" : "truth";
  const parts = target.part === "secret" ? " and clues" : target.part === "force" ? ", steps, ticks and quest links" : target.part === "lore" ? " and passages" : "";
  const ok = await confirm(`Delete this ${noun}? "${target.title}" and its connections${parts} are removed.`, {
    title: `Delete this ${noun}`,
    confirmLabel: "Delete",
  });
  if (!ok) return;
  try {
    await destroy(target.id);
  } catch {
    return; // The mutation has already told the DM (toast); the entry stays open.
  }
  // The page is the list: deleting leaves the entry's place empty and the selection cleared, nowhere else.
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
  active.value = truth.part === "secret" ? "secrets" : truth.part === "force" ? "moving" : truth.part === "lore" ? "lore" : "truths";
  await nextTick();
  document.getElementById(`canon-entry-${truth.id}`)?.scrollIntoView({ block: "center" });
}, { immediate: true });

// `?section=<part>` takes the DM to a part of the page (Ask Grimoire's "Review suggestions" does), once it has loaded.
const sectionParam = computed(() => CANON_SECTIONS.find((s) => s.id === route.query.section)?.id ?? null);
watch(
  () => campaign.value && !isLoading.value && !isError.value ? sectionParam.value : null,
  async (id) => {
    if (!id) return;
    active.value = id;
    await nextTick();
    document.getElementById(`canon-${id}`)?.scrollIntoView({ block: "start" });
  },
  { immediate: true },
);

watch(
  () => campaign.value && !isLoading.value && !isError.value ? selectedBackstoryMember.value?.id : undefined,
  async (memberId) => {
    if (!memberId) return;
    active.value = "backstories";
    await nextTick();
    document.getElementById("canon-backstories")?.scrollIntoView({ block: "start" });
  },
  { immediate: true },
);
</script>
