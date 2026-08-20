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
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Tags</label>
              <TagInput v-model="form.tags" />
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

      <!-- DM Notes -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">DM Notes</span>
        </div>
        <div class="p-3">
          <RichTextEditor v-model="form.notes" placeholder="Private notes, encounter hooks, related quests…" size="md" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconSave } from '@/lib/icons';
import {
  useCreateDungeonFeature,
  useUpdateDungeonFeature,
  useDeleteDungeonFeature,
} from "@/composables/useDungeonFeatures";
import { useConfirm } from "@/composables/useConfirm";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TRIGGERS } from "@/types/dungeonFeature.types";
import type { DungeonFeature, DungeonFeatureTrigger } from "@/types/dungeonFeature.types";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";

const props = defineProps<{ feature: DungeonFeature | null; isNew: boolean }>();

const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const createMut = useCreateDungeonFeature();
const updateMut = useUpdateDungeonFeature();
const deleteMut = useDeleteDungeonFeature();
const saving = ref(false);

const blankForm = () => ({
  name: "",
  feature_type: "Secret Door" as (typeof DUNGEON_FEATURE_TYPES)[number],
  description: null as string | null,
  perception_dc: null as number | null,
  investigation_dc: null as number | null,
  arcana_dc: null as number | null,
  trigger_type: null as DungeonFeatureTrigger | null,
  trigger_description: null as string | null,
  contents_description: null as string | null,
  image_url: null as string | null,
  image_focal_point: null as { x: number; y: number } | null,
  tags: [] as string[],
  notes: null as string | null,
});

const form = ref(blankForm());

watch(
  () => props.feature,
  (f) => {
    if (f)
      Object.assign(form.value, {
        name: f.name,
        feature_type: f.feature_type,
        description: f.description
          ? typeof f.description === "string" ? f.description : JSON.stringify(f.description)
          : null,
        perception_dc: f.perception_dc,
        investigation_dc: f.investigation_dc,
        arcana_dc: f.arcana_dc,
        trigger_type: f.trigger_type,
        trigger_description: f.trigger_description,
        contents_description: f.contents_description
          ? typeof f.contents_description === "string" ? f.contents_description : JSON.stringify(f.contents_description)
          : null,
        image_url: f.image_url,
        image_focal_point: f.image_focal_point,
        tags: [...(f.tags ?? [])],
        notes: f.notes
          ? typeof f.notes === "string" ? f.notes : JSON.stringify(f.notes)
          : null,
      });
  },
  { immediate: true },
);

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    if (props.isNew) {
      await createMut.mutateAsync({ ...form.value });
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
