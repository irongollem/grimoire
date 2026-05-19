<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Wizard Steps</h2>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-cinzel text-[10px] tracking-wider text-foreground hover:bg-muted/40 transition-colors"
        @click="addStep"
      >
        <IconAdd class="h-3 w-3" />
        Add step
      </button>
    </div>
    <p class="font-fell text-sm text-muted-foreground">
      Steps shown to the player in the level-up wizard (e.g. choose a fighting style at level 1).
    </p>

    <div v-if="steps.length === 0" class="font-fell text-sm text-muted-foreground italic">No steps defined.</div>

    <div v-for="(step, i) in steps" :key="i" class="rounded-md border border-border p-3 space-y-3 relative">
      <button type="button" class="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors" @click="removeStep(i)">
        <IconClose class="h-3.5 w-3.5" />
      </button>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">LEVEL</label>
          <input :value="step.level" type="number" min="1" max="20"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="updateStep(i, 'level', Number(($event.target as HTMLInputElement).value))" />
        </div>
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">TYPE</label>
          <select :value="step.type" class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="updateStep(i, 'type', ($event.target as HTMLSelectElement).value as 'select' | 'append')">
            <option value="select">Pick one</option>
            <option value="append">Accumulate</option>
          </select>
        </div>
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">OPTIONS FROM</label>
          <select :value="step.step_type" class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="updateStep(i, 'step_type', ($event.target as HTMLSelectElement).value as 'feature_pick' | 'spell_pick' | 'text_pick')">
            <option value="feature_pick">Abilities compendium</option>
            <option value="spell_pick">Spellbook</option>
            <option value="text_pick">Custom text</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">KEY</label>
          <input :value="step.key" placeholder="e.g. fighting_style"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="updateStep(i, 'key', ($event.target as HTMLInputElement).value)" />
        </div>
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">PICKS (count)</label>
          <input :value="step.count" type="number" min="1" placeholder="1"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="updateStep(i, 'count', Number(($event.target as HTMLInputElement).value))" />
        </div>
      </div>

      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">LABEL</label>
        <input :value="step.label" placeholder="e.g. Choose Fighting Style"
          class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="updateStep(i, 'label', ($event.target as HTMLInputElement).value)" />
      </div>

      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">DESCRIPTION (optional)</label>
        <input :value="step.description" placeholder="Optional hint shown in wizard…"
          class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="updateStep(i, 'description', ($event.target as HTMLInputElement).value)" />
      </div>

      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">OPTIONS</label>
        <template v-if="step.step_type === 'feature_pick'">
          <div v-if="step.options.length > 0" class="flex flex-wrap gap-1.5 mb-2">
            <span v-for="fid in step.options" :key="fid"
              class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-fell text-xs text-primary">
              {{ featureNameById(fid) }}
              <button type="button" class="ml-0.5 text-primary/60 hover:text-destructive transition-colors leading-none" @click="removeOptionFromStep(i, fid)">×</button>
            </span>
          </div>
          <EntityCombobox model-value="" :options="availableOptionsForStep(i)" placeholder="Add ability option…"
            @update:model-value="(fid) => fid && addOptionToStep(i, fid)" />
        </template>
        <TagInput v-else :model-value="step.options" placeholder="Add option…" @update:model-value="(opts) => updateStepOptions(i, opts)" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IconAdd, IconClose } from "@/lib/icons";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import type { CustomStep, StepType } from "@/levelup/customTypes";

const { steps, allFeatureOptions } = defineProps<{
  steps: CustomStep[];
  allFeatureOptions: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  "update:steps": [value: CustomStep[]];
}>();

function featureNameById(featureId: string): string {
  return allFeatureOptions.find(f => f.id === featureId)?.name ?? featureId;
}

function availableOptionsForStep(stepIdx: number) {
  const selected = new Set(steps[stepIdx]?.options ?? []);
  return allFeatureOptions.filter(f => !selected.has(f.id));
}

function addStep() {
  emit("update:steps", [...steps, { level: 1, type: "select", step_type: "text_pick" as StepType, key: "", label: "", options: [] }]);
}

function removeStep(i: number) {
  emit("update:steps", steps.filter((_, idx) => idx !== i));
}

function updateStep<K extends keyof CustomStep>(i: number, field: K, value: CustomStep[K]) {
  const next = steps.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
  emit("update:steps", next);
}

function updateStepOptions(i: number, options: string[]) {
  updateStep(i, "options", options);
}

function addOptionToStep(stepIdx: number, featureId: string) {
  const step = steps[stepIdx];
  if (step && !step.options.includes(featureId)) {
    updateStep(stepIdx, "options", [...step.options, featureId]);
  }
}

function removeOptionFromStep(stepIdx: number, featureId: string) {
  const step = steps[stepIdx];
  if (step) {
    updateStep(stepIdx, "options", step.options.filter(id => id !== featureId));
  }
}
</script>
