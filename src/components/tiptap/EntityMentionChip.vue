<template>
  <!-- atom node — no inner content, NodeViewWrapper must be inline -->
  <NodeViewWrapper as="span" class="entity-mention-wrapper">
    <!-- ── EDITOR MODE: static chip ───────────────────────────────────────── -->
    <span
      v-if="isEditable"
      class="entity-chip"
      :class="[`entity-chip--${entityType}--edit`, isUnknown && 'entity-chip--unknown']"
      contenteditable="false"
    >
      <span class="entity-chip-at">@</span>
      <span class="entity-chip-label">{{ displayName }}</span>
    </span>

    <!-- ── VIEWER MODE, unknown to this viewer: inert chip, no navigation ─── -->
    <span
      v-else-if="isUnknown"
      class="entity-chip entity-chip--unknown"
      contenteditable="false"
      title="Unknown"
    >
      <span class="entity-chip-at">@</span>
      <span class="entity-chip-label">{{ displayName }}</span>
    </span>

    <!-- ── VIEWER MODE, known: clickable chip ──────────────────────────────── -->
    <button
      v-else
      type="button"
      class="entity-chip"
      :class="`entity-chip--${entityType}`"
      contenteditable="false"
      :title="`Go to ${entityType}: ${displayName}`"
      @click="navigate"
    >
      <span class="entity-chip-at">@</span>
      <span class="entity-chip-label">{{ displayName }}</span>
    </button>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import { useRouter, useRoute } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { isPlayerArea } from "@/router/lens";
import { useMentionName } from "@/composables/notes/useMentionName";
import type { EntityType } from "@/lib/tiptap/EntityMention";

const props = defineProps({ ...nodeViewProps });

const isEditable = computed(() => props.editor.isEditable);
const entityType = computed(() => props.node.attrs.entityType as EntityType);
const entityId = computed(() => props.node.attrs.id as string);

/**
 * The mention no longer carries its own name (#932 story 3 — a stored label
 * would leak a disguised NPC's true identity to every viewer, player portal
 * included). This chip resolves it itself, one mention at a time, via
 * `useMentionName` — rather than an extension option built once per
 * containing editor/viewer, which would subscribe every `RichTextViewer`
 * instance (57 call sites) to every entity kind's query regardless of
 * whether its document mentions one. `null` means this viewer doesn't know
 * the name, rendered as "???" and — in viewer mode — as a non-clickable chip
 * rather than a link to nowhere.
 */
const resolvedName = useMentionName(entityType.value, entityId.value);
const isUnknown = computed(() => resolvedName.value === null);
const displayName = computed(() => resolvedName.value ?? "???");

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
  faction: "/factions",
};

// Player portal only has list pages — navigate to the list, no ID.
const PLAYER_LIST_ROUTES: Record<EntityType, string> = {
  player: "/play/party",
  npc: "/play/party",
  monster: "/play/bestiary",
  location: "/play/atlas",
  party: "/play/party",
  faction: "/play/factions",
};

function navigate() {
  if (isPlayerArea(route.path)) {
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
  border-color: theme(colors.kind-player / 35%);
  background: theme(colors.kind-player / 10%);
  color: theme(colors.kind-player);
  cursor: default;
}
.entity-chip--player {
  border-color: theme(colors.kind-player / 40%);
  background: theme(colors.kind-player / 10%);
  color: theme(colors.kind-player);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--player:hover {
  background: theme(colors.kind-player / 20%);
  border-color: theme(colors.kind-player / 60%);
}

/* ── NPC (violet) ───────────────────────────────────────────────────────── */
.entity-chip--npc--edit {
  border-color: theme(colors.kind-npc / 35%);
  background: theme(colors.kind-npc / 10%);
  color: theme(colors.kind-npc);
  cursor: default;
}
.entity-chip--npc {
  border-color: theme(colors.kind-npc / 40%);
  background: theme(colors.kind-npc / 10%);
  color: theme(colors.kind-npc);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--npc:hover {
  background: theme(colors.kind-npc / 20%);
  border-color: theme(colors.kind-npc / 60%);
}

/* ── Monster (rose) ─────────────────────────────────────────────────────── */
.entity-chip--monster--edit {
  border-color: theme(colors.kind-monster / 35%);
  background: theme(colors.kind-monster / 10%);
  color: theme(colors.kind-monster);
  cursor: default;
}
.entity-chip--monster {
  border-color: theme(colors.kind-monster / 40%);
  background: theme(colors.kind-monster / 10%);
  color: theme(colors.kind-monster);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--monster:hover {
  background: theme(colors.kind-monster / 20%);
  border-color: theme(colors.kind-monster / 60%);
}

/* ── Location (emerald) ─────────────────────────────────────────────────── */
.entity-chip--location--edit {
  border-color: theme(colors.kind-location / 35%);
  background: theme(colors.kind-location / 10%);
  color: theme(colors.kind-location);
  cursor: default;
}
.entity-chip--location {
  border-color: theme(colors.kind-location / 40%);
  background: theme(colors.kind-location / 10%);
  color: theme(colors.kind-location);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--location:hover {
  background: theme(colors.kind-location / 20%);
  border-color: theme(colors.kind-location / 60%);
}

.entity-chip--party--edit {
  border-color: theme(colors.kind-party / 35%);
  background: theme(colors.kind-party / 10%);
  color: theme(colors.kind-party);
  cursor: default;
}
.entity-chip--party {
  border-color: theme(colors.kind-party / 40%);
  background: theme(colors.kind-party / 10%);
  color: theme(colors.kind-party);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--party:hover {
  background: theme(colors.kind-party / 20%);
  border-color: theme(colors.kind-party / 60%);
}

/* ── Faction (cyan) ─────────────────────────────────────────────────────── */
.entity-chip--faction--edit {
  border-color: theme(colors.kind-faction / 35%);
  background: theme(colors.kind-faction / 10%);
  color: theme(colors.kind-faction);
  cursor: default;
}
.entity-chip--faction {
  border-color: theme(colors.kind-faction / 40%);
  background: theme(colors.kind-faction / 10%);
  color: theme(colors.kind-faction);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.entity-chip--faction:hover {
  background: theme(colors.kind-faction / 20%);
  border-color: theme(colors.kind-faction / 60%);
}

/* ── Unknown to this viewer (withheld name) — muted, inert ─────────────── */
.entity-chip--unknown {
  border-color: theme(colors.muted-foreground / 30%);
  background: theme(colors.muted-foreground / 8%);
  color: theme(colors.muted-foreground);
  cursor: default;
}
</style>
