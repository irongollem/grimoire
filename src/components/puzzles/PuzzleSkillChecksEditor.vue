<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">Skill Checks</span>
      <button
        type="button"
        class="text-label font-semibold text-primary hover:opacity-80 transition-opacity"
        @click="emit('add-skill-check')"
      >
        + Add
      </button>
    </div>
    <div class="p-4 space-y-2">
      <p v-if="!checks.length" class="font-fell text-xs text-muted-foreground italic">
        No skill checks yet.
      </p>
      <div v-for="(check, i) in checks" :key="i" class="flex items-center gap-2">
        <select
          v-model="check.skill"
          class="flex-1 bg-background border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option v-for="s in PUZZLE_SKILLS" :key="s" :value="s">{{ s }}</option>
        </select>
        <span class="font-cinzel text-xs text-muted-foreground shrink-0">DC</span>
        <input
          v-model.number="check.dc"
          type="number"
          min="1"
          max="30"
          class="w-16 bg-background border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-center"
        />
        <button
          type="button"
          class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          @click="emit('remove-skill-check', i)"
        >
          <IconClose class="size-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconClose } from "@/lib/icons";
import { PUZZLE_SKILLS } from "@/types/puzzle.types";
import type { PuzzleSkillCheck } from "@/types/puzzle.types";

defineProps<{
  checks: PuzzleSkillCheck[];
}>();

const emit = defineEmits<{
  (e: "add-skill-check"): void;
  (e: "remove-skill-check", index: number): void;
}>();
</script>
