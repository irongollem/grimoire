<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <EntityEditorActionBar
      :title="draft.name"
      :title-label="isFeat ? 'Feat name' : 'Ability name'"
      :title-placeholder="isFeat ? 'Feat name…' : 'Ability name…'"
      :exists="!!feature"
      :can-save="canSave"
      :saving="saving"
      :deleting="deleting"
      :error="saveError"
      :autosave="autosaveBar"
      @update:title="draft.name = $event"
      @save="create"
      @cancel="done"
      @delete="remove"
    />

    <!-- Identity fields -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-eyebrow text-muted-foreground mb-1.5">SOURCE</label>
        <AppInput v-model="draft.source" placeholder="PHB, XGtE, Homebrew…" tone="card" size="body" />
      </div>

      <div v-if="!isOfficial">
        <label class="block text-eyebrow text-muted-foreground mb-1.5">CAMPAIGN SCOPE</label>
        <AppSelect v-model="draft.campaignScope" tone="card" size="body" weight="normal" block>
          <option value="all">All my campaigns</option>
          <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </AppSelect>
      </div>
    </div>

    <!-- The book's wording of the prerequisite -->
    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1.5">PREREQUISITE (AS WRITTEN)</label>
      <AppInput
        v-model="draft.prerequisite"
        placeholder="e.g. Dexterity 13 or higher, Proficiency with a martial weapon…"
        tone="card"
        size="body"
      />
    </div>

    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1.5">TAGS</label>
      <TagInput v-model="draft.tags" placeholder="ranger, gloom-stalker, combat…" />
    </div>

    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1.5">DESCRIPTION</label>
      <RichTextEditor
        v-model="draft.description"
        placeholder="The rules text as the book words it…"
        size="md"
      />
    </div>

    <section v-if="isFeat" class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
      <h2 class="text-label-lg uppercase text-muted-foreground">Feat</h2>
      <FeatFields :fields="draft.feat" :ruleset="ruleset" :errors="check.featErrors" @update:fields="draft.feat = $event" />
    </section>

    <section class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
      <div>
        <h2 class="text-label-lg uppercase text-muted-foreground">Mechanics</h2>
        <p class="text-caption text-muted-foreground mt-1">
          What the app does with it: the character sheet, rolls and level-up read these fields. The description stays the rules text.
        </p>
      </div>
      <MechanicsEditor :mechanics="draft.mechanics" :errors="check.mechanicsErrors" @update:mechanics="draft.mechanics = $event" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import TagInput from "@/components/common/controls/TagInput.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityEditorActionBar from "@/components/common/entity/EntityEditorActionBar.vue";
import FeatFields from "@/components/feats/FeatFields.vue";
import MechanicsEditor from "@/components/features/mechanics/MechanicsEditor.vue";
import { useCreateFeature, useUpdateFeature, useDeleteFeature } from "@/composables/rules/useFeatures";
import { useDmCampaigns } from "@/composables/campaign/useCampaigns";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import type { FeatureKind } from "@/rules/features/mechanics.types";
import type { ClassFeature } from "@/types/feature.types";
import { markEdited } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";
import { checkDraft, contentChanged, contentColumns, draftFromFeature, emptyDraft, type FeatureDraft } from "./featureDraft";

/**
 * The editor for abilities and feats (#976). An existing row saves itself;
 * a new one has no row to save into, so it gets one explicit Create and then
 * goes to the list (CLAUDE.md, Post-Mutation Navigation).
 */
const { feature, newKind = "feature" } = defineProps<{
  feature: ClassFeature | null;
  /** The kind a new row is created as; an existing row keeps its own. */
  newKind?: FeatureKind;
}>();

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const { ruleset: activeRuleset } = useRuleset();
const { data: campaignList } = useDmCampaigns();
const campaigns = computed(() => campaignList.value ?? []);

const { mutateAsync: createFeature } = useCreateFeature();
const { mutateAsync: update } = useUpdateFeature();
const { mutateAsync: del } = useDeleteFeature();

const kind = computed<FeatureKind>(() => feature?.kind ?? newKind);
const isFeat = computed(() => kind.value === "feat");
const isOfficial = computed(() => !!feature && feature.user_id === null);
const ruleset = computed(() => feature?.ruleset ?? activeRuleset.value);
const listPath = computed(() => (isFeat.value ? "/codex/feats" : "/codex/abilities"));

// Same default flip as CustomClassEditorView (#596): a new one defaults to the
// active campaign rather than "all my campaigns" by accident.
const { activeCampaignId } = storeToRefs(useCampaignStore());

const draft = reactive<FeatureDraft>(feature ? draftFromFeature(feature) : emptyDraft(activeCampaignId.value ?? "all"));

const check = computed(() => checkDraft(draft, kind.value));
const hasErrors = computed(() => check.value.mechanicsErrors.length > 0 || check.value.featErrors.length > 0);
const canSave = computed(() => !!draft.name.trim() && !hasErrors.value);

const saving = ref(false);
const deleting = ref(false);
const saveError = ref("");

async function saveExisting(snapshot: FeatureDraft) {
  if (!feature) return;
  const snapshotCheck = checkDraft(snapshot, kind.value);
  const columns = contentColumns(snapshot, snapshotCheck, kind.value);
  // Material edit detection: a changed name, source, prerequisite, rules text or
  // mechanics means a human has now authored part of an AI-generated ability.
  // Tags and campaign scope are carve-outs, as for every other generator.
  await update({
    id: feature.id,
    update: {
      ...columns,
      tags: snapshot.tags,
      campaign_id: isOfficial.value ? null : snapshot.campaignScope === "all" ? null : snapshot.campaignScope,
      ai_provenance: contentChanged(feature, columns) ? markEdited(feature.ai_provenance) : (feature.ai_provenance ?? null),
    },
  });
}

const autosave = feature
  ? useAutosave({
      draft,
      initial: () => draftFromFeature(feature),
      equal: deepEqual,
      save: saveExisting,
      canSave: () => canSave.value,
      errorMessage: "Failed to save",
    })
  : null;

const autosaveBar = computed(() =>
  autosave
    ? {
        status: autosave.status.value,
        error: autosave.saveError.value,
        pausedLabel: "Autosave paused until the name is set and the mechanics are complete",
      }
    : undefined,
);

// The saved row coming back is our own echo unless the DM has moved on since;
// only a quiet draft is re-hydrated, so typing is never overwritten.
watch(
  () => feature,
  (row) => {
    if (!row || !autosave || autosave.dirty.value || autosave.saving.value) return;
    const next = draftFromFeature(row);
    if (!deepEqual(next, draft)) autosave.reset(next);
  },
);

/** Creating: the explicit first save, then the list. */
async function create() {
  if (feature || !canSave.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    await createFeature({
      ...contentColumns(draft, check.value, kind.value),
      tags: draft.tags,
      ruleset: ruleset.value,
      campaign_id: draft.campaignScope === "all" ? null : draft.campaignScope,
      open5e_import: false,
      ai_provenance: null,
    });
    void router.push(listPath.value);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to save.";
  } finally {
    saving.value = false;
  }
}

/** Done: leave the editor for the read view once nothing is waiting to be written. */
async function done() {
  await autosave?.saveNow();
  if (autosave?.dirty.value) {
    saveError.value = "Some changes are not saved yet. Fix the problems shown, or they will be lost.";
    return;
  }
  const q = { ...route.query };
  delete q.edit;
  void router.push({ query: q });
}

async function remove() {
  if (!feature || deleting.value) return;
  const ok = await confirm(`Delete "${feature.name}"? This cannot be undone.`, {
    title: isFeat.value ? "Delete Feat" : "Delete Ability",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  deleting.value = true;
  // Nothing pending may land on a row being deleted.
  await autosave?.hold();
  try {
    await del(feature.id);
    void router.push(listPath.value);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to delete.";
    autosave?.release();
  } finally {
    deleting.value = false;
  }
}
</script>
