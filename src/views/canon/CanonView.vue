<template>
  <!-- `@container/canon`: the contents column and the next-session card appear by the page's own width, not the screen's, so a laptop with the sidebar open still gets them. -->
  <PageHeader class="@container/canon" owns-phone-bar title="Canon" description="The campaign's background book.">
    <template #actions>
      <CanonSearchField class="w-72 min-w-0 shrink @max-3xl/header:w-40" />
      <AppButton to="/canon/import" variant="outline" size="md" :icon="IconUpload" label="Bring in a book" collapse-label-on-mobile collapse-below="header" />
      <CanonOpenAsBook />
      <!-- Short, so the header keeps to one row on a laptop; the tooltip says what it opens. -->
      <AppButton to="/canon/tonight" variant="outline" size="md" :icon="IconMoon" label="Tonight" tooltip="Prepare tonight: what the canon has waiting for the session" collapse-label-on-mobile collapse-below="header" class="@min-[60rem]/canon:hidden" />
    </template>
    <!-- The header holds these from a tablet up; a phone's header is the page's own bar, so they sit under the title where a thumb finds them. -->
    <div class="mb-4 flex flex-col gap-2 md:hidden" data-testid="canon-phone-actions">
      <CanonSearchField />
      <div class="flex flex-wrap gap-2">
        <AppButton to="/canon/import" variant="outline" size="sm" :icon="IconUpload" label="Bring in a book" />
        <AppButton to="/canon/tonight" variant="outline" size="sm" :icon="IconMoon" label="Tonight" />
      </div>
    </div>

    <div id="canon-page-top" class="flex flex-col gap-4 @min-[60rem]/canon:flex-row @min-[60rem]/canon:items-start @min-[60rem]/canon:gap-6">
      <!-- The contents: a column from 60rem of the page (kept in sight), a chapter picker above the chapter below it. The arc filter is page-wide, so it sits with it. -->
      <div class="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2 @min-[60rem]/canon:flex-col @min-[60rem]/canon:flex-nowrap @min-[60rem]/canon:items-stretch @min-[60rem]/canon:gap-3 @min-[60rem]/canon:sticky @min-[60rem]/canon:top-0 @min-[60rem]/canon:w-56 @min-[60rem]/canon:shrink-0 @min-[60rem]/canon:self-start">
        <CanonContents :active="active" :counts="counts" :arc-label="arcLabel" @select="goTo" @clear-arc="ui.arcFilter = null" />
        <CanonArcs v-if="ready && (searching || ARC_NARROWED_SECTIONS.includes(active))" />
        <!-- The next session under the contents; below that the header has the button instead. -->
        <div class="hidden @min-[60rem]/canon:block"><CanonNextSession /></div>
      </div>

      <!-- Centred in the room beside the contents, never hugging the left with an empty right half. -->
      <div class="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-8">
        <ListSkeleton v-if="isLoading || campaign === null" variant="rows" :count="4" />
        <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load the canon.</p>
        <template v-else>
          <!-- What the Familiar's whole-canon read found (asked for in Ask Grimoire), above whichever chapter is open. -->
          <CanonReview mode="read" />
          <CanonSearchResults v-if="searching" class="mx-auto w-full max-w-3xl" :groups="hitGroups" :query="ui.query" @open="ui.query = ''" />
          <!-- A new canon is led in by the page itself, until its four steps are done or the DM skips them. -->
          <CanonWayIn v-else-if="showWayIn" :entries="entries" :clues="allClues ?? []" :calendar-id="campaign?.calendar_id ?? null" />
          <template v-else>
            <TruthsChapter
              v-if="active === 'truths'"
              :truths="shownTruths"
              :all-truths="truths"
              :selected="selectedTruth"
              :arc-label="arcLabel"
              @select="select"
              @close="closeEntry"
              @delete="removeSelected"
            />
            <ArcsChapter v-else-if="active === 'arcs'" />
            <ForcesChapter v-else-if="active === 'moving'" :forces="shownForces" :arc-label="arcLabel" :selected="selectedForce" @select="select" @close="closeEntry" @delete="removeSelected" />
            <SecretsChapter v-else-if="active === 'secrets'" :secrets="shownSecrets" :questions="shownQuestions" :selected="selectedSecret" :arc-label="arcLabel" @select="select" @close="closeEntry" @delete="removeSelected" />
            <LoreChapter v-else-if="active === 'lore'" :lore="shownLore" :selected="selectedLore" :arc-label="arcLabel" @select="select" @close="closeEntry" @delete="removeSelected" />
            <BackstoriesChapter v-else-if="active === 'backstories'" :party="party" :entries="backstories" :passages="allPassages ?? []" :selected-id="selectedBackstoryMember?.id ?? null" @select="selectBackstory" @close="closeEntry" />
            <PremiseChapter v-else-if="active === 'premise'" :campaign="campaign" :entries="entries" />
            <WorldChapter v-else-if="active === 'world'" />
            <TimelineChapter v-else-if="active === 'timeline'" :arc-label="arcLabel" />
            <PeoplesChapter v-else-if="active === 'peoples'" />
            <LifeChapter v-else />
          </template>
        </template>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * The DM's Canon page (#1226, rebuilt in #1267): the campaign's background book, one chapter at a time, chosen in the
 * contents (a column from 60rem of the page, a grouped picker below). The chapter is the route, `/canon/:part`; `/canon` opens the one the DM
 * was last on. `?entry=<id>` is the link to one entry (search results and the world web point there) and also the page's
 * own selection, which opens beside the chapter's list; it, `?section=<chapter>` and `?backstory=<member>` on a bare
 * `/canon` resolve to the chapter that holds them. One search in the header finds a word in any title or body, and
 * stands in place of the chapter while it is set.
 */
import { computed, nextTick, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/list/PageHeader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonArcs from "@/components/canon/CanonArcs.vue";
import CanonSearchResults from "@/components/canon/CanonSearchResults.vue";
import CanonSearchField from "@/components/canon/CanonSearchField.vue";
import CanonNextSession from "@/components/canon/CanonNextSession.vue";
import CanonOpenAsBook from "@/components/canon/CanonOpenAsBook.vue";
import CanonReview from "@/components/canon/CanonReview.vue";
import CanonWayIn from "@/components/canon/CanonWayIn.vue";
import CanonContents from "@/components/canon/CanonContents.vue";
import ArcsChapter from "@/components/canon/ArcsChapter.vue";
import BackstoriesChapter from "@/components/canon/BackstoriesChapter.vue";
import ForcesChapter from "@/components/canon/ForcesChapter.vue";
import LoreChapter from "@/components/canon/LoreChapter.vue";
import PremiseChapter from "@/components/canon/PremiseChapter.vue";
import SecretsChapter from "@/components/canon/SecretsChapter.vue";
import TruthsChapter from "@/components/canon/TruthsChapter.vue";
import WorldChapter from "@/components/canon/WorldChapter.vue";
import TimelineChapter from "@/components/canon/TimelineChapter.vue";
import LifeChapter from "@/components/canon/ecology/LifeChapter.vue";
import PeoplesChapter from "@/components/canon/ecology/PeoplesChapter.vue";
import { narrowToArc } from "@/lib/canon/canonNarrow";
import { isNewCanon, wayInSteps } from "@/lib/canon/canonWayIn";
import { searchCanon } from "@/lib/canon/canonSearch";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { useCampaignPeoples } from "@/composables/canon/useCampaignPeoples";
import { useTableFacts } from "@/composables/canon/useTableFacts";
import { useCanonUiStore } from "@/stores/ui/canon";
import { ARC_NARROWED_SECTIONS, isSectionId, sectionCounts, sectionFromWord, sectionOfPart, type CanonSectionId } from "@/lib/canon/canonParts";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries, useTrashCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useParty } from "@/composables/party/useParty";
import { IconMoon, IconUpload } from "@/lib/icons";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import { prefersReducedMotion } from "@/lib/motion";
import { scrollWithin } from "@/lib/scrollParent";

const route = useRoute();
const router = useRouter();
const campaign = computed(() => useCampaignStore().activeCampaign);

const { data, isLoading, isError } = useCanonEntries();
const entries = computed(() => data.value ?? []);
const truths = computed(() => entries.value.filter((e) => e.part === "truth"));
const forces = computed(() => entries.value.filter((e) => e.part === "force"));
const secrets = computed(() => entries.value.filter((e) => e.part === "secret"));
const lore = computed(() => entries.value.filter((e) => e.part === "lore"));
const backstories = computed(() => entries.value.filter((e) => e.part === "backstory"));
const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const { data: allPassages } = useCanonPassages();
const { data: allClues, isSuccess: cluesLoaded } = useCanonClues();
// Only once the canon and its clues have loaded, or a canon still on its way would flash as new.
const showWayIn = computed(() => {
  const id = campaign.value?.id;
  if (id === undefined || !ready.value || !cluesLoaded.value) return false;
  // Only in place of the first chapter: choosing any other in the contents must open it. In front of every chapter it
  // trapped the DM on one landing page that no click could leave (production, 24 Nov 2026).
  if (active.value !== "premise") return false;
  return isNewCanon(entries.value, wayInSteps(entries.value, allClues.value ?? [])) && ui.wayInDismissed[id] !== true;
});
const { data: forceData } = useCanonForceData();

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

// The contents count what the narrowed chapters show, so its numbers match the lists under the arc.
const counts = computed(() => ({
  // The arcs chapter counts the arcs themselves, which are not entries.
  ...sectionCounts(narrowed.value, arcs.value?.length ?? 0),
  // One backstory per character, opened or not: the contents count the characters.
  backstories: party.value.length,
}));

// The page's one search: it reads the arc-narrowed canon, and the clues, force steps and passages of what it reads.
const searching = computed(() => ui.query.trim() !== "");
const { peoples } = useCampaignPeoples();
const { habitats } = useCampaignHabitats();
const { facts: tableFacts } = useTableFacts();
const hitGroups = computed(() =>
  searching.value
    ? searchCanon(ui.query, {
        entries: narrowed.value,
        clues: allClues.value ?? [],
        steps: forceData.value?.steps ?? [],
        passages: allPassages.value ?? [],
        arcs: arcs.value ?? [],
        peoples: peoples.value,
        habitats: habitats.value,
        facts: tableFacts.data.value ?? [],
      })
    : [],
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

// A chapter opens at its top; an entry link scrolls to its own row below instead.
watch(active, async () => {
  if (entryParam.value !== null) return;
  await nextTick();
  const top = document.getElementById("canon-page-top");
  if (top) scrollWithin(top, { block: "start", smooth: !prefersReducedMotion() });
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
  if (row) scrollWithin(row, { block: "center", smooth: !prefersReducedMotion() });
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
  // The chapter's entry wrapper: beside the list from 56rem of the chapter, in place of it below that.
  const detail = document.getElementById("canon-inline-detail");
  if (detail) scrollWithin(detail, { block: "nearest", smooth: !prefersReducedMotion() });
});

watch(
  () => (ready.value ? selectedBackstoryMember.value?.id : undefined),
  async (memberId) => {
    if (!memberId) return;
    await nextTick();
    const detail = document.getElementById("canon-inline-detail");
    if (detail) scrollWithin(detail, { block: "nearest" });
  },
  { immediate: true },
);
</script>
