<template>
  <aside class="space-y-3 rounded-xl border border-border bg-background p-3" aria-label="Selected beat inspector">
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-label font-bold uppercase tracking-wider text-muted-foreground">Beat inspector</p>
        <h2 class="truncate font-cinzel text-base font-bold text-foreground">{{ beat.title || "Untitled beat" }}</h2>
      </div>
      <AppButton :to="fullPageTo" label="Open as page" size="xs" variant="subtle" />
    </div>

    <div class="rounded-md border border-border bg-card p-2">
      <p class="text-caption font-semibold text-foreground">Suggested for {{ beat.kind }}</p>
      <p class="text-caption text-muted-foreground">{{ suggestion }}</p>
    </div>

    <details v-if="gaps.length" open class="rounded-md border border-dashed border-tone-caution/50 bg-tone-caution/5 p-2">
      <summary class="cursor-pointer text-caption font-semibold text-tone-caution">{{ gaps.length }} readiness gap{{ gaps.length === 1 ? '' : 's' }}</summary>
      <ul class="mt-2 space-y-1 text-caption">
        <li v-for="gap in gaps" :key="gap.label"><a :href="gap.href" class="text-tone-caution underline">{{ gap.label }}</a></li>
      </ul>
    </details>

    <div id="beat-fields"><QuestBeatFields :key="beat.id" :beat="beat" compact /></div>

    <section class="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Outgoing branches">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Outgoing branches</h3>
      <ul v-if="outgoing.length" class="space-y-1 text-caption">
        <li v-for="edge in outgoing" :key="edge.id" class="flex gap-2">
          <span class="text-muted-foreground">{{ edge.label || "Continue" }} →</span>
          <span class="font-semibold text-foreground">{{ beatTitle(edge.target_beat_id) }}</span>
        </li>
      </ul>
      <p v-else class="text-caption italic text-muted-foreground">No authored next beat yet.</p>
    </section>

    <div id="beat-attachments"><QuestBeatAttachmentsPanel :beat="beat" :attachments="attachments" /></div>
    <div id="beat-loot"><QuestBeatLootPanel :beat="beat" :loot="loot" /></div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatEdge, QuestBeatLoot } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import QuestBeatAttachmentsPanel from "./QuestBeatAttachmentsPanel.vue";
import QuestBeatFields from "./QuestBeatFields.vue";
import QuestBeatLootPanel from "./QuestBeatLootPanel.vue";

const props = defineProps<{
  beat: QuestBeat;
  beats: QuestBeat[];
  edges: QuestBeatEdge[];
  attachments: QuestBeatAttachmentSummary[];
  loot: QuestBeatLoot[];
  presentation?: QuestBeatPresentation;
}>();

const fullPageTo = computed(() => ({
  path: `/quests/${props.beat.quest_id}/beats/${props.beat.id}`,
  query: { returnTo: `/quests/${props.beat.quest_id}?mode=build&beat=${props.beat.id}` },
}));
const outgoing = computed(() => props.edges.filter((edge) => edge.source_beat_id === props.beat.id));
const suggestions: Record<string, string> = {
  combat: "Attach the encounter, battlefield location, stakes, audio cue, and loot before play.",
  social: "Prepare the people, leverage, player-facing reveal, and consequences of agreement or refusal.",
  explore: "Anchor the location or room set, discoveries, checks, sensory audio, and routes onward.",
  discovery: "Prepare the clue or handout, how players can find it, and what it unlocks.",
  neutral: "Add only the material this story moment needs; kind never removes or owns content.",
};
const suggestion = computed(() => suggestions[props.beat.kind] ?? suggestions.neutral);
const gaps = computed(() => {
  const result: Array<{ label: string; href: string }> = [];
  if (!props.beat.dm_content) result.push({ label: "Add the DM lead", href: "#beat-fields" });
  if (props.beat.visibility !== "hidden" && !(props.beat.visibility === "rumored" ? props.beat.rumor_text : props.beat.reveal_text)) {
    result.push({ label: `Add explicit ${props.beat.visibility === "rumored" ? "rumor" : "reveal"} copy`, href: "#beat-fields" });
  }
  for (const attachment of props.attachments.filter((row) => row.prep_gap)) {
    result.push({ label: `Replace ${attachment.label}`, href: "#beat-attachments" });
  }
  if (props.presentation?.isDisconnected) result.push({ label: "Connect this staging beat to the story flow", href: "#quest-flow-canvas" });
  return result;
});

function beatTitle(id: string) {
  return props.beats.find((beat) => beat.id === id)?.title || "Missing beat";
}
</script>
