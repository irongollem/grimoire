<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h2 class="truncate text-heading-sm font-bold text-foreground">{{ importRow.display_name }}</h2>
      <WizardStepIndicator :steps="WIZARD_STEPS" :current-index="displayedIndex" />
    </div>

    <p v-if="errorMessage" class="text-caption text-destructive">{{ errorMessage }}</p>

    <!-- ── A kind step ─────────────────────────────────────────────────────── -->
    <template v-if="currentKind && currentEntry">
      <p v-if="droppedCount > 0" class="text-caption text-muted-foreground">
        {{ droppedCount }} {{ droppedCount === 1 ? "entry" : "entries" }} in this section couldn't be read and
        {{ droppedCount === 1 ? "was" : "were" }} skipped.
      </p>

      <!-- Result banner — only shown when the import needs the DM's attention -->
      <div v-if="pendingProgress" class="space-y-3 rounded-lg border border-destructive/40 bg-card p-4">
        <p class="text-body text-foreground">This step finished, but its progress was not saved.</p>
        <p class="text-caption text-muted-foreground">
          Retry saving before continuing. This does not import the rows again.
        </p>
        <div class="flex justify-end">
          <AppButton
            variant="primary"
            size="md"
            label="Retry saving progress"
            :loading="isImporting"
            @click="retryPendingProgress"
          />
        </div>
      </div>

      <div v-else-if="phase === 'result' && lastReport" class="space-y-3 rounded-lg border border-border bg-card p-4">
        <div class="flex items-center gap-2">
          <IconWarning v-if="lastReport.stoppedAtQuota" class="h-4 w-4 shrink-0 text-tone-caution" />
          <IconCircleCheck v-else class="h-4 w-4 shrink-0 text-tone-success" />
          <p class="text-body text-foreground">
            {{ lastReport.imported }} of {{ lastReport.planned }} {{ currentEntry.labelPlural.toLowerCase() }} created.
          </p>
        </div>
        <p v-if="lastLinkedCount > 0" class="text-caption text-muted-foreground">
          {{ lastLinkedCount }} more {{ lastLinkedCount === 1 ? "was" : "were" }} already in your campaign or the
          shared library and got linked instead of duplicated.
        </p>
        <p v-if="lastReport.stoppedAtQuota" class="text-caption text-muted-foreground">
          Your plan's limit for {{ currentEntry.labelPlural.toLowerCase() }} was reached, so the rest of this batch
          was not attempted. The ones already created are safe — upgrade or free up room to bring in the rest.
        </p>
        <p v-else-if="lastReport.imported < lastReport.planned" class="text-caption text-muted-foreground">
          {{ lastReport.planned - lastReport.imported }} couldn't be imported and can be revisited after this
          finishes.
        </p>
        <p v-if="unresolvedLinkNames.length" class="text-caption text-muted-foreground">
          Couldn't match a reference to: {{ unresolvedLinkNames.join(", ") }}.
        </p>
        <div class="flex justify-end">
          <AppButton variant="primary" size="md" label="Continue" @click="advanceDisplayedStep" />
        </div>
      </div>

      <!-- Review grid -->
      <template v-else>
        <EmptyState
          v-if="usableEntities.length === 0"
          :title="`No ${currentEntry.labelPlural.toLowerCase()} found`"
          :description="`This document didn't yield any ${currentEntry.labelPlural.toLowerCase()}.`"
        >
          <template #action>
            <AppButton variant="primary" size="md" label="Continue" :loading="isImporting" @click="skipStep" />
          </template>
        </EmptyState>

        <template v-else>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-body text-muted-foreground">{{ selectedCount }} of {{ usableEntities.length }} selected</p>
            <div class="flex items-center gap-2">
              <AppButton variant="ghost" size="inline" label="Select all" @click="selectAll" />
              <AppButton variant="ghost" size="inline" label="Select none" @click="selectNone" />
            </div>
          </div>

          <p v-if="isLinkableStep && matchesLoading" class="text-caption text-muted-foreground">
            Checking your existing {{ currentEntry.labelPlural.toLowerCase() }} and the shared library for matches…
          </p>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DocumentImportEntityCard
              v-for="entity in usableEntities"
              :key="entity.ref"
              :entry="currentEntry"
              :entity-ref="entity.ref"
              :page="entity.page"
              :confidence="entity.confidence"
              :selected="selectedRefs.has(entity.ref)"
              :data="editsByRef.get(entity.ref) ?? entity.data"
              :match="matchByRef.get(entity.ref) ?? null"
              :link-to-existing="linkChoiceByRef.get(entity.ref) ?? false"
              @update:selected="(v: boolean) => toggleSelected(entity.ref, v)"
              @update:data="(v: Record<string, unknown>) => editsByRef.set(entity.ref, v)"
              @update:link-to-existing="(v: boolean) => setLinkChoice(entity.ref, v)"
            />
          </div>

          <p v-if="hasBlankSelectedNames" class="text-caption text-destructive">
            Every selected entry needs a name before it can be imported.
          </p>
          <p v-if="provenanceMissing" class="text-caption text-destructive">
            This document's generation info is missing, so nothing here can be imported. Re-run extraction and try
            again.
          </p>

          <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
            <AppButton variant="subtle" size="md" label="Skip this type" :disabled="isImporting" @click="skipStep" />
            <AppButton
              variant="primary"
              size="md"
              :label="`Import ${selectedCount} selected`"
              :loading="isImporting"
              :disabled="
                selectedCount === 0 || provenanceMissing || hasBlankSelectedNames || (isLinkableStep && matchesLoading)
              "
              @click="runImport"
            />
          </div>
        </template>
      </template>
    </template>

    <!-- ── Final summary ───────────────────────────────────────────────────── -->
    <div v-else class="space-y-4">
      <h3 class="text-heading font-bold text-foreground">Import complete</h3>
      <ul class="divide-y divide-border rounded-lg border border-border bg-card">
        <li v-for="kindEntry in allEntries" :key="kindEntry.kind" class="flex items-center justify-between gap-2 p-3">
          <span class="text-body text-foreground">{{ kindEntry.labelPlural }}</span>
          <div class="flex items-center gap-3">
            <span class="text-body text-muted-foreground">{{ localCounts[kindEntry.kind] ?? 0 }} imported</span>
            <AppButton
              v-if="(localCounts[kindEntry.kind] ?? 0) > 0"
              variant="ghost"
              size="inline"
              label="View"
              :icon-right="IconExternalLink"
              :to="LIST_ROUTES[kindEntry.kind]"
            />
          </div>
        </li>
      </ul>
      <div class="flex justify-end">
        <AppButton variant="primary" size="md" label="Done" @click="finish" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The document importer's (#353 chunk 3) seven-step review wizard: one step
 * per `IMPORT_ENTITY_KINDS` entry, then a summary. All the mapping and
 * link-resolution logic already lives in `src/lib/documentImport/` — this
 * component's own job is orchestration: which step is showing, what the DM
 * has (de)selected and edited this step, running the insert loop and
 * reporting honestly what happened, and persisting `imported_counts` so a
 * refresh resumes instead of restarting.
 *
 * ── Why "current step" is its own ref, not derived from imported_counts ─────
 *
 * `importRow.imported_counts` is what makes a *resume* land on the right
 * step, but once a step's import finishes, the wizard needs a moment to show
 * the DM what happened (especially a quota stop) before moving on — deriving
 * the displayed step directly from the persisted counts would jump to the
 * next kind the instant the count is written, before that banner ever
 * renders. So `displayedIndex` is separate local state, seeded from
 * `imported_counts` once per `importRow.id`, and only ever advanced by an
 * explicit user action (Continue / Skip / a clean Import).
 *
 * ── Linking instead of duplicating (#837/#838) ──────────────────────────────
 *
 * Monsters and items can already exist — the DM's own vault, or the shared
 * library — so entering either step calls `resolve_monster_references` /
 * `resolve_item_references` once, with every extracted heading in that step,
 * rather than creating a stub for a creature/item the DM already has. A
 * match defaults the card to "link" (`entityMatching.ts` decides what counts
 * as one, this component only stores the DM's per-entity choice), and
 * `buildImportPlan`'s `linkedRefs` parameter (importPlan.ts) is what keeps a
 * linked entity out of the insert loop entirely — no row, no quota hit, no
 * duplicate. `lastLinkedCount` is why the result banner can say "N created,
 * M linked" instead of a report that looks like fewer rows landed than the
 * DM selected.
 */
import { computed, ref, watch } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import AppButton from "@/components/common/AppButton.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import WizardStepIndicator from "@/components/common/WizardStepIndicator.vue";
import type { WizardStep } from "@/components/common/WizardStepIndicator.vue";
import DocumentImportEntityCard from "@/components/campaign/DocumentImportEntityCard.vue";
import { getEntityKindEntry, listEntityKindsInWizardOrder } from "@/lib/documentImport/entityKinds";
import {
  matchEntitiesByName,
  normalizeItemMatchRows,
  normalizeMonsterMatchRows,
  type EntityMatch,
} from "@/lib/documentImport/entityMatching";
import {
  buildImportPlan,
  buildImportRunReport,
  resolveLinks,
  type ImportRowOutcome,
  type ImportRunReport,
  type LinkedRow,
  type LinkResolution,
  type NameLookupRow,
} from "@/lib/documentImport/importPlan";
import { isQuotaExceeded } from "@/lib/quotaError";
import { writeQuestSpine, type WriteQuestSpineDeps } from "@/lib/quests/spineWrite";
import {
  IMPORT_ENTITY_KINDS,
  type DocumentImport,
  type DocumentImportStatus,
  type ExtractedEntity,
  type ImportConfidence,
  type ImportEntityKind,
} from "@/types/documentImport.types";
import { IconWarning, IconCircleCheck, IconExternalLink } from "@/lib/icons";

const { importRow } = defineProps<{ importRow: DocumentImport }>();
const emit = defineEmits<{ finished: [] }>();

const allEntries = listEntityKindsInWizardOrder();
const WIZARD_STEPS: WizardStep[] = [
  ...allEntries.map((entry): WizardStep => ({ id: entry.kind, label: entry.labelPlural })),
  { id: "summary", label: "Summary" },
];

/** List-view route per kind, for the summary's "View" links. */
const LIST_ROUTES: Record<ImportEntityKind, string> = {
  monsters: "/monsters",
  npcs: "/npcs",
  locations: "/locations",
  items: "/vault",
  spells: "/spells",
  quests: "/quests",
  factions: "/factions",
};

/** Which other kinds a source kind's cross-entity references resolve
 *  against — mirrors (only the shape of) importPlan.ts's own `LINK_TARGETS`,
 *  which isn't exported; the resolution algorithm itself still comes from
 *  `resolveLinks`, this only tells the wizard which lookups to fetch first. */
const LINK_LOOKUP_TARGETS: Partial<Record<ImportEntityKind, ImportEntityKind[]>> = {
  npcs: ["factions"],
  locations: ["locations"],
  quests: ["npcs", "locations"],
};

// ── Step position ─────────────────────────────────────────────────────────────

const localCounts = ref<Partial<Record<ImportEntityKind, number>>>({});
const displayedIndex = ref(0);

function computeResumeIndex(counts: Partial<Record<ImportEntityKind, number>>): number {
  const idx = IMPORT_ENTITY_KINDS.findIndex((k) => counts[k] === undefined);
  return idx === -1 ? IMPORT_ENTITY_KINDS.length : idx;
}

watch(
  () => importRow.id,
  () => {
    localCounts.value = { ...importRow.imported_counts };
    displayedIndex.value = computeResumeIndex(localCounts.value);
    // Every step was already reviewed in an earlier session but the row never
    // got flipped to complete (e.g. the tab closed mid-update) — finish the
    // job rather than stranding the DM on a wizard with nothing left to show.
    if (displayedIndex.value === IMPORT_ENTITY_KINDS.length && importRow.status !== "complete") {
      void supabase.from("document_imports").update({ status: "complete" satisfies DocumentImportStatus }).eq("id", importRow.id);
    }
  },
  { immediate: true },
);

const currentKind = computed<ImportEntityKind | null>(() =>
  displayedIndex.value < IMPORT_ENTITY_KINDS.length ? IMPORT_ENTITY_KINDS[displayedIndex.value] : null,
);
const currentEntry = computed(() => (currentKind.value ? getEntityKindEntry(currentKind.value) : null));

// ── Per-step review state ────────────────────────────────────────────────────

interface UsableEntity {
  ref: string;
  page: number | null;
  confidence: ImportConfidence;
  data: Record<string, unknown>;
}

const usableEntities = ref<UsableEntity[]>([]);
const droppedCount = ref(0);
const selectedRefs = ref<Set<string>>(new Set());
const editsByRef = ref<Map<string, Record<string, unknown>>>(new Map());
const phase = ref<"review" | "result">("review");
const lastReport = ref<ImportRunReport | null>(null);
const unresolvedLinkNames = ref<string[]>([]);
/** How many of the last run's selected entities were linked rather than
 *  created — shown alongside `lastReport` so "3 created, 4 linked" is what
 *  the DM sees, never a silently smaller "3 imported". */
const lastLinkedCount = ref(0);
const isImporting = ref(false);
const errorMessage = ref<string | null>(null);

interface PendingProgress {
  kind: ImportEntityKind;
  count: number;
  report: ImportRunReport | null;
  unresolved: string[];
  /** How many of this run's selected entities were linked to an existing
   *  campaign/library row rather than created — see the "Linking instead of
   *  duplicating" section below. */
  linkedCount: number;
}

const pendingProgress = ref<PendingProgress | null>(null);

// ── Linking instead of duplicating (#837/#838) ──────────────────────────────
//
// Monsters and items are the two kinds `resolve_monster_references` /
// `resolve_item_references` cover. Every other kind still just gets created —
// there is no third resolver, and nothing here changes their flow.
const LINKABLE_KINDS = new Set<ImportEntityKind>(["monsters", "items"]);

/** Per-ref resolved match, populated once when a linkable kind's step opens.
 *  A ref absent from this map has no match and can only be created. */
const matchByRef = ref<Map<string, EntityMatch>>(new Map());
/** Per-ref DM choice: link (true) vs. create fresh (false). Only ever set for
 *  refs present in `matchByRef` — the wizard seeds it to `true` (link) the
 *  moment a match arrives, and the DM can flip it back per entity. */
const linkChoiceByRef = ref<Map<string, boolean>>(new Map());
const matchesLoading = ref(false);

const isLinkableStep = computed(() => currentKind.value !== null && LINKABLE_KINDS.has(currentKind.value));

/** Raw shape of one `resolve_monster_references` / `resolve_item_references`
 *  row as it comes back over `supabase.rpc` — the client here is untyped
 *  (src/lib/supabase.ts has no Database generic), so this is the boundary
 *  where that untyped response gets treated as genuinely unknown before
 *  `normalizeMonsterMatchRows`/`normalizeItemMatchRows` (entityMatching.ts)
 *  validate it field by field. */
async function fetchMatchRows(rpcName: "resolve_monster_references" | "resolve_item_references", campaignId: string, names: string[]): Promise<unknown[]> {
  const { data, error } = await supabase.rpc(rpcName, { p_campaign_id: campaignId, p_names: names });
  if (error || !Array.isArray(data)) return [];
  return data as unknown[];
}

/**
 * Resolves one linkable kind's freshly-entered step against the DM's own
 * vault and the shared library, once, with every extracted heading in a
 * single call — never one lookup per card. Best-effort: a resolver failure
 * must not block the review step, so every entity simply falls back to
 * "create fresh," the only behaviour that existed before #837/#838.
 *
 * Guards on `currentKind.value !== kind` before applying results, since a DM
 * can Skip past this step (or the whole wizard can move on) before the RPC
 * settles — applying a stale kind's matches to whatever step is showing by
 * then would attach the wrong entities' matches to the wrong cards.
 */
async function loadEntityMatches(kind: "monsters" | "items", entities: readonly UsableEntity[]): Promise<void> {
  const entry = getEntityKindEntry(kind);
  const headings = entities
    .map((e) => ({ ref: e.ref, heading: e.data[entry.displayField] }))
    .filter((e): e is { ref: string; heading: string } => typeof e.heading === "string" && e.heading.trim() !== "");
  if (headings.length === 0) return;

  matchesLoading.value = true;
  try {
    const rows = await fetchMatchRows(
      kind === "monsters" ? "resolve_monster_references" : "resolve_item_references",
      importRow.campaign_id,
      headings.map((h) => h.heading),
    );
    if (currentKind.value !== kind) return;

    const normalized = kind === "monsters" ? normalizeMonsterMatchRows(rows) : normalizeItemMatchRows(rows);
    const matches = matchEntitiesByName(headings, normalized);
    matchByRef.value = matches;
    linkChoiceByRef.value = new Map([...matches.keys()].map((ref) => [ref, true]));
  } catch {
    // See doc comment above — leave both maps empty, i.e. "no matches found".
  } finally {
    if (currentKind.value === kind) matchesLoading.value = false;
  }
}

function setLinkChoice(ref: string, value: boolean): void {
  linkChoiceByRef.value.set(ref, value);
}

/**
 * `importRow.extracted` is untrusted model output (documentImport.types.ts
 * header) — a missing kind, a non-array value, or an entity missing its
 * heading field must not reach the review grid at all rather than rendering
 * broken or throwing. Anything dropped is counted so the DM isn't left
 * wondering why a step looks short.
 */
function sanitizeEntities(raw: unknown, displayField: "name" | "title"): { entities: UsableEntity[]; dropped: number } {
  if (!Array.isArray(raw)) return { entities: [], dropped: 0 };
  const entities: UsableEntity[] = [];
  let dropped = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      dropped++;
      continue;
    }
    const rec = item as Record<string, unknown>;
    const rawData = rec.data;
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
      dropped++;
      continue;
    }
    const dataRec = rawData as Record<string, unknown>;
    const heading = dataRec[displayField];
    if (typeof heading !== "string" || heading.trim() === "") {
      dropped++;
      continue;
    }
    const ref = typeof rec.ref === "string" && rec.ref.length > 0 ? rec.ref : crypto.randomUUID();
    const page = typeof rec.page === "number" ? rec.page : null;
    const confidence: ImportConfidence = rec.confidence === "partial" ? "partial" : "complete";
    entities.push({ ref, page, confidence, data: dataRec });
  }
  return { entities, dropped };
}

watch(
  currentKind,
  (kind) => {
    phase.value = "review";
    lastReport.value = null;
    unresolvedLinkNames.value = [];
    lastLinkedCount.value = 0;
    pendingProgress.value = null;
    errorMessage.value = null;
    matchByRef.value = new Map();
    linkChoiceByRef.value = new Map();
    matchesLoading.value = false;
    if (!kind) {
      usableEntities.value = [];
      droppedCount.value = 0;
      return;
    }
    const entry = getEntityKindEntry(kind);
    const raw: unknown = importRow.extracted[kind];
    const { entities, dropped } = sanitizeEntities(raw, entry.displayField);
    droppedCount.value = dropped;
    usableEntities.value = entities;
    selectedRefs.value = new Set(entities.map((e) => e.ref));
    editsByRef.value = new Map(entities.map((e) => [e.ref, { ...e.data }]));
    if (kind === "monsters" || kind === "items") {
      void loadEntityMatches(kind, entities);
    }
  },
  { immediate: true },
);

const selectedCount = computed(() => selectedRefs.value.size);
const provenanceMissing = computed(() => importRow.ai_provenance == null);
const hasBlankSelectedNames = computed(() => {
  const entry = currentEntry.value;
  if (!entry) return false;
  return usableEntities.value.some((e) => {
    if (!selectedRefs.value.has(e.ref)) return false;
    const edited = editsByRef.value.get(e.ref) ?? e.data;
    const v = edited[entry.displayField];
    return typeof v !== "string" || v.trim() === "";
  });
});

function toggleSelected(ref: string, checked: boolean): void {
  if (checked) selectedRefs.value.add(ref);
  else selectedRefs.value.delete(ref);
}
function selectAll(): void {
  usableEntities.value.forEach((e) => selectedRefs.value.add(e.ref));
}
function selectNone(): void {
  selectedRefs.value.clear();
}

function advanceDisplayedStep(): void {
  displayedIndex.value = Math.min(displayedIndex.value + 1, IMPORT_ENTITY_KINDS.length);
}

// ── Persisting progress ──────────────────────────────────────────────────────

/** Never includes `source_paths` — the UPDATE policy re-checks it, and
 *  omitting the key entirely (rather than sending it back unchanged) is the
 *  documented-safe way to leave it alone. */

/**
 * `writeQuestSpine`'s four writes, done with the wizard's own plain Supabase
 * inserts rather than the TanStack mutations `useCreateQuestFromHook` injects.
 * The wizard imports in batches outside any component's query cache and does
 * its own invalidation at the end of a step, so going through the mutation
 * composables here would fire one cache round-trip per beat.
 */
const questSpineDeps: WriteQuestSpineDeps = {
  createBeat: async (beat) => {
    const { data, error } = await supabase.from("quest_beats").insert(beat).select().single();
    if (error) throw error;
    return data;
  },
  createBeatEdge: async (edge) => {
    const { data, error } = await supabase.from("quest_beat_edges").insert(edge).select().single();
    if (error) throw error;
    return data;
  },
  createObjective: async (objective) => {
    const { data, error } = await supabase.from("quest_objectives").insert(objective).select().single();
    if (error) throw error;
    return data;
  },
  createConsequence: async (consequence) => {
    const { data, error } = await supabase.from("quest_consequences").insert(consequence).select().single();
    if (error) throw error;
    return data;
  },
};

async function persistCount(kind: ImportEntityKind, count: number): Promise<void> {
  const nextCounts = { ...localCounts.value, [kind]: count };
  const allDone = IMPORT_ENTITY_KINDS.every((k) => nextCounts[k] !== undefined);
  const updates: { imported_counts: Partial<Record<ImportEntityKind, number>>; status?: DocumentImportStatus } = {
    imported_counts: nextCounts,
  };
  if (allDone) updates.status = "complete";
  const { error } = await supabase.from("document_imports").update(updates).eq("id", importRow.id);
  if (error) {
    throw new Error("Progress couldn't be saved. Retry saving before continuing.");
  }
  localCounts.value = nextCounts;
}

function finishPersistedStep(progress: PendingProgress): void {
  pendingProgress.value = null;
  errorMessage.value = null;
  if (!progress.report) {
    advanceDisplayedStep();
    return;
  }
  // A run where every planned row landed and nothing was left unresolved is
  // still noteworthy when something was linked (#837/#838) — "4 linked to
  // existing content" is real information, not something to skip past.
  const noteworthy =
    progress.report.imported < progress.report.planned ||
    progress.unresolved.length > 0 ||
    progress.linkedCount > 0;
  if (noteworthy) {
    lastReport.value = progress.report;
    unresolvedLinkNames.value = progress.unresolved;
    lastLinkedCount.value = progress.linkedCount;
    phase.value = "result";
  } else {
    advanceDisplayedStep();
  }
}

async function retryPendingProgress(): Promise<void> {
  const progress = pendingProgress.value;
  if (!progress || isImporting.value) return;
  isImporting.value = true;
  try {
    await persistCount(progress.kind, progress.count);
    finishPersistedStep(progress);
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Progress couldn't be saved.";
  } finally {
    isImporting.value = false;
  }
}

async function skipStep(): Promise<void> {
  const kind = currentKind.value;
  if (!kind || isImporting.value) return;
  isImporting.value = true;
  try {
    const progress: PendingProgress = { kind, count: 0, report: null, unresolved: [], linkedCount: 0 };
    pendingProgress.value = progress;
    await persistCount(kind, 0);
    finishPersistedStep(progress);
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Progress couldn't be saved.";
  } finally {
    isImporting.value = false;
  }
}

// ── Link resolution ──────────────────────────────────────────────────────────

async function fetchNameLookup(targetKind: ImportEntityKind, campaignId: string): Promise<NameLookupRow[]> {
  const targetEntry = getEntityKindEntry(targetKind);
  const { data, error } = await supabase
    .from(targetEntry.table)
    .select(`id, ${targetEntry.displayField}`)
    .eq("campaign_id", campaignId);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row[targetEntry.displayField] ?? ""),
  }));
}

/** Best-effort: a link write failing doesn't undo the row it points from,
 *  which already landed and is already counted as imported. */
async function applyLinkResolution(resolution: Extract<LinkResolution, { status: "resolved" }>): Promise<void> {
  const { apply, sourceId, targetId } = resolution;
  try {
    if (apply.kind === "fk_update") {
      await supabase.from(apply.table).update({ [apply.column]: targetId }).eq("id", sourceId);
    } else {
      const user = getCurrentUser();
      if (!user) return;
      await supabase.from(apply.table).insert({
        user_id: user.id,
        [apply.sourceColumn]: sourceId,
        [apply.targetColumn]: targetId,
      });
    }
  } catch {
    // See doc comment above.
  }
}

// ── Import ────────────────────────────────────────────────────────────────────

async function runImport(): Promise<void> {
  const kind = currentKind.value;
  const entry = currentEntry.value;
  const provenance = importRow.ai_provenance;
  if (!kind || !entry || !provenance || isImporting.value) return;

  isImporting.value = true;
  errorMessage.value = null;
  try {
    // Needed for `user_id` on every inserted row — see the insert below for why
    // the mappers cannot supply it. Fail loudly rather than inserting rows the
    // database is guaranteed to reject.
    const user = getCurrentUser();
    if (!user) throw new Error("You must be signed in to import.");

    const entitiesForPlan = usableEntities.value.map((e) => ({
      ref: e.ref,
      page: e.page,
      confidence: e.confidence,
      data: editsByRef.value.get(e.ref) ?? e.data,
    }));

    // Selected entities the DM left on "link to existing" (#837/#838) — only
    // possible for a ref `matchByRef` actually resolved, and only when still
    // selected (deselecting a linked card means "skip it," not "create it").
    const refsLinkedToExisting = new Set(
      [...selectedRefs.value].filter((ref) => matchByRef.value.has(ref) && (linkChoiceByRef.value.get(ref) ?? false)),
    );

    // `kind` is a runtime value here, not a literal type, so TypeScript can't
    // correlate it with ExtractedPayloadMap[K] the way importPlan.ts's own
    // `mapEntity` switch does (documented there — microsoft/TypeScript#33014).
    // `entitiesForPlan` was already validated at runtime, against this exact
    // kind's registry entry, by `sanitizeEntities`.
    const plan = buildImportPlan(
      kind,
      entitiesForPlan as unknown as ExtractedEntity<typeof kind>[],
      selectedRefs.value,
      importRow.campaign_id,
      provenance,
      refsLinkedToExisting,
    );

    // Row by row (never a single batched insert) so a mid-batch quota
    // rejection can be attributed to the row that tripped it and every row
    // ahead of it is still known to have landed.
    const outcomes: ImportRowOutcome[] = [];
    for (const planned of plan) {
      // `planned.row` is a union of all seven Insert shapes (the table itself
      // is only known at runtime, via `entry.table`) — postgrest-js's
      // `.insert()` can't type-check a call whose argument could be any one
      // of seven unrelated row shapes, so it's widened here rather than
      // fighting that inference. The row's actual shape was already decided,
      // correctly, by `buildImportPlan`/`mapEntity` above.
      //
      // `user_id` is added HERE and not by the mapper, because every
      // `<Entity>Insert` type omits it by construction — it is the caller's
      // identity, not a property of the extracted entity. Every other write
      // path in the app does the same (`useFactions` and friends all spread
      // `{ ...payload, user_id: user.id }`). Leaving it off is not a type
      // error anywhere, and it is rejected twice over at the database: the
      // column is NOT NULL on all seven tables, and each table's RLS insert
      // policy checks `auth.uid() = user_id`. It cost a full round of green
      // typecheck, lint, build and 3,801 tests to find that out by running it.
      const { data: inserted, error } = await supabase
        .from(entry.table)
        .insert({ ...(planned.row as Record<string, unknown>), user_id: user.id })
        .select("id")
        .single();
      if (error) {
        if (isQuotaExceeded(error)) {
          outcomes.push({ ref: planned.ref, status: "quota_exceeded" });
          break; // retrying the rest would fail identically — see importPlan.ts
        }
        outcomes.push({ ref: planned.ref, status: "failed", message: error.message });
        continue;
      }
      outcomes.push({ ref: planned.ref, status: "inserted", id: (inserted as { id: string }).id });
    }

    const report = buildImportRunReport(kind, plan, outcomes);

    const linkedRows: LinkedRow[] = [];
    for (const outcome of outcomes) {
      if (outcome.status !== "inserted") continue;
      const planned = plan.find((p) => p.ref === outcome.ref);
      if (planned) linkedRows.push({ id: outcome.id, links: planned.links });
    }

    const lookupTargets = LINK_LOOKUP_TARGETS[kind] ?? [];
    const lookups: Partial<Record<ImportEntityKind, NameLookupRow[]>> = {};
    for (const targetKind of lookupTargets) {
      lookups[targetKind] = await fetchNameLookup(targetKind, importRow.campaign_id);
    }

    const resolutions = resolveLinks(kind, linkedRows, lookups);
    const unresolved: string[] = [];
    for (const resolution of resolutions) {
      if (resolution.status === "unresolved") {
        unresolved.push(resolution.name);
        continue;
      }
      await applyLinkResolution(resolution);
    }

    // A second pass like the link resolution above, for the same reason: every
    // beat needs the quest's own id, which does not exist until here.
    //
    // This used to insert a single hardcoded "Opening beat" holding all of a
    // quest's prose — the generation-one shape, which survived #793 by moving
    // from `quests.description` onto one beat rather than being deleted. An
    // adventure page is already written as events with branches, so #829 lands
    // the whole graph instead, through the same `writeQuestSpine` the AI hook
    // generator uses. One writer for `quest_beats`, not two.
    if (kind === "quests") {
      for (const outcome of outcomes) {
        if (outcome.status !== "inserted") continue;
        const spine = plan.find((p) => p.ref === outcome.ref)?.questSpine;
        if (!spine) continue;
        try {
          await writeQuestSpine(
            {
              questId: outcome.id,
              campaignId: importRow.campaign_id,
              beats: spine.beats,
              routes: spine.routes,
              objectives: spine.objectives,
            },
            questSpineDeps,
          );
        } catch {
          // Best-effort, like the link writes above: the quest already landed
          // and is already counted as imported. `writeQuestSpine` is itself
          // partial-failure tolerant, so this only catches a total failure.
        }
      }
    }

    // `imported_counts[kind]` is what the final summary step and the resume
    // check read — see this file's own header. A linked entity never became
    // a new row, but it is exactly as much "this document's Nth entity now
    // exists in your campaign" as a created one, so it counts here too;
    // `lastReport`/`lastLinkedCount` below are what keep the two distinguishable
    // in the DM-facing text.
    const linkedCount = refsLinkedToExisting.size;
    const progress: PendingProgress = { kind, count: report.imported + linkedCount, report, unresolved, linkedCount };
    pendingProgress.value = progress;
    await persistCount(kind, progress.count);
    finishPersistedStep(progress);
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Something went wrong while importing this batch.";
  } finally {
    isImporting.value = false;
  }
}

function finish(): void {
  emit("finished");
}
</script>
