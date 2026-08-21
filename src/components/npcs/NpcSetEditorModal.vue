<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-box">
      <h2 class="modal-title">{{ isEdit ? "Edit set" : "New NPC set" }}</h2>

      <label class="block">
        <span class="modal-label">Name</span>
        <input
          ref="nameInput"
          v-model="name"
          class="modal-input"
          placeholder="Session 12 — The Docks…"
          @keydown.enter.prevent="canSave && save()"
        />
      </label>

      <label class="block">
        <span class="modal-label">Notes <span class="optional">(optional)</span></span>
        <input
          v-model="description"
          class="modal-input"
          placeholder="Who the party is likely to meet tonight…"
        />
      </label>

      <div class="picker">
        <div class="picker-header">
          <span class="modal-label mb-0">NPCs</span>
          <span class="picker-count">{{ orderedIds.length }} selected</span>
        </div>

        <input
          v-model="search"
          class="modal-input"
          placeholder="Search NPCs…"
        />

        <div v-if="isLoading" class="picker-empty">
          <LoadingSpinner />
        </div>
        <p v-else-if="!filtered.length" class="picker-empty">No NPCs match.</p>
        <div v-else class="picker-list">
          <AppCheckbox
            v-for="npc in filtered"
            :key="npc.id"
            :model-value="selected.has(npc.id)"
            class="picker-row"
            label-class="contents"
            @update:model-value="toggle(npc.id)"
          >
            <img
              class="picker-thumb"
              :src="portrait(npc)"
              :alt="displayName(npc)"
              loading="lazy"
              @error="onImgError"
            />
            <div class="picker-info">
              <span class="picker-name">{{ displayName(npc) }}</span>
              <span v-if="subtitle(npc)" class="picker-sub">{{ subtitle(npc) }}</span>
            </div>
          </AppCheckbox>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="modal-cancel" @click="close">Cancel</button>
        <button
          type="button"
          class="modal-confirm"
          :disabled="!canSave || saving"
          @click="save"
        >
          {{ saving ? "Saving…" : isEdit ? "Save" : "Create set" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { useNpcs } from "@/composables/useNpcs";
import { useCreateNpcSet, useUpdateNpcSet } from "@/composables/useNpcSets";
import { getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { Npc, NpcSet } from "@/types/npc.types";

const props = defineProps<{ set: NpcSet | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const PLACEHOLDER = "/assets/placeholders/npc.webp";

const { data: npcs, isLoading } = useNpcs();
const createSet = useCreateNpcSet();
const updateSet = useUpdateNpcSet();

const isEdit = computed(() => !!props.set);

const name = ref("");
const description = ref("");
const search = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

// Ordered selection preserves the "playlist" order the DM built it in.
const orderedIds = ref<string[]>([]);
const selected = computed(() => new Set(orderedIds.value));

// Re-seed the form whenever a different set (or create/edit) is opened.
watch(
  () => props.set,
  (set) => {
    name.value = set?.name ?? "";
    description.value = set?.description ?? "";
    orderedIds.value = [...(set?.npc_ids ?? [])];
    search.value = "";
    nextTick(() => nameInput.value?.focus());
  },
  { immediate: true },
);

const filtered = computed<Npc[]>(() => {
  const q = search.value.trim().toLowerCase();
  const list = npcs.value ?? [];
  if (!q) return list;
  return list.filter(
    (n) =>
      displayName(n).toLowerCase().includes(q) ||
      n.race?.toLowerCase().includes(q) ||
      n.occupation?.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q)),
  );
});

function toggle(id: string) {
  orderedIds.value = selected.value.has(id)
    ? orderedIds.value.filter((x) => x !== id)
    : [...orderedIds.value, id];
}

function displayName(npc: Npc): string {
  return getNpcDisplayName(npc) ?? "???";
}
function portrait(npc: Npc): string {
  return getNpcDisplayPortrait(npc) || PLACEHOLDER;
}
function subtitle(npc: Npc): string | undefined {
  const parts = [npc.race, npc.occupation].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : undefined;
}
function onImgError(e: Event) {
  (e.target as HTMLImageElement).src = PLACEHOLDER;
}

const saving = computed(() => createSet.isPending.value || updateSet.isPending.value);
const canSave = computed(() => name.value.trim().length > 0);

async function save() {
  if (!canSave.value) return;
  const payload = {
    name: name.value.trim(),
    description: description.value.trim() || null,
    npc_ids: orderedIds.value,
  };
  try {
    if (props.set) {
      await updateSet.mutateAsync({ id: props.set.id, update: payload });
    } else {
      await createSet.mutateAsync(payload);
    }
    emit("saved");
  } catch {
    // toast surfaced by the mutation's onError
  }
}

function close() {
  emit("close");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.modal-backdrop {
  @apply fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4;
}
.modal-box {
  @apply bg-card border border-border rounded-xl p-6 w-full max-w-lg flex flex-col gap-4 max-h-[85vh];
}
.modal-title {
  @apply text-heading font-bold text-foreground;
}
.modal-label {
  @apply block font-cinzel text-xs font-semibold text-muted-foreground mb-1;
}
.optional {
  @apply font-fell font-normal italic text-muted-foreground/60;
}
.modal-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.picker {
  @apply flex flex-col gap-2 min-h-0 flex-1;
}
.picker-header {
  @apply flex items-baseline justify-between;
}
.picker-count {
  @apply font-cinzel text-xs font-semibold text-primary;
}
.picker-list {
  @apply flex-1 overflow-y-auto flex flex-col gap-0.5 min-h-0 rounded-md border border-border p-1;
}
.picker-empty {
  @apply flex items-center justify-center py-8 text-body text-muted-foreground italic;
}
.picker-row {
  @apply flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/60 transition-colors;
}
.picker-thumb {
  @apply size-8 shrink-0 rounded object-cover bg-muted;
}
.picker-info {
  @apply flex flex-col min-w-0;
}
.picker-name {
  @apply font-cinzel text-xs font-semibold text-foreground truncate;
}
.picker-sub {
  @apply text-caption text-muted-foreground truncate capitalize;
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
</style>
