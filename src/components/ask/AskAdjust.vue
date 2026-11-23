<template>
  <div class="flex flex-col gap-2 border-t border-border/60 pt-2" data-testid="ask-adjust">
    <p v-if="fields.length === 0" class="text-caption text-muted-foreground">Nothing here to adjust.</p>
    <div v-for="[key, schema] in fields" :key="key" class="flex flex-col gap-1">
      <span class="text-eyebrow uppercase text-muted-foreground">{{ label(key) }}</span>
      <div v-if="schema.type === 'boolean'" class="flex items-center gap-2">
        <ToggleSwitch :model-value="inputs[key] === true" :aria-label="label(key)" @update:model-value="set(key, $event)" />
        <span class="text-caption text-muted-foreground">{{ schema.description }}</span>
      </div>
      <div v-else-if="schema.type === 'string' && schema.enum" class="flex flex-wrap gap-1.5">
        <AppButton
          v-for="option in schema.enum"
          :key="option"
          variant="chip"
          size="xs"
          :active="inputs[key] === option"
          :label="option"
          @click="set(key, inputs[key] === option ? undefined : option)"
        />
      </div>
      <AppInput
        v-else-if="schema.type === 'integer'"
        type="number"
        size="sm"
        :model-value="typeof inputs[key] === 'number' ? inputs[key] : ''"
        :placeholder="schema.description"
        @update:model-value="setNumber(key, $event)"
      />
      <AppInput
        v-else
        size="sm"
        :model-value="typeof inputs[key] === 'string' ? inputs[key] : ''"
        :placeholder="schema.description"
        @update:model-value="set(key, typeof $event === 'string' && $event.trim() !== '' ? $event : undefined)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Adjust on a quote card: the generator's own options as editable fields (a toggle for yes or no, chips for a fixed
 * set, a field for words and numbers). Every edit emits the whole new `inputs`, and the card re-quotes from it.
 * `*_id` options are left out: they name a record the model resolved, and typing an id by hand helps nobody. So is a
 * `links` option (a list of ties to records, each with an id): a text field would overwrite the list with a string.
 */
import { computed } from "vue";
import type { AskGenerator, AskInputSchema } from "@edge-shared/agent/askContract";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";

const { generator, inputs } = defineProps<{ generator: AskGenerator; inputs: Record<string, unknown> }>();
const emit = defineEmits<{ update: [inputs: Record<string, unknown>] }>();

const fields = computed<[string, AskInputSchema][]>(() => Object.entries(generator.inputs).filter(([key, schema]) => !key.endsWith("_id") && schema.type !== "links"));

const label = (key: string) => key.replace(/_/g, " ");

function set(key: string, value: unknown) {
  const next = { ...inputs };
  if (value === undefined || value === false) delete next[key];
  else next[key] = value;
  emit("update", next);
}

function setNumber(key: string, raw: unknown) {
  const n = typeof raw === "number" ? raw : Number(raw);
  set(key, raw === "" || raw === null || !Number.isFinite(n) ? undefined : n);
}
</script>
