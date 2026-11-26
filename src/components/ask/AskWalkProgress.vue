<template>
  <div class="shrink-0 border-b border-border/60 px-4 py-1.5" data-testid="walk-progress">
    <div class="flex items-center justify-between gap-2">
      <AppButton
        variant="ghost"
        size="inline-caption"
        :icon-right="open ? IconChevronUp : IconChevronDown"
        :aria-expanded="open"
        class="min-w-0 truncate"
        data-testid="walk-progress-toggle"
        @click="open = !open"
      >
        <span class="font-semibold text-foreground">Design it with me</span>
        <span class="truncate text-muted-foreground">{{ summary }}</span>
      </AppButton>
      <AppButton variant="ghost" size="inline-caption" class="shrink-0 whitespace-nowrap" label="Leave the walk" data-testid="walk-leave" @click="emit('leave')" />
    </div>
    <ol v-if="open" class="mt-1.5 flex max-h-56 list-none flex-col gap-0.5 overflow-y-auto p-0" aria-label="Sections" data-testid="walk-progress-list">
      <li v-for="s in progress" :key="stopKey(s)" :data-state="s.state" class="flex items-center gap-1">
        <AppButton
          variant="ghost"
          size="sm"
          block
          class="min-w-0 justify-between gap-2"
          :active="s.current"
          :aria-current="s.current ? 'step' : undefined"
          :data-testid="`walk-stop-${stopKey(s)}`"
          @click="jumpTo(s)"
        >
          <span class="min-w-0 truncate" :class="s.current ? 'font-bold text-foreground' : ''">{{ stopTitle(s) }}</span>
          <span class="shrink-0 text-caption text-muted-foreground">{{ s.state === "filled" ? "✓ " : "" }}{{ stateWord(s.state) }}</span>
        </AppButton>
        <!-- Bringing a section back removes its skip, then asks its question. A character's stop has no skip row of its own. -->
        <AppButton v-if="s.state === 'skipped' && s.memberId === null" variant="link" size="inline-caption" label="Bring back" :data-testid="`walk-bring-back-${stopKey(s)}`" @click="bringBack.mutate(s.step, { onSuccess: () => jumpTo(s) })" />
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
/**
 * The walk's place under the Familiar's header (#1282): one slim line while it runs, opening into every stop with its
 * state. Pressing a stop asks that question now; a skipped section can be brought back; the walk can be left.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCanonWalkSkipActions } from "@/composables/canon/useCanonWalkSkips";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import { creditsText } from "@/lib/ask/askCredits";
import { stateWord, stopTitle, type AskWalkView } from "@/lib/ask/askWalkCopy";
import { stopKey, type WalkStopRef } from "@/lib/canon/canonWalk";

const { progress, spent = 0 } = defineProps<{ progress: AskWalkView["progress"]; spent?: number }>();
const emit = defineEmits<{ jump: [stop: WalkStopRef]; leave: [] }>();

const open = ref(false);

// A jump closes the list: the question it asks is below it, and the box is where the answer goes (the panel puts the
// focus there as the question is asked). Left open, the list covered half the pane on a laptop.
function jumpTo(stop: WalkStopRef) {
  open.value = false;
  emit("jump", stop);
}
const { bringBack } = useCanonWalkSkipActions();

const summary = computed(() => {
  const here = progress.find((s) => s.current);
  const done = progress.filter((s) => s.state !== "todo").length;
  // The running total stands in for a price on every cheap draft's button (#1282, the notable-price rule).
  const cost = spent > 0 ? ` · ${creditsText(spent)}` : "";
  return `${here ? `${stopTitle(here)} · ` : ""}${done} of ${progress.length} done${cost}`;
});
</script>
