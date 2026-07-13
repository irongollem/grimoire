<template>
  <aside class="source-panel">
    <div v-if="store.mode === 'collection'" class="source-tabs">
      <button
        v-for="src in SOURCES"
        :key="src.id"
        type="button"
        class="src-tab"
        :class="{ active: store.source === src.id }"
        @click="store.source = src.id"
      >
        {{ src.label }}
        <span v-if="store.selectedIds[src.id].size" class="tab-count">{{
          store.selectedIds[src.id].size
        }}</span>
      </button>
    </div>
    <div v-else class="loot-banner">
      <span class="loot-banner-title">Loot Deck</span>
      <span class="loot-banner-count">
        {{ store.selectedIds.items.size }} item{{
          store.selectedIds.items.size === 1 ? "" : "s"
        }}
      </span>
    </div>

    <label class="block">
      <span class="sr-only">Search</span>
      <input
        v-model="store.search"
        placeholder="Search…"
        class="search-input"
      />
    </label>

    <div class="selection-header">
      <span class="selection-count">{{ filteredList.length }} entries</span>
      <button type="button" class="sel-action" @click="selectAll">
        All
      </button>
      <button type="button" class="sel-action" @click="store.clearSourceSelection">
        None
      </button>
    </div>

    <div class="entity-list">
      <label
        v-for="item in filteredList"
        :key="item.id"
        class="entity-row"
      >
        <input
          type="checkbox"
          :checked="store.selectedIds[store.source].has(item.id)"
          @change="store.toggleSelect(item.id)"
        />
        <div class="entity-info">
          <span class="entity-name">{{ item.name }}</span>
          <span class="entity-sub">{{ item.sub }}</span>
        </div>
      </label>
      <p v-if="!filteredList.length" class="empty-list">No results</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useCardForgeStore } from "@/stores/cardForge";
import { useCardForgeData } from "@/composables/useCardForgeData";
import type { SourceId } from "@/stores/cardForge";

const store = useCardForgeStore();
const { filteredList } = useCardForgeData();

const SOURCES: ReadonlyArray<{ id: SourceId; label: string }> = [
  { id: "npcs", label: "NPCs" },
  { id: "monsters", label: "Monsters" },
  { id: "items", label: "Items" },
  { id: "spells", label: "Spells" },
  { id: "downtime", label: "Interlude" },
];

function selectAll() {
  store.selectAllInSource(filteredList.value.map((i) => i.id));
}
</script>

<style scoped>
@reference "@/assets/main.css";

.source-panel {
  @apply w-64 shrink-0 flex flex-col gap-2 min-h-0;
}
.source-tabs {
  @apply flex rounded-md overflow-hidden border border-border shrink-0;
}
.src-tab {
  @apply relative flex-1 font-cinzel text-xs font-semibold py-1.5 text-muted-foreground bg-card transition-colors;
}
.src-tab.active {
  @apply bg-primary/20 text-primary;
}
.tab-count {
  @apply absolute top-0.5 right-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground font-cinzel text-[9px] font-bold w-3.5 h-3.5;
}
.loot-banner {
  @apply flex items-center justify-between px-3 py-2 rounded-md border border-border bg-primary/10 shrink-0;
}
.loot-banner-title {
  @apply font-cinzel text-xs font-bold text-primary;
}
.loot-banner-count {
  @apply font-cinzel text-xs font-semibold text-muted-foreground;
}
.search-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.selection-header {
  @apply flex items-center gap-2 shrink-0;
}
.selection-count {
  @apply font-cinzel text-xs text-muted-foreground flex-1;
}
.sel-action {
  @apply font-cinzel text-xs font-semibold text-primary hover:opacity-80;
}
.entity-list {
  @apply flex-1 overflow-y-auto flex flex-col gap-0.5 min-h-0;
}
.entity-row {
  @apply flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/60 transition-colors;
}
.entity-row input[type="checkbox"] {
  @apply accent-primary shrink-0;
}
.entity-info {
  @apply flex flex-col min-w-0;
}
.entity-name {
  @apply font-cinzel text-xs font-semibold text-foreground truncate;
}
.entity-sub {
  @apply font-fell text-xs text-muted-foreground truncate capitalize;
}
.empty-list {
  @apply font-fell text-sm text-muted-foreground text-center py-8 italic;
}
</style>
