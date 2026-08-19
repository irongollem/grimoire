<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Wizard Steps</h2>
      <AppButton variant="outline" size="xs" label="Add step" :icon="IconAdd" icon-size="xs" @click="addStep" />
    </div>
    <p class="text-body text-muted-foreground">
      Steps shown to the player in the level-up wizard (e.g. choose a fighting style at level 1).
    </p>

    <div v-if="steps.length === 0" class="text-body text-muted-foreground italic">No steps defined.</div>

    <div v-for="(step, i) in steps" :key="i" class="rounded-md border border-border p-3 space-y-3 relative">
      <AppButton
        variant="ghost"
        tone="danger"
        size="icon-xs"
        :icon="IconClose"
        class="absolute top-2 right-2"
        @click="removeStep(i)"
      />

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">LEVEL</label>
          <AppInput
            v-model.number="stepField(i, 'level').value"
            type="number" min="1" max="20"
            tone="muted"
            size="body-xs"
          />
        </div>
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">TYPE</label>
          <AppSelect v-model="stepField(i, 'type').value" tone="muted" size="body-xs" weight="normal" block>
            <option value="select">Pick one</option>
            <option value="append">Accumulate</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">OPTIONS FROM</label>
          <AppSelect v-model="stepField(i, 'step_type').value" tone="muted" size="body-xs" weight="normal" block>
            <option value="feature_pick">Abilities compendium</option>
            <option value="spell_pick">Spellbook</option>
            <option value="text_pick">Custom text</option>
          </AppSelect>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">KEY</label>
          <AppInput
            v-model="stepField(i, 'key').value"
            placeholder="e.g. fighting_style"
            tone="muted"
            size="body-xs"
          />
        </div>
        <div>
          <label class="block text-label text-muted-foreground mb-1">PICKS (count)</label>
          <AppInput
            v-model.number="stepField(i, 'count').value"
            type="number" min="1" placeholder="1"
            tone="muted"
            size="body-xs"
          />
        </div>
      </div>

      <div>
        <label class="block text-eyebrow text-muted-foreground mb-1">LABEL</label>
        <AppInput
          v-model="stepField(i, 'label').value"
          placeholder="e.g. Choose Fighting Style"
          tone="muted"
          size="body-xs"
        />
      </div>

      <div>
        <label class="block text-label text-muted-foreground mb-1">DESCRIPTION (optional)</label>
        <AppInput
          v-model="stepField(i, 'description').value"
          placeholder="Optional hint shown in wizard…"
          tone="muted"
          size="body-xs"
        />
      </div>

      <div>
        <label class="block text-eyebrow text-muted-foreground mb-1">OPTIONS</label>
        <template v-if="step.step_type === 'feature_pick'">
          <div v-if="step.options.length > 0" class="flex flex-wrap gap-1.5 mb-2">
            <span v-for="fid in step.options" :key="fid"
              class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-caption text-primary">
              {{ featureNameById(fid) }}
              <AppButton
                variant="ghost"
                tone="danger"
                size="inline-xs"
                label="×"
                class="ml-0.5 text-primary/60"
                @click="removeOptionFromStep(i, fid)"
              />
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
import { computed } from "vue";
import { IconAdd, IconClose } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
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

// Per-field writable proxy that routes an AppInput/AppSelect v-model through
// updateStep() rather than mutating the (immutable, emit-driven) `steps` prop
// directly — this component replaces the whole array on every edit, unlike
// components that own a locally-reactive form model.
function stepField<K extends keyof CustomStep>(i: number, field: K) {
  return computed<CustomStep[K]>({
    get: () => steps[i][field],
    set: (value) => updateStep(i, field, value),
  });
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
