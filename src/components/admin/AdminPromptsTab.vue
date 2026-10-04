<template>
  <div class="space-y-4">
    <div v-if="promptsQuery.isPending.value" class="text-muted-foreground text-body">
      Loading prompts…
    </div>
    <div v-else-if="promptsQuery.isError.value" class="text-destructive text-body">
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
            <h2 class="text-heading-sm font-semibold text-foreground">
              {{ prompt.label }}
            </h2>
            <span class="text-eyebrow text-muted-foreground uppercase">
              {{ prompt.generator_type }}
            </span>
          </div>
          <AppButton
            variant="primary"
            size="sm"
            :disabled="promptSaving[prompt.generator_type]"
            :label="promptSaving[prompt.generator_type] ? 'Saving…' : 'Save'"
            @click="savePrompt(prompt)"
          />
        </div>
        <DraftConflictNotice
          :fields="drafts.conflicts[prompt.generator_type]?.length ? ['Prompt text'] : []"
          :on-discard="() => drafts.reset(prompt.generator_type)"
        />
        <textarea
          v-model="drafts.drafts[prompt.generator_type]!.content"
          rows="12"
          class="w-full bg-muted border border-border rounded px-2.5 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
import { useAdminPrompts } from "@/composables/admin/useAdminPrompts";
import type { AiSystemPrompt } from "@/composables/admin/useAdminPrompts";
import { useKeyedRecordDrafts } from "@/composables/admin/useKeyedRecordDrafts";

const promptsQuery = useAdminPrompts();
const promptSaving = reactive<Record<string, boolean>>({});

// Each prompt saves on its own, and a refetch (another admin, another tab) must
// reach prompts that have not been touched here (#946).
const drafts = useKeyedRecordDrafts<AiSystemPrompt, { content: string }>((p) => ({ content: p.content }));

watch(
  () => promptsQuery.prompts.value,
  (list) => {
    if (!list) return;
    for (const p of list) drafts.sync(p.generator_type, p);
  },
  { immediate: true },
);

async function savePrompt(prompt: AiSystemPrompt) {
  const key = prompt.generator_type;
  const changed = drafts.changes(key, (d) => d);
  if (changed.content === undefined) return;
  promptSaving[key] = true;
  try {
    await promptsQuery.updatePrompt.mutateAsync({ generator_type: key, content: changed.content });
    drafts.commit(key);
  } finally {
    promptSaving[key] = false;
  }
}
</script>
