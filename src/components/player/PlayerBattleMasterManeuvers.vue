<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border flex items-center justify-between">
      <p class="text-label-lg font-semibold text-muted-foreground">Battle Master Maneuvers</p>
      <div class="flex items-center gap-2">
        <span class="text-label rounded px-1.5 py-0.5 bg-muted/50 text-muted-foreground border border-border">{{ superiorityDiceSize }}</span>
      </div>
    </div>
    <!-- Superiority dice track -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border">
      <span class="text-body text-muted-foreground flex-1">Superiority Dice</span>
      <button
        class="h-6 w-6 rounded border border-border font-cinzel text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        :disabled="superiorityDiceCurrent <= 0"
        @click="emit('spend-superiority-die')"
      >−</button>
      <span class="font-cinzel text-sm text-foreground w-10 text-center">
        {{ superiorityDiceCurrent }} / {{ superiorityDiceMax }}
      </span>
      <button
        class="h-6 w-6 rounded border border-border font-cinzel text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        :disabled="superiorityDiceCurrent >= superiorityDiceMax"
        @click="emit('restore-superiority-die')"
      >+</button>
    </div>
    <!-- Known maneuvers -->
    <div class="divide-y divide-border">
      <div v-if="knownManeuvers.length === 0" class="px-4 py-3">
        <p class="text-body text-muted-foreground italic">No maneuvers learned yet.</p>
      </div>
      <div v-for="maneuver in knownManeuvers" :key="maneuver.name" class="px-4 py-2.5">
        <button
          class="w-full text-left flex items-center gap-2 cursor-pointer"
          @click="toggleExpanded(`maneuver-${maneuver.name}`)"
        >
          <span class="text-body text-foreground flex-1">{{ maneuver.name }}</span>
          <IconChevronDown
            class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
            :class="expanded.has(`maneuver-${maneuver.name}`) ? 'rotate-180' : ''"
          />
        </button>
        <div
          v-if="expanded.has(`maneuver-${maneuver.name}`)"
          class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 text-body text-muted-foreground leading-relaxed"
        >
          <p class="text-caption text-primary/70 mb-1 italic">{{ maneuver.timing }}</p>
          {{ maneuver.description }}
        </div>
      </div>
    </div>
    <!-- Learn maneuver -->
    <div v-if="availableToLearn.length > 0" class="px-4 py-2.5 border-t border-border">
      <div v-if="!showLearnForm" class="flex justify-start">
        <button
          class="text-label text-muted-foreground hover:text-foreground transition-colors"
          @click="showLearnForm = true"
        >+ Learn Maneuver</button>
      </div>
      <div v-else class="space-y-2">
        <select
          v-model="pendingLearn"
          class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>Select maneuver to learn…</option>
          <option v-for="m in availableToLearn" :key="m.name" :value="m.name">{{ m.name }}</option>
        </select>
        <div class="flex gap-2">
          <button
            :disabled="!pendingLearn"
            class="text-label px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
            @click="confirmLearn"
          >Learn</button>
          <button
            class="text-label px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
            @click="showLearnForm = false; pendingLearn = ''"
          >Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconChevronDown } from "@/lib/icons";
import type { BattleManeuver } from "@/data/battleMasterManeuvers";

const {
  knownManeuvers,
  availableToLearn,
  superiorityDiceSize,
  superiorityDiceCurrent,
  superiorityDiceMax,
} = defineProps<{
  knownManeuvers: BattleManeuver[];
  availableToLearn: BattleManeuver[];
  superiorityDiceSize: string;
  superiorityDiceCurrent: number;
  superiorityDiceMax: number;
}>();

const emit = defineEmits<{
  "spend-superiority-die": [];
  "restore-superiority-die": [];
  "learn-maneuver": [name: string];
}>();

const expanded = ref(new Set<string>());
function toggleExpanded(name: string) {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
  expanded.value = new Set(expanded.value);
}

const showLearnForm = ref(false);
const pendingLearn = ref("");

function confirmLearn() {
  if (!pendingLearn.value) return;
  emit("learn-maneuver", pendingLearn.value);
  showLearnForm.value = false;
  pendingLearn.value = "";
}
</script>
