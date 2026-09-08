<template>
  <div class="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2" aria-label="Threads in this quest">
    <span class="text-label font-bold uppercase tracking-wider text-primary">Threads in this quest</span>

    <AppButton
      v-for="badge in badges"
      :key="badge.thread.id"
      :label="isDimmed(badge.thread) ? `${threadTitle(badge)} (${badge.thread.status})` : threadTitle(badge)"
      variant="tinted"
      :tone="buttonTone(badge.index)"
      :emphasis="badge.thread.id === threadId ? 'strong' : isDimmed(badge.thread) ? 'soft' : 'outline'"
      shape="pill"
      size="xs"
      :class="isDimmed(badge.thread) ? 'opacity-50' : ''"
      :disabled="isDimmed(badge.thread)"
      @click="emit('switch', badge.thread.id)"
    >
      <template #icon>
        <span
          class="block h-1.5 w-1.5 shrink-0 rounded-full"
          :class="[dotClass(badge.index), badge.thread.id === threadId ? 'animate-pulse' : '']"
        />
      </template>
    </AppButton>

    <AppButton
      label="Open a thread"
      :icon="IconAdd"
      variant="subtle"
      shape="pill"
      size="xs"
      class="border-dashed"
      @click="formOpen = !formOpen"
    />

    <span class="ml-auto text-caption text-muted-foreground">Switching is just navigation — no cursor moves and nothing is recorded.</span>

    <Transition v-bind="drawerTransition()">
      <div v-show="formOpen" class="flex w-full flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-end">
        <div class="min-w-0 flex-1">
          <p class="mb-1 text-caption text-muted-foreground">Beat</p>
          <EntityCombobox v-model="newBeatId" :options="beatOptions" placeholder="Choose a beat…" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="mb-1 text-caption text-muted-foreground">Label</p>
          <AppInput v-model="newLabel" placeholder="What is this thread?" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="mb-1 text-caption text-muted-foreground">Reason</p>
          <AppInput v-model="newReason" placeholder="Why open it now? (optional)" />
        </div>
        <div class="flex gap-2">
          <AppButton label="Cancel" size="sm" variant="subtle" @click="closeForm" />
          <AppButton label="Open thread" size="sm" variant="primary" :loading="openThread.isPending.value" :disabled="!newBeatId || !newLabel.trim()" @click="submit" />
        </div>
      </div>
    </Transition>
    <p v-if="error" role="alert" class="basis-full text-caption text-destructive">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The cockpit runs one thread at a time; switching is free (#853, story F).
 * Every thread the quest holds gets a pill — live and waiting ones are
 * selectable, closed and merged ones are shown dimmed for context but cannot
 * be switched to. Deliberately reads `useQuestThreads` rather than
 * `context.threads`: the bar's whole job is showing threads a running
 * context does not otherwise surface (closed/merged), so it owns that query
 * itself instead of asking the cockpit to thread it through.
 */
import { computed, ref } from "vue";
import { useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useOpenQuestThread, useQuestThreads } from "@/composables/quests/useQuestThreads";
import { threadBadges, threadTitle } from "@/lib/quests/threads";
import { drawerTransition } from "@/lib/motion";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const { questId, campaignId, threadId } = defineProps<{ questId: string; campaignId: string; threadId: string }>();
const emit = defineEmits<{ switch: [threadId: string] }>();

const threadsQuery = useQuestThreads(computed(() => questId));
const beatsQuery = useQuestBeats(computed(() => questId));
const openThread = useOpenQuestThread();

const badges = computed(() => threadBadges(threadsQuery.data.value ?? []));
const beatOptions = computed(() => (beatsQuery.data.value ?? []).map((beat) => ({ id: beat.id, name: beat.title || "Untitled beat" })));

/** A merged/closed thread is shown for context but is not a place to switch to. */
function isDimmed(thread: { status: string }): boolean {
  return thread.status === "closed" || thread.status === "merged";
}

const THREAD_BUTTON_TONES = ["primary", "info", "arcane"] as const;
function buttonTone(index: number): typeof THREAD_BUTTON_TONES[number] {
  return THREAD_BUTTON_TONES[((index % THREAD_BUTTON_TONES.length) + THREAD_BUTTON_TONES.length) % THREAD_BUTTON_TONES.length]!;
}
const DOT_CLASSES = ["bg-primary", "bg-ink-info", "bg-ink-arcane"] as const;
function dotClass(index: number): string {
  return DOT_CLASSES[((index % DOT_CLASSES.length) + DOT_CLASSES.length) % DOT_CLASSES.length]!;
}

const formOpen = ref(false);
const newBeatId = ref("");
const newLabel = ref("");
const newReason = ref("");
const error = ref("");

function closeForm() {
  formOpen.value = false;
  newBeatId.value = "";
  newLabel.value = "";
  newReason.value = "";
  error.value = "";
}

async function submit() {
  if (!newBeatId.value || !newLabel.value.trim()) return;
  error.value = "";
  try {
    const context = await openThread.mutateAsync({
      campaignId, questId, beatId: newBeatId.value, label: newLabel.value.trim(), reason: newReason.value.trim() || undefined,
    });
    closeForm();
    emit("switch", context.thread.id);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "The thread could not be opened";
  }
}
</script>
