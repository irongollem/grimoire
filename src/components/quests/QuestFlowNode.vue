<template>
  <article
    class="quest-flow-node"
    :class="[
      { 'is-selected': selected, 'is-current': isCurrent, 'is-visited': presentation?.isVisited, 'is-stranded': presentation?.reach === 'stranded', 'has-gaps': presentation && !presentation.isReady, 'is-gated': gated },
      isCurrent ? currentBorderTone?.border : null,
    ]"
  >
    <Handle v-if="editable" type="target" :position="Position.Left" aria-hidden="true" />
    <button
      type="button"
      class="quest-flow-node__main"
      :aria-label="accessibleLabel"
      @click="emit('select')"
      @keydown.enter.stop.prevent="emit('open')"
      @keydown.delete.stop.prevent="editable && deletable && emit('delete')"
    >
      <span v-if="partyChips.length" class="quest-flow-node__party-row">
        <span v-for="chip in partyChips" :key="chip.key" class="quest-flow-node__party" :class="chip.textClass">
          <IconParty class="h-3 w-3" aria-hidden="true" />{{ chip.label }}
        </span>
      </span>
      <span class="quest-flow-node__kind">{{ kindEyebrow }}</span>
      <strong>{{ title || "Untitled beat" }}</strong>
      <span class="quest-flow-node__facts">
        <span v-if="presentation?.prepGapCount" class="is-gap">{{ presentation.prepGapCount }} prep gap{{ presentation.prepGapCount === 1 ? '' : 's' }}</span>
        <span v-if="presentation?.handoutCount">{{ presentation.handoutCount }} handout{{ presentation.handoutCount === 1 ? '' : 's' }}</span>
        <span v-if="presentation?.payoffCount">{{ presentation.payoffCount }} payoff{{ presentation.payoffCount === 1 ? '' : 's' }}</span>
        <span v-if="presentation?.loot.undispatched">{{ presentation.loot.undispatched }} loot held</span>
        <span v-if="presentation?.loot.unclaimed">{{ presentation.loot.unclaimed }} loot unclaimed</span>
        <span v-if="presentation?.isDisconnected">Staging</span>
        <span v-if="presentation?.convergeLabel">converge · {{ presentation.convergeLabel }}</span>
        <span v-if="presentation?.site" class="is-site"><IconDungeon class="h-3 w-3" aria-hidden="true" />site · {{ presentation.site.roomCount }} room{{ presentation.site.roomCount === 1 ? '' : 's' }}</span>
        <span v-if="presentation?.site?.emptyRoomLabel" class="is-gap">{{ presentation.site.emptyRoomLabel }}</span>
        <span v-if="presentation?.unlocksQuest">unlocks a quest</span>
        <span v-if="reachLabel" :class="reachClass">{{ reachLabel }}</span>
      </span>
    </button>
    <AppButton v-if="editable" label="Add next" size="xs" variant="subtle" @click.stop="emit('create-next')" />
    <Handle v-if="editable" type="source" :position="Position.Right" aria-hidden="true" />
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { IconDungeon, IconParty } from "@/lib/icons";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import { threadBadge, type ThreadLike } from "@/lib/quests/threads";
import { QUEST_BEAT_KIND_LABELS } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";

const { title, kind, visibility, current, presentation, editable = true, deletable = true, threads = [], gated = false } = defineProps<{ title: string; kind: string; visibility: string; selected?: boolean; current?: boolean; presentation?: QuestBeatPresentation; editable?: boolean; deletable?: boolean; threads?: ThreadLike[]; gated?: boolean }>();
const emit = defineEmits<{ select: []; open: []; delete: []; "create-next": [] }>();

const kindLabel = computed(() => QUEST_BEAT_KIND_LABELS[kind as keyof typeof QUEST_BEAT_KIND_LABELS] ?? kind);
const kindEyebrow = computed(() => `${kindLabel.value} · ${visibility}`);

/** One chip per thread standing on this beat, in thread order — a
 *  converge-all beat can legitimately hold more than one before they merge.
 *  Falls back to a single plain chip for a caller that only ever passes the
 *  legacy `current` boolean and no thread roster. */
const partyChips = computed(() => {
  const ids = presentation?.currentThreadIds ?? [];
  if (ids.length) {
    return ids.map((id) => {
      const badge = threadBadge(threads, id);
      return { key: id, label: badge ? `Party is here · ${badge.letter}` : "Party is here", textClass: badge?.tone.text ?? "text-primary" };
    });
  }
  return current ? [{ key: "current", label: "Party is here", textClass: "text-primary" }] : [];
});
const isCurrent = computed(() => Boolean(current) || partyChips.value.length > 0);
// The border colour follows whichever thread is first in line — the same
// order the thread bar and swimlanes use, so a node under two thread borders
// is not a case this needs to invent a rule for.
const currentBorderTone = computed(() => {
  const firstId = presentation?.currentThreadIds?.[0];
  return firstId ? threadBadge(threads, firstId)?.tone ?? null : null;
});

// "Ahead" is left unlabelled on purpose: it is the ordinary state of an unplayed
// beat, so a chip on every one of them would drown the two that are worth
// noticing. The current beat says so with the party marker instead of a chip.
const REACH_LABELS: Partial<Record<NonNullable<QuestBeatPresentation["reach"]>, string>> = {
  visited: "Visited",
  stranded: "Cut off",
};
const reachLabel = computed(() => presentation ? REACH_LABELS[presentation.reach] ?? "" : "");
const reachClass = computed(() => presentation?.reach === "stranded" ? "is-cutoff" : "");
const accessibleLabel = computed(() => [
  title || "Untitled beat",
  kindLabel.value,
  visibility,
  isCurrent.value ? "current beat, party is here" : "",
  presentation?.reach === "visited" ? "visited" : "",
  presentation?.reach === "stranded" ? "no longer reachable from the current beat" : "",
  presentation?.isDisconnected ? "disconnected staging beat" : "",
  presentation?.prepGapCount ? `${presentation.prepGapCount} prep gaps` : "ready",
  presentation?.loot.undispatched ? `${presentation.loot.undispatched} loot held` : "",
  presentation?.loot.unclaimed ? `${presentation.loot.unclaimed} loot unclaimed` : "",
].filter(Boolean).join(", "));
</script>

<style scoped>
.quest-flow-node { width: 15rem; border: 1px solid var(--border); border-radius: .65rem; background: var(--card); color: var(--card-foreground); padding: .75rem; box-shadow: 0 .25rem 1rem color-mix(in oklab, var(--foreground) 10%, transparent); display: grid; gap: .25rem; cursor: pointer; }
.quest-flow-node.is-selected { outline: 2px solid var(--ring); outline-offset: 2px; }
.quest-flow-node.is-current { box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 18%, transparent); }
.quest-flow-node.is-visited { border-style: solid; }
/* Cut off is a fact about the run, not a preparation fault, so it reads as
   receding rather than as another caution border competing with `has-gaps`. */
.quest-flow-node.is-stranded { opacity: .55; }
.quest-flow-node__party-row { display: flex; flex-wrap: wrap; gap: .25rem; justify-content: flex-start; }
.quest-flow-node__party { display: inline-flex; align-items: center; gap: .25rem; border-radius: 999px; background: var(--muted); padding: .1rem .4rem; font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.quest-flow-node.has-gaps { border-color: var(--color-tone-caution); border-style: dashed; }
.quest-flow-node.is-gated { border-color: var(--muted-foreground); border-style: dashed; }
.quest-flow-node__main { display: grid; gap: .25rem; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.quest-flow-node__main:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: .25rem; }
.quest-flow-node__kind { color: var(--muted-foreground); font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; }
.quest-flow-node__facts { display: flex; flex-wrap: wrap; gap: .3rem; color: var(--muted-foreground); font-size: .7rem; }
.quest-flow-node__facts span { border-radius: 999px; background: var(--muted); padding: .1rem .35rem; }
.quest-flow-node__facts .is-gap { color: var(--color-tone-caution); }
.quest-flow-node__facts .is-cutoff { color: var(--color-tone-caution); }
.quest-flow-node__facts .is-site { color: var(--color-ink-info); display: inline-flex; align-items: center; gap: .2rem; }
@media (prefers-reduced-motion: reduce) { .quest-flow-node { transition: none; } }
</style>
