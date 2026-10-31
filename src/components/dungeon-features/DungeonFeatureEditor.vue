<template>
  <div>
    <!-- Action bar -->
    <div class="flex flex-wrap items-center justify-end gap-2 mb-4">
      <AppButton
        v-if="!isNew"
        variant="destructive"
        size="md"
        label="Delete"
        :icon="IconDelete"
        @click="deleteFeature"
      />
      <AppButton
        v-if="!isNew"
        variant="subtle"
        size="md"
        label="Cancel"
        @click="onCancel"
      />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconSave"
        :disabled="saving || !form.name.trim()"
        :label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
        @click="save"
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
              <AppSelect v-model="form.object_material" size="body" weight="normal" block>
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
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { IconDelete, IconSave } from '@/lib/icons';
import {
  useCreateDungeonFeature,
  useUpdateDungeonFeature,
  useDeleteDungeonFeature,
} from "@/composables/dungeon-features/useDungeonFeatures";
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
  objectArmorClass,
  objectHitPoints,
} from "@/rules/objects";
import type { ObjectMaterial, ObjectSize } from "@/rules/objects";
import { markEdited } from "@/ai/provenance";
import type { AiProvenance } from "@/ai/provenance";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import TagInput from "@/components/common/controls/TagInput.vue";
import CampaignScopeField from "@/components/common/entity/CampaignScopeField.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";

const props = defineProps<{ feature: DungeonFeature | null; isNew: boolean }>();

const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const { activeCampaignId } = storeToRefs(useCampaignStore());

const createMut = useCreateDungeonFeature();
const updateMut = useUpdateDungeonFeature();
const deleteMut = useDeleteDungeonFeature();
const saving = ref(false);

const blankForm = () => ({
  name: "",
  feature_type: "Secret Door" as (typeof DUNGEON_FEATURE_TYPES)[number],
  feature_glyph: null as FeatureGlyph | null,
  // New features default to the active campaign; existing ones keep whatever
  // scope they already have (#800) — this only matters for the pre-load
  // (isNew) case, since the watch below overwrites it from `f.campaign_id`.
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
  ai_provenance: null as AiProvenance | null,
});

const form = ref(blankForm());

watch(
  () => props.feature,
  (f) => {
    if (f)
      Object.assign(form.value, {
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
        ai_provenance: f.ai_provenance ?? null,
      });
  },
  { immediate: true },
);

// Choosing a material fills in the book's AC, but never replaces one the DM typed.
watch(
  () => form.value.object_material,
  (material) => {
    if (material && form.value.object_ac === null) form.value.object_ac = objectArmorClass(material);
  },
);

const bookHitPoints = computed(() => {
  const size = form.value.object_size;
  if (!size) return null;
  return { fragile: objectHitPoints(size, "fragile"), resilient: objectHitPoints(size, "resilient") };
});

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    // Material edit detection (#606): the image, tags and scope do not count.
    const f = props.feature;
    const text = (v: string | null) => v ?? "";
    if (f && (
      form.value.name.trim() !== f.name ||
      form.value.feature_type !== f.feature_type ||
      text(form.value.description) !== text(f.description) ||
      text(form.value.contents_description) !== text(f.contents_description) ||
      form.value.trigger_type !== f.trigger_type ||
      text(form.value.trigger_description) !== text(f.trigger_description) ||
      form.value.perception_dc !== f.perception_dc ||
      form.value.investigation_dc !== f.investigation_dc ||
      form.value.arcana_dc !== f.arcana_dc ||
      form.value.object_material !== f.object_material ||
      form.value.object_size !== f.object_size ||
      form.value.object_ac !== f.object_ac ||
      form.value.object_hp !== f.object_hp ||
      form.value.damage_threshold !== f.damage_threshold ||
      form.value.break_dc !== f.break_dc ||
      form.value.lock_dc !== f.lock_dc
    )) {
      form.value.ai_provenance = markEdited(form.value.ai_provenance);
    }
    if (props.isNew) {
      await createMut.mutateAsync({ ...form.value, notes: null });
    } else {
      await updateMut.mutateAsync({ id: props.feature!.id, update: { ...form.value } });
    }
    router.push("/dungeon-craft");
  } finally {
    saving.value = false;
  }
}

async function deleteFeature() {
  const ok = await confirm(`Delete "${form.value.name}"? This cannot be undone.`, {
    title: "Delete Feature",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  await deleteMut.mutateAsync(props.feature!);
  router.push("/dungeon-craft");
}

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}
</script>
