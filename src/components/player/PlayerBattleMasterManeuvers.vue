<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">Battle Master Maneuvers</p>
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
        <AppButton
          variant="ghost"
          size="inline-xs"
          label="+ Learn Maneuver"
          @click="showLearnForm = true"
        />
      </div>
      <div v-else class="space-y-2">
        <AppSelect v-model="pendingLearn" tone="muted" size="body" weight="normal" block>
          <option value="" disabled>Select maneuver to learn…</option>
          <option v-for="m in availableToLearn" :key="m.name" :value="m.name">{{ m.name }}</option>
        </AppSelect>
        <div class="flex gap-2">
          <AppButton
            variant="primary"
            size="xs"
            label="Learn"
            :disabled="!pendingLearn"
            @click="confirmLearn"
          />
          <AppButton
            variant="subtle"
            size="xs"
            label="Cancel"
            @click="showLearnForm = false; pendingLearn = ''"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconChevronDown } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { BattleManeuver } from "@/data/battleMasterManeuvers";

const { knownManeuvers, availableToLearn } = defineProps<{
  knownManeuvers: BattleManeuver[];
  availableToLearn: BattleManeuver[];
}>();

const emit = defineEmits<{
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
