<template>
  <section aria-labelledby="quest-story-heading" class="space-y-3">
    <div>
      <h3 id="quest-story-heading" class="font-cinzel text-base font-bold text-foreground">Story so far</h3>
      <p class="text-caption text-muted-foreground">Only moments the party has learned or lived through appear here.</p>
    </div>

    <p v-if="!columns.length" class="rounded-lg border border-border bg-card p-3 text-body italic text-muted-foreground">
      No confirmed story moments have been revealed yet.
    </p>

    <div v-else class="grid overflow-hidden rounded-xl border border-border" :style="gridStyle">
      <div
        v-for="(column, columnIndex) in columns"
        :key="column.threadId"
        class="flex flex-col gap-3 p-3 sm:p-4"
        :class="[columnIndex > 0 && 'border-t md:border-l md:border-t-0 border-border', !column.isPrimary && column.tone.bg]"
      >
        <h4 class="flex items-center gap-1.5 text-label-lg font-semibold uppercase tracking-wide" :class="column.tone.text">
          <IconNavigate class="h-3 w-3 shrink-0" aria-hidden="true" />
          {{ column.eyebrow }}
        </h4>

        <ol :aria-label="`${column.label} story so far`" class="flex flex-col">
          <li v-for="(beat, beatIndex) in column.beats" :key="beat.id" class="min-w-0">
            <div v-if="beatIndex > 0" aria-hidden="true" class="ml-4 h-3 w-px" :class="column.isPrimary ? 'bg-border' : column.tone.border" />
            <article
              class="min-w-0 rounded-lg border p-3"
              :class="beat.is_current ? [column.tone.border, 'border-2 bg-card'] : 'border-border bg-muted/20'"
            >
              <p v-if="beat.visibility === 'rumored'" class="font-fell text-body leading-relaxed text-foreground">
                <em>Rumoured:</em>
                {{ ' ' }}{{ beat.player_text || "a rumour is circulating, but its details have not been shared yet." }}
              </p>
              <p v-else-if="beat.player_text" class="font-fell text-body leading-relaxed text-foreground">
                {{ beat.player_text }}
              </p>

              <div
                v-if="beat.is_current || beat.payoff.length"
                class="flex flex-wrap items-center gap-2"
                :class="(beat.visibility === 'rumored' || beat.player_text) && 'mt-2.5 border-t border-border/60 pt-2'"
              >
                <span v-if="beat.is_current" class="flex items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">
                  <span aria-hidden="true" class="h-1.5 w-1.5 rounded-full" :class="[column.tone.dot, !reducedMotion && 'animate-pulse']" />
                  happening now
                </span>
                <template v-for="(entry, entryIndex) in beat.payoff" :key="entryIndex">
                  <span
                    v-if="entry.kind === 'knowledge'"
                    class="flex items-center gap-1 rounded bg-tone-info/15 px-1.5 py-0.5 text-label text-ink-info"
                  >
                    <IconScrollText class="h-3 w-3 shrink-0" aria-hidden="true" />
                    {{ entry.text }}
                  </span>
                  <AppButton
                    v-else-if="entry.state === 'claimable'"
                    variant="tinted"
                    tone="success"
                    emphasis="soft"
                    size="xs"
                    :icon="IconLoot"
                    :label="`Claim: ${entry.label}`"
                    @click="goToChat"
                  />
                  <span v-else class="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground opacity-60">
                    <IconLoot class="h-3 w-3 shrink-0" aria-hidden="true" />
                    {{ entry.label }} · claimed
                  </span>
                </template>
              </div>
            </article>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { IconLoot, IconNavigate, IconScrollText } from "@/lib/icons";
import { prefersReducedMotion } from "@/lib/motion";
import { groupPlayerBeatsByThread } from "@/lib/quests/playerThreads";
import AppButton from "@/components/common/AppButton.vue";
import type { PlayerQuestBeat } from "@/types/quest.types";

const props = defineProps<{ beats: PlayerQuestBeat[] }>();
const reducedMotion = prefersReducedMotion();
const router = useRouter();

const columns = computed(() => groupPlayerBeatsByThread(props.beats));

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.max(columns.value.length, 1)}, minmax(0, 1fr))`,
}));

// A payoff's claimable loot links to the table's chat, where the claim button
// actually lives (`ChatLootChestMessage.vue`/`ChatItemDropMessage.vue`) — the
// journal only ever shows what a beat paid out, never the claiming UI itself.
// `ChatPanelContent` already carries a `focusMessageId` prop to scroll a
// specific drop into view; no player route wires it up yet, so this jumps to
// the chat surface and stops there.
function goToChat() {
  void router.push("/play/chat");
}
</script>
