<template>
  <article
    class="quest-flow-node"
    :class="{ 'is-selected': selected, 'is-current': current, 'is-visited': presentation?.isVisited, 'has-gaps': presentation && !presentation.isReady }"
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
      <span class="quest-flow-node__kind">{{ kind }}</span>
      <strong>{{ title || "Untitled beat" }}</strong>
      <span class="quest-flow-node__facts">
        <span class="quest-flow-node__visibility">{{ visibility }}</span>
        <span v-if="presentation?.prepGapCount" class="is-gap">{{ presentation.prepGapCount }} prep gap{{ presentation.prepGapCount === 1 ? '' : 's' }}</span>
        <span v-else class="is-ready">Ready</span>
        <span v-if="presentation?.handoutCount">{{ presentation.handoutCount }} handout{{ presentation.handoutCount === 1 ? '' : 's' }}</span>
        <span v-if="presentation?.loot.undispatched">{{ presentation.loot.undispatched }} loot held</span>
        <span v-if="presentation?.loot.unclaimed">{{ presentation.loot.unclaimed }} loot unclaimed</span>
        <span v-if="presentation?.isDisconnected">Staging</span>
        <span v-if="presentation?.isVisited">Visited</span>
      </span>
    </button>
    <AppButton v-if="editable" label="Add next" size="xs" variant="subtle" @click.stop="emit('create-next')" />
    <Handle v-if="editable" type="source" :position="Position.Right" aria-hidden="true" />
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Handle, Position } from "@vue-flow/core";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import AppButton from "@/components/common/AppButton.vue";

const props = withDefaults(defineProps<{ title: string; kind: string; visibility: string; selected?: boolean; current?: boolean; presentation?: QuestBeatPresentation; editable?: boolean; deletable?: boolean }>(), { editable: true, deletable: true });
const emit = defineEmits<{ select: []; open: []; delete: []; "create-next": [] }>();
const accessibleLabel = computed(() => [
  props.title || "Untitled beat",
  props.kind,
  props.visibility,
  props.current ? "current beat" : "",
  props.presentation?.isVisited ? "visited" : "",
  props.presentation?.isDisconnected ? "disconnected staging beat" : "",
  props.presentation?.prepGapCount ? `${props.presentation.prepGapCount} prep gaps` : "ready",
  props.presentation?.loot.undispatched ? `${props.presentation.loot.undispatched} loot held` : "",
  props.presentation?.loot.unclaimed ? `${props.presentation.loot.unclaimed} loot unclaimed` : "",
].filter(Boolean).join(", "));
</script>

<style scoped>
.quest-flow-node { width: 15rem; border: 1px solid var(--border); border-radius: .65rem; background: var(--card); color: var(--card-foreground); padding: .75rem; box-shadow: 0 .25rem 1rem color-mix(in oklab, var(--foreground) 10%, transparent); display: grid; gap: .25rem; cursor: pointer; }
.quest-flow-node.is-selected { outline: 2px solid var(--ring); outline-offset: 2px; }
.quest-flow-node.is-current { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 18%, transparent); }
.quest-flow-node.is-visited { border-style: solid; }
.quest-flow-node.has-gaps { border-color: var(--color-tone-caution); border-style: dashed; }
.quest-flow-node__main { display: grid; gap: .25rem; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.quest-flow-node__main:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: .25rem; }
.quest-flow-node__kind, .quest-flow-node__visibility { color: var(--muted-foreground); font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; }
.quest-flow-node__facts { display: flex; flex-wrap: wrap; gap: .3rem; color: var(--muted-foreground); font-size: .7rem; }
.quest-flow-node__facts span { border-radius: 999px; background: var(--muted); padding: .1rem .35rem; }
.quest-flow-node__facts .is-ready { color: var(--color-tone-success); }
.quest-flow-node__facts .is-gap { color: var(--color-tone-caution); }
@media (prefers-reduced-motion: reduce) { .quest-flow-node { transition: none; } }
</style>
