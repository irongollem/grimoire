<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Action bar -->
    <div v-if="!editable" class="flex items-center gap-2">
      <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
        {{ readOnlyLabel }}
      </span>
    </div>
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

    <!-- Identity card -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Identity</span>
      </div>
      <div class="p-4 flex gap-4 items-start">
        <div
          v-if="sub.image_url"
          class="card-plate relative shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted"
        >
          <FocalImage
            :src="sub.image_url"
            :alt="sub.subclass_name"
            format="portrait"
            :focal-point="sub.focal_point"
            :lightbox="true"
            class="w-full h-full"
          />
        </div>
        <div class="flex flex-col gap-2 min-w-0 flex-1">
        <div class="flex flex-wrap gap-2 items-center">
          <span class="text-label bg-primary/10 text-primary rounded px-2 py-0.5">
            {{ sub.class_name }}
          </span>
          <SourceBadge :source="sub.source_document_key ?? sub.source" />
          <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ sub.campaign_id ? 'Campaign-scoped' : 'All campaigns' }}
          </span>
        </div>
        <RichTextViewer v-if="sub.description" :content="sub.description" />
        </div>
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

    <!-- Spellcasting of its own -->
    <div v-if="sub.spellcasting" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Spellcasting</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div class="flex flex-wrap gap-2">
          <span class="text-label bg-primary/10 text-primary rounded px-2 py-0.5">{{ castingAbilityLabel }}</span>
          <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">{{ sub.spellcasting.list }} spell list</span>
          <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">{{ castingTypeLabel }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-center border-collapse">
            <thead>
              <tr>
                <th class="text-label text-muted-foreground pb-1.5 pr-2 text-left w-8">LVL</th>
                <th v-for="sl in castingColumns" :key="sl" class="text-label text-muted-foreground pb-1.5">{{ sl }}</th>
                <th class="text-label text-muted-foreground pb-1.5 pl-2">KNOWN</th>
                <th class="text-label text-muted-foreground pb-1.5 pl-2">CANTRIPS</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in castingRows" :key="row.level" class="border-t border-border/40">
                <td class="text-label text-primary pr-2 text-left py-0.5">{{ row.level }}</td>
                <td v-for="(n, i) in row.slots" :key="i" class="text-body py-0.5">{{ n }}</td>
                <td class="text-body py-0.5 pl-2">{{ row.known }}</td>
                <td class="text-body py-0.5 pl-2">{{ row.cantrips }}</td>
              </tr>
            </tbody>
          </table>
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
import SourceBadge from "@/components/common/entity/SourceBadge.vue";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { canEditSubclass, useDeleteCustomSubclass } from "@/composables/rules/useCustomSubclasses";
import { useAuthStore } from "@/stores/auth";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { useSpellsByIds } from "@/composables/spells/useSpellsByIds";
import FocalImage from "@/components/common/media/FocalImage.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { SUBCLASS_ABILITY_OPTIONS, SUBCLASS_SLOT_COLUMNS } from "@/levelup/subclassSpellcasting";
import type { CustomSubclass } from "@/levelup/customTypes";

const props = defineProps<{ sub: CustomSubclass }>();

const { labelFor } = useSourceTitles();
const bookLabel = computed(() => labelFor(props.sub.source_document_key ?? props.sub.source));
/** A subclass nobody owns is a book's; name the book. */
const readOnlyLabel = computed(() =>
  props.sub.user_id === null && bookLabel.value ? `${bookLabel.value}, read only` : "Read only",
);
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteCustomSubclass();
const auth = useAuthStore();
const editable = computed(() => canEditSubclass(props.sub, { userId: auth.user?.id ?? null, isAdmin: auth.isAppAdmin }));

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

const castingAbilityLabel = computed(() =>
  SUBCLASS_ABILITY_OPTIONS.find(a => a.value === props.sub.spellcasting?.ability)?.label ?? "",
);
const castingTypeLabel = computed(() => {
  const t = props.sub.spellcasting?.caster_type;
  return t === "known" ? "Known caster" : t === "prepared" ? "Prepared caster" : "Spellbook caster";
});
const castingColumns = computed(() => {
  const widest = Math.max(SUBCLASS_SLOT_COLUMNS, ...(props.sub.spellcasting?.spell_slots ?? []).map(r => r.length));
  return Array.from({ length: widest }, (_, i) => i + 1);
});
/** Class levels that grant anything: a row of zeros is a level the archetype has not started casting at. */
const castingRows = computed(() => {
  const sc = props.sub.spellcasting;
  if (!sc) return [];
  return Array.from({ length: 20 }, (_, i) => ({
    level: i + 1,
    slots: castingColumns.value.map((_, c) => sc.spell_slots[i]?.[c] ?? 0),
    known: sc.spells_known[i] ?? 0,
    cantrips: sc.cantrips_known[i] ?? 0,
  })).filter(r => r.slots.some(n => n > 0) || r.known > 0 || r.cantrips > 0);
});

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
  await deleteMut.mutateAsync(props.sub);
}
</script>
