<template>
  <div
    class="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2 sm:flex-wrap sm:overflow-visible"
    aria-label="Threads in this quest"
  >
    <span class="shrink-0 text-label font-bold uppercase tracking-wider text-primary max-sm:hidden">Threads in this quest</span>

    <AppButton
      v-for="badge in badges"
      :key="badge.thread.id"
      :label="isDimmed(badge.thread) ? `${threadTitle(badge)} (${badge.thread.status})` : threadTitle(badge)"
      variant="tinted"
      :tone="buttonTone(badge.index)"
      :emphasis="badge.thread.id === threadId ? 'strong' : isDimmed(badge.thread) ? 'soft' : 'outline'"
      shape="pill"
      size="xs"
      :class="[
        'shrink-0',
        isDimmed(badge.thread) ? 'opacity-50 max-sm:hidden' : '',
        badge.thread.id === threadId ? 'max-sm:order-first' : '',
      ]"
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
      class="max-sm:hidden border-dashed"
      @click="formOpen = !formOpen"
    />

    <span class="ml-auto max-sm:hidden text-caption text-muted-foreground">Switching is just navigation — no cursor moves and nothing is recorded.</span>

    <!-- Below sm, the picker (every thread, the caption and the create form) moves into a sheet
         behind this counter — five pills plus the caption plus the form wrap into a four-line
         block on a 390px phone and shove the beat card off the fold (frame 5). -->
    <AppButton
      :label="`${badges.length} ›`"
      :aria-label="`${badges.length} threads — open the thread picker`"
      variant="subtle"
      shape="pill"
      size="sm"
      class="ml-auto min-h-11 shrink-0 sm:hidden"
      @click="sheetOpen = true"
    />

    <Transition v-bind="drawerTransition()">
      <QuestThreadOpenForm
        v-show="formOpen"
        v-model:beat-id="newBeatId"
        v-model:label="newLabel"
        v-model:reason="newReason"
        :options="beatOptions"
        :pending="openThread.isPending.value"
        layout="row"
        class="max-sm:hidden"
        @submit="submit"
        @cancel="closeForm"
      />
    </Transition>
    <p v-if="error" role="alert" class="max-sm:hidden basis-full text-caption text-destructive">{{ error }}</p>

    <MobileSheet v-model:open="sheetOpen" title="Threads in this quest" show-until="sm">
      <p class="mb-2 text-caption text-muted-foreground">Switching is just navigation — no cursor moves and nothing is recorded.</p>

      <ul class="space-y-1.5">
        <li v-for="badge in badges" :key="badge.thread.id">
          <AppButton
            variant="subtle"
            size="sm"
            block
            class="min-h-11 justify-start gap-2 rounded-md border border-border p-2.5 text-left"
            :class="isDimmed(badge.thread) ? 'opacity-50' : ''"
            :disabled="isDimmed(badge.thread)"
            @click="selectFromSheet(badge.thread.id)"
          >
            <span
              class="block h-1.5 w-1.5 shrink-0 rounded-full"
              :class="[dotClass(badge.index), badge.thread.id === threadId ? 'animate-pulse' : '']"
            />
            <span class="min-w-0 flex-1 truncate">{{ threadTitle(badge) }}</span>
            <span
              v-if="isDimmed(badge.thread)"
              class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground"
            >{{ badge.thread.status }}</span>
          </AppButton>
        </li>
      </ul>

      <Transition v-bind="drawerTransition()">
        <QuestThreadOpenForm
          v-show="formOpen"
          v-model:beat-id="newBeatId"
          v-model:label="newLabel"
          v-model:reason="newReason"
          :options="beatOptions"
          :pending="openThread.isPending.value"
          layout="stack"
          class="mt-3"
          @submit="submit"
          @cancel="closeForm"
        />
      </Transition>
      <p v-if="error" role="alert" class="mt-2 text-caption text-destructive">{{ error }}</p>

      <template #footer>
        <AppButton
          label="Open a thread"
          :icon="IconAdd"
          variant="subtle"
          shape="pill"
          size="sm"
          class="min-h-11 w-full border-dashed"
          @click="formOpen = !formOpen"
        />
      </template>
    </MobileSheet>
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
import MobileSheet from "@/components/common/MobileSheet.vue";
import QuestThreadOpenForm from "./QuestThreadOpenForm.vue";

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

// #872 frame 5: below `sm` the picker (every thread, dimmed ones included) lives
// in this sheet behind the trailing counter pill. Selecting one is exactly the
// pill's own click handler, plus closing the sheet.
const sheetOpen = ref(false);
function selectFromSheet(id: string) {
  emit("switch", id);
  sheetOpen.value = false;
}

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
