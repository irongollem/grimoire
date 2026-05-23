<template>
  <EntityLightbox
    :open="!!beast"
    :portrait-src="beast?.image_url ?? null"
    :portrait-alt="beast?.name"
    :focal-point="beast?.portrait_focal_point ?? null"
    portrait-height="48"
    @close="emit('close')"
  >
    <div>
      <h2 class="font-cinzel text-lg font-bold text-foreground">{{ beast?.name }}</h2>
      <p class="font-fell text-xs text-muted-foreground italic">
        {{ beast?.size }} {{ beast?.monster_type }}
        · CR {{ beast?.stat_block?.challenge_rating }}
      </p>
    </div>
    <StatBlockPanel v-if="beast?.stat_block" :sb="beast.stat_block" />

    <!-- Special abilities -->
    <div v-if="beast?.stat_block?.special_abilities?.length" class="space-y-2">
      <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-primary/70 uppercase border-b border-primary/20 pb-1">Special Abilities</p>
      <div
        v-for="trait in beast.stat_block.special_abilities"
        :key="trait.name"
        class="font-fell text-sm leading-snug"
      >
        <span class="font-semibold not-italic">{{ trait.name }}.</span>
        {{ trait.description }}
      </div>
    </div>

    <!-- Actions -->
    <div v-if="beast?.stat_block?.actions?.length" class="space-y-2">
      <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-primary/70 uppercase border-b border-primary/20 pb-1">Actions</p>
      <div
        v-for="action in beast.stat_block.actions"
        :key="action.name"
        class="font-fell text-sm leading-snug"
      >
        <span class="font-semibold not-italic">{{ action.name }}.</span>
        {{ action.description }}
      </div>
    </div>

    <!-- Bonus Actions -->
    <div v-if="beast?.stat_block?.bonus_actions?.length" class="space-y-2">
      <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-primary/70 uppercase border-b border-primary/20 pb-1">Bonus Actions</p>
      <div
        v-for="action in beast.stat_block.bonus_actions"
        :key="action.name"
        class="font-fell text-sm leading-snug"
      >
        <span class="font-semibold not-italic">{{ action.name }}.</span>
        {{ action.description }}
      </div>
    </div>

    <!-- Reactions -->
    <div v-if="beast?.stat_block?.reactions?.length" class="space-y-2">
      <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-primary/70 uppercase border-b border-primary/20 pb-1">Reactions</p>
      <div
        v-for="action in beast.stat_block.reactions"
        :key="action.name"
        class="font-fell text-sm leading-snug"
      >
        <span class="font-semibold not-italic">{{ action.name }}.</span>
        {{ action.description }}
      </div>
    </div>

    <template #footer>
      <div class="shrink-0 border-t border-border px-4 py-3 flex items-center justify-end gap-2">
        <button
          type="button"
          class="font-cinzel text-xs px-3 py-1.5 rounded border border-border hover:bg-muted/50 transition-colors"
          @click="emit('close')"
        >Cancel</button>
        <button
          type="button"
          :disabled="!canWildshape && !activeWildshape"
          class="font-cinzel text-xs px-3 py-1.5 rounded border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="emit('confirm')"
        >🐺 Wild Shape</button>
      </div>
    </template>
  </EntityLightbox>
</template>

<script setup lang="ts">
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import type { Monster } from "@/types/monster.types";

const { beast, canWildshape, activeWildshape } = defineProps<{
  beast: Monster | null;
  canWildshape: boolean;
  activeWildshape: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>
