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

    <!-- ── Review: the compact confirmation ─────────────────────────────────── -->
    <template v-else-if="isReview && row">
      <template v-if="hasQuest">
        <div>
          <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">Quest title</label>
          <AppInput v-model="questTitle" size="lg" placeholder="The road beneath the lake…" />
        </div>
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

      <div v-if="otherGroups.length" class="space-y-2 rounded-md border border-border bg-muted/30 p-3">
        <p class="text-label-lg font-semibold text-muted-foreground">Also found</p>
        <AppCheckbox
          v-for="group in otherGroups"
          :key="group.kind"
          v-model="includeKind[group.kind]"
          size="md"
          :label="`${group.entities.length} ${group.label}`"
        />
      </div>

      <p v-if="row.ai_provenance == null" class="text-caption text-destructive">
        This document's generation info is missing, so nothing here can be imported. Re-run extraction and try again.
      </p>
      <p v-if="confirmError" class="text-caption text-destructive">{{ confirmError }}</p>

      <div class="flex flex-wrap justify-end gap-2 pt-2">
        <AppButton variant="subtle" size="md" label="Discard" :disabled="isConfirming" @click="discardMine" />
        <AppButton
          variant="primary"
          size="md"
          :label="hasQuest ? 'Create quest' : 'Import selected'"
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
 * `useDocumentImportRunner` (`runImportKind`, `buildImportPlan`,
 * `writeQuestSpine`, the link resolvers) `DocumentImportWizard.vue` uses —
 * only the *review surface* is different: one compact confirmation instead
 * of a step per kind. The quest is the headline and lands first; anything
 * else the page yielded (`questPasteReview.ts`'s "also found" groups) is a
 * per-group toggle, defaulted on, so a DM who wants only the quest unticks
 * the rest and is done in two clicks.
 *
 * `DocumentImportWizard.vue`'s full review is still there, unchanged, for
 * genuine bulk imports — this is a second door to the same room, not a
 * replacement.
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
import { computed, ref, watch } from "vue";
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
import { pagesForText, validateTextImport, type UploadValidationResult } from "@/lib/documentImport/limits";
import { tiptapToMarkdown } from "@/lib/tiptap/tiptapToMarkdown";
import { deriveImportDisplayName, selectPrimaryQuest, summarizeOtherKinds } from "@/lib/documentImport/questPasteReview";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import { supabase } from "@/lib/supabase";
import { IMPORT_ENTITY_KINDS, type ExtractedEntity, type ImportEntityKind } from "@/types/documentImport.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ProFeatureGate from "@/components/common/ProFeatureGate.vue";
import DocumentPasteEditor from "@/components/campaign/DocumentPasteEditor.vue";
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
const { runKind, finalizeImport } = useDocumentImportRunner();

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
/** A full `Record`, not `Partial` — every kind defaults `false` so
 *  `includeKind[group.kind]` is always a plain `boolean` for `AppCheckbox`'s
 *  v-model, never `boolean | undefined` for a kind the current row happens
 *  not to have found anything for. */
const includeKind = ref<Record<ImportEntityKind, boolean>>(
  Object.fromEntries(IMPORT_ENTITY_KINDS.map((kind) => [kind, false])) as Record<ImportEntityKind, boolean>,
);

// Seeded once per row, the moment it first lands on "review" — never
// re-derived on every render, so a DM's own edits to the title/premise or
// toggles aren't clobbered by an unrelated reactive update.
watch(
  () => (row.value?.status === "review" ? row.value.id : null),
  (id) => {
    if (!id) return;
    const entity = primaryQuest.value.entity;
    questTitle.value = typeof entity?.data.title === "string" ? entity.data.title : "";
    questSummary.value = typeof entity?.data.summary === "string" ? entity.data.summary : "";
    const next = Object.fromEntries(IMPORT_ENTITY_KINDS.map((kind) => [kind, false])) as Record<ImportEntityKind, boolean>;
    for (const group of otherGroups.value) next[group.kind] = true;
    includeKind.value = next;
  },
  { immediate: true },
);

const selectedOtherCount = computed(() =>
  otherGroups.value.filter((g) => includeKind.value[g.kind]).reduce((sum, g) => sum + g.entities.length, 0),
);

const isConfirming = ref(false);
const confirmError = ref<string | null>(null);

const canConfirm = computed(() => {
  const r = row.value;
  if (!r || r.status !== "review" || r.ai_provenance == null || isConfirming.value) return false;
  return hasQuest.value ? questTitle.value.trim().length > 0 : selectedOtherCount.value > 0;
});

async function confirmImport(): Promise<void> {
  const r = row.value;
  if (!r || !canConfirm.value) return;
  isConfirming.value = true;
  confirmError.value = null;
  try {
    const counts: Partial<Record<ImportEntityKind, number>> = { ...r.imported_counts };
    let createdQuestId: string | null = null;
    let questQuotaHit = false;
    const importedElsewhere: { label: string; count: number }[] = [];
    // A kind the DM asked for that came back short — quota or a row-level
    // failure. Surfaced explicitly rather than folded into `importedElsewhere`
    // silently: a DM who ticked "2 Locations" and got a quest with nothing
    // else must be told why, not left to guess. See runImportKind.ts's own
    // `ImportRunReport` for `stoppedAtQuota`/`planned` vs `imported`.
    const shortfalls: { label: string; imported: number; planned: number; quota: boolean }[] = [];

    for (const kind of IMPORT_ENTITY_KINDS) {
      // Already reviewed on another surface (the settings wizard, before
      // this panel's row became "mine") — never touch it twice.
      if (r.imported_counts[kind] !== undefined) continue;

      if (kind === "quests") {
        const entity = primaryQuest.value.entity;
        if (!entity) {
          counts.quests = 0;
          continue;
        }
        const edited = {
          ref: entity.ref,
          page: entity.page,
          confidence: entity.confidence,
          data: { ...entity.data, title: questTitle.value.trim(), summary: questSummary.value.trim() || undefined },
        };
        const result = await runKind(r, "quests", [edited] as unknown as ExtractedEntity<"quests">[], new Set([entity.ref]));
        counts.quests = result.report.imported;
        createdQuestId = result.insertedIds.get(entity.ref) ?? null;
        questQuotaHit = result.report.stoppedAtQuota;
        continue;
      }

      const group = otherGroups.value.find((g) => g.kind === kind);
      if (!group || !includeKind.value[kind]) {
        counts[kind] = 0;
        continue;
      }
      const selected = new Set(group.entities.map((e) => e.ref));
      const result = await runKind(r, kind, group.entities as unknown as ExtractedEntity<typeof kind>[], selected);
      counts[kind] = result.report.imported;
      if (result.report.imported > 0) importedElsewhere.push({ label: group.label, count: result.report.imported });
      if (result.report.imported < result.report.planned) {
        shortfalls.push({
          label: group.label,
          imported: result.report.imported,
          planned: result.report.planned,
          quota: result.report.stoppedAtQuota,
        });
      }
    }

    // A sub-quest created under a parent (QuestFlowStarter's own `parentId`
    // prop) — done as a follow-up update rather than threaded through
    // `runKind`, which has no notion of quest parentage: `mapExtractedQuest`
    // always produces `parent_quest_id: null`, correctly, since a printed
    // page cannot know it is being imported as anyone's sub-quest.
    if (createdQuestId && parentId) {
      try {
        await supabase.from("quests").update({ parent_quest_id: parentId }).eq("id", createdQuestId);
      } catch {
        // Best-effort, like the link/spine writes inside runKind: the quest
        // already landed and is already counted as imported.
      }
    }

    await finalizeImport(r.id, counts);
    rememberRow(null);

    const note = importedElsewhere.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ");
    const shortfallNote = shortfalls
      .map((s) => `${s.label}: ${s.quota ? "plan limit reached" : "not all imported"} (${s.imported} of ${s.planned})`)
      .join(". ");
    if (createdQuestId) {
      const parts = [note && `Also imported: ${note}.`, shortfallNote && `${shortfallNote}.`].filter(Boolean);
      if (parts.length) toast.info(parts.join(" "), 8000);
      await router.push({ path: `/quests/${createdQuestId}`, query: { view: "overview" } });
    } else {
      const base = questQuotaHit
        ? "Your quest limit has been reached, so this one couldn't be created."
        : note
          ? `Imported: ${note}.`
          : "Nothing was imported.";
      toast.info(shortfallNote ? `${base} ${shortfallNote}.` : base, 8000);
      await router.push("/quests");
    }
  } catch (err) {
    confirmError.value = toast.fromError(err, "Something went wrong while importing.");
  } finally {
    isConfirming.value = false;
  }
}
</script>
