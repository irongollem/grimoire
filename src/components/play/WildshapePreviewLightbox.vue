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
      <h2 class="text-heading font-bold text-foreground">{{ beast?.name }}</h2>
      <p class="text-caption text-muted-foreground italic">
        {{ beast?.size }} {{ beast?.monster_type }}
        · CR {{ beast?.stat_block?.challenge_rating }}
      </p>
    </div>
    <StatBlockPanel v-if="beast?.stat_block" :sb="beast.stat_block" :name="beast.name" />

    <!-- Special abilities -->
    <div v-if="beast?.stat_block?.special_abilities?.length" class="space-y-2">
      <p class="text-eyebrow font-semibold text-primary/70 border-b border-primary/20 pb-1">Special Abilities</p>
      <div
        v-for="trait in beast.stat_block.special_abilities"
        :key="trait.name"
        class="text-body leading-snug"
      >
        <span class="font-semibold not-italic">{{ trait.name }}.</span>
        {{ trait.description }}
      </div>
    </div>

    <!-- Actions -->
    <div v-if="beast?.stat_block?.actions?.length" class="space-y-2">
      <p class="text-eyebrow font-semibold text-primary/70 border-b border-primary/20 pb-1">Actions</p>
      <div
        v-for="action in beast.stat_block.actions"
        :key="action.name"
        class="text-body leading-snug"
      >
        <span class="font-semibold not-italic">{{ action.name }}.</span>
        {{ action.description }}
      </div>
    </div>

    <!-- Bonus Actions -->
    <div v-if="beast?.stat_block?.bonus_actions?.length" class="space-y-2">
      <p class="text-eyebrow font-semibold text-primary/70 border-b border-primary/20 pb-1">Bonus Actions</p>
      <div
        v-for="action in beast.stat_block.bonus_actions"
        :key="action.name"
        class="text-body leading-snug"
      >
        <span class="font-semibold not-italic">{{ action.name }}.</span>
        {{ action.description }}
      </div>
    </div>

    <!-- Reactions -->
    <div v-if="beast?.stat_block?.reactions?.length" class="space-y-2">
      <p class="text-eyebrow font-semibold text-primary/70 border-b border-primary/20 pb-1">Reactions</p>
      <div
        v-for="action in beast.stat_block.reactions"
        :key="action.name"
        class="text-body leading-snug"
      >
        <span class="font-semibold not-italic">{{ action.name }}.</span>
        {{ action.description }}
      </div>
    </div>

    <template #footer>
      <div class="shrink-0 border-t border-border px-4 py-3 flex items-center justify-end gap-2">
        <AppButton
          variant="outline"
          fill="muted"
          size="sm"
          label="Cancel"
          @click="emit('close')"
        />
        <AppButton
          variant="tinted"
          tone="primary"
          emphasis="soft"
          size="sm"
          label="🐺 Wild Shape"
          :disabled="!canWildshape && !activeWildshape"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </EntityLightbox>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
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
