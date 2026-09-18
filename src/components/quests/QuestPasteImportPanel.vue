<template>
  <div class="space-y-4">
    <LoadingSpinner v-if="isLoadingActive" />

    <!-- ── Blocked: a different import is already in flight for this campaign ── -->
    <template v-else-if="foreignActive">
      <div class="rounded-md border border-border bg-muted/30 p-4 space-y-2">
        <p class="text-body text-foreground">
          An import is already in progress ("{{ foreignActive.display_name }}").
        </p>
        <p class="text-caption text-muted-foreground">
          Only one document import runs at a time per campaign. Finish or discard it in Document Import before
          pasting another page here.
        </p>
        <div class="flex justify-end pt-1">
          <AppButton to="/campaign/settings?tab=import" variant="primary" size="md" label="Open Document Import" />
        </div>
      </div>
    </template>

    <!-- ── Reading the page ─────────────────────────────────────────────────── -->
    <template v-else-if="isBridging || isWorking">
      <LoadingSpinner message="Reading your page… this can take a minute." />
      <p v-if="startError" class="text-caption text-destructive">{{ startError }}</p>
      <div v-if="startError && row?.status === 'pending'" class="flex justify-end">
        <AppButton variant="primary" size="md" label="Retry" :loading="startExtraction.isPending.value" @click="retryStartOnly" />
      </div>
    </template>

    <!-- ── Extraction failed ────────────────────────────────────────────────── -->
    <template v-else-if="isFailed && row">
      <p class="text-body text-foreground">Reading "{{ row.display_name }}" failed.</p>
      <p class="text-caption text-destructive">{{ row.error ?? "The extraction failed." }}</p>
      <p v-if="startError" class="text-caption text-destructive">{{ startError }}</p>
      <p v-if="confirmError" class="text-caption text-destructive">{{ confirmError }}</p>
      <div class="flex justify-end gap-2 pt-2">
        <AppButton variant="destructive" size="md" label="Discard" :disabled="isBusy" @click="discardMine" />
        <AppButton
          variant="primary"
          size="md"
          label="Retry"
          :loading="retryImport.isPending.value || startExtraction.isPending.value"
          @click="retryMine"
        />
      </div>
    </template>

    <!-- ── Review ────────────────────────────────────────────────────────────── -->
    <template v-else-if="isReview && row">
      <template v-if="hasQuest">
        <div>
          <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">Quest title</label>
          <AppInput v-model="questTitle" size="lg" placeholder="The road beneath the lake…" />
        </div>
        <p v-if="duplicateQuestCandidate" class="text-caption text-tone-caution">
          Your campaign already has a quest called
          <AppButton
            variant="link"
            size="inline-caption"
            :label="`“${duplicateQuestCandidate.name}”`"
            :to="{ path: `/quests/${duplicateQuestCandidate.targetId}`, query: { view: 'overview' } }"
          />.
        </p>
        <div>
          <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">
            Premise <span class="font-normal">(optional)</span>
          </label>
          <AppInput
            v-model="questSummary"
            :maxlength="QUEST_SUMMARY_MAX"
            placeholder="Players see this verbatim — the blurb that tells you what the quest is without opening it."
          />
        </div>
        <p v-if="beatCount > 0" class="text-caption text-muted-foreground">
          {{ beatCount }} story beat{{ beatCount === 1 ? "" : "s" }} found — wired into a draft flow you can edit.
        </p>
        <p v-if="primaryQuest.extraCount > 0" class="text-caption text-muted-foreground">
          This page describes {{ primaryQuest.extraCount + 1 }} possible quests — only the first is used here. Open
          Document Import in Campaign Settings to review the rest.
        </p>
      </template>
      <template v-else>
        <p class="text-body text-foreground">This page doesn't look like it contains a quest.</p>
        <p v-if="otherGroups.length" class="text-caption text-muted-foreground">
          It did find some other things you can still bring in.
        </p>
        <p v-else class="text-caption text-muted-foreground">Nothing usable was found on this page.</p>
      </template>

      <div v-if="matches.error.value" class="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <p class="text-caption text-destructive">Couldn't check your campaign for existing entries.</p>
        <AppButton variant="subtle" size="inline" label="Retry" @click="matches.refetch()" />
      </div>

      <ImportKindReview
        v-for="group in otherGroups"
        :key="group.kind"
        :kind="group.kind"
        :entities="group.entities"
        :label="group.label"
        :candidates-by-ref="matches.candidatesFor(group.kind)"
        :matches-ready="!matches.isLoading.value && !matches.error.value"
        :decisions="decisionMapFor(group.kind)"
        :edits="editMapFor(group.kind)"
        @update:decisions="(m: Map<string, ImportDecision>) => (decisionsByKind[group.kind] = m)"
        @update:edits="(m: Map<string, Record<string, unknown>>) => (editsByKind[group.kind] = m)"
      />

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

      <p v-if="row.ai_provenance == null" class="text-caption text-destructive">
        This document's generation info is missing, so nothing here can be imported. Re-run extraction and try again.
      </p>
      <ImportQuotaWarning :shortfalls="shortfalls" />
      <p v-if="progress" class="text-caption text-muted-foreground">{{ progressLabel }}</p>
      <p v-if="confirmError" class="text-caption text-destructive">{{ confirmError }}</p>

      <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
        <GenerationCostBadge v-if="totalGenerateCount > 0" :credits="totalGenerateCredits" />
        <AppButton variant="subtle" size="md" label="Discard" :disabled="isConfirming" @click="discardMine" />
        <AppButton
          variant="primary"
          size="md"
          :label="confirmLabel"
          :icon="IconGenerate"
          :loading="isConfirming"
          :disabled="!canConfirm"
          @click="confirmImport"
        />
      </div>
    </template>

    <!-- ── Paste input ──────────────────────────────────────────────────────── -->
    <template v-else>
      <DocumentPasteEditor ref="pasteEditorRef" v-model="content" />

      <template v-if="charCount === 0">
        <p class="text-caption text-muted-foreground italic">Paste some text to see its page count and cost.</p>
      </template>
      <ProFeatureGate v-else-if="pageCapUpsell" :message="pageCapUpsell.message" />
      <p v-else-if="validationFailure" class="text-caption text-destructive">{{ validationFailure.message }}</p>
      <div v-else class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
        <p class="text-body text-foreground">{{ pageCount }} {{ pageCount === 1 ? "page" : "pages" }}</p>
        <template v-if="costLoading">
          <p class="text-caption text-muted-foreground italic">Calculating cost…</p>
        </template>
        <template v-else-if="costErrored || !costEstimate">
          <p class="text-caption text-muted-foreground italic">Price unavailable</p>
        </template>
        <template v-else>
          <GenerationCostBadge :credits="costEstimate.totalCredits" />
          <p class="text-caption text-muted-foreground">
            {{ costEstimate.baseCredits }} base + {{ costEstimate.perPageCredits }} × {{ costEstimate.pageCount }} pages
          </p>
        </template>
      </div>

      <AppCheckbox v-model="rightsAttested" size="md" label="I have the right to use this material." />

      <p v-if="startError" class="text-caption text-destructive">{{ startError }}</p>

      <div class="flex justify-end pt-2">
        <AppButton
          variant="primary"
          size="md"
          label="Extract"
          :icon="IconGenerate"
          :loading="isBridging"
          :disabled="!canExtract"
          @click="startPasteImport"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The "paste a page" entry point in the create-quest flow (#839) — a third
 * way to start a quest, beside typing one (`QuestFlowStarter.vue`'s own
 * form) and generating one (`QuestGeneratorPanel.vue`). Mounted by
 * `QuestFlowStarter.vue` when the DM picks that mode.
 *
 * ── Same extraction, a different, smaller review ────────────────────────────
 *
 * This does NOT run a second extraction contract for quests-only — that
 * would be exactly the fork #780 exists to undo. It creates the same
 * `document_imports` row (`source_kind: "text"`), runs the same
 * `import-extract` pass, and imports through the very same
 * `useDocumentImportRunner` (`runImportSweep`) `DocumentImportWizard.vue`
 * uses — only the *review surface* is different: the quest is the headline
 * (its own title/premise editor, no accordion — a quest always defaults to
 * `create`, see `entityMatching.ts`), and everything else the page yielded
 * gets one `ImportKindReview` group each, exactly like a wizard step, so the
 * DM sees the same link/create/generate/ignore choice either door offers
 * (#837/#838's successor).
 *
 * ── One import in flight per campaign ────────────────────────────────────────
 *
 * `useActiveDocumentImport()` returns the single most recent unfinished row
 * for the campaign, regardless of which surface created it — the same query
 * `DocumentImportTab.vue` reads. Rather than try to reproduce every one of
 * that surface's states here (pending/failed retry, abandon, "start
 * extraction" as its own confirmed step), this panel simply refuses to start
 * a *second* paste while one is already active: `foreignActive` below is
 * non-null exactly when an active row exists that this panel didn't create,
 * and the DM is pointed at Document Import to finish or discard it there.
 * That also sidesteps a real correctness risk: if the wizard had already
 * reviewed some kinds of that other row, blindly re-running every kind here
 * would import them twice. `myRowId` — persisted to sessionStorage so a mode
 * switch or reload during the DM's own paste still resumes it — is this
 * panel's only way to tell "the active row is mine."
 *
 * A hard refresh mid-extraction loses that local `myRowId` and this panel
 * then treats its own row as foreign, pointing the DM at Document Import
 * instead of resuming the compact view inline. Nothing is lost — the same
 * row, fully intact, is what the full wizard picks up there, including
 * creating the quest when it reaches that step — this is a known, accepted
 * degradation for a flow meant to be finished in one sitting, not a bug.
 */
import { computed, reactive, ref, useId, watch } from "vue";
import { useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useConfirm } from "@/composables/useConfirm";
import { useSubscription } from "@/composables/billing/useSubscription";
import {
  useActiveDocumentImport,
  useCreateDocumentImport,
  useStartExtraction,
  useRetryDocumentImport,
  useAbandonDocumentImport,
  useImportCost,
} from "@/composables/campaign/useDocumentImport";
import { useDocumentImportRunner } from "@/composables/campaign/useDocumentImportRunner";
import { useImportEntityMatches } from "@/composables/campaign/useImportEntityMatches";
import { useImportSourceOptions } from "@/composables/campaign/useImportSourceOptions";
import { useMonsterGenerationCost } from "@/composables/monsters/useMonsterGenerationCost";
import { pagesForText, validateTextImport, type UploadValidationResult } from "@/lib/documentImport/limits";
import { tiptapToMarkdown } from "@/lib/tiptap/tiptapToMarkdown";
import { deriveImportDisplayName, selectPrimaryQuest, summarizeOtherKinds } from "@/lib/documentImport/questPasteReview";
import { getEntityKindEntry } from "@/lib/documentImport/entityKinds";
import { quotaShortfalls, rowsAddedToQuota, tallyDecisions } from "@/lib/documentImport/reviewDecisions";
import { hasSourcedCreate, normalizeSourceTitle } from "@/lib/documentImport/sourceTitle";
import { useImportQuotaRoom } from "@/composables/campaign/useImportQuotaRoom";
import ImportQuotaWarning from "@/components/campaign/ImportQuotaWarning.vue";
import type { ImportDecision } from "@/lib/documentImport/entityMatching";
import type { UsableEntity } from "@/lib/documentImport/sanitizeEntities";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import { IMPORT_ENTITY_KINDS, type ImportEntityKind } from "@/types/documentImport.types";
import type { ImportSweepInput, ImportSweepProgress } from "@/composables/campaign/useDocumentImportRunner";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ProFeatureGate from "@/components/common/ProFeatureGate.vue";
import DocumentPasteEditor from "@/components/campaign/DocumentPasteEditor.vue";
import ImportKindReview from "@/components/campaign/ImportKindReview.vue";
import { IconGenerate } from "@/lib/icons";

const { parentId = null } = defineProps<{ parentId?: string | null }>();

const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();
const { isPro } = useSubscription();
const campaign = useCampaignStore();
const campaignId = computed(() => campaign.activeCampaignId);

// ── Which active row (if any) is this panel's own ───────────────────────────

const SESSION_PREFIX = "grimoire:quest-paste-import:";
const myRowId = ref<string | null>(null);
let hydratedSession = false;

watch(
  campaignId,
  (id) => {
    if (hydratedSession || !id) return;
    hydratedSession = true;
    try {
      myRowId.value = sessionStorage.getItem(`${SESSION_PREFIX}${id}`);
    } catch {
      // Private browsing or a blocked storage API — treat as "no stored id".
    }
  },
  { immediate: true },
);

function rememberRow(id: string | null): void {
  myRowId.value = id;
  const cid = campaignId.value;
  if (!cid) return;
  try {
    if (id) sessionStorage.setItem(`${SESSION_PREFIX}${cid}`, id);
    else sessionStorage.removeItem(`${SESSION_PREFIX}${cid}`);
  } catch {
    // See above.
  }
}

const activeImportQuery = useActiveDocumentImport();
const activeImport = computed(() => activeImportQuery.data.value ?? null);
const isLoadingActive = activeImportQuery.isPending;

const isMine = computed(() => activeImport.value !== null && activeImport.value.id === myRowId.value);
const foreignActive = computed(() => (activeImport.value && !isMine.value ? activeImport.value : null));
const row = computed(() => (activeImport.value && isMine.value ? activeImport.value : null));

const isWorking = computed(() => row.value !== null && (row.value.status === "pending" || row.value.status === "extracting"));
const isFailed = computed(() => row.value?.status === "failed");
const isReview = computed(() => row.value?.status === "review");

// ── Paste input ──────────────────────────────────────────────────────────────

const createImport = useCreateDocumentImport();
const startExtraction = useStartExtraction();
const retryImport = useRetryDocumentImport();
const abandonImport = useAbandonDocumentImport();
const { runImportSweep } = useDocumentImportRunner();

const content = ref("");
const pasteEditorRef = ref<InstanceType<typeof DocumentPasteEditor> | null>(null);
const rightsAttested = ref(false);
const startError = ref<string | null>(null);

/** Bridges the gap between "Extract" being clicked and `activeImport`
 *  reflecting the row this panel just created — both mutations' own
 *  `isPending` flags, so no extra local flag is needed to cover it. */
const isBridging = computed(() => createImport.isPending.value || startExtraction.isPending.value);
const isBusy = computed(() => isBridging.value || isConfirming.value || abandonImport.isPending.value);

const sourceText = computed(() => tiptapToMarkdown(content.value));
const charCount = computed(() => sourceText.value.length);
const pageCount = computed(() => pagesForText(charCount.value));
const validation = computed<UploadValidationResult | null>(() =>
  charCount.value > 0 ? validateTextImport(charCount.value, isPro.value) : null,
);
const validationFailure = computed(() => (validation.value && !validation.value.ok ? validation.value : null));
const pageCapUpsell = computed(() =>
  validationFailure.value?.reason === "too_many_pages" && !isPro.value ? validationFailure.value : null,
);
const { estimate: costEstimate, isLoading: costLoading, isError: costErrored } = useImportCost(pageCount);

const canExtract = computed(
  () => charCount.value > 0 && validation.value?.ok === true && rightsAttested.value && !isBridging.value,
);

async function startPasteImport(): Promise<void> {
  if (!canExtract.value) return;
  startError.value = null;
  try {
    const text = sourceText.value;
    const created = await createImport.mutateAsync({
      files: [],
      sourceKind: "text",
      sourceText: text,
      displayName: deriveImportDisplayName(text),
      pageCount: pageCount.value,
      rightsAttested: rightsAttested.value,
    });
    rememberRow(created.id);
    pasteEditorRef.value?.reset();
    rightsAttested.value = false;

    const outcome = await startExtraction.mutateAsync(created.id);
    if (outcome.warning) toast.info(outcome.warning, 8000);
  } catch (err) {
    startError.value = toast.fromError(err, "Could not start the import.");
  }
}

async function retryStartOnly(): Promise<void> {
  const r = row.value;
  if (!r) return;
  startError.value = null;
  try {
    const outcome = await startExtraction.mutateAsync(r.id);
    if (outcome.warning) toast.info(outcome.warning, 8000);
  } catch (err) {
    startError.value = toast.fromError(err, "Extraction failed.");
  }
}

async function retryMine(): Promise<void> {
  const r = row.value;
  if (!r) return;
  startError.value = null;
  try {
    const updated = await retryImport.mutateAsync(r.id);
    const outcome = await startExtraction.mutateAsync(updated.id);
    if (outcome.warning) toast.info(outcome.warning, 8000);
  } catch (err) {
    startError.value = toast.fromError(err, "Could not retry the extraction.");
  }
}

async function discardMine(): Promise<void> {
  const r = row.value;
  if (!r || isBusy.value) return;
  const ok = await confirm("Discard this import?", { title: "Discard import", confirmLabel: "Discard", danger: true });
  if (!ok) return;
  try {
    await abandonImport.mutateAsync({ id: r.id, source_paths: r.source_paths });
    rememberRow(null);
  } catch (err) {
    confirmError.value = toast.fromError(err, "Could not discard the import.");
  }
}

// ── Review ───────────────────────────────────────────────────────────────────

const primaryQuest = computed(() => (row.value ? selectPrimaryQuest(row.value.extracted) : { entity: null, extraCount: 0, dropped: 0 }));
const otherGroups = computed(() => (row.value ? summarizeOtherKinds(row.value.extracted) : []));
const hasQuest = computed(() => primaryQuest.value.entity !== null);
const beatCount = computed(() => {
  const beats = primaryQuest.value.entity?.data.beats;
  return Array.isArray(beats) ? beats.length : 0;
});

const questTitle = ref("");
const questSummary = ref("");

/** One decision/edit map per kind this row yielded (including `quests`,
 *  which only ever holds the single headline entity), keyed and mutated in
 *  place — see `ImportKindReview.vue`'s own doc comment on why a `Map`
 *  behind `reactive()`/`ref()` tracks `.set()` without needing a whole-map
 *  replacement. */
const decisionsByKind = reactive<Partial<Record<ImportEntityKind, Map<string, ImportDecision>>>>({});
const editsByKind = reactive<Partial<Record<ImportEntityKind, Map<string, Record<string, unknown>>>>>({});

function decisionMapFor(kind: ImportEntityKind): Map<string, ImportDecision> {
  return (decisionsByKind[kind] ??= new Map());
}
function editMapFor(kind: ImportEntityKind): Map<string, Record<string, unknown>> {
  return (editsByKind[kind] ??= new Map());
}

// Seeded once per row, the moment it first lands on "review" — never
// re-derived on every render, so a DM's own edits to the title/premise or
// decisions aren't clobbered by an unrelated reactive update.
watch(
  () => (row.value?.status === "review" ? row.value.id : null),
  (id) => {
    if (!id) return;
    const entity = primaryQuest.value.entity;
    questTitle.value = typeof entity?.data.title === "string" ? entity.data.title : "";
    questSummary.value = typeof entity?.data.summary === "string" ? entity.data.summary : "";
    for (const key of Object.keys(decisionsByKind)) delete decisionsByKind[key as ImportEntityKind];
    for (const key of Object.keys(editsByKind)) delete editsByKind[key as ImportEntityKind];
    // The headline quest always creates — see `defaultDecision`'s own doc
    // comment: a printed adventure's headline quest is never silently merged
    // into an existing one, only flagged as a possible duplicate.
    if (entity) decisionMapFor("quests").set(entity.ref, { action: "create" });
  },
  { immediate: true },
);

const entitiesByKindForMatch = computed<Partial<Record<ImportEntityKind, readonly UsableEntity[]>>>(() => {
  const map: Partial<Record<ImportEntityKind, readonly UsableEntity[]>> = {};
  const entity = primaryQuest.value.entity;
  if (entity) map.quests = [entity];
  for (const group of otherGroups.value) map[group.kind] = group.entities;
  return map;
});

const importRowIdForMatch = computed(() => (row.value && isReview.value ? row.value.id : null));
const matches = useImportEntityMatches(importRowIdForMatch, entitiesByKindForMatch);

const duplicateQuestCandidate = computed(() => {
  const entity = primaryQuest.value.entity;
  if (!entity) return null;
  return matches.candidatesFor("quests").get(entity.ref)?.[0] ?? null;
});

/** Rows each kind would insert against a plan limit — the headline quest
 *  counts too (it is always one `create`). */
const quotaAdds = computed(() => {
  const adds: Partial<Record<ImportEntityKind, number>> = {};
  if (hasQuest.value) adds.quests = 1;
  for (const group of otherGroups.value) {
    const decisions = decisionsByKind[group.kind];
    if (!decisions) continue;
    adds[group.kind] = rowsAddedToQuota(group.kind, tallyDecisions(group.entities.map((e) => e.ref), decisions));
  }
  return adds;
});
const { roomFor, isLoading: quotaLoading } = useImportQuotaRoom();
const shortfalls = computed(() => quotaShortfalls(quotaAdds.value, roomFor.value));

const canConfirm = computed(() => {
  const r = row.value;
  if (!r || r.status !== "review" || r.ai_provenance == null || isConfirming.value) return false;
  // A failed duplicate check seeds no decisions, and an entity with no
  // decision is not imported — so confirming then would create the quest and
  // silently drop the rest of the page. Nothing goes until the check has run.
  if (matches.isLoading.value || matches.error.value) return false;
  if (quotaLoading.value || shortfalls.value.length > 0) return false;
  if (hasQuest.value) return questTitle.value.trim().length > 0;
  return otherGroups.value.some((group) => {
    const decisions = decisionsByKind[group.kind];
    if (!decisions) return false;
    return group.entities.some((e) => decisions.get(e.ref) !== undefined && decisions.get(e.ref)?.action !== "ignore");
  });
});

/** Link/adopt/create/generate counts across every "also found" group — the
 *  headline quest is excluded (it's always exactly one `create`, not
 *  something these tallies need to explain). */
const totalTally = computed(() => {
  let link = 0, adopt = 0, create = 0, generate = 0;
  for (const group of otherGroups.value) {
    const decisions = decisionsByKind[group.kind];
    if (!decisions) continue;
    const t = tallyDecisions(group.entities.map((e) => e.ref), decisions);
    link += t.link;
    adopt += t.adopt;
    create += t.create;
    generate += t.generate;
  }
  return { link, adopt, create, generate };
});
const totalGenerateCount = computed(() => totalTally.value.generate);

const { credits: perMonsterGenerateCredits } = useMonsterGenerationCost();
const totalGenerateCredits = computed(
  () => totalTally.value.generate * perMonsterGenerateCredits.value,
);

// ── Source book (#site-workbench decision, 18 Sep 2026) ──────────────────────
//
// Same field, same seed-once behaviour as `DocumentImportWizard.vue`'s own —
// shown only once at least one monster/item/spell "also found" group is
// decided `create` (the headline quest itself never has a `source` column).
const showSourceTitleField = computed(() => hasSourcedCreate(decisionsByKind));

const { options: sourceOptions, defaultSourceTitle, isLoading: sourceOptionsLoading } = useImportSourceOptions();
const sourceTitleInput = ref("");
const sourceTitleListId = `quest-paste-source-${useId()}`;

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

const confirmLabel = computed(() => {
  const base = hasQuest.value ? "Create quest" : "Import selected";
  const newCount = totalTally.value.create + totalTally.value.generate;
  const linkedCount = totalTally.value.link;
  const adoptCount = totalTally.value.adopt;
  if (newCount === 0 && linkedCount === 0 && adoptCount === 0) return base;
  const parts = [
    newCount > 0 ? `${newCount} new` : null,
    linkedCount > 0 ? `${linkedCount} linked` : null,
    adoptCount > 0 ? `${adoptCount} from library` : null,
  ].filter((p): p is string => p !== null);
  return `${base} · ${parts.join(", ")}`;
});

const isConfirming = ref(false);
const confirmError = ref<string | null>(null);
const progress = ref<ImportSweepProgress | null>(null);
const progressLabel = computed(() => {
  const p = progress.value;
  if (!p) return "";
  if (p.phase === "linking") return "Linking…";
  const label = p.kind ? getEntityKindEntry(p.kind).labelPlural : "entries";
  return `Importing ${label} ${p.done}/${p.total}…`;
});

function buildEntitiesByKind(): ImportSweepInput["entitiesByKind"] {
  const out: Partial<Record<ImportEntityKind, readonly UsableEntity[]>> = {};
  const entity = primaryQuest.value.entity;
  if (entity) {
    out.quests = [
      {
        ...entity,
        data: { ...entity.data, title: questTitle.value.trim(), summary: questSummary.value.trim() || undefined },
      },
    ];
  }
  for (const group of otherGroups.value) {
    const edits = editsByKind[group.kind];
    out[group.kind] = group.entities.map((e) => ({ ...e, data: edits?.get(e.ref) ?? e.data }));
  }
  return out;
}

function buildDecisions(): ImportSweepInput["decisions"] {
  const map = new Map<ImportEntityKind, ReadonlyMap<string, ImportDecision>>();
  for (const kind of IMPORT_ENTITY_KINDS) {
    const decisions = decisionsByKind[kind];
    if (decisions && decisions.size > 0) map.set(kind, decisions);
  }
  return map;
}

async function confirmImport(): Promise<void> {
  const r = row.value;
  if (!r || !canConfirm.value) return;
  isConfirming.value = true;
  confirmError.value = null;
  progress.value = null;
  try {
    const input: ImportSweepInput = {
      entitiesByKind: buildEntitiesByKind(),
      decisions: buildDecisions(),
      parentQuestId: parentId ?? null,
      sourceTitle: normalizeSourceTitle(sourceTitleInput.value),
    };
    const report = await runImportSweep(r, input, (p) => {
      progress.value = p;
    });
    rememberRow(null);

    const noteParts: string[] = [];
    const shortfallParts: string[] = [];
    for (const kind of IMPORT_ENTITY_KINDS) {
      if (kind === "quests") continue;
      const outcome = report.perKind[kind];
      if (!outcome) continue;
      const label = getEntityKindEntry(kind).labelPlural.toLowerCase();
      const landed = outcome.imported + outcome.linked + outcome.adopted;
      if (landed > 0) noteParts.push(`${landed} ${label}`);
      if (outcome.imported < outcome.planned) {
        shortfallParts.push(
          `${label}: ${outcome.stoppedAtQuota ? "plan limit reached" : "not all imported"} (${outcome.imported} of ${outcome.planned})`,
        );
      }
    }
    const note = noteParts.join(", ");
    const shortfallNote = shortfallParts.join(". ");
    const unresolvedNote = report.unresolvedLinks.length ? `Couldn't match a reference to: ${report.unresolvedLinks.join(", ")}.` : "";

    if (report.createdQuestId) {
      const parts = [note && `Also imported: ${note}.`, shortfallNote && `${shortfallNote}.`, unresolvedNote].filter(Boolean);
      if (parts.length) toast.info(parts.join(" "), 8000);
      await router.push({ path: `/quests/${report.createdQuestId}`, query: { view: "overview" } });
    } else {
      const questOutcome = report.perKind.quests;
      const questQuotaHit = questOutcome?.stoppedAtQuota ?? false;
      const base = questQuotaHit
        ? "Your quest limit has been reached, so this one couldn't be created."
        : note
          ? `Imported: ${note}.`
          : "Nothing was imported.";
      const parts = [base, shortfallNote && `${shortfallNote}.`, unresolvedNote].filter(Boolean);
      toast.info(parts.join(" "), 8000);
      await router.push("/quests");
    }
  } catch (err) {
    confirmError.value = toast.fromError(err, "Something went wrong while importing.");
  } finally {
    isConfirming.value = false;
    progress.value = null;
  }
}
</script>
