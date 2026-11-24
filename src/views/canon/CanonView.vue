<template>
  <PageHeader owns-phone-bar title="Canon" description="The world's larger shape: what is true, what you keep back, how it feels to play, and what has happened.">
    <template #actions>
      <AppButton to="/canon/tonight" variant="ghost" size="md" :icon="IconMoon" label="Tonight" />
      <AppButton to="/canon/import" variant="outline" size="md" :icon="IconUpload" label="Bring in a book" />
      <CanonAiTools />
    </template>
    <!-- The header holds these from a tablet up; a phone's header is the page's own bar, so they sit under the title where a thumb finds them. -->
    <div class="mb-4 flex flex-wrap items-start gap-2 md:hidden" data-testid="canon-phone-actions">
      <AppButton to="/canon/tonight" variant="outline" size="sm" :icon="IconMoon" label="Tonight" />
      <AppButton to="/canon/import" variant="outline" size="sm" :icon="IconUpload" label="Bring in a book" />
      <CanonAiTools />
    </div>

    <!-- One search for the whole page: while a query is set its results stand in place of the part. -->
    <div id="canon-page-top" class="mb-4 flex max-w-3xl items-center gap-2">
      <AppInput v-model="ui.query" type="search" tone="filled" size="body" class="flex-1" placeholder="Search the whole canon…" aria-label="Search the whole canon" />
      <AppButton v-if="searching" variant="ghost" size="sm" label="Clear" data-testid="search-clear" @click="ui.query = ''" />
    </div>

    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <CanonContents class="sticky top-0 z-10 lg:z-auto lg:shrink-0" :active="active" :counts="counts" @select="goTo" />

      <div
        class="@container flex min-w-0 flex-1 flex-col gap-8 max-lg:[&_#canon-inline-detail]:scroll-mt-16"
        :class="splitOpen ? 'max-w-5xl [&>:not([data-split-open])]:max-w-3xl' : 'max-w-3xl'"
      >
        <ListSkeleton v-if="isLoading || campaign === null" variant="rows" :count="4" />
        <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load the canon.</p>
        <template v-else>
          <CanonArcs v-if="searching || ARC_NARROWED_SECTIONS.includes(active)" />
          <CanonSearchResults v-if="searching" :groups="hitGroups" :query="ui.query" @open="ui.query = ''" />
          <template v-else>
            <template v-if="active === 'premise'">
              <CanonStart :counts="startCounts" :has-pitch="hasPitch" @go="goTo" />
              <PremiseSection :campaign="campaign" :entries="entries" />
            </template>
            <template v-else-if="active === 'truths'">
              <TruthsSection :truths="shownTruths" :arc-label="arcLabel" :selected-id="selected?.id ?? null" @select="select" />
              <!-- Below a desktop there is no side column: the selected truth opens under its part. -->
              <div v-if="selectedTruth && !wide" id="canon-inline-detail">
                <TruthDetail :key="selectedTruth.id" :entry="selectedTruth" @delete="removeSelected" />
              </div>
            </template>
            <CanonSplit v-else-if="active === 'moving'" close-label="Close this force" @close="closeEntry">
              <ForcesSection :forces="shownForces" :arc-label="arcLabel" :selected-id="selectedForce?.id ?? null" @select="select" />
              <template v-if="selectedForce" #detail>
                <ForceDetail :key="selectedForce.id" :entry="selectedForce" @delete="removeSelected" />
              </template>
            </CanonSplit>
            <SecretsSection v-else-if="active === 'secrets'" :secrets="shownSecrets" :questions="shownQuestions" :arc-label="arcLabel" :selected-id="selectedSecret?.id ?? null" @select="select">
              <!-- In the part's slot, so it opens under the ledger and not past the open questions. -->
              <div v-if="selectedSecret && !wide" id="canon-inline-detail">
                <SecretDetail :key="selectedSecret.id" :entry="selectedSecret" @delete="removeSelected" />
              </div>
            </SecretsSection>
            <WorldWorksSection v-else-if="active === 'world'" />
            <LifeSection v-else-if="active === 'life'" />
            <CanonSplit v-else-if="active === 'lore'" close-label="Close this lore entry" @close="closeEntry">
              <LoreSection :lore="shownLore" :arc-label="arcLabel" :selected-id="selectedLore?.id ?? null" @select="select" />
              <template v-if="selectedLore" #detail>
                <LoreDetail :key="selectedLore.id" :entry="selectedLore" @delete="removeSelected" />
              </template>
            </CanonSplit>
            <CanonSplit v-else-if="active === 'backstories'" close-label="Close this backstory" @close="closeEntry">
              <BackstoriesSection :party="party" :entries="backstories" :passages="allPassages ?? []" :selected-id="selectedBackstoryMember?.id ?? null" @select="selectBackstory" />
              <template v-if="selectedBackstoryMember" #detail>
                <BackstoryDetail :key="selectedBackstoryMember.id" :member="selectedBackstoryMember" />
              </template>
            </CanonSplit>
            <ChronicleSection v-else-if="active === 'chronicle'" :lore="lore" :forces="forces" />
            <TableAddedSection v-else :truths="truths" />
            <CanonDeleted />
          </template>
        </template>
      </div>
    </div>

    <!-- Only the short entries take the side column: a lore entry and a force are long, and open beside their ledger. -->
    <template v-if="(selectedTruth || selectedSecret) && wide && !searching" #sidebar>
      <TruthDetail v-if="selectedTruth" :key="selectedTruth.id" :entry="selectedTruth" @delete="removeSelected" />
      <SecretDetail v-else-if="selectedSecret" :key="selectedSecret.id" :entry="selectedSecret" @delete="removeSelected" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * The DM's Canon page (#1226): the premise, the truths, what is moving, the secrets and the open questions, how the world works, the lore, the chronicle and what the table added, one part
 * at a time (#1258 item 19), chosen in the contents column. The part is the route, `/canon/:part`; `/canon` opens the one
 * the DM was last on. `?entry=<id>` is the link to one entry (search results and the world web point there) and also the
 * page's own selection; it, `?section=<part>` and `?backstory=<member>` on a bare `/canon` resolve to the part that holds
 * them. One search at the top finds a word in any title or body, and stands in place of the part while it is set.
 */
import { computed, nextTick, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/list/PageHeader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import BackstoriesSection from "@/components/canon/BackstoriesSection.vue";
import BackstoryDetail from "@/components/canon/BackstoryDetail.vue";
import CanonAiTools from "@/components/canon/CanonAiTools.vue";
import CanonArcs from "@/components/canon/CanonArcs.vue";
import CanonSearchResults from "@/components/canon/CanonSearchResults.vue";
import CanonSplit from "@/components/canon/CanonSplit.vue";
import ChronicleSection from "@/components/canon/ChronicleSection.vue";
import TableAddedSection from "@/components/canon/TableAddedSection.vue";
import CanonDeleted from "@/components/canon/CanonDeleted.vue";
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
import LifeSection from "@/components/canon/ecology/LifeSection.vue";
import { narrowToArc } from "@/lib/canon/canonNarrow";
import { searchCanon } from "@/lib/canon/canonSearch";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCanonUiStore } from "@/stores/ui/canon";
import { ARC_NARROWED_SECTIONS, isSectionId, sectionCounts, sectionFromWord, sectionOfPart, type CanonSectionId } from "@/lib/canon/canonParts";
import { unreviewedCount } from "@/lib/canon/canonTableFacts";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries, useTrashCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
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
const backstories = computed(() => entries.value.filter((e) => e.part === "backstory"));
const hasPitch = computed(() => entries.value.some((e) => e.part === "premise" && e.premise_kind === "pitch"));
const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const { data: allPassages } = useCanonPassages();
const { data: allClues } = useCanonClues();
const { data: forceData } = useCanonForceData();
// The Chronicle counts the sessions with a chronicle entry written; What the table added, the lines still to review.
const { written } = useChronicle();
const tableRecord = useTableFacts();

// The arc the page is narrowed to (CanonArcs holds the control). The selection below reads the whole lists, so an entry
// the DM just moved to another arc stays open instead of vanishing under them.
const ui = useCanonUiStore();
const { data: arcs } = useCanonArcs();
const arcLabel = computed(() => (ui.arcFilter === null ? null : (arcs.value?.find((a) => a.id === ui.arcFilter)?.name ?? "this arc")));
const narrowed = computed(() => narrowToArc(entries.value, ui.arcFilter));
const shownTruths = computed(() => narrowed.value.filter((e) => e.part === "truth"));
const shownForces = computed(() => narrowed.value.filter((e) => e.part === "force"));
const shownSecrets = computed(() => narrowed.value.filter((e) => e.part === "secret"));
const shownQuestions = computed(() => narrowed.value.filter((e) => e.part === "question"));
const shownLore = computed(() => narrowed.value.filter((e) => e.part === "lore"));

// "Where to begin" asks what the canon holds at all, so it reads the whole canon; the contents column counts what the
// narrowed parts show, so its numbers match the lists under the arc.
const elsewhere = computed(() => ({
  chronicle: written.value,
  table: unreviewedCount(tableRecord.facts.data.value ?? []),
}));
const startCounts = computed(() => ({ ...sectionCounts(entries.value), backstories: party.value.length, ...elsewhere.value }));
const counts = computed(() => ({
  ...sectionCounts(narrowed.value),
  // One backstory per character, opened or not: the contents column counts the characters.
  backstories: party.value.length,
  ...elsewhere.value,
}));

// The page's one search: it reads the arc-narrowed canon, and the clues, force steps and passages of what it reads.
const searching = computed(() => ui.query.trim() !== "");
const hitGroups = computed(() =>
  searching.value ? searchCanon(ui.query, { entries: narrowed.value, clues: allClues.value ?? [], steps: forceData.value?.steps ?? [], passages: allPassages.value ?? [] }) : [],
);

const entryParam = computed(() => (typeof route.query.entry === "string" ? route.query.entry : null));
const backstoryParam = computed(() => (typeof route.query.backstory === "string" ? route.query.backstory : null));

// The part on screen. The route names it; on a bare `/canon` a link's own words do (`?section=`, `?backstory=`, the part
// `?entry=` points into) and otherwise the part the DM was last on.
const routePart = computed(() => (isSectionId(route.params.part) ? route.params.part : null));
const linkedPart = computed<CanonSectionId | null>(() => {
  const word = sectionFromWord(route.query.section);
  if (word !== null) return word;
  if (backstoryParam.value !== null) return "backstories";
  const target = entries.value.find((e) => e.id === entryParam.value);
  return target ? sectionOfPart(target.part) : null;
});
const active = computed<CanonSectionId>(() => routePart.value ?? linkedPart.value ?? ui.lastPart);

// A link with no part, or with a part the entry is not in, or with `?section=`, is rewritten to the part's own address
// once the canon has loaded (an entry's part is only known then), so the URL names what is on screen.
const ready = computed(() => campaign.value !== null && !isLoading.value && !isError.value);
watch(
  [ready, () => route.params.part, () => route.query, entries],
  () => {
    if (!ready.value) return;
    const wanted = linkedPart.value ?? routePart.value ?? ui.lastPart;
    if (routePart.value === wanted && route.query.section === undefined) return;
    void router.replace({ path: `/canon/${wanted}`, query: { ...route.query, section: undefined } });
  },
  { immediate: true },
);
watch(active, (id) => { ui.lastPart = id; }, { immediate: true });

// Each part draws only its own detail; a link whose part and entry disagree is rewritten to the entry's part above.
const selectedTruth = computed(() => truths.value.find((t) => t.id === entryParam.value) ?? null);
const selectedSecret = computed(() => secrets.value.find((t) => t.id === entryParam.value) ?? null);
const selectedForce = computed(() => forces.value.find((t) => t.id === entryParam.value) ?? null);
const selectedLore = computed(() => lore.value.find((t) => t.id === entryParam.value) ?? null);
const selected = computed(() => selectedTruth.value ?? selectedForce.value ?? selectedSecret.value ?? selectedLore.value);

// A backstory is chosen by its character: `?backstory=<party member id>`, or `?entry=<its entry>` (search and the world
// web point at the entry, which a character may not have yet).
const selectedBackstoryMember = computed(() => {
  const viaEntry = backstories.value.find((e) => e.id === entryParam.value)?.party_member_id ?? null;
  const id = backstoryParam.value ?? viaEntry;
  return id === null ? null : party.value.find((m) => m.id === id) ?? null;
});

// A split (a ledger with its entry beside it) widens the page body; the entries that take the side column do not.
const splitOpen = computed(() => selectedBackstoryMember.value !== null || selectedForce.value !== null || selectedLore.value !== null);

// Opening `?entry=<id>` brings that entry into view, once per id and only after the list has loaded.
let scrolledTo: string | null = null;
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

const { mutateAsync: destroy } = useTrashCanonEntry();
const { confirm } = useConfirm();

async function removeSelected() {
  const target = selected.value;
  if (!target) return;
  const noun = target.part === "secret" ? "secret" : target.part === "force" ? "force" : target.part === "lore" ? "lore entry" : "truth";
  const parts = target.part === "secret" ? " and clues" : target.part === "force" ? ", steps, ticks and quest links" : target.part === "lore" ? " and passages" : "";
  const ok = await confirm(`Delete this ${noun}? "${target.title}" and its connections${parts} go to Deleted for thirty days, where you can restore them.`, {
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

// Choosing a part leaves the search and any open entry behind: the part is what the DM asked to see.
function goTo(id: CanonSectionId) {
  ui.query = "";
  void router.push({ path: `/canon/${id}` });
}

// A part opens at its top; an entry link scrolls to its own row below instead.
watch(active, async () => {
  if (entryParam.value !== null) return;
  await nextTick();
  const top = document.getElementById("canon-page-top");
  if (typeof top?.scrollIntoView === "function") top.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
});

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

watch([entryParam, entries, isLoading, active], async ([id]) => {
  const target = entries.value.find((e) => e.id === id);
  // A backstory is opened by its own watcher below.
  if (!target || target.part === "backstory" || target.id === scrolledTo || sectionOfPart(target.part) !== active.value) return;
  scrolledTo = target.id;
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

watch(
  () => (ready.value ? selectedBackstoryMember.value?.id : undefined),
  async (memberId) => {
    if (!memberId) return;
    await nextTick();
    const detail = document.getElementById("canon-inline-detail");
    if (typeof detail?.scrollIntoView === "function") detail.scrollIntoView({ block: "nearest" });
  },
  { immediate: true },
);
</script>
