<template>
  <div>
    <label class="field-label" :for="inputId">Who</label>

    <div v-if="selected" class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      <span class="min-w-0 truncate text-body font-bold text-foreground">{{ selected.name }}</span>
      <AppButton variant="ghost" size="sm" label="Change" @click="emit('update:modelValue', null)" />
    </div>

    <template v-else>
      <AppInput :id="inputId" v-model="query" tone="card" size="body" block placeholder="Search NPCs and characters…" autocomplete="off" />
      <ul v-if="matches.length > 0" data-slip class="mt-1 max-h-48 divide-y divide-dotted divide-border overflow-y-auto rounded-md border border-border bg-card">
        <li v-for="p in matches" :key="p.key">
          <button
            type="button"
            class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-muted/60"
            @click="emit('update:modelValue', p.key)"
          >
            <span class="truncate text-body font-bold text-foreground">{{ p.name }}</span>
            <span class="shrink-0 text-caption italic text-muted-foreground">{{ p.meta }}</span>
          </button>
        </li>
      </ul>
      <div v-if="typed && !exact" class="mt-2 flex flex-wrap gap-2">
        <AppButton variant="outline" fill="muted" size="sm" :loading="creating" :label="`+ New NPC “${typed}”`" @click="emit('create', typed)" />
        <AppButton
          v-if="draftLabel"
          variant="outline"
          fill="muted"
          size="sm"
          :icon="IconGenerate"
          icon-size="xs"
          :label="draftLabel"
          @click="emit('draft')"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconGenerate } from "@/lib/icons";
import type { PersonKey } from "@/types/kinship.types";

export interface WhoOption {
  key: PersonKey;
  name: string;
  /** Life dates, e.g. "born 1459 · 36". */
  meta: string;
}

/**
 * The "Who" picker of Add relative. EntityCombobox is not used because this
 * list ends in two actions on the typed text (a new NPC, a drafted one), which
 * it has no place for. The search is a popup of candidates, so it stays local.
 */
const { options, modelValue, draftLabel = null, creating = false } = defineProps<{
  options: readonly WhoOption[];
  modelValue: PersonKey | null;
  /** The label of the "Draft with AI" action, or null when it is not offered here. */
  draftLabel?: string | null;
  creating?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [key: PersonKey | null]; create: [name: string]; draft: [] }>();

const inputId = useId();
const query = ref("");
const typed = computed(() => query.value.trim());
const selected = computed(() => options.find((o) => o.key === modelValue) ?? null);
const matches = computed(() => {
  const q = typed.value.toLowerCase();
  const list = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  return list.slice(0, 8);
});
const exact = computed(() => options.some((o) => o.name.toLowerCase() === typed.value.toLowerCase()));
</script>
