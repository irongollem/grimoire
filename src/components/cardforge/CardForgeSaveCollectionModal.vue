<template>
  <div
    v-if="store.showSaveModal"
    class="modal-backdrop"
    @click.self="store.showSaveModal = false"
  >
    <div class="modal-box">
      <h2 class="modal-title">
        Save Collection <span class="modal-scope">(local)</span>
      </h2>
      <label class="block">
        <span class="modal-label">Collection name</span>
        <input
          v-model="name"
          class="modal-input"
          placeholder="My Boss Monsters…"
        />
      </label>
      <div class="modal-actions">
        <button
          type="button"
          class="modal-cancel"
          @click="store.showSaveModal = false"
        >
          Cancel
        </button>
        <button
          type="button"
          class="modal-confirm"
          :disabled="!name.trim()"
          @click="save"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useCardForgeStore } from "@/stores/cardForge";
import { useCardForgeData } from "@/composables/useCardForgeData";
import { cardSubjectId } from "@/types/card.types";

const store = useCardForgeStore();
const { selectedSubjects } = useCardForgeData();
const name = ref("");

function save() {
  store.saveCollection(
    name.value,
    // A downtime archetype is keyed by `key`, not `id` — `cardSubjectId` owns that,
    // and `loadCollection` maps the kind back to its bucket.
    selectedSubjects.value.map((s) => ({ kind: s.kind, id: cardSubjectId(s) })),
  );
  name.value = "";
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
  @apply font-fell text-xs font-normal italic text-muted-foreground/60 ml-1;
}
.modal-label {
  @apply block font-cinzel text-xs font-semibold text-muted-foreground mb-1;
}
.modal-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.modal-actions {
  @apply flex gap-2 justify-end;
}
.modal-cancel {
  @apply font-cinzel text-xs font-semibold px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors;
}
.modal-confirm {
  @apply font-cinzel text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity;
}

@media print {
  .modal-backdrop {
    display: none !important;
  }
}
</style>
