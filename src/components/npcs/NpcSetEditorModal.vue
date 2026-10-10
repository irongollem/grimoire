<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-box">
      <h2 class="modal-title">{{ isEdit ? "Edit set" : "New NPC set" }}</h2>

      <label class="block">
        <span class="modal-label">Name</span>
        <input
          ref="nameInput"
          v-model="draft.name"
          class="modal-input"
          placeholder="Session 12: The Docks…"
          @keydown.enter.prevent="canSave && save()"
        />
      </label>

      <label class="block">
        <span class="modal-label">Notes <span class="optional">(optional)</span></span>
        <input
          v-model="draft.description"
          class="modal-input"
          placeholder="Who the party is likely to meet tonight…"
        />
      </label>

      <div class="picker">
        <div class="picker-header">
          <span class="modal-label mb-0">NPCs</span>
          <span class="picker-count">{{ draft.npc_ids.length }} selected</span>
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

      <DraftConflictNotice :fields="conflictLabels" :on-discard="reset" />

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
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";
import { useRecordDraft } from "@/composables/useRecordDraft";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useCreateNpcSet, useUpdateNpcSet } from "@/composables/npcs/useNpcSets";
import { getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import type { NpcListRow, NpcSet } from "@/types/npc.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const props = defineProps<{ set: NpcSet | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const PLACEHOLDER = placeholderUrl("npc");

const { data: npcs, isLoading } = useNpcs();
const createSet = useCreateNpcSet();
const updateSet = useUpdateNpcSet();

const isEdit = computed(() => !!props.set);

const search = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

interface SetDraft {
  name: string;
  description: string;
  // Ordered selection preserves the "playlist" order the DM built it in.
  npc_ids: string[];
}

// The set arrives from a list row that may be stale; a refetch (or the same
// set saved elsewhere) updates the fields the DM has not touched instead of
// being ignored, and save sends only the columns they changed (#946).
const { draft, changes, commit, reset, conflicts } = useRecordDraft({
  source: () => props.set,
  identity: (set: NpcSet) => set.id,
  toDraft: (set): SetDraft => ({
    name: set?.name ?? "",
    description: set?.description ?? "",
    npc_ids: [...(set?.npc_ids ?? [])],
  }),
});

const conflictLabels = computed(() => {
  const labels: Record<keyof SetDraft, string> = { name: "Name", description: "Notes", npc_ids: "NPCs" };
  return conflicts.value.map((key) => labels[key]);
});

const selected = computed(() => new Set(draft.npc_ids));

// Reset the search and focus the name whenever a different set (or create/edit) is opened.
watch(
  () => props.set?.id,
  () => {
    search.value = "";
    nextTick(() => nameInput.value?.focus());
  },
  { immediate: true },
);

const filtered = computed<NpcListRow[]>(() => {
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
  draft.npc_ids = selected.value.has(id)
    ? draft.npc_ids.filter((x) => x !== id)
    : [...draft.npc_ids, id];
}

function displayName(npc: NpcListRow): string {
  return getNpcDisplayName(npc) ?? "???";
}
function portrait(npc: NpcListRow): string {
  return getNpcDisplayPortrait(npc) || PLACEHOLDER;
}
function subtitle(npc: NpcListRow): string | undefined {
  const parts = [npc.race, npc.occupation].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : undefined;
}
function onImgError(e: Event) {
  (e.target as HTMLImageElement).src = PLACEHOLDER;
}

const saving = computed(() => createSet.isPending.value || updateSet.isPending.value);
const canSave = computed(() => draft.name.trim().length > 0);

function buildPayload(d: SetDraft) {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    npc_ids: d.npc_ids,
  };
}

async function save() {
  if (!canSave.value) return;
  try {
    if (props.set) {
      const update = changes(buildPayload);
      if (Object.keys(update).length > 0) {
        await updateSet.mutateAsync({ id: props.set.id, update });
      }
      commit();
    } else {
      await createSet.mutateAsync(buildPayload(draft));
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
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
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
  @apply text-label-lg font-semibold text-primary;
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
  @apply text-caption font-semibold text-foreground truncate;
}
.picker-sub {
  @apply text-caption text-muted-foreground truncate capitalize;
}
.modal-actions {
  @apply flex gap-2 justify-end;
}
.modal-cancel {
  @apply text-label-lg font-semibold px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors;
}
.modal-confirm {
  @apply text-label-lg font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity;
}
</style>
