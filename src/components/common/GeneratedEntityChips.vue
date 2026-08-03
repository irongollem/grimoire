<template>
  <div v-if="entities.length" class="flex flex-wrap gap-1.5">
    <template v-for="entity in entities" :key="`${entity.kind}-${entity.name}`">
      <button
        v-if="entity.id"
        type="button"
        class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption-sm transition-colors"
        :class="ENTITY_CHIP_CLASS[entity.kind]"
        @click="emit('navigate', entity)"
      >
        <component :is="ENTITY_CHIP_ICON[entity.kind]" class="h-3 w-3 shrink-0" />
        {{ entity.name }}
      </button>
      <span
        v-else
        title="Not in your campaign — the model introduced this"
        class="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-caption-sm text-muted-foreground"
      >
        <component :is="ENTITY_CHIP_ICON[entity.kind]" class="h-3 w-3 shrink-0" />
        {{ entity.name }}
        <span class="italic text-muted-foreground/60">new</span>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { IconUser, IconLocation, IconFaction } from "@/lib/icons";
import type { ResolvedEntity } from "@/ai/resolveGeneratedEntities";

/**
 * Chip row for AI-generated results that reference campaign entities by name
 * (quest hooks, roll tables — see resolveGeneratedEntities). A resolved chip
 * navigates on click; an unmatched name renders dashed with a "new" affix
 * instead of being dropped. The route + close-panel behaviour differ per
 * consumer, so `navigate` only hands back the entity — the parent decides.
 */
const { entities } = defineProps<{ entities: ResolvedEntity[] }>();

const emit = defineEmits<{ navigate: [entity: ResolvedEntity] }>();

const ENTITY_CHIP_ICON: Record<ResolvedEntity["kind"], typeof IconUser> = {
  npc: IconUser,
  location: IconLocation,
  faction: IconFaction,
};

const ENTITY_CHIP_CLASS: Record<ResolvedEntity["kind"], string> = {
  npc: "border-violet-400/40 bg-violet-400/10 text-violet-400 hover:bg-violet-400/20 hover:border-violet-400/60",
  location: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 hover:border-emerald-400/60",
  faction: "border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 hover:border-amber-400/60",
};
</script>
