<template>
  <div>
    <!-- Action bar: an existing feature saves itself, so Save gives way to the status line. -->
    <div class="flex flex-wrap items-center justify-end gap-2 mb-4">
      <AppButton
        v-if="!isNew"
        variant="destructive"
        size="md"
        :label="deleting ? 'Deleting…' : 'Delete'"
        :icon="IconDelete"
        :disabled="deleting"
        @click="deleteFeature"
      />
      <AppButton
        v-if="!isNew"
        variant="subtle"
        size="md"
        label="Done"
        @click="onDone"
      />
      <AutosaveStatus
        v-if="autosave"
        :status="autosave.status.value"
        :error="autosave.saveError.value"
        paused-label="Autosave paused until the feature has a name"
      />
      <AppButton
        v-else
        variant="primary"
        size="md"
        :icon="IconSave"
        :disabled="saving || !form.name.trim()"
        :label="saving ? 'Saving…' : 'Create'"
        @click="create"
      />
    </div>

    <div class="flex flex-col gap-4 max-w-2xl">
      <!-- Identity -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Identity</span>
        </div>
        <div class="p-4 flex gap-4">
          <div class="shrink-0 w-28">
            <ImageUpload
              :model-value="form.image_url"
              :focal-point="form.image_focal_point"
              aspect="square"
              show-focal-point
              bucket="dungeon-feature-images"
              @update:model-value="form.image_url = $event"
              @update:focal-point="form.image_focal_point = $event"
            />
          </div>
          <div class="flex-1 grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Name</label>
              <AppInput v-model="form.name" size="heading" placeholder="Feature name…" />
            </div>
            <div class="col-span-2">
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Type</label>
              <AppSelect v-model="form.feature_type" size="body" weight="normal" block>
                <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
              </AppSelect>
            </div>
            <div class="col-span-2">
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">How it draws on the map</label>
              <AppSelect v-model="form.feature_glyph" size="body" weight="normal" block>
                <option :value="null">Generic feature marker</option>
                <option v-for="g in FEATURE_GLYPHS" :key="g" :value="g">{{ FEATURE_GLYPH_LABELS[g] }}</option>
              </AppSelect>
            </div>
            <div class="col-span-2">
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Tags</label>
              <TagInput v-model="form.tags" />
            </div>
            <div class="col-span-2">
              <CampaignScopeField v-model="form.campaign_id" />
            </div>
          </div>
        </div>
      </div>

      <!-- Discovery -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Discovery</span>
        </div>
        <div class="p-4 grid grid-cols-3 gap-3">
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Perception DC</label>
            <AppInput v-model.number="form.perception_dc" type="number" min="1" max="30" placeholder="15" size="body" />
          </div>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Investigation DC</label>
            <AppInput v-model.number="form.investigation_dc" type="number" min="1" max="30" placeholder="15" size="body" />
          </div>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Arcana DC</label>
            <AppInput v-model.number="form.arcana_dc" type="number" min="1" max="30" placeholder="—" size="body" />
          </div>
        </div>
      </div>

      <!-- Object -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Object</span>
        </div>
        <div class="p-4 flex flex-col gap-3">
          <p class="text-caption text-muted-foreground">For something the party can attack, force or pick: a door, a lock, a cart.</p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Material</label>
              <AppSelect :model-value="form.object_material" size="body" weight="normal" block @update:model-value="onMaterialChange">
                <option :value="null">Not an object</option>
                <option v-for="m in OBJECT_MATERIALS" :key="m" :value="m">{{ OBJECT_MATERIAL_LABELS[m] }}</option>
              </AppSelect>
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Size</label>
              <AppSelect v-model="form.object_size" size="body" weight="normal" block>
                <option :value="null">—</option>
                <option v-for="z in OBJECT_SIZES" :key="z" :value="z">{{ OBJECT_SIZE_LABELS[z] }}</option>
              </AppSelect>
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">AC</label>
              <AppInput v-model.number="form.object_ac" type="number" min="1" max="30" placeholder="—" size="body" />
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Hit points</label>
              <AppInput v-model.number="form.object_hp" type="number" min="1" max="9999" placeholder="—" size="body" />
              <p v-if="bookHitPoints" class="mt-1 text-caption text-muted-foreground">
                Book: {{ bookHitPoints.fragile }} fragile, {{ bookHitPoints.resilient }} resilient
              </p>
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Damage threshold</label>
              <AppInput v-model.number="form.damage_threshold" type="number" min="1" max="50" placeholder="—" size="body" />
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Break DC (Strength)</label>
              <AppInput v-model.number="form.break_dc" type="number" min="1" max="30" placeholder="—" size="body" />
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Pick lock DC (thieves' tools)</label>
              <AppInput v-model.number="form.lock_dc" type="number" min="1" max="30" placeholder="—" size="body" />
            </div>
          </div>
        </div>
      </div>

      <!-- Trigger / Mechanism -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Trigger / Mechanism</span>
        </div>
        <div class="p-4 flex flex-col gap-3">
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Trigger Type</label>
            <AppSelect v-model="form.trigger_type" size="body" weight="normal" block>
              <option :value="null">—</option>
              <option v-for="t in DUNGEON_FEATURE_TRIGGERS" :key="t" :value="t">{{ t }}</option>
            </AppSelect>
          </div>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Trigger Description</label>
            <AppInput
              v-model="form.trigger_description"
              placeholder="A worn bookshelf that swings open when the red tome is removed…"
              size="body"
            />
          </div>
        </div>
      </div>

      <!-- Contents -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Contents / What's Inside</span>
        </div>
        <div class="p-4">
          <RichTextEditor v-model="form.contents_description" placeholder="Gold, a forgotten relic, a hidden stairway leading to the lower vaults…" size="md" />
        </div>
      </div>

      <!-- Description -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Description</span>
        </div>
        <div class="p-3">
          <RichTextEditor v-model="form.description" placeholder="Flavor text, appearance, atmosphere…" size="md" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { IconDelete, IconSave } from '@/lib/icons';
import {
  useCreateDungeonFeature,
  useUpdateDungeonFeature,
  useDeleteDungeonFeature,
} from "@/composables/dungeon-features/useDungeonFeatures";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import {
  DUNGEON_FEATURE_TYPES,
  DUNGEON_FEATURE_TRIGGERS,
  FEATURE_GLYPHS,
  FEATURE_GLYPH_LABELS,
} from "@/types/dungeonFeature.types";
import type { DungeonFeature, DungeonFeatureTrigger, FeatureGlyph } from "@/types/dungeonFeature.types";
import {
  OBJECT_MATERIALS,
  OBJECT_MATERIAL_LABELS,
  OBJECT_SIZES,
  OBJECT_SIZE_LABELS,
  objectHitPoints,
} from "@/rules/objects";
import type { ObjectMaterial, ObjectSize } from "@/rules/objects";
import { withObjectMaterial } from "@/lib/dungeon-features/objectStats";
import { markEdited } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import TagInput from "@/components/common/controls/TagInput.vue";
import CampaignScopeField from "@/components/common/entity/CampaignScopeField.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";

/**
 * The Dungeon Craft feature editor. An existing feature saves itself as it is
 * edited and Done leaves for the sheet; a new one has no row to save into yet, so
 * it gets one explicit Create and then goes to the list (CLAUDE.md, Post-Mutation
 * Navigation).
 */
const props = defineProps<{ feature: DungeonFeature | null; isNew: boolean }>();

const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const { activeCampaignId } = storeToRefs(useCampaignStore());

const createMut = useCreateDungeonFeature();
const updateMut = useUpdateDungeonFeature();
const deleteMut = useDeleteDungeonFeature();
const saving = ref(false);
const deleting = ref(false);

const blankForm = () => ({
  name: "",
  feature_type: "Secret Door" as (typeof DUNGEON_FEATURE_TYPES)[number],
  feature_glyph: null as FeatureGlyph | null,
  // New features default to the active campaign; existing ones keep whatever
  // scope they already have (#800).
  campaign_id: (activeCampaignId.value ?? null) as string | null,
  description: null as string | null,
  perception_dc: null as number | null,
  investigation_dc: null as number | null,
  arcana_dc: null as number | null,
  object_material: null as ObjectMaterial | null,
  object_size: null as ObjectSize | null,
  object_ac: null as number | null,
  object_hp: null as number | null,
  damage_threshold: null as number | null,
  break_dc: null as number | null,
  lock_dc: null as number | null,
  trigger_type: null as DungeonFeatureTrigger | null,
  trigger_description: null as string | null,
  contents_description: null as string | null,
  image_url: null as string | null,
  image_focal_point: null as { x: number; y: number } | null,
  tags: [] as string[],
});
type FeatureForm = ReturnType<typeof blankForm>;

function featureToForm(f: DungeonFeature): FeatureForm {
  return {
    name: f.name,
    feature_type: f.feature_type,
    feature_glyph: f.feature_glyph,
    campaign_id: f.campaign_id,
    description: f.description
      ? typeof f.description === "string" ? f.description : JSON.stringify(f.description)
      : null,
    perception_dc: f.perception_dc,
    investigation_dc: f.investigation_dc,
    arcana_dc: f.arcana_dc,
    object_material: f.object_material,
    object_size: f.object_size,
    object_ac: f.object_ac,
    object_hp: f.object_hp,
    damage_threshold: f.damage_threshold,
    break_dc: f.break_dc,
    lock_dc: f.lock_dc,
    trigger_type: f.trigger_type,
    trigger_description: f.trigger_description,
    contents_description: f.contents_description
      ? typeof f.contents_description === "string" ? f.contents_description : JSON.stringify(f.contents_description)
      : null,
    image_url: f.image_url,
    image_focal_point: f.image_focal_point,
    tags: [...(f.tags ?? [])],
  };
}

const form = reactive<FeatureForm>(props.feature ? featureToForm(props.feature) : blankForm());

/**
 * Picking a material, and only picking one: a watcher on the field also fired
 * when a saved feature loaded into the form, refilling an AC the DM had cleared
 * and marking an untouched AI feature as edited.
 */
function onMaterialChange(next: ObjectMaterial | null) {
  Object.assign(form, withObjectMaterial(form, next));
}

const bookHitPoints = computed(() => {
  const size = form.object_size;
  if (!size) return null;
  return { fragile: objectHitPoints(size, "fragile"), resilient: objectHitPoints(size, "resilient") };
});

// Material edit detection (#606): the image, glyph, tags and scope do not count.
const MATERIAL_FIELDS = [
  "name", "feature_type", "description", "contents_description", "trigger_type", "trigger_description",
  "perception_dc", "investigation_dc", "arcana_dc",
  "object_material", "object_size", "object_ac", "object_hp", "damage_threshold", "break_dc", "lock_dc",
] as const satisfies readonly (keyof FeatureForm)[];

async function saveExisting(snapshot: FeatureForm) {
  const f = props.feature;
  if (!f) return;
  // Compared with the server copy, so a save that changes only tags or art leaves
  // an AI-generated feature unedited.
  const saved = featureToForm(f);
  const edited = MATERIAL_FIELDS.some((field) => !deepEqual(snapshot[field], saved[field]));
  await updateMut.mutateAsync({
    id: f.id,
    update: { ...snapshot, ai_provenance: edited ? markEdited(f.ai_provenance) : f.ai_provenance },
  });
}

const autosave = props.feature
  ? useAutosave({
      draft: form,
      initial: () => featureToForm(props.feature!),
      equal: deepEqual,
      save: saveExisting,
      canSave: () => !!form.name.trim(),
      errorMessage: "Failed to save",
    })
  : null;

// The saved row coming back is our own echo unless the DM has moved on since;
// only a quiet form is re-hydrated, so typing is never overwritten.
watch(
  () => props.feature,
  (row) => {
    if (!row || !autosave || autosave.dirty.value || autosave.saving.value) return;
    const next = featureToForm(row);
    if (!deepEqual(next, form)) autosave.reset(next);
  },
);

/** Creating: the explicit first save, then the list. */
async function create() {
  if (!props.isNew || !form.name.trim() || saving.value) return;
  saving.value = true;
  try {
    await createMut.mutateAsync({ ...form, ai_provenance: null, notes: null });
    router.push("/dungeon-craft");
  } finally {
    saving.value = false;
  }
}

async function deleteFeature() {
  if (!props.feature || deleting.value) return;
  const ok = await confirm(`Delete "${form.name}"? This cannot be undone.`, {
    title: "Delete Feature",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  deleting.value = true;
  // Nothing pending may land on a row being deleted.
  await autosave?.hold();
  try {
    await deleteMut.mutateAsync(props.feature);
    router.push("/dungeon-craft");
  } catch (e) {
    autosave?.release();
    throw e;
  } finally {
    deleting.value = false;
  }
}

/** Done: back to the sheet once every edit has been written. */
async function onDone() {
  if (autosave) {
    await autosave.saveNow();
    // Still dirty means nothing was written: a blank name pauses autosave, or the
    // write failed. Leaving silently would drop those edits.
    if (autosave.dirty.value) {
      const reason = autosave.status.value === "paused"
        ? "A feature needs a name before its edits can be saved."
        : "The last save failed.";
      const leave = await confirm(`${reason} Leave anyway and lose your unsaved edits?`, {
        title: "Unsaved edits",
        confirmLabel: "Leave",
      });
      if (!leave) return;
      autosave.reset();
    }
  }
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}
</script>
