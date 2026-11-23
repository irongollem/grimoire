<template>
  <PageHeader owns-phone-bar title="Canon" description="The world's larger shape: what is true, what you keep back, how it feels to play, and what has happened.">
    <template #actions>
      <AppButton to="/canon/tonight" variant="ghost" size="md" :icon="IconMoon" label="Tonight" />
      <AppButton to="/canon/import" variant="outline" size="md" :icon="IconUpload" label="Bring in a book" />
    </template>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <CanonContents class="sticky top-0 z-10 lg:z-auto lg:shrink-0" :active="active" :counts="counts" @select="goTo" />

      <div
        class="@container flex min-w-0 flex-1 flex-col gap-8 max-lg:[&_#canon-inline-detail]:scroll-mt-16 max-lg:[&_section]:scroll-mt-16"
        :class="splitOpen ? 'max-w-5xl [&>:not([data-split-open])]:max-w-3xl' : 'max-w-3xl'"
      >
        <ListSkeleton v-if="isLoading || campaign === null" variant="rows" :count="4" />
        <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load the canon.</p>
        <template v-else>
          <CanonStart :counts="counts" :has-pitch="hasPitch" @go="goTo" />
          <PremiseSection :campaign="campaign" :entries="entries" />
          <TruthsSection :truths="truths" :selected-id="selected?.id ?? null" @select="select" />
          <!-- Below a desktop there is no side column: the selected truth opens under its part. -->
          <div v-if="selectedTruth && !wide" id="canon-inline-detail">
            <TruthDetail :key="selectedTruth.id" :entry="selectedTruth" @delete="removeSelected" />
          </div>
          <CanonSplit close-label="Close this force" @close="closeEntry">
            <ForcesSection :forces="forces" :selected-id="selectedForce?.id ?? null" @select="select" />
            <template v-if="selectedForce" #detail>
              <ForceDetail :key="selectedForce.id" :entry="selectedForce" @delete="removeSelected" />
            </template>
          </CanonSplit>
          <SecretsSection :secrets="secrets" :questions="questions" :selected-id="selectedSecret?.id ?? null" @select="select">
            <!-- In the part's slot, so it opens under the ledger and not past the open questions. -->
            <div v-if="selectedSecret && !wide" id="canon-inline-detail">
              <SecretDetail :key="selectedSecret.id" :entry="selectedSecret" @delete="removeSelected" />
            </div>
          </SecretsSection>
          <WorldWorksSection />
          <CanonSplit close-label="Close this lore entry" @close="closeEntry">
            <LoreSection :lore="lore" :selected-id="selectedLore?.id ?? null" @select="select" />
            <template v-if="selectedLore" #detail>
              <LoreDetail :key="selectedLore.id" :entry="selectedLore" @delete="removeSelected" />
            </template>
          </CanonSplit>
          <CanonSplit close-label="Close this backstory" @close="closeEntry">
            <BackstoriesSection :party="party" :entries="backstories" :passages="allPassages ?? []" :selected-id="selectedBackstoryMember?.id ?? null" @select="selectBackstory" />
            <template v-if="selectedBackstoryMember" #detail>
              <BackstoryDetail :key="selectedBackstoryMember.id" :member="selectedBackstoryMember" />
            </template>
          </CanonSplit>
          <ChronicleSection :lore="lore" :forces="forces" />
          <TableAddedSection :truths="truths" />
          <!-- The header holds Bring in a book from a tablet up; a phone's header is the page's own bar. -->
          <AppButton to="/canon/tonight" variant="ghost" size="md" :icon="IconMoon" label="Tonight" class="self-start md:hidden" />
          <AppButton to="/canon/import" variant="outline" size="md" :icon="IconUpload" label="Bring in a book" class="self-start md:hidden" />
        </template>
      </div>
    </div>

    <!-- Only the short entries take the side column: a lore entry and a force are long, and open beside their ledger. -->
    <template v-if="(selectedTruth || selectedSecret) && wide" #sidebar>
      <TruthDetail v-if="selectedTruth" :key="selectedTruth.id" :entry="selectedTruth" @delete="removeSelected" />
      <SecretDetail v-else-if="selectedSecret" :key="selectedSecret.id" :entry="selectedSecret" @delete="removeSelected" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * The DM's Canon page (#1226): the premise, the truths, what is moving, the secrets and the open questions, how the world works, the lore, the chronicle and what the table added, with a
 * contents column. `?entry=<id>` is the link to one entry (search results and the world web point there), and also the
 * page's own selection, so a reload or a shared link keeps the truth or secret that is open.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/list/PageHeader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BackstoriesSection from "@/components/canon/BackstoriesSection.vue";
import BackstoryDetail from "@/components/canon/BackstoryDetail.vue";
import CanonSplit from "@/components/canon/CanonSplit.vue";
import ChronicleSection from "@/components/canon/ChronicleSection.vue";
import TableAddedSection from "@/components/canon/TableAddedSection.vue";
import CanonStart from "@/components/canon/CanonStart.vue";
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
import { CANON_SECTIONS, sectionCounts, sectionOfPart, type CanonSectionId } from "@/lib/canon/canonParts";
import { unreviewedCount } from "@/lib/canon/canonTableFacts";
import { useCanonEntries, useDeleteCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useCanonScrollSpy } from "@/composables/canon/useCanonScrollSpy";
import { useChronicle } from "@/composables/canon/useChronicle";
import { useParty } from "@/composables/party/useParty";
import { useTableFacts } from "@/composables/canon/useTableFacts";
import { IconMoon, IconUpload } from "@/lib/icons";
import { useAbove } from "@/composables/useBreakpoint";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import { prefersReducedMotion } from "@/lib/motion";

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
const hasPitch = computed(() => entries.value.some((e) => e.part === "premise" && e.premise_kind === "pitch"));
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

// A split (a ledger with its entry beside it) widens the page body; the entries that take the side column do not.
const splitOpen = computed(() => selectedBackstoryMember.value !== null || selectedForce.value !== null || selectedLore.value !== null);

// A tap that opens the detail under its part, which can be off screen: bring it into view once it is there.
let tapped = false;

function select(id: string) {
  scrolledTo = id; // the DM is already looking at it: no scroll to the row
  tapped = true;
  void router.replace({ query: { ...route.query, entry: id, backstory: undefined } });
}
function closeEntry() {
  void router.replace({ query: { ...route.query, entry: undefined, backstory: undefined } });
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

// The highlight follows the scroll, and stays on a part chosen here until the DM scrolls by hand again.
const { hold } = useCanonScrollSpy(CANON_SECTIONS.map((s) => s.id), active, (id) => `canon-${id}`);

function goTo(id: CanonSectionId) {
  hold();
  active.value = id;
  document.getElementById(`canon-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// The premise and the questions have no detail pane: a landed-on row is marked for a moment instead.
const LANDED = ["ring-1", "ring-primary"];
const LANDED_MS = 2000;
let landedTimer: ReturnType<typeof setTimeout> | undefined;
let landedEl: HTMLElement | null = null;
function clearLanded() {
  clearTimeout(landedTimer);
  landedEl?.classList.remove(...LANDED);
  landedEl = null;
}
onBeforeUnmount(clearLanded);

watch([entryParam, entries, isLoading], async ([id]) => {
  const target = entries.value.find((e) => e.id === id);
  // A backstory is opened by its own watcher below.
  if (!target || target.part === "backstory" || target.id === scrolledTo) return;
  scrolledTo = target.id;
  hold();
  active.value = sectionOfPart(target.part);
  await nextTick();
  const row = document.getElementById(`canon-entry-${target.id}`);
  row?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  if (row && (target.part === "premise" || target.part === "question")) {
    clearLanded();
    landedEl = row;
    row.classList.add(...LANDED);
    landedTimer = setTimeout(clearLanded, LANDED_MS);
  }
}, { immediate: true });

watch(() => selected.value?.id, async (id) => {
  if (!id || !tapped) return;
  tapped = false;
  await nextTick();
  // The wrapper exists for a split's entry at every width (it is under its ledger below 56rem of page body) and for a truth or secret
  // below lg; a truth or secret in the side column has none, so nothing scrolls there.
  const detail = document.getElementById("canon-inline-detail");
  if (typeof detail?.scrollIntoView === "function") detail.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
});

// `?section=<part>` opens the page at a part ("What the table added" from Tonight). Once per value, after the page
// has loaded, so the part is on the page to scroll to.
const sectionParam = computed<CanonSectionId | null>(() => {
  const raw = route.query.section;
  return CANON_SECTIONS.find((s) => s.id === raw)?.id ?? null;
});
watch(
  () => (campaign.value && !isLoading.value && !isError.value ? sectionParam.value : null),
  async (id) => {
    if (!id) return;
    hold();
    active.value = id;
    await nextTick();
    const part = document.getElementById(`canon-${id}`);
    if (typeof part?.scrollIntoView === "function") part.scrollIntoView({ block: "start" });
  },
  { immediate: true },
);

watch(
  () => campaign.value && !isLoading.value && !isError.value ? selectedBackstoryMember.value?.id : undefined,
  async (memberId) => {
    if (!memberId) return;
    hold();
    active.value = "backstories";
    await nextTick();
    document.getElementById("canon-backstories")?.scrollIntoView({ block: "start" });
  },
  { immediate: true },
);
</script>
