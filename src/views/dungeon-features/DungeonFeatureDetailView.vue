<template>
  <PageHeader :title="isNew ? 'New Dungeon Feature' : form.name || 'Loading…'">
    <template #actions>
      <button
        v-if="isEdit"
        type="button"
        class="font-fell text-sm text-destructive hover:opacity-70 transition-opacity"
        @click="deleteFeature"
      >
        Delete
      </button>
      <button
        type="button"
        :disabled="saving || !form.name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <div class="flex flex-col gap-4 max-w-2xl">
        <!-- Identity -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Identity</span>
          </div>
          <div class="p-4 flex gap-4">
            <!-- Image -->
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

            <!-- Fields -->
            <div class="flex-1 grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Name</label>
                <input
                  v-model="form.name"
                  placeholder="Feature name…"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div class="col-span-2">
                <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Type</label>
                <select
                  v-model="form.feature_type"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="col-span-2">
                <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Tags</label>
                <TagInput v-model="form.tags" />
              </div>
            </div>
          </div>
        </div>

        <!-- Discovery -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Discovery</span>
          </div>
          <div class="p-4 grid grid-cols-3 gap-3">
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Perception DC</label>
              <input
                v-model.number="form.perception_dc"
                type="number"
                min="1"
                max="30"
                placeholder="15"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Investigation DC</label>
              <input
                v-model.number="form.investigation_dc"
                type="number"
                min="1"
                max="30"
                placeholder="15"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Arcana DC</label>
              <input
                v-model.number="form.arcana_dc"
                type="number"
                min="1"
                max="30"
                placeholder="—"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <!-- Trigger / Mechanism -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Trigger / Mechanism</span>
          </div>
          <div class="p-4 flex flex-col gap-3">
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Trigger Type</label>
              <select
                v-model="form.trigger_type"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option :value="null">—</option>
                <option v-for="t in DUNGEON_FEATURE_TRIGGERS" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Trigger Description</label>
              <input
                v-model="form.trigger_description"
                placeholder="A worn bookshelf that swings open when the red tome is removed…"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <!-- Contents -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Contents / What's Inside</span>
          </div>
          <div class="p-4">
            <RichTextEditor
              v-model="form.contents_description"
              placeholder="Gold, a forgotten relic, a hidden stairway leading to the lower vaults…"
              min-height="100px"
            />
          </div>
        </div>

        <!-- Description -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
          </div>
          <div class="p-3">
            <RichTextEditor
              v-model="form.description"
              placeholder="Flavor text, appearance, atmosphere…"
              min-height="120px"
            />
          </div>
        </div>

        <!-- DM Notes -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">DM Notes</span>
          </div>
          <div class="p-3">
            <RichTextEditor
              v-model="form.notes"
              placeholder="Private notes, encounter hooks, related quests…"
              min-height="100px"
            />
          </div>
        </div>
      </div>
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import {
  useDungeonFeature,
  useCreateDungeonFeature,
  useUpdateDungeonFeature,
  useDeleteDungeonFeature,
} from "@/composables/useDungeonFeatures";
import { useConfirm } from "@/composables/useConfirm";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TRIGGERS } from "@/types/dungeonFeature.types";
import type { DungeonFeatureTrigger } from "@/types/dungeonFeature.types";

const route  = useRoute();
const router = useRouter();

const isNew  = computed(() => route.name === "dungeon-feature-new");
const isEdit = computed(() => !isNew.value);
const id     = computed(() => route.params.id as string);

const { data: feature, isLoading } = useDungeonFeature(id);
const createMut = useCreateDungeonFeature();
const updateMut = useUpdateDungeonFeature();
const deleteMut = useDeleteDungeonFeature();
const { confirm } = useConfirm();

const saving = ref(false);

const blankForm = () => ({
  name:                 "",
  feature_type:         "Secret Door" as (typeof DUNGEON_FEATURE_TYPES)[number],
  description:          null as string | null,
  perception_dc:        null as number | null,
  investigation_dc:     null as number | null,
  arcana_dc:            null as number | null,
  trigger_type:         null as DungeonFeatureTrigger | null,
  trigger_description:  null as string | null,
  contents_description: null as string | null,
  image_url:            null as string | null,
  image_focal_point:    null as { x: number; y: number } | null,
  tags:                 [] as string[],
  notes:                null as string | null,
});

const form = ref(blankForm());

watch(
  feature,
  (f) => {
    if (f)
      Object.assign(form.value, {
        name:                 f.name,
        feature_type:         f.feature_type,
        description:          f.description
          ? typeof f.description === "string" ? f.description : JSON.stringify(f.description)
          : null,
        perception_dc:        f.perception_dc,
        investigation_dc:     f.investigation_dc,
        arcana_dc:            f.arcana_dc,
        trigger_type:         f.trigger_type,
        trigger_description:  f.trigger_description,
        contents_description: f.contents_description
          ? typeof f.contents_description === "string" ? f.contents_description : JSON.stringify(f.contents_description)
          : null,
        image_url:            f.image_url,
        image_focal_point:    f.image_focal_point,
        tags:                 [...(f.tags ?? [])],
        notes:                f.notes
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
    if (isNew.value) {
      await createMut.mutateAsync({ ...form.value });
    } else {
      await updateMut.mutateAsync({ id: id.value, update: { ...form.value } });
    }
    router.push("/dungeon-craft");
  } finally {
    saving.value = false;
  }
}

async function deleteFeature() {
  const ok = await confirm(
    `Delete "${form.value.name}"? This cannot be undone.`,
    { title: "Delete Feature", confirmLabel: "Delete", danger: true },
  );
  if (!ok) return;
  await deleteMut.mutateAsync(feature.value!);
  router.push("/dungeon-craft");
}
</script>
