<template>
  <div
    v-if="store.showLoadModal"
    class="modal-backdrop"
    @click.self="store.showLoadModal = false"
  >
    <div class="modal-box">
      <h2 class="modal-title">
        Card Library <span class="modal-scope">(local)</span>
      </h2>
      <div class="library-list">
        <div v-for="col in store.library" :key="col.id" class="library-entry">
          <div class="library-info">
            <span class="library-name">{{ col.name }}</span>
            <span class="library-meta">
              {{ col.items.length }} cards · {{ formatDate(col.created) }}
            </span>
          </div>
          <div class="library-btns">
            <button
              type="button"
              class="lib-load-btn"
              @click="store.loadCollection(col)"
            >
              Load
            </button>
            <button
              type="button"
              class="lib-del-btn"
              @click="store.deleteCollection(col.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button
          type="button"
          class="modal-cancel"
          @click="store.showLoadModal = false"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCardForgeStore } from "@/stores/cardForge";

const store = useCardForgeStore();

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
</script>

<style scoped>
@reference "@/assets/main.css";

.modal-backdrop {
  @apply fixed inset-0 bg-black/60 flex items-center justify-center z-50;
}
.modal-box {
  @apply bg-card border border-border rounded-xl p-6 w-full max-w-md flex flex-col gap-4;
}
.modal-title {
  @apply font-cinzel text-lg font-bold text-foreground;
}
.modal-scope {
  @apply text-caption font-normal italic text-muted-foreground/60 ml-1;
}
.modal-actions {
  @apply flex gap-2 justify-end;
}
.modal-cancel {
  @apply font-cinzel text-xs font-semibold px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors;
}
.library-list {
  @apply flex flex-col gap-2 max-h-80 overflow-y-auto;
}
.library-entry {
  @apply flex items-center gap-3 p-3 rounded-lg bg-muted border border-border;
}
.library-info {
  @apply flex flex-col flex-1 min-w-0;
}
.library-name {
  @apply font-cinzel text-sm font-semibold text-foreground;
}
.library-meta {
  @apply text-caption text-muted-foreground;
}
.library-btns {
  @apply flex gap-1;
}
.lib-load-btn {
  @apply font-cinzel text-xs font-semibold px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors;
}
.lib-del-btn {
  @apply font-cinzel text-sm font-bold px-2 py-1 rounded text-muted-foreground hover:text-destructive transition-colors;
}

@media print {
  .modal-backdrop {
    display: none !important;
  }
}
</style>
