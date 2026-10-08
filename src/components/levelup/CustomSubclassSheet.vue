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

    <!-- Spell cards: granted, by choice, expanded list -->
    <div v-for="card in spellCards" :key="card.title" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">{{ card.title }}</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div v-for="block in card.blocks" :key="block.heading ?? ''" class="flex flex-col gap-2">
          <span v-if="block.heading" class="text-label-lg text-foreground">{{ block.heading }}</span>
          <div v-for="lvl in block.levels" :key="lvl" class="flex items-start gap-3">
            <span class="text-label-lg text-primary w-6 shrink-0 pt-0.5">{{ lvl }}</span>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="sid in block.map[lvl.toString()]"
                :key="sid"
                class="text-label bg-tone-success/10 text-ink-success rounded px-2 py-0.5"
              >{{ spellNameById(sid) }}</span>
            </div>
          </div>
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
import { useSpellsByIds } from "@/composables/spells/useSpellsByIds";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import AppButton from "@/components/common/AppButton.vue";
import type { CustomSubclass } from "@/levelup/customTypes";

const props = defineProps<{ sub: CustomSubclass }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteCustomSubclass();

const { data: allFeatures } = useAllFeatures();
const variantMaps = computed(() => Object.entries(props.sub.spell_variants));
const expandedVariantMaps = computed(() => Object.entries(props.sub.expanded_spell_variants));
const { data: grantedSpells } = useSpellsByIds(() => [
  ...Object.values(props.sub.granted_spells).flat(),
  ...variantMaps.value.flatMap(([, map]) => Object.values(map).flat()),
  ...Object.values(props.sub.expanded_spells).flat(),
  ...expandedVariantMaps.value.flatMap(([, map]) => Object.values(map).flat()),
]);

function featureNameById(id: string): string {
  return allFeatures.value?.find(f => f.id === id)?.name ?? id;
}

function spellNameById(id: string): string {
  return grantedSpells.value.get(id)?.name ?? id;
}

const populatedLevels = computed<number[]>(() =>
  Object.keys(props.sub.features).map(Number).sort((a, b) => a - b),
);

function sortedLevels(map: Record<string, string[]>): number[] {
  return Object.keys(map).map(Number).sort((a, b) => a - b);
}

interface SpellBlock { heading: string | null; map: Record<string, string[]>; levels: number[] }

const spellCards = computed<{ title: string; blocks: SpellBlock[] }[]>(() => {
  const cards: { title: string; blocks: SpellBlock[] }[] = [];
  const granted = props.sub.granted_spells;
  if (Object.keys(granted).length) {
    cards.push({ title: "Granted Spells per Level", blocks: [{ heading: null, map: granted, levels: sortedLevels(granted) }] });
  }
  if (variantMaps.value.length) {
    cards.push({
      title: props.sub.spell_variant_label ? `Spells by ${props.sub.spell_variant_label}` : "Spells by Choice",
      blocks: variantMaps.value.map(([name, map]) => ({ heading: name, map, levels: sortedLevels(map) })),
    });
  }
  if (expandedVariantMaps.value.length) {
    cards.push({
      title: props.sub.spell_variant_label
        ? `Expanded Spell List by ${props.sub.spell_variant_label} (by spell level)`
        : "Expanded Spell List by Choice (by spell level)",
      blocks: expandedVariantMaps.value.map(([name, map]) => ({ heading: name, map, levels: sortedLevels(map) })),
    });
  }
  const expanded = props.sub.expanded_spells;
  if (Object.keys(expanded).length) {
    cards.push({ title: "Expanded Spell List (by spell level)", blocks: [{ heading: null, map: expanded, levels: sortedLevels(expanded) }] });
  }
  return cards;
});

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
