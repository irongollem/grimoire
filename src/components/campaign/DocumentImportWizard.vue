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
            {{ lastReport.imported }} of {{ lastReport.planned }} {{ currentEntry.labelPlural.toLowerCase() }} imported.
          </p>
        </div>
        <p v-if="lastReport.stoppedAtQuota" class="text-caption text-muted-foreground">
          Your plan's limit for {{ currentEntry.labelPlural.toLowerCase() }} was reached, so the rest of this batch
          was not attempted. The ones already imported are safe — upgrade or free up room to bring in the rest.
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
              @update:selected="(v: boolean) => toggleSelected(entity.ref, v)"
              @update:data="(v: Record<string, unknown>) => editsByRef.set(entity.ref, v)"
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
              :disabled="selectedCount === 0 || provenanceMissing || hasBlankSelectedNames"
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
const isImporting = ref(false);
const errorMessage = ref<string | null>(null);

interface PendingProgress {
  kind: ImportEntityKind;
  count: number;
  report: ImportRunReport | null;
  unresolved: string[];
}

const pendingProgress = ref<PendingProgress | null>(null);

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
    pendingProgress.value = null;
    errorMessage.value = null;
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
  const noteworthy = progress.report.imported < progress.report.planned || progress.unresolved.length > 0;
  if (noteworthy) {
    lastReport.value = progress.report;
    unresolvedLinkNames.value = progress.unresolved;
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
    const progress: PendingProgress = { kind, count: 0, report: null, unresolved: [] };
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
    const progress: PendingProgress = { kind, count: report.imported, report, unresolved };
    pendingProgress.value = progress;
    await persistCount(kind, report.imported);
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
