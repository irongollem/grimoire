<template>
  <section class="flex flex-col gap-5" aria-label="Choose what goes in">
    <header class="flex items-end justify-between gap-3">
      <div>
        <span class="text-eyebrow text-muted-foreground">Open Book · {{ book?.title ?? "" }}</span>
        <h2 class="text-display">Choose what goes in</h2>
      </div>
      <AppButton variant="ghost" size="sm" label="Done" @click="emit('close')" />
    </header>

    <ListSkeleton v-if="isPending" variant="rows" :count="8" :columns="1" />
    <NoticeCard v-else-if="loadError" title="The entries could not be loaded">{{ loadError }}</NoticeCard>
    <EmptyState
      v-else-if="!book"
      title="No book yet"
      description="Set up the book first; then you can choose what goes in it."
    />
    <div v-else class="grid min-h-0 gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <PickerChapterNav v-model="chapter" :counts="counts" :enabled="book.chapters" />
      <div class="flex min-w-0 flex-col gap-3.5">
        <PickerFilters
          v-model:search="search"
          v-model:place-id="placeId"
          v-model:audience="audience"
          v-model:not-in-book="notInBook"
          :place-options="placeOptions"
          :has-active-filters="filtersActive"
          @clear="clearFilters"
        />
        <PickerRowList
          :rows="shown"
          :selected="selectedIds"
          :heading="`${shown.length} ${shown.length === 1 ? 'entry' : 'entries'} shown`"
          @toggle="toggle"
          @toggle-all="(checked) => (checked ? selectAll(shownKeys) : clear())"
        />
        <PickerActionBar
          :summary="summary"
          :busy="busy"
          :has-party="partyIds.length > 0"
          @take-out="takeOut"
          @add-eligible="addEligible"
          @share-and-add="shareAndAdd"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * "Choose what goes in" (#1085, `Fill.dc.html`): the bulk picker for the Open Book, so a DM never toggles 500
 * entries one by one. Chapters with in/total counts on the left; search and filters over the list; a row per entry
 * with who sees it at the table and whether it is in the book; a bar of what the selection can do.
 *
 * Wiring only. Rows, filters, counts and the writes a press means live in `lib/openBook/pickerRows.ts`.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import NoticeCard from "@/components/common/feedback/NoticeCard.vue";
import PickerActionBar from "./picker/PickerActionBar.vue";
import PickerChapterNav from "./picker/PickerChapterNav.vue";
import PickerFilters from "./picker/PickerFilters.vue";
import PickerRowList from "./picker/PickerRowList.vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useAllDeities, useAllPantheons } from "@/composables/deities/useDeities";
import { useNotes } from "@/composables/notes/useNotes";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useOpenBook } from "@/composables/openBook/useOpenBook";
import { useClearOpenBookEntries, useOpenBookEntries, useSetOpenBookEntries } from "@/composables/openBook/useOpenBookEntries";
import { useLocationVisibility, useShareWithParty } from "@/composables/openBook/useOpenBookShare";
import { useParty } from "@/composables/party/useParty";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import {
  NO_FILTER,
  buildPickerRows,
  chapterCounts,
  filterRows,
  hasActiveFilters,
  idsByType,
  placeSubtreeIds,
  planEntryWrites,
  summariseSelection,
  type AudienceFilter,
  type EntryWrites,
  type PickerRow,
} from "@/lib/openBook/pickerRows";
import { pluralizeCount } from "@/lib/utils";
import type { OpenBookChapter } from "@/types/openBook.types";

const { campaignId } = defineProps<{ campaignId: string }>();
const emit = defineEmits<{ close: [] }>();

const { data: book, isPending: bookPending, error: bookError } = useOpenBook(() => campaignId);
const { data: entries, isPending: entriesPending, error: entriesError } = useOpenBookEntries(() => campaignId);
const { data: party, isPending: partyPending, error: partyError } = useParty();
const { data: locations, isPending: locationsPending, error: locationsError } = useAllLocations();
const { data: visibility, isPending: visibilityPending, error: visibilityError } = useLocationVisibility(() => campaignId);
const { data: npcs, isPending: npcsPending, error: npcsError } = useNpcs();
const { data: factions, isPending: factionsPending, error: factionsError } = useAllFactions();
const { data: pantheons, isPending: pantheonsPending, error: pantheonsError } = useAllPantheons();
const { data: deities, isPending: deitiesPending, error: deitiesError } = useAllDeities();
const { data: notes, isPending: notesPending, error: notesError } = useNotes();

const isPending = computed(
  () =>
    bookPending.value || entriesPending.value || partyPending.value || locationsPending.value || visibilityPending.value ||
    npcsPending.value || factionsPending.value || pantheonsPending.value || deitiesPending.value || notesPending.value,
);
const loadError = computed(() => {
  const error = [
    bookError, entriesError, partyError, locationsError, visibilityError, npcsError, factionsError, pantheonsError,
    deitiesError, notesError,
  ].find((e) => e.value)?.value;
  return error ? "Close this and try again." : null;
});

const partyIds = computed(() => (party.value ?? []).map((member) => member.id));

/** Places of this campaign only: the Atlas list also carries general places that no book snapshot holds. */
const places = computed(() => {
  const shown = new Map((visibility.value ?? []).map((v) => [v.id, v.player_visible_to]));
  return (locations.value ?? [])
    .filter((l) => shown.has(l.id))
    .map((l) => ({ id: l.id, parent_id: l.parent_id, name: l.name, player_visible_to: shown.get(l.id) ?? [] }));
});

const rows = computed<PickerRow[]>(() =>
  buildPickerRows(
    {
      locations: places.value,
      npcs: npcs.value ?? [],
      factions: factions.value ?? [],
      pantheons: pantheons.value ?? [],
      deities: deities.value ?? [],
      notes: notes.value ?? [],
    },
    entries.value ?? [],
    { includeShared: book.value?.include_shared ?? true },
    partyIds.value,
  ),
);

// Dialog-scoped filters: a picker that reopens on last time's search is the bug, so none of this goes in a store.
const chapter = ref<OpenBookChapter | null>(null);
const search = ref(NO_FILTER.search);
const placeId = ref("");
const audience = ref<AudienceFilter>(NO_FILTER.audience);
const notInBook = ref(NO_FILTER.notInBook);

const filter = computed(() => ({
  chapter: chapter.value,
  search: search.value,
  placeIds: placeId.value === "" ? null : placeSubtreeIds(places.value, placeId.value),
  audience: audience.value,
  notInBook: notInBook.value,
}));
const filtersActive = computed(() => hasActiveFilters(filter.value));
function clearFilters() {
  search.value = NO_FILTER.search;
  placeId.value = "";
  audience.value = NO_FILTER.audience;
  notInBook.value = NO_FILTER.notInBook;
}

const counts = computed(() => chapterCounts(rows.value));
const shown = computed(() => filterRows(rows.value, filter.value));
const shownKeys = computed(() => shown.value.map((row) => row.key));
const placeOptions = computed(() => [
  { id: "", name: "Anywhere" },
  ...rows.value.filter((r) => r.type === "location").map((r) => ({ id: r.id, name: `${"– ".repeat(r.depth)}${r.name}` })),
]);

// A selection only ever holds rows the DM can see: a filter that hides a ticked row unticks it.
const { selectedIds, toggle, selectAll, clear, pruneTo } = useBulkSelection();
watch(shownKeys, (keys) => pruneTo(keys));
const summary = computed(() => summariseSelection(shown.value, selectedIds.value));
const selectedRows = () => shown.value.filter((row) => selectedIds.value.has(row.key));

const setEntries = useSetOpenBookEntries();
const clearEntries = useClearOpenBookEntries();
const share = useShareWithParty();
const busy = computed(() => setEntries.isPending.value || clearEntries.isPending.value || share.isPending.value);
const toast = useToast();
const { confirm } = useConfirm();

async function applyWrites(writes: EntryWrites[]) {
  for (const { type, upsertIds, clearIds } of writes) {
    // `included` is the same for every upsert of one press: it is the opposite of the default, by construction.
    if (upsertIds.length > 0) {
      await setEntries.mutateAsync({ campaignId, entityType: type, ids: upsertIds, included: !includeShared() });
    }
    if (clearIds.length > 0) await clearEntries.mutateAsync({ campaignId, entityType: type, ids: clearIds });
  }
}
const includeShared = () => book.value?.include_shared ?? true;

async function put(rowsToChange: PickerRow[], want: boolean, done: string) {
  try {
    await applyWrites(planEntryWrites(rowsToChange, want, includeShared()));
    toast.success(done);
    clear();
  } catch (e) {
    toast.error(toast.fromError(e, "The book could not be changed."));
  }
}

function takeOut() {
  const picked = selectedRows();
  return put(picked, false, `Took ${pluralizeCount(picked.length, "entry", "entries")} out of the book.`);
}

function addEligible() {
  const picked = selectedRows().filter((row) => row.eligible);
  return put(picked, true, `Added ${pluralizeCount(picked.length, "entry", "entries")} to the book.`);
}

async function shareAndAdd() {
  const picked = selectedRows();
  if (picked.length === 0 || partyIds.value.length === 0) return;
  const ok = await confirm(
    `This shows ${pluralizeCount(picked.length, "entry", "entries")} to every player in the party, at the table as well as in the book.`,
    { title: "Share with the whole party?", confirmLabel: "Share and add", danger: false },
  );
  if (!ok) return;
  try {
    const seedNpcFields = new Set((npcs.value ?? []).filter((n) => n.player_visible_fields.length === 0).map((n) => n.id));
    await share.mutateAsync({
      partyIds: partyIds.value,
      targets: [...idsByType(picked)].map(([type, ids]) => ({ type, ids })),
      seedNpcFields,
    });
  } catch (e) {
    toast.error(toast.fromError(e, "The entries could not be shared."));
    return;
  }
  // Everything picked can be seen by the whole party now, so all of it may go in.
  await put(
    picked.map((row) => ({ ...row, eligible: true })),
    true,
    `Shared ${pluralizeCount(picked.length, "entry", "entries")} with the party and added them to the book.`,
  );
}
</script>
