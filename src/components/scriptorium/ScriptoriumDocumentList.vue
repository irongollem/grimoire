<template>
  <div>
    <!-- Filters bar -->
    <ListFilterBar
      class="mb-5"
      :has-active-filters="scriptoriumUi.scriptoriumHasActiveFilters"
      @clear="scriptoriumUi.resetScriptoriumFilters()"
    >
      <SegmentedControl v-model="kindFilter" :options="KIND_OPTIONS" size="sm" aria-label="Show" />
      <ListSearchInput v-model="scriptoriumUi.scriptoriumSearch" placeholder="Search documents…" />
      <!--
        Ten doc types is past what a segmented group can hold: joined segments
        do not wrap, so at md widths the tail gets clipped. Same call the
        Bestiary makes for its 14 creature types — a native select lists them
        compactly and opens the OS picker on touch.
      -->
      <ListFilterSelect v-model="typeFilter" aria-label="Document type filter">
        <option v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
      </ListFilterSelect>
      <ListFilterSelect v-model="scopeFilter" aria-label="Scope filter">
        <option value="">Usable here</option>
        <option value="campaign">This campaign</option>
        <option value="general">General</option>
        <option value="other_campaign">Other campaigns</option>
      </ListFilterSelect>
    </ListFilterBar>

    <ListSkeleton v-if="isLoading" :variant="layout === 'rows' ? 'tiles' : 'text'" :columns="layout === 'rows' ? 1 : 4" />

    <EmptyState
      v-else-if="!filtered.length && !scriptoriumUi.scriptoriumHasActiveFilters"
      title="The scriptorium awaits"
      :description="canWrite
        ? 'Make a handout for your players, a letter, a notice or a page from a journal, or a book of chapters for your table. Start with New handout or New book above.'
        : 'Make handouts and books with the look of the official ones. Writing needs a tablet or desktop screen.'"
    >
      <template #icon><IconNavScriptorium class="h-16 w-16" /></template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No documents match your filters.
    </p>

    <EntityCollection
      v-else
      :items="filtered"
      :item-key="docKey"
      :layout="layout"
      :grid-columns="columns"
      :grid-row-estimate="DOC_ROW_PX"
    >
      <template #row="{ item: doc }">
        <EntityListRow
          :to="`/scriptorium/${doc.id}`"
          :title="doc.title"
          :subtitle="documentMeta(doc, partyNames)"
          :fallback-icon="IconNavScriptorium"
          :tags="docRowTags(doc)"
          :max-tags="5"
          :locked="lockedDocIds.has(doc.id)"
        >
          <template #actions>
            <AppButton
              variant="ghost"
              size="icon-xs"
              :icon="IconDelete"
              tooltip="Delete document"
              aria-label="Delete document"
              @click="confirmDelete(doc.id, doc.title)"
            />
          </template>
        </EntityListRow>
      </template>
      <template #card="{ item: doc }">
      <div
        class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Card link overlay (disabled for locked items) -->
        <RouterLink v-if="!lockedDocIds.has(doc.id)" :to="`/scriptorium/${doc.id}`" class="absolute inset-0 z-2" />

        <!-- Locked overlay for over-quota items -->
        <div
          v-if="lockedDocIds.has(doc.id)"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-sm"
        >
          <IconLock class="h-4 w-4 text-muted-foreground" />
          <p class="text-label font-semibold text-muted-foreground">Locked</p>
          <RouterLink to="/billing" class="text-label text-primary/80 hover:text-primary transition-colors">
            Upgrade to access
          </RouterLink>
        </div>

        <div class="p-4 flex flex-col gap-1.5 flex-1">
          <span
            class="text-eyebrow"
            :class="doc.kind === 'handout' ? 'text-ink-caution' : 'text-primary'"
          >
            {{ KIND_LABELS[doc.kind] }}
          </span>
          <h3 class="text-heading-xs font-bold text-foreground leading-tight line-clamp-2">
            {{ doc.title }}
          </h3>
          <p class="text-caption text-muted-foreground">{{ documentMeta(doc, partyNames) }}</p>

          <!-- Scope hint: only for a document scoped to a campaign other than
               the active one, where "whose is this" is not otherwise visible. -->
          <p
            v-if="otherCampaignName(doc)"
            class="text-caption text-muted-foreground italic truncate"
          >
            {{ otherCampaignName(doc) }}
          </p>

          <p class="mt-auto pt-1 text-caption text-muted-foreground">
            {{ formatDate(doc.updated_at) }}
          </p>
        </div>

        <button
          type="button"
          class="absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center bg-card/80 border border-border text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-all"
          title="Delete document"
          @click.prevent="confirmDelete(doc.id, doc.title)"
        >
          <IconDelete class="h-3 w-3" />
        </button>
      </div>
      </template>
    </EntityCollection>

    <p
      v-if="filtered.length"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ docs?.length ?? 0 }} documents
    </p>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { IconDelete, IconLock, IconNavScriptorium } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import {
  useScriptoriumDocuments,
  useDeleteScriptoriumDocument,
} from "@/composables/scriptorium/useScriptorium";
import { useScriptoriumUiStore } from "@/stores/ui/scriptorium";
import { useCampaignStore } from "@/stores/campaign";
import { useAllDmCampaigns } from "@/composables/campaign/useCampaigns";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import { useListLayout } from "@/composables/useListLayout";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import ListFilterBar from "@/components/common/list/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/list/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { useAbove } from "@/composables/useBreakpoint";
import type { ScriptoriumDocType, ScriptoriumDocumentSummary, ScriptoriumKind } from "@/types/scriptorium.types";
import { DOC_TYPE_OPTIONS } from "@/lib/scriptorium/editorConstants";
import { documentMeta, KIND_LABELS } from "@/lib/scriptorium/documentCardMeta";
import { useParty } from "@/composables/party/useParty";
import { documentScopeOf, isDocumentUsableIn } from "@/lib/scriptorium/documentScope";

// Mirrors the `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` this grid used to carry.
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
// The page header's toggle writes the same key.
const layout = useListLayout("scriptorium", "grid");
const docKey = (doc: ScriptoriumDocumentSummary) => doc.id;

// Row height before a row is measured (px): 1px border x2 + p-4 (32) + kind
// eyebrow (16) + two title lines (35) + meta line (17) + date (4 pt-1 + 17) +
// four gap-1.5 (24) = 147; rows are re-measured as they mount.
const DOC_ROW_PX = 147;
const { quota: docQuota } = useQuota("scriptorium_documents");
// Writing needs a larger screen (#915 story 7): the phone list is a reader.
const canWrite = useAbove("md");

// Derived from DOC_TYPES so the filter cannot fall behind the create dropdown:
// a hand-kept copy here once omitted Subclass, Species and Quest, leaving those
// documents creatable but impossible to filter to.
const TYPE_OPTIONS = [{ value: "all", label: "All" }, ...DOC_TYPE_OPTIONS] as const;

// Filter State Pattern — search + type survive opening a document and coming back.
const scriptoriumUi = useScriptoriumUiStore();

// ListFilterSelect models a plain string; the store keeps the narrower union.
const typeFilter = computed({
  get: () => scriptoriumUi.scriptoriumFilterType as string,
  set: (v) => { scriptoriumUi.scriptoriumFilterType = v as ScriptoriumDocType | "all"; },
});
const KIND_OPTIONS: SegmentedOption<ScriptoriumKind | "all">[] = [
  { value: "all", label: "All" },
  { value: "handout", label: "Handouts" },
  { value: "book", label: "Books" },
];
const kindFilter = computed({
  get: () => scriptoriumUi.scriptoriumFilterKind,
  set: (v) => { scriptoriumUi.scriptoriumFilterKind = v; },
});
const scopeFilter = computed({
  get: () => scriptoriumUi.scriptoriumFilterScope,
  set: (v) => { scriptoriumUi.scriptoriumFilterScope = v; },
});

// Who holds a handout is read off the active party; a holder from another campaign is counted, not named.
const { data: partyData } = useParty();
const partyNames = computed(() => new Map((partyData.value ?? []).map((m) => [m.id, m.name])));

const { data: docs, isLoading } = useScriptoriumDocuments();
const { mutateAsync: deleteDoc } = useDeleteScriptoriumDocument();
const { activeCampaignId } = storeToRefs(useCampaignStore());

// A document scoped to another campaign can only be one this account DMs
// (RLS is owner-only) — the "Other campaigns" name hint. Archived campaigns
// included on purpose: a document does not stop being theirs when the
// campaign that owns it is archived.
const { data: allDmCampaigns } = useAllDmCampaigns();
const campaignNameById = computed(() => {
  const map = new Map<string, string>();
  for (const c of allDmCampaigns.value ?? []) map.set(c.id, c.name);
  return map;
});
function otherCampaignName(doc: ScriptoriumDocumentSummary): string | null {
  if (doc.campaign_id === null) return null;
  if (documentScopeOf(doc, activeCampaignId.value) !== "other_campaign") return null;
  return campaignNameById.value.get(doc.campaign_id) ?? null;
}

const lockedDocIds = computed((): Set<string> => {
  const q = docQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const sorted = [...(docs.value ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map((d) => d.id));
});

// Row text: the card's own line, and its badges as tags.
function docRowTags(doc: ScriptoriumDocumentSummary): string[] {
  const tags: string[] = [KIND_LABELS[doc.kind]];
  if (doc.is_published) tags.push("Published");
  const other = otherCampaignName(doc);
  if (other) tags.push(other);
  return [...tags, ...doc.tags];
}

async function confirmDelete(id: string, title: string) {
  if (!(await confirm(`Delete "${title}"? This cannot be undone.`))) return;
  await deleteDoc(id);
}

const filtered = computed(() => {
  let list = docs.value ?? [];
  list = scriptoriumUi.scriptoriumFilterScope
    ? list.filter((d) => documentScopeOf(d, activeCampaignId.value) === scriptoriumUi.scriptoriumFilterScope)
    : list.filter((d) => isDocumentUsableIn(d, activeCampaignId.value));
  if (scriptoriumUi.scriptoriumSearch.trim()) {
    const q = scriptoriumUi.scriptoriumSearch.trim().toLowerCase();
    list = list.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (scriptoriumUi.scriptoriumFilterKind !== "all")
    list = list.filter((d) => d.kind === scriptoriumUi.scriptoriumFilterKind);
  if (scriptoriumUi.scriptoriumFilterType !== "all")
    list = list.filter((d) => d.doc_type === scriptoriumUi.scriptoriumFilterType);
  return list;
});


function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
</script>
