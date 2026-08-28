<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <AppButton variant="destructive" size="md" :icon="IconDelete" label="Delete" @click="handleDelete" />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconEdit"
        label="Edit"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      />
    </div>

    <!-- Identity card -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Identity</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div class="flex flex-wrap gap-2 items-center">
          <span class="text-label bg-primary/10 text-primary rounded px-2 py-0.5">
            {{ sub.class_name }}
          </span>
          <span v-if="sub.source" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ sub.source }}
          </span>
          <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ sub.campaign_id ? 'Campaign-scoped' : 'All campaigns' }}
          </span>
        </div>
        <RichTextViewer v-if="sub.description" :content="sub.description" />
      </div>
    </div>

    <!-- Features per level card -->
    <div v-if="populatedLevels.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Features per Level</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div v-for="lvl in populatedLevels" :key="lvl" class="flex items-start gap-3">
          <span class="text-label-lg text-primary w-6 shrink-0 pt-0.5">{{ lvl }}</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="fid in sub.features[lvl.toString()]"
              :key="fid"
              class="text-label bg-primary/10 text-primary rounded px-2 py-0.5"
            >{{ featureNameById(fid) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Granted spells per level card -->
    <div v-if="grantedLevels.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Granted Spells per Level</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div v-for="lvl in grantedLevels" :key="lvl" class="flex items-start gap-3">
          <span class="text-label-lg text-primary w-6 shrink-0 pt-0.5">{{ lvl }}</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="sid in sub.granted_spells[lvl.toString()]"
              :key="sid"
              class="text-label bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded px-2 py-0.5"
            >{{ spellNameById(sid) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Steps card -->
    <div v-if="sub.steps?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Wizard Steps</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div v-for="step in sub.steps" :key="step.key" class="flex items-center gap-3">
          <span class="text-label-lg text-primary w-6 shrink-0">{{ step.level }}</span>
          <span class="text-body text-foreground flex-1">{{ step.label || step.key }}</span>
          <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5 shrink-0">
            ×{{ step.count ?? 1 }}
          </span>
        </div>
      </div>
    </div>

    <!-- Resources card -->
    <div v-if="sub.resources?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Resource Pools</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div v-for="res in sub.resources" :key="res.key" class="flex items-center gap-2">
          <span class="text-body text-foreground flex-1">{{ res.label || res.key }}</span>
          <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ res.rest === 'short' ? 'Short rest' : 'Long rest' }}
          </span>
          <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ res.scaling }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteCustomSubclass } from "@/composables/rules/useCustomSubclasses";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { useAllSpells } from "@/composables/spells/useSpells";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import AppButton from "@/components/common/AppButton.vue";
import type { CustomSubclass } from "@/levelup/customTypes";

const props = defineProps<{ sub: CustomSubclass }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteCustomSubclass();

const { data: allFeatures } = useAllFeatures();
const { data: allSpells } = useAllSpells();

function featureNameById(id: string): string {
  return allFeatures.value?.find(f => f.id === id)?.name ?? id;
}

function spellNameById(id: string): string {
  return allSpells.value?.find(s => s.id === id)?.name ?? id;
}

const populatedLevels = computed<number[]>(() =>
  Object.keys(props.sub.features).map(Number).sort((a, b) => a - b),
);

const grantedLevels = computed<number[]>(() =>
  Object.keys(props.sub.granted_spells ?? {}).map(Number).sort((a, b) => a - b),
);

async function handleDelete() {
  const ok = await confirm(`Delete "${props.sub.subclass_name}"? This cannot be undone.`, {
    title: "Delete Archetype",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push("/codex/archetypes");
  await deleteMut.mutateAsync(props.sub.id);
}
</script>
