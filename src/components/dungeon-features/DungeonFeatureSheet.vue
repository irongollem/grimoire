<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Read-only library banner (same wording as MonsterDetail) -->
    <LibraryReadOnlyBanner
      v-if="library"
      :source="librarySource"
      message="Customize it to make your own editable copy."
      action-label="Customize"
      busy-label="Copying…"
      :busy="cloning"
      @action="customize"
    />

    <!-- Action bar -->
    <div v-else class="flex items-center justify-end gap-2">
      <AppButton variant="destructive" size="md" :icon="IconDelete" label="Delete" @click="handleDelete" />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconEdit"
        label="Edit"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      />
    </div>

    <!-- Identity: image + name / type / tags -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex gap-4">
        <div class="shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
          <FocalImage
            :src="feature.image_url"
            :alt="feature.name"
            format="portrait"
            :focal-point="feature.image_focal_point ?? null"
            :lightbox="true"
            :placeholder="placeholderUrl('dungeonfeature')"
            class="w-full h-full"
            ai-badge="right"
          />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <h1 class="text-heading-lg font-bold text-foreground leading-tight">{{ feature.name }}</h1>
          <span class="text-label font-semibold bg-muted/60 text-muted-foreground rounded px-2 py-0.5 self-start">
            {{ feature.feature_type }}
          </span>
          <div v-if="feature.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in feature.tags"
              :key="tag"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Discovery DCs -->
    <div
      v-if="feature.perception_dc || feature.investigation_dc || feature.arcana_dc"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Discovery</span>
      </div>
      <div class="p-4 grid grid-cols-3 gap-x-6">
        <div v-if="feature.perception_dc">
          <span class="text-eyebrow font-semibold text-muted-foreground">Perception DC</span>
          <p class="text-title font-bold text-foreground">{{ feature.perception_dc }}</p>
        </div>
        <div v-if="feature.investigation_dc">
          <span class="text-eyebrow font-semibold text-muted-foreground">Investigation DC</span>
          <p class="text-title font-bold text-foreground">{{ feature.investigation_dc }}</p>
        </div>
        <div v-if="feature.arcana_dc">
          <span class="text-eyebrow font-semibold text-muted-foreground">Arcana DC</span>
          <p class="text-title font-bold text-foreground">{{ feature.arcana_dc }}</p>
        </div>
      </div>
    </div>

    <!-- Object stats -->
    <div v-if="hasObjectStats" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Object</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <div v-if="feature.object_ac !== null">
            <span class="text-eyebrow font-semibold text-muted-foreground">AC</span>
            <p class="text-title font-bold text-foreground">{{ feature.object_ac }}</p>
            <p v-if="feature.object_material" class="text-caption text-muted-foreground">{{ OBJECT_MATERIAL_LABELS[feature.object_material] }}</p>
          </div>
          <div v-if="feature.object_hp !== null">
            <span class="text-eyebrow font-semibold text-muted-foreground">Hit points</span>
            <p class="text-title font-bold text-foreground">{{ feature.object_hp }}</p>
            <p v-if="feature.object_size" class="text-caption text-muted-foreground">{{ OBJECT_SIZE_LABELS[feature.object_size] }}</p>
          </div>
          <div v-if="feature.damage_threshold !== null">
            <span class="text-eyebrow font-semibold text-muted-foreground">Damage threshold</span>
            <p class="text-title font-bold text-foreground">{{ feature.damage_threshold }}</p>
          </div>
          <div v-if="feature.break_dc !== null">
            <span class="text-eyebrow font-semibold text-muted-foreground">Break DC</span>
            <p class="text-title font-bold text-foreground">{{ feature.break_dc }}</p>
          </div>
          <div v-if="feature.lock_dc !== null">
            <span class="text-eyebrow font-semibold text-muted-foreground">Pick lock DC</span>
            <p class="text-title font-bold text-foreground">{{ feature.lock_dc }}</p>
          </div>
        </div>
        <p class="text-caption text-muted-foreground">Immune to {{ immunityText }} damage.</p>
      </div>
    </div>

    <!-- Trigger -->
    <div
      v-if="feature.trigger_type || feature.trigger_description"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Trigger</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <span
          v-if="feature.trigger_type"
          class="text-label font-semibold bg-tone-caution/10 text-ink-caution rounded px-2.5 py-1 self-start"
        >{{ feature.trigger_type }}</span>
        <p v-if="feature.trigger_description" class="text-body text-foreground italic">
          {{ feature.trigger_description }}
        </p>
      </div>
    </div>

    <!-- Contents -->
    <div v-if="hasContents" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Contents / What's Inside</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="feature.contents_description" />
      </div>
    </div>

    <!-- Description -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="feature.description" />
      </div>
    </div>

    <!-- Authoring guidance: only a library row carries it here; an own row's notes live in the DM note box -->
    <div v-if="library && hasNotes" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Notes</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="feature.notes" />
      </div>
    </div>

    <!-- Placed In -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Placed In</span>
      </div>
      <div class="p-4">
        <EntityPlacements kind="dungeon_feature" :entity-id="feature.id" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useCloneLibraryDungeonFeature, useDeleteDungeonFeature } from "@/composables/dungeon-features/useDungeonFeatures";
import { isLibraryFeature } from "@/lib/dungeon-features/library";
import { OBJECT_DAMAGE_IMMUNITIES, OBJECT_MATERIAL_LABELS, OBJECT_SIZE_LABELS } from "@/rules/objects";
import type { DungeonFeatureEntry } from "@/types/dungeonFeature.types";
import FocalImage from "@/components/common/media/FocalImage.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import LibraryReadOnlyBanner from "@/components/common/entity/LibraryReadOnlyBanner.vue";
import EntityPlacements from "@/components/locations/place/EntityPlacements.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const props  = defineProps<{ feature: DungeonFeatureEntry }>();
const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const deleteMut = useDeleteDungeonFeature();
const cloneMut = useCloneLibraryDungeonFeature();

// A library feature is read-only; Customize is the one way it becomes editable.
const library = computed(() => isLibraryFeature(props.feature));
const librarySource = computed(() => (isLibraryFeature(props.feature) ? props.feature.source : undefined));
const cloning = computed(() => cloneMut.isPending.value);

async function customize() {
  if (!isLibraryFeature(props.feature)) return;
  const copy = await cloneMut.mutateAsync(props.feature);
  router.replace(`/dungeon-features/${copy.id}`);
}

function hasContent(field: string | null | undefined): boolean {
  if (!field) return false;
  try {
    const doc = JSON.parse(field);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(field).trim().length > 0;
  }
}

const hasObjectStats = computed(() => {
  const f = props.feature;
  return (
    f.object_material !== null || f.object_size !== null || f.object_ac !== null || f.object_hp !== null ||
    f.damage_threshold !== null || f.break_dc !== null || f.lock_dc !== null
  );
});
// "poison and psychic": built from the rule's own list, not retyped here.
const immunityText = OBJECT_DAMAGE_IMMUNITIES.join(" and ");

const hasContents    = computed(() => hasContent(props.feature.contents_description));
const hasDescription = computed(() => hasContent(props.feature.description));
const hasNotes      = computed(() => hasContent(props.feature.notes));

async function handleDelete() {
  if (isLibraryFeature(props.feature)) return;
  const ok = await confirm(`Delete "${props.feature.name}"? This cannot be undone.`, {
    title: "Delete Feature",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push("/dungeon-craft");
  await deleteMut.mutateAsync(props.feature);
}
</script>
