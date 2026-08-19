<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">Skill Checks</span>
      <AppButton variant="link" size="inline-xs" label="+ Add" @click="emit('add-skill-check')" />
    </div>
    <div class="p-4 space-y-2">
      <p v-if="!checks.length" class="text-caption text-muted-foreground italic">
        No skill checks yet.
      </p>
      <div v-for="(check, i) in checks" :key="i" class="flex items-center gap-2">
        <AppSelect
          v-model="check.skill"
          tone="default"
          size="body"
          weight="normal"
          block
          class="flex-1"
        >
          <option v-for="s in PUZZLE_SKILLS" :key="s" :value="s">{{ s }}</option>
        </AppSelect>
        <span class="font-cinzel text-xs text-muted-foreground shrink-0">DC</span>
        <AppInput
          v-model.number="check.dc"
          type="number"
          min="1"
          max="30"
          tone="default"
          size="body"
          align="center"
          class="w-16"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-xs"
          :icon="IconClose"
          aria-label="Remove skill check"
          @click="emit('remove-skill-check', i)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
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
