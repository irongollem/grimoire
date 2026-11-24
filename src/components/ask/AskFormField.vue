<template>
  <div class="flex flex-col gap-1" :data-testid="`ask-field-${inputKey}`">
    <span v-if="schema.type !== 'links'" class="text-eyebrow uppercase text-muted-foreground">{{ inputLabel(inputKey, schema) }}</span>
    <GeneratorLinksField
      v-if="schema.type === 'links'"
      :model-value="ties"
      :subject-kind="schema.subject"
      :noun="noun"
      @update:model-value="emit('update:ties', $event)"
    />
    <div v-else-if="schema.type === 'boolean'" class="flex items-center gap-2">
      <ToggleSwitch :model-value="modelValue === true" :aria-label="inputLabel(inputKey, schema)" @update:model-value="emit('update:modelValue', $event)" />
      <span v-if="schema.hint" class="text-caption text-muted-foreground">{{ schema.hint }}</span>
    </div>
    <EntityCombobox
      v-else-if="options !== null"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      :options="options"
      :selected-label="schema.type === 'string' && schema.record === undefined && typeof modelValue === 'string' ? modelValue : null"
      :placeholder="schema.placeholder ?? 'Search…'"
      @update:model-value="emit('update:modelValue', $event === '' ? undefined : $event)"
    />
    <div v-else-if="schema.type === 'string' && schema.enum" class="flex flex-wrap gap-1.5">
      <AppButton
        v-for="option in schema.enum"
        :key="option"
        variant="chip"
        size="xs"
        :active="modelValue === option"
        :label="optionLabel(schema, option)"
        @click="emit('update:modelValue', modelValue === option ? undefined : option)"
      />
    </div>
    <AppInput
      v-else-if="schema.type === 'integer'"
      type="number"
      size="sm"
      :model-value="typeof modelValue === 'number' ? modelValue : ''"
      :placeholder="schema.placeholder"
      @update:model-value="emit('update:modelValue', whole($event))"
    />
    <!-- Words that run over several lines (lyrics): a model-facing words box, so a native textarea (CLAUDE.md, Sanctioned Exceptions), in the DM's hand and growing with what is written. -->
    <textarea
      v-else-if="schema.type === 'string' && schema.multiline"
      :value="typeof modelValue === 'string' ? modelValue : ''"
      :rows="rowsFor(modelValue)"
      :placeholder="schema.placeholder"
      :aria-label="inputLabel(inputKey, schema)"
      data-hand="text"
      class="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-base leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      :data-testid="`ask-multiline-${inputKey}`"
      @input="emit('update:modelValue', textOrUndefined(($event.target as HTMLTextAreaElement).value))"
    />
    <AppInput
      v-else
      size="sm"
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      :placeholder="schema.placeholder"
      @update:model-value="emit('update:modelValue', typeof $event === 'string' && $event.trim() !== '' ? $event : undefined)"
    />
    <p v-if="aside" class="text-caption text-muted-foreground" :data-testid="`ask-aside-${inputKey}`">{{ aside }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * One input of the card's form (#1270), drawn by what the contract says it is: a switch, chips for a short fixed set, a
 * searchable pick for a long list or a record, the ties field, a number or a field of words. `options` is the pick's
 * list when the input has one (the parent knows where each list comes from), else null. Nothing here is free text
 * unless the input is words: a record is picked by name and carries an id.
 */
import type { AskInputSchema } from "@edge-shared/agent/askContract";
import { inputLabel, optionLabel } from "@/ai/ask/askForm";
import type { AskRecordOption } from "@/ai/ask/askOptions";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import GeneratorLinksField from "@/components/generators/GeneratorLinksField.vue";

const { inputKey, schema, modelValue, options, ties, noun, aside = null } = defineProps<{
  inputKey: string;
  schema: AskInputSchema;
  modelValue: unknown;
  options: AskRecordOption[] | null;
  /** The pending ties, for a `links` input. */
  ties: readonly GeneratorLink[];
  /** A quiet line under the field, read from the card's inputs (`askAsides.ts`). */
  aside?: string | null;
  /** What the new record is called in the ties dialog ("this NPC"). */
  noun: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: unknown];
  "update:ties": [ties: GeneratorLink[]];
}>();

/** A box that grows with its lines, from three to twelve before it scrolls. */
function rowsFor(value: unknown): number {
  const lines = typeof value === "string" ? value.split("\n").length : 1;
  return Math.min(12, Math.max(3, lines + 1));
}

function textOrUndefined(text: string): string | undefined {
  return text.trim() !== "" ? text : undefined;
}

function whole(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : Number(raw);
  return raw === "" || raw === null || !Number.isFinite(n) ? undefined : n;
}
</script>
