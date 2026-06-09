<template>
  <!-- atom node — no inner content, NodeViewWrapper must be inline -->
  <NodeViewWrapper as="span" class="entity-mention-wrapper">
    <!-- ── EDITOR MODE: static chip ───────────────────────────────────────── -->
    <span
      v-if="isEditable"
      class="entity-chip"
      :class="`entity-chip--${entityType}--edit`"
      contenteditable="false"
    >
      <span class="entity-chip-at">@</span>
      <span class="entity-chip-label">{{ label }}</span>
    </span>

    <!-- ── VIEWER MODE: clickable chip ───────────────────────────────────── -->
    <button
      v-else
      type="button"
      class="entity-chip"
      :class="`entity-chip--${entityType}`"
      contenteditable="false"
      :title="`Go to ${entityType}: ${label}`"
      @click="navigate"
    >
      <span class="entity-chip-at">@</span>
      <span class="entity-chip-label">{{ label }}</span>
    </button>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import { useRouter, useRoute } from "vue-router";
import { useUiStore } from "@/stores/ui";
import type { EntityType } from "@/lib/tiptap/EntityMention";

const props = defineProps({ ...nodeViewProps });

const isEditable = computed(() => props.editor.isEditable);
const entityType = computed(() => props.node.attrs.entityType as EntityType);
const label = computed(() => props.node.attrs.label as string);
const entityId = computed(() => props.node.attrs.id as string);

const router = useRouter();
const route = useRoute();
const ui = useUiStore();

// DM side has per-entity detail routes — append the ID.
const DM_ENTITY_ROUTES: Record<EntityType, string> = {
  player: "/party",
  npc: "/npcs",
  monster: "/monsters",
  location: "/locations",
  party: "/party",
};

// Player portal only has list pages — navigate to the list, no ID.
const PLAYER_LIST_ROUTES: Record<EntityType, string> = {
  player: "/play/party",
  npc: "/play/party",
  monster: "/play/bestiary",
  location: "/play/atlas",
  party: "/play/party",
};

function navigate() {
  if (route.path.startsWith("/play/")) {
    // Locations open in a quick-view dialog over the current page rather than
    // yanking the player off to the Atlas list (issue #442).
    if (entityType.value === "location") {
      ui.openPlayerLocationDialog(entityId.value);
      return;
    }
    const target = PLAYER_LIST_ROUTES[entityType.value];
    if (target) void router.push(target);
  } else {
    const base = DM_ENTITY_ROUTES[entityType.value];
    if (base) void router.push(`${base}/${entityId.value}`);
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

.entity-mention-wrapper {
  display: inline;
}

.entity-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  font-family: var(--font-cinzel, serif);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  white-space: nowrap;
  vertical-align: baseline;
  line-height: 1.6;
  border: 1px solid;
  user-select: none;
}

.entity-chip-at {
  opacity: 0.7;
  font-size: 0.6rem;
}

/* ── Player (blue) ──────────────────────────────────────────────────────── */
.entity-chip--player--edit {
  border-color: theme(colors.blue-400 / 35%);
  background: theme(colors.blue-400 / 10%);
  color: theme(colors.blue-400);
  cursor: default;
}
.entity-chip--player {
  border-color: theme(colors.blue-400 / 40%);
  background: theme(colors.blue-400 / 10%);
  color: theme(colors.blue-400);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--player:hover {
  background: theme(colors.blue-400 / 20%);
  border-color: theme(colors.blue-400 / 60%);
}

/* ── NPC (violet) ───────────────────────────────────────────────────────── */
.entity-chip--npc--edit {
  border-color: theme(colors.violet-400 / 35%);
  background: theme(colors.violet-400 / 10%);
  color: theme(colors.violet-400);
  cursor: default;
}
.entity-chip--npc {
  border-color: theme(colors.violet-400 / 40%);
  background: theme(colors.violet-400 / 10%);
  color: theme(colors.violet-400);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--npc:hover {
  background: theme(colors.violet-400 / 20%);
  border-color: theme(colors.violet-400 / 60%);
}

/* ── Monster (rose) ─────────────────────────────────────────────────────── */
.entity-chip--monster--edit {
  border-color: theme(colors.rose-400 / 35%);
  background: theme(colors.rose-400 / 10%);
  color: theme(colors.rose-400);
  cursor: default;
}
.entity-chip--monster {
  border-color: theme(colors.rose-400 / 40%);
  background: theme(colors.rose-400 / 10%);
  color: theme(colors.rose-400);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--monster:hover {
  background: theme(colors.rose-400 / 20%);
  border-color: theme(colors.rose-400 / 60%);
}

/* ── Location (emerald) ─────────────────────────────────────────────────── */
.entity-chip--location--edit {
  border-color: theme(colors.emerald-400 / 35%);
  background: theme(colors.emerald-400 / 10%);
  color: theme(colors.emerald-400);
  cursor: default;
}
.entity-chip--location {
  border-color: theme(colors.emerald-400 / 40%);
  background: theme(colors.emerald-400 / 10%);
  color: theme(colors.emerald-400);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--location:hover {
  background: theme(colors.emerald-400 / 20%);
  border-color: theme(colors.emerald-400 / 60%);
}

.entity-chip--party--edit {
  border-color: theme(colors.amber-400 / 35%);
  background: theme(colors.amber-400 / 10%);
  color: theme(colors.amber-400);
  cursor: default;
}
.entity-chip--party {
  border-color: theme(colors.amber-400 / 40%);
  background: theme(colors.amber-400 / 10%);
  color: theme(colors.amber-400);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--party:hover {
  background: theme(colors.amber-400 / 20%);
  border-color: theme(colors.amber-400 / 60%);
}
</style>
