<template>
  <AppButton
    variant="menu"
    size="body"
    block
    class="group rounded-none"
    :class="density === 'list' ? 'gap-3 px-4 py-2.5 max-md:min-h-11' : 'min-h-11 gap-2 px-2 py-1.5'"
    v-roll-mode="(mode: RollMode | null) => emit('roll', mode)"
  >
    <span
      class="h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
      :class="profClass"
    >
      <span v-if="level === 'expertise'" class="h-1.5 w-1.5 rounded-full bg-current" />
    </span>
    <span class="text-body flex-1 text-foreground" :class="density === 'compact' && 'min-w-0 text-left leading-tight whitespace-normal'">{{ label }}</span>
    <span v-if="density === 'list'" class="text-label text-muted-foreground/50 mr-1">{{ ability.toUpperCase() }}</span>
    <span class="text-heading-sm font-bold" :class="bonus >= 0 ? 'text-foreground' : 'text-destructive'">
      {{ bonus >= 0 ? `+${bonus}` : bonus }}
    </span>
    <IconChevronRight v-if="density === 'list'" class="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
  </AppButton>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconChevronRight } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import type { RollMode } from "@/lib/dice/roller";
import type { SaveKey } from "@/types/party.types";

/** One skill: proficiency marker, name, bonus. Tap rolls; hold picks a mode. */
const { label, ability, bonus, level, density } = defineProps<{
  label: string;
  ability: SaveKey;
  bonus: number;
  level: "none" | "proficient" | "expertise";
  density: "list" | "compact";
}>();
const emit = defineEmits<{ roll: [mode: RollMode | null] }>();

const profClass = computed(() => {
  if (level === "expertise") return "border-gold-500 text-gold-500";
  if (level === "proficient") return "border-primary text-primary bg-primary/20";
  return "border-muted-foreground/30 text-transparent";
});
</script>
