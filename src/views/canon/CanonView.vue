<template>
  <PageHeader owns-phone-bar title="Canon" description="The campaign's background book: what is true, what you keep back, and how it feels to play.">
    <template #actions>
      <CanonSearchField class="w-72" />
      <AppButton to="/canon/import" variant="outline" size="md" :icon="IconUpload" label="Bring in a book" />
    </template>
    <!-- The header holds these from a tablet up; a phone's header is the page's own bar, so they sit under the title where a thumb finds them. -->
    <div class="mb-4 flex flex-col gap-2 md:hidden" data-testid="canon-phone-actions">
      <CanonSearchField />
      <AppButton to="/canon/import" variant="outline" size="sm" :icon="IconUpload" label="Bring in a book" class="self-start" />
    </div>

    <div id="canon-page-top" class="flex flex-col gap-4 min-[90rem]:flex-row min-[90rem]:items-start min-[90rem]:gap-6">
      <!-- The contents: a column from 90rem (kept in sight), a chapter picker above the chapter below it. The arc filter is page-wide, so it sits with it. -->
      <div class="flex min-w-0 flex-col gap-3 min-[90rem]:sticky min-[90rem]:top-0 min-[90rem]:w-56 min-[90rem]:shrink-0 min-[90rem]:self-start">
        <CanonContents :active="active" :counts="counts" @select="goTo" />
        <CanonArcs v-if="ready && (searching || ARC_NARROWED_SECTIONS.includes(active))" />
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-8">
        <ListSkeleton v-if="isLoading || campaign === null" variant="rows" :count="4" />
        <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load the canon.</p>
        <template v-else>
          <CanonSearchResults v-if="searching" class="max-w-3xl" :groups="hitGroups" :query="ui.query" @open="ui.query = ''" />
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
            <CanonChapter
              v-else-if="LIST_CHAPTERS.includes(active)"
              :chapter="active"
              :title="chapter.label"
              :why="chapter.why"
              :open="openEntryId !== null"
              :back-label="chapter.label"
              @close="closeEntry"
            >
              <ForcesSection v-if="active === 'moving'" :forces="shownForces" :arc-label="arcLabel" :selected-id="selectedForce?.id ?? null" @select="select" />
              <SecretsSection v-else-if="active === 'secrets'" :secrets="shownSecrets" :questions="shownQuestions" :arc-label="arcLabel" :selected-id="selectedSecret?.id ?? null" @select="select" />
              <LoreSection v-else-if="active === 'lore'" :lore="shownLore" :arc-label="arcLabel" :selected-id="selectedLore?.id ?? null" @select="select" />
              <BackstoriesSection v-else :party="party" :entries="backstories" :passages="allPassages ?? []" :selected-id="selectedBackstoryMember?.id ?? null" @select="selectBackstory" />
              <template #entry>
                <ForceDetail v-if="active === 'moving' && selectedForce" :key="selectedForce.id" :entry="selectedForce" @delete="removeSelected" />
                <SecretDetail v-else-if="active === 'secrets' && selectedSecret" :key="selectedSecret.id" :entry="selectedSecret" @delete="removeSelected" />
                <LoreDetail v-else-if="active === 'lore' && selectedLore" :key="selectedLore.id" :entry="selectedLore" @delete="removeSelected" />
                <BackstoryDetail v-else-if="active === 'backstories' && selectedBackstoryMember" :key="selectedBackstoryMember.id" :member="selectedBackstoryMember" />
              </template>
            </CanonChapter>
            <PremiseSection v-else-if="active === 'premise'" class="max-w-3xl" :campaign="campaign" :entries="entries" />
            <WorldWorksSection v-else-if="active === 'world'" class="max-w-3xl" />
            <section v-else class="flex max-w-3xl flex-col gap-3" :aria-labelledby="`canon-${active}-heading`" :data-chapter="active">
              <header class="flex flex-col gap-0.5">
                <h2 :id="`canon-${active}-heading`" class="m-0 text-heading-sm font-bold">{{ chapter.label }}</h2>
                <p class="m-0 text-caption italic text-muted-foreground">{{ chapter.why }}</p>
              </header>
              <WorldPeoples v-if="active === 'peoples'" />
              <HabitatsPanel v-else />
            </section>
            <CanonDeleted />
          </template>
        </template>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * The DM's Canon page (#1226, rebuilt in #1267): the campaign's background book, one chapter at a time, chosen in the
 * contents (a column from 90rem, a picker below). The chapter is the route, `/canon/:part`; `/canon` opens the one the DM
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
import BackstoriesSection from "@/components/canon/BackstoriesSection.vue";
import BackstoryDetail from "@/components/canon/BackstoryDetail.vue";
import CanonArcs from "@/components/canon/CanonArcs.vue";
import CanonSearchResults from "@/components/canon/CanonSearchResults.vue";
import CanonChapter from "@/components/canon/kit/CanonChapter.vue";
import CanonSearchField from "@/components/canon/CanonSearchField.vue";
import CanonDeleted from "@/components/canon/CanonDeleted.vue";
import CanonContents from "@/components/canon/CanonContents.vue";
import ForceDetail from "@/components/canon/ForceDetail.vue";
import ForcesSection from "@/components/canon/ForcesSection.vue";
import LoreDetail from "@/components/canon/LoreDetail.vue";
import LoreSection from "@/components/canon/LoreSection.vue";
import PremiseSection from "@/components/canon/PremiseSection.vue";
import SecretDetail from "@/components/canon/SecretDetail.vue";
import SecretsSection from "@/components/canon/SecretsSection.vue";
import TruthsChapter from "@/components/canon/TruthsChapter.vue";
import WorldWorksSection from "@/components/canon/WorldWorksSection.vue";
import HabitatsPanel from "@/components/canon/ecology/HabitatsPanel.vue";
import WorldPeoples from "@/components/canon/WorldPeoples.vue";
import { narrowToArc } from "@/lib/canon/canonNarrow";
import { searchCanon } from "@/lib/canon/canonSearch";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCanonUiStore } from "@/stores/ui/canon";
import { ARC_NARROWED_SECTIONS, chapterOf, isSectionId, sectionCounts, sectionFromWord, sectionOfPart, type CanonSectionId } from "@/lib/canon/canonParts";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries, useTrashCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useParty } from "@/composables/party/useParty";
import { IconUpload } from "@/lib/icons";
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
const { data: allClues } = useCanonClues();
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
  ...sectionCounts(narrowed.value),
  // One backstory per character, opened or not: the contents count the characters.
  backstories: party.value.length,
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

// The chapters that are a list of entries, and which entry is open in the chapter on screen (the chapter lays itself out).
const LIST_CHAPTERS: readonly CanonSectionId[] = ["moving", "secrets", "lore", "backstories"];
const chapter = computed(() => chapterOf(active.value));
const openEntryId = computed(() => {
  switch (active.value) {
    case "moving": return selectedForce.value?.id ?? null;
    case "secrets": return selectedSecret.value?.id ?? null;
    case "lore": return selectedLore.value?.id ?? null;
    case "backstories": return selectedBackstoryMember.value?.id ?? null;
    default: return null;
  }
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
