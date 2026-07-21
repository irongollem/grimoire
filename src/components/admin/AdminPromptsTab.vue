<template>
  <div class="space-y-4">
    <div v-if="promptsQuery.isPending.value" class="text-muted-foreground font-fell text-sm">
      Loading prompts…
    </div>
    <div v-else-if="promptsQuery.isError.value" class="text-destructive font-fell text-sm">
      Failed to load prompts.
    </div>
    <div v-else class="space-y-4">
      <div
        v-for="prompt in promptsQuery.prompts.value ?? []"
        :key="prompt.generator_type"
        class="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">
              {{ prompt.label }}
            </h2>
            <span class="font-cinzel text-2xs tracking-widest text-muted-foreground uppercase">
              {{ prompt.generator_type }}
            </span>
          </div>
          <button
            class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            :disabled="promptSaving[prompt.generator_type]"
            @click="savePrompt(prompt)"
          >
            {{ promptSaving[prompt.generator_type] ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <textarea
          v-model="draftPrompts[prompt.generator_type]"
          rows="12"
          class="w-full bg-muted border border-border rounded px-2.5 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import { useAdminPrompts } from "@/composables/useAdminPrompts";
import type { AiSystemPrompt } from "@/composables/useAdminPrompts";

const promptsQuery = useAdminPrompts();
const draftPrompts = reactive<Record<string, string>>({});
const promptSaving = reactive<Record<string, boolean>>({});

watch(
  () => promptsQuery.prompts.value,
  (list) => {
    if (!list) return;
    for (const p of list) {
      if (!(p.generator_type in draftPrompts)) {
        draftPrompts[p.generator_type] = p.content;
      }
    }
  },
  { immediate: true },
);

async function savePrompt(prompt: AiSystemPrompt) {
  promptSaving[prompt.generator_type] = true;
  try {
    await promptsQuery.updatePrompt.mutateAsync({
      generator_type: prompt.generator_type,
      content: draftPrompts[prompt.generator_type] ?? prompt.content,
    });
  } finally {
    promptSaving[prompt.generator_type] = false;
  }
}
</script>
