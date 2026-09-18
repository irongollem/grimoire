<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h2 class="truncate text-heading-sm font-bold text-foreground">{{ importRow.display_name }}</h2>
      <WizardStepIndicator :steps="WIZARD_STEPS" :current-index="displayedIndex" />
    </div>

    <!-- ── A kind step ─────────────────────────────────────────────────────── -->
    <template v-if="currentKind && currentEntry">
      <div v-if="matches.error.value" class="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <p class="text-caption text-destructive">
          Couldn't check your campaign for entries you already have. Nothing is imported until that check has run.
        </p>
        <AppButton variant="subtle" size="inline" label="Retry" @click="matches.refetch()" />
      </div>

      <EmptyState
        v-if="currentUsable.length === 0"
        :title="`No ${currentEntry.labelPlural.toLowerCase()} found`"
        :description="`This document didn't yield any ${currentEntry.labelPlural.toLowerCase()}.`"
      />
      <ImportKindReview
        v-else
        :kind="currentKind!"
        :entities="currentUsable"
        :label="currentEntry.labelPlural"
        :candidates-by-ref="currentCandidates"
        :matches-ready="!matches.isLoading.value && !matches.error.value"
        :dropped-count="currentDropped"
        :decisions="decisionMapFor(currentKind!)"
        :edits="editMapFor(currentKind!)"
        @update:decisions="(m: Map<string, ImportDecision>) => (decisionsByKind[currentKind!] = m)"
        @update:edits="(m: Map<string, Record<string, unknown>>) => (editsByKind[currentKind!] = m)"
      />

      <div class="flex items-center justify-between gap-2 border-t border-border pt-3">
        <AppButton variant="subtle" size="md" label="Back" :disabled="displayedIndex === 0" @click="goBack" />
        <div class="flex items-center gap-2">
          <AppButton v-if="currentUsable.length > 0" variant="ghost" size="md" label="Skip this type" @click="skipStep" />
          <AppButton variant="primary" size="md" label="Next" @click="advanceDisplayedStep" />
        </div>
      </div>
    </template>

    <!-- ── Summary + import ────────────────────────────────────────────────── -->
    <template v-else-if="!sweepReport">
      <h3 class="text-heading font-bold text-foreground">Ready to import</h3>
      <ul class="divide-y divide-border rounded-lg border border-border bg-card">
        <li v-for="kindEntry in allEntries" :key="kindEntry.kind" class="flex items-center justify-between gap-2 p-3">
          <span class="text-body text-foreground">{{ kindEntry.labelPlural }}</span>
          <span class="text-caption text-muted-foreground">{{ summaryLineFor(kindEntry.kind) }}</span>
        </li>
      </ul>

      <div v-if="showSourceTitleField" class="space-y-1">
        <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">
          Source book <span class="font-normal">(optional)</span>
        </label>
        <AppInput
          v-model="sourceTitleInput"
          :list="sourceTitleListId"
          tone="filled"
          size="body"
          placeholder="Icewind Dale: Rime of the Frostmaiden…"
        />
        <datalist :id="sourceTitleListId">
          <option v-for="opt in sourceOptions" :key="opt.value" :value="opt.value" />
        </datalist>
      </div>

      <p v-if="importRow.ai_provenance == null" class="text-caption text-destructive">
        This document's generation info is missing, so nothing here can be imported. Re-run extraction and try again.
      </p>
      <ImportQuotaWarning :shortfalls="shortfalls" />
      <p v-if="sweepError" class="text-caption text-destructive">{{ sweepError }}</p>
      <p v-if="sweepProgress" class="text-caption text-muted-foreground">{{ sweepProgressLabel }}</p>

      <div class="flex items-center justify-between gap-2 pt-2">
        <AppButton variant="subtle" size="md" label="Back" :disabled="isSweeping" @click="goBack" />
        <div class="flex items-center gap-2">
          <GenerationCostBadge v-if="totalGenerateCount > 0" :credits="totalGenerateCredits" />
          <AppButton
            variant="primary"
            size="md"
            label="Import"
            :loading="isSweeping"
            :disabled="importRow.ai_provenance == null || matches.isLoading.value || !!matches.error.value || quotaLoading || shortfalls.length > 0 || isSweeping"
            @click="runSweep"
          />
        </div>
      </div>
    </template>

    <!-- ── Result ──────────────────────────────────────────────────────────── -->
    <div v-else class="space-y-4">
      <h3 class="text-heading font-bold text-foreground">Import complete</h3>
      <ul class="divide-y divide-border rounded-lg border border-border bg-card">
        <li v-for="kindEntry in allEntries" :key="kindEntry.kind" class="flex items-center justify-between gap-2 p-3">
          <span class="text-body text-foreground">{{ kindEntry.labelPlural }}</span>
          <div class="flex items-center gap-3">
            <span class="text-body text-muted-foreground">{{ resultLineFor(kindEntry.kind) }}</span>
            <AppButton
              v-if="(sweepReport.perKind[kindEntry.kind]?.imported ?? 0) > 0"
              variant="ghost"
              size="inline"
              label="View"
              :icon-right="IconExternalLink"
              :to="LIST_ROUTES[kindEntry.kind]"
            />
          </div>
        </li>
      </ul>
      <p v-if="sweepReport.unresolvedLinks.length" class="text-caption text-muted-foreground">
        Couldn't match a reference to: {{ sweepReport.unresolvedLinks.join(", ") }}.
      </p>
      <div class="flex justify-end">
        <AppButton variant="primary" size="md" label="Done" @click="finish" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The document importer's (#353 chunk 3) eight-step review wizard: one step
 * per `IMPORT_ENTITY_KINDS` entry, then a summary. Reworked for the
 * link/create/generate/ignore decision model (see
 * `context/features/document-import.md`'s "Every entity gets an explicit
 * DECISION" section) — nothing is imported per step any more. Decisions
 * accumulate across every step the DM visits, and the final "Import" button
 * runs the whole thing in one sweep (`useDocumentImportRunner`'s
 * `runImportSweep`), the same machinery `QuestPasteImportPanel.vue` uses.
 *
 * The mapping and link-resolution logic lives in `src/lib/documentImport/`;
 * this component's job is orchestration: which step is showing, the
 * decision/edit state each `ImportKindReview` reads and writes, running the
 * sweep, and reporting what happened.
 *
 * ── Why decisions live here, not per-step ────────────────────────────────────
 *
 * A DM can go Back and change their mind about an earlier kind — an NPC they
 * chose to link, once they've seen the faction step, might actually want to
 * be a fresh row instead. Nothing is committed to the database until the
 * final sweep, so `decisionsByKind`/`editsByKind` simply persist for the
 * wizard's whole lifetime rather than being thrown away and re-seeded on
 * every step change.
 *
 * ── One matches call for the whole row ───────────────────────────────────────
 *
 * `useImportEntityMatches` is called once, keyed on `importRow.id`, with
 * every kind's entities at once — never re-called per step. By the time the
 * DM reaches a later step the candidates are almost always already in.
 */
import { computed, reactive, ref, useId, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import WizardStepIndicator from "@/components/common/WizardStepIndicator.vue";
import type { WizardStep } from "@/components/common/WizardStepIndicator.vue";
import ImportKindReview from "@/components/campaign/ImportKindReview.vue";
import { getEntityKindEntry, listEntityKindsInWizardOrder } from "@/lib/documentImport/entityKinds";
import { sanitizeEntities, type UsableEntity } from "@/lib/documentImport/sanitizeEntities";
import { ignoreAllDecisions, quotaShortfalls, rowsAddedToQuota, tallyDecisions } from "@/lib/documentImport/reviewDecisions";
import { hasSourcedCreate, normalizeSourceTitle } from "@/lib/documentImport/sourceTitle";
import { useImportQuotaRoom } from "@/composables/campaign/useImportQuotaRoom";
import { useImportSourceOptions } from "@/composables/campaign/useImportSourceOptions";
import ImportQuotaWarning from "@/components/campaign/ImportQuotaWarning.vue";
import type { EntityCandidate, ImportDecision } from "@/lib/documentImport/entityMatching";
import { useDocumentImportRunner } from "@/composables/campaign/useDocumentImportRunner";
import { useImportEntityMatches } from "@/composables/campaign/useImportEntityMatches";
import { useMonsterGenerationCost } from "@/composables/monsters/useMonsterGenerationCost";
import type { ImportSweepInput, ImportSweepProgress, ImportSweepReport } from "@/composables/campaign/useDocumentImportRunner";
import {
  IMPORT_ENTITY_KINDS,
  type DocumentImport,
  type ImportEntityKind,
} from "@/types/documentImport.types";
import { IconExternalLink } from "@/lib/icons";

const { importRow } = defineProps<{ importRow: DocumentImport }>();
const emit = defineEmits<{ finished: [] }>();

const allEntries = listEntityKindsInWizardOrder();
const WIZARD_STEPS: WizardStep[] = [
  ...allEntries.map((entry): WizardStep => ({ id: entry.kind, label: entry.labelPlural })),
  { id: "summary", label: "Summary" },
];

/** List-view route per kind, for the result step's "View" links. */
const LIST_ROUTES: Record<ImportEntityKind, string> = {
  monsters: "/monsters",
  npcs: "/npcs",
  locations: "/locations",
  items: "/vault",
  spells: "/spells",
  quests: "/quests",
  factions: "/factions",
  encounters: "/encounters",
};

// ── Every kind's usable entities, once ───────────────────────────────────────

const usableByKind = computed<Record<ImportEntityKind, UsableEntity[]>>(() => {
  const out = {} as Record<ImportEntityKind, UsableEntity[]>;
  for (const kind of IMPORT_ENTITY_KINDS) {
    const entry = getEntityKindEntry(kind);
    out[kind] = sanitizeEntities(importRow.extracted[kind], entry.displayField).entities;
  }
  return out;
});
const droppedByKind = computed<Partial<Record<ImportEntityKind, number>>>(() => {
  const out: Partial<Record<ImportEntityKind, number>> = {};
  for (const kind of IMPORT_ENTITY_KINDS) {
    const entry = getEntityKindEntry(kind);
    out[kind] = sanitizeEntities(importRow.extracted[kind], entry.displayField).dropped;
  }
  return out;
});

const importRowId = computed(() => importRow.id);
const entitiesByKindForMatch = computed(() => usableByKind.value);
const matches = useImportEntityMatches(importRowId, entitiesByKindForMatch);

// ── Decision/edit state, persisted for the wizard's whole lifetime ──────────

const decisionsByKind = reactive<Partial<Record<ImportEntityKind, Map<string, ImportDecision>>>>({});
const editsByKind = reactive<Partial<Record<ImportEntityKind, Map<string, Record<string, unknown>>>>>({});

function decisionMapFor(kind: ImportEntityKind): Map<string, ImportDecision> {
  return (decisionsByKind[kind] ??= new Map());
}
function editMapFor(kind: ImportEntityKind): Map<string, Record<string, unknown>> {
  return (editsByKind[kind] ??= new Map());
}

// ── Step position ─────────────────────────────────────────────────────────────

const displayedIndex = ref(0);
const currentKind = computed<ImportEntityKind | null>(() =>
  displayedIndex.value < IMPORT_ENTITY_KINDS.length ? IMPORT_ENTITY_KINDS[displayedIndex.value]! : null,
);
const currentEntry = computed(() => (currentKind.value ? getEntityKindEntry(currentKind.value) : null));
const currentUsable = computed(() => (currentKind.value ? usableByKind.value[currentKind.value] : []));
const currentDropped = computed(() => (currentKind.value ? (droppedByKind.value[currentKind.value] ?? 0) : 0));
const currentCandidates = computed(() =>
  currentKind.value ? matches.candidatesFor(currentKind.value) : new Map<string, EntityCandidate[]>(),
);

function goBack(): void {
  displayedIndex.value = Math.max(displayedIndex.value - 1, 0);
}
function advanceDisplayedStep(): void {
  displayedIndex.value = Math.min(displayedIndex.value + 1, IMPORT_ENTITY_KINDS.length);
}
/** Skipping a step means every entity of that kind is ignored — the same
 *  meaning it always had, now expressed as a bulk decision instead of a
 *  step the DM never got to import. */
function skipStep(): void {
  const kind = currentKind.value;
  if (!kind) return;
  decisionsByKind[kind] = ignoreAllDecisions(usableByKind.value[kind]);
  advanceDisplayedStep();
}

// ── Summary tallies ──────────────────────────────────────────────────────────

function summaryLineFor(kind: ImportEntityKind): string {
  const entities = usableByKind.value[kind];
  if (entities.length === 0) return "None found";
  const decisions = decisionsByKind[kind];
  const t = decisions ? tallyDecisions(entities.map((e) => e.ref), decisions) : { link: 0, adopt: 0, create: 0, generate: 0, ignore: 0 };
  const parts = [
    t.link > 0 ? `${t.link} link${t.link === 1 ? "" : "s"}` : null,
    t.adopt > 0 ? `${t.adopt} added from library` : null,
    t.create > 0 ? `${t.create} new` : null,
    t.generate > 0 ? `${t.generate} generate${t.generate === 1 ? "" : "s"}` : null,
    t.ignore > 0 ? `${t.ignore} ignored` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : `${entities.length} found`;
}

/** Rows each kind would insert against a plan limit, from the decisions made
 *  so far — checked on the summary step, before anything is written. */
const quotaAdds = computed(() => {
  const adds: Partial<Record<ImportEntityKind, number>> = {};
  for (const kind of IMPORT_ENTITY_KINDS) {
    const decisions = decisionsByKind[kind];
    if (!decisions) continue;
    adds[kind] = rowsAddedToQuota(kind, tallyDecisions(usableByKind.value[kind].map((e) => e.ref), decisions));
  }
  return adds;
});
const { roomFor, isLoading: quotaLoading } = useImportQuotaRoom();
const shortfalls = computed(() => quotaShortfalls(quotaAdds.value, roomFor.value));

const totalTally = computed(() => {
  let generate = 0;
  for (const kind of IMPORT_ENTITY_KINDS) {
    const entities = usableByKind.value[kind];
    const decisions = decisionsByKind[kind];
    if (!decisions) continue;
    generate += tallyDecisions(entities.map((e) => e.ref), decisions).generate;
  }
  return { generate };
});
const totalGenerateCount = computed(() => totalTally.value.generate);

const { credits: perMonsterGenerateCredits } = useMonsterGenerationCost();
const totalGenerateCredits = computed(
  () => totalTally.value.generate * perMonsterGenerateCredits.value,
);

// ── Source book (#site-workbench decision, 18 Sep 2026) ──────────────────────
//
// Only shown once the review would actually create a monster/item/spell —
// linked and generated rows keep their own source, so the field would have
// nothing to attach to otherwise.
const showSourceTitleField = computed(() => hasSourcedCreate(decisionsByKind));

const { options: sourceOptions, defaultSourceTitle, isLoading: sourceOptionsLoading } = useImportSourceOptions();
const sourceTitleInput = ref("");
const sourceTitleListId = `document-import-source-${useId()}`;

// Seeded exactly once, the moment the DM's own source history has loaded —
// never again after that, so a DM who clears the field (wants no book on
// file) or types their own title isn't fought by a reactive re-seed.
let sourceTitleSeeded = false;
watch(
  [defaultSourceTitle, sourceOptionsLoading],
  ([def, loading]) => {
    if (sourceTitleSeeded || loading) return;
    sourceTitleSeeded = true;
    sourceTitleInput.value = def ?? "";
  },
  { immediate: true },
);

// ── The sweep ────────────────────────────────────────────────────────────────

const { runImportSweep } = useDocumentImportRunner();
const isSweeping = ref(false);
const sweepError = ref<string | null>(null);
const sweepProgress = ref<ImportSweepProgress | null>(null);
const sweepReport = ref<ImportSweepReport | null>(null);

const sweepProgressLabel = computed(() => {
  const p = sweepProgress.value;
  if (!p) return "";
  if (p.phase === "linking") return "Linking…";
  const label = p.kind ? getEntityKindEntry(p.kind).labelPlural : "entries";
  return `Importing ${label} ${p.done}/${p.total}…`;
});

function resultLineFor(kind: ImportEntityKind): string {
  const outcome = sweepReport.value?.perKind[kind];
  if (!outcome) return "0 imported";
  const failed = outcome.rows.filter((row) => row.status === "failed").length;
  const parts = [
    `${outcome.imported} created`,
    outcome.linked > 0 ? `${outcome.linked} linked` : null,
    outcome.adopted > 0 ? `${outcome.adopted} added from library` : null,
    outcome.ignored > 0 ? `${outcome.ignored} ignored` : null,
    failed > 0 ? `${failed} failed` : null,
    outcome.stoppedAtQuota ? "plan limit reached" : null,
  ].filter((p): p is string => p !== null);
  return parts.join(", ");
}

async function runSweep(): Promise<void> {
  if (isSweeping.value || importRow.ai_provenance == null) return;
  isSweeping.value = true;
  sweepError.value = null;
  sweepProgress.value = null;
  try {
    const entitiesByKind: ImportSweepInput["entitiesByKind"] = {};
    const decisions = new Map<ImportEntityKind, ReadonlyMap<string, ImportDecision>>();
    for (const kind of IMPORT_ENTITY_KINDS) {
      const entities = usableByKind.value[kind];
      if (entities.length === 0) continue;
      const edits = editsByKind[kind];
      entitiesByKind[kind] = entities.map((e) => ({ ...e, data: edits?.get(e.ref) ?? e.data }));
      const kindDecisions = decisionsByKind[kind];
      if (kindDecisions && kindDecisions.size > 0) decisions.set(kind, kindDecisions);
    }

    sweepReport.value = await runImportSweep(
      importRow,
      { entitiesByKind, decisions, parentQuestId: null, sourceTitle: normalizeSourceTitle(sourceTitleInput.value) },
      (p) => {
        sweepProgress.value = p;
      },
    );
  } catch (e) {
    sweepError.value = e instanceof Error ? e.message : "Something went wrong while importing.";
  } finally {
    isSweeping.value = false;
    sweepProgress.value = null;
  }
}

function finish(): void {
  emit("finished");
}
</script>
