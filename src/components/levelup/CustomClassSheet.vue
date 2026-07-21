<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="handleDelete"
      >
        <IconDelete class="h-3.5 w-3.5" />Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />Edit
      </button>
    </div>

    <!-- Identity card -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Identity</span>
      </div>
      <div class="p-4 flex flex-wrap gap-3 items-center">
        <span class="text-label bg-primary/10 text-primary rounded px-2 py-0.5">
          d{{ cls.hit_die }}
        </span>
        <span v-if="cls.primary_ability" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
          {{ cls.primary_ability }}
        </span>
        <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
          Subclass at level {{ cls.subclass_level }}
        </span>
        <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
          {{ cls.campaign_id ? 'Campaign-scoped' : 'All campaigns' }}
        </span>
      </div>
    </div>

    <!-- Proficiencies card -->
    <div
      v-if="cls.saving_throws.length || cls.armor_proficiencies.length || cls.weapon_proficiencies.length"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Proficiencies</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div v-if="cls.saving_throws.length">
          <span class="text-eyebrow text-muted-foreground block mb-1.5">Saving Throws</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="st in cls.saving_throws"
              :key="st"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ st }}</span>
          </div>
        </div>
        <div v-if="cls.armor_proficiencies.length">
          <span class="text-eyebrow text-muted-foreground block mb-1.5">Armor</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="a in cls.armor_proficiencies"
              :key="a"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ a }}</span>
          </div>
        </div>
        <div v-if="cls.weapon_proficiencies.length">
          <span class="text-eyebrow text-muted-foreground block mb-1.5">Weapons</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="w in cls.weapon_proficiencies"
              :key="w"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ w }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Features per level card -->
    <div v-if="populatedLevels.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Features per Level</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div v-for="lvl in populatedLevels" :key="lvl" class="flex items-start gap-3">
          <span class="font-cinzel text-xs text-primary tracking-wider w-6 shrink-0 pt-0.5">{{ lvl }}</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="fid in cls.features[lvl.toString()]"
              :key="fid"
              class="text-label bg-primary/10 text-primary rounded px-2 py-0.5"
            >{{ featureNameById(fid) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ASI levels card -->
    <div v-if="cls.asi_levels.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Ability Score Increase Levels</span>
      </div>
      <div class="p-4 flex flex-wrap gap-1">
        <span
          v-for="lvl in cls.asi_levels"
          :key="lvl"
          class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
        >{{ lvl }}</span>
      </div>
    </div>

    <!-- Spellcasting card -->
    <div v-if="cls.spell_slots !== null" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Spellcasting</span>
      </div>
      <div class="p-4 flex flex-wrap gap-2">
        <span class="text-label bg-primary/10 text-primary rounded px-2 py-0.5">
          {{ casterTypeLabel }}
        </span>
        <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
          {{ cls.slot_recovery === 'long' ? 'Long rest recovery' : 'Short rest recovery' }}
        </span>
        <span class="text-label text-muted-foreground italic font-fell text-xs self-center">
          Spell slot table defined
        </span>
      </div>
    </div>

    <!-- Steps card -->
    <div v-if="cls.steps?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Wizard Steps</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div v-for="step in cls.steps" :key="step.key" class="flex items-center gap-3">
          <span class="font-cinzel text-xs text-primary tracking-wider w-6 shrink-0">{{ step.level }}</span>
          <span class="font-fell text-sm text-foreground flex-1">{{ step.label || step.key }}</span>
          <span class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5 shrink-0">
            ×{{ step.count ?? 1 }}
          </span>
        </div>
      </div>
    </div>

    <!-- Resources card -->
    <div v-if="cls.resources?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Resource Pools</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <div v-for="res in cls.resources" :key="res.key" class="flex items-center gap-2">
          <span class="font-fell text-sm text-foreground flex-1">{{ res.label || res.key }}</span>
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
import { useDeleteCustomClass } from "@/composables/useCustomClasses";
import { useAllFeatures } from "@/composables/useFeatures";
import type { CustomClass } from "@/levelup/customTypes";

const props = defineProps<{ cls: CustomClass }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteCustomClass();

const { data: allFeatures } = useAllFeatures();

function featureNameById(id: string): string {
  return allFeatures.value?.find(f => f.id === id)?.name ?? id;
}

const populatedLevels = computed<number[]>(() =>
  Object.keys(props.cls.features).map(Number).sort((a, b) => a - b),
);

const casterTypeLabel = computed(() => {
  const map: Record<string, string> = {
    prepared: "Prepared caster",
    spellbook: "Spellbook caster",
    known: "Known caster",
    none: "Non-caster",
  };
  return map[props.cls.caster_type] ?? props.cls.caster_type;
});

async function handleDelete() {
  const ok = await confirm(`Delete "${props.cls.class_name}"? This cannot be undone.`, {
    title: "Delete Class",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push("/codex/classes");
  await deleteMut.mutateAsync(props.cls.id);
}
</script>
