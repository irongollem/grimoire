<template>
  <article
    class="quest-flow-node"
    :class="{ 'is-selected': selected, 'is-current': current }"
    tabindex="0"
    role="button"
    :aria-label="`${title || 'Untitled beat'}, ${kind}, ${visibility}${current ? ', current beat' : ''}`"
    @click="emit('select')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('select')"
    @keydown.delete.prevent="emit('delete')"
  >
    <Handle type="target" :position="Position.Left" aria-hidden="true" />
    <span class="quest-flow-node__kind">{{ kind }}</span>
    <strong>{{ title || "Untitled beat" }}</strong>
    <span class="quest-flow-node__visibility">{{ visibility }}</span>
    <Handle type="source" :position="Position.Right" aria-hidden="true" />
  </article>
</template>

<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";

defineProps<{ title: string; kind: string; visibility: string; selected?: boolean; current?: boolean }>();
const emit = defineEmits<{ select: []; open: []; delete: [] }>();
</script>

<style scoped>
.quest-flow-node { width: 15rem; border: 1px solid var(--border); border-radius: .65rem; background: var(--card); color: var(--card-foreground); padding: .75rem; box-shadow: 0 .25rem 1rem color-mix(in oklab, var(--foreground) 10%, transparent); display: grid; gap: .25rem; cursor: pointer; }
.quest-flow-node:focus-visible, .quest-flow-node.is-selected { outline: 2px solid var(--ring); outline-offset: 2px; }
.quest-flow-node.is-current { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 18%, transparent); }
.quest-flow-node__kind, .quest-flow-node__visibility { color: var(--muted-foreground); font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; }
@media (prefers-reduced-motion: reduce) { .quest-flow-node { transition: none; } }
</style>
