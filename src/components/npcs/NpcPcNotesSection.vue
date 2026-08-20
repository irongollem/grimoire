<template>
  <div class="space-y-2">
    <!-- Existing notes list -->
    <div
      v-for="note in notes"
      :key="note.id"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <!-- View mode: toolbar-style header with name + actions -->
      <div v-if="editingId !== note.id" class="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span class="font-cinzel text-xs font-semibold text-foreground">{{ memberName(note.party_member_id) }}</span>
        <div class="flex items-center gap-3">
          <AppButton variant="ghost" size="inline-xs" label="Edit" @click="startEdit(note)" />
          <AppButton variant="ghost" tone="danger" size="inline-xs" label="Delete" @click="remove(note.id)" />
        </div>
      </div>
      <div v-if="editingId !== note.id" class="px-3 py-2">
        <RichTextViewer :content="note.notes" />
      </div>

      <!-- Edit mode: RichTextEditor with PC name in toolbar -->
      <div v-else>
        <RichTextEditor v-model="editText" placeholder="How do they know each other…" size="sm">
          <template #toolbar-end>
            <div class="ml-auto flex items-center gap-2 pl-1">
              <div class="w-px h-5 bg-border" />
              <AppSelect v-model="editRelType" tone="filled" size="xs" class="h-6.5">
                <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
              </AppSelect>
              <span class="text-label font-semibold text-muted-foreground">
                {{ memberName(note.party_member_id) }}
              </span>
              <button
                type="button"
                :disabled="isSaving"
                class="px-2 h-6.5 text-label font-semibold rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 transition-colors"
                @click="saveEdit(note)"
              >{{ isSaving ? '…' : 'Save' }}</button>
              <AppButton variant="ghost" fill="muted" size="xs" class="h-6.5" label="Cancel" @click="cancelEdit" />
            </div>
          </template>
        </RichTextEditor>
      </div>
    </div>

    <!-- Add note: RichTextEditor with PC selector + save in toolbar -->
    <div v-if="showForm">
      <RichTextEditor v-model="newText" placeholder="How do they know each other…" size="sm">
        <template #toolbar-end>
          <div class="ml-auto flex items-center gap-2 pl-1">
            <div class="w-px h-5 bg-border" />
            <AppSelect v-model="newRelType" tone="filled" size="xs" class="h-6.5">
              <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
            </AppSelect>
            <AppSelect v-model="newMemberId" tone="filled" size="xs" class="h-6.5">
              <option value="" disabled>PC…</option>
              <option v-for="m in availableMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
            </AppSelect>
            <button
              type="button"
              :disabled="!newMemberId || !newText || isSaving"
              class="px-2 h-6.5 text-label font-semibold rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 transition-colors"
              @click="addNote"
            >{{ isSaving ? '…' : 'Save' }}</button>
            <AppButton variant="ghost" fill="muted" size="xs" class="h-6.5" label="Cancel" @click="cancelAdd" />
          </div>
        </template>
      </RichTextEditor>
    </div>

    <AppButton
      v-if="!showForm && availableMembers.length > 0"
      variant="subtle"
      size="xs"
      fill="muted"
      label="+ Add"
      @click="showForm = true"
    />

    <p v-if="notes?.length === 0 && !showForm" class="text-caption text-muted-foreground italic">
      No per-PC notes yet.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useParty } from "@/composables/useParty";
import { useNpcPcNotes, useUpsertNpcPcNote, useDeleteNpcPcNote } from "@/composables/useNpcPcNotes";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { NPC_RELATIONSHIP_TYPE_LABELS } from "@/types/npc.types";
import type { NpcPcNote, NpcRelationshipType } from "@/types/npc.types";

const typeOptions = Object.entries(NPC_RELATIONSHIP_TYPE_LABELS) as [NpcRelationshipType, string][];

const props = defineProps<{ npcId: string }>();

const { data: members } = useParty();
const { data: notes } = useNpcPcNotes(props.npcId);
const upsertMut = useUpsertNpcPcNote(props.npcId);
const deleteMut = useDeleteNpcPcNote(props.npcId);

const isSaving = computed(() => upsertMut.isPending.value);

const availableMembers = computed(() => {
  const existing = new Set((notes.value ?? []).map((n) => n.party_member_id));
  return (members.value ?? []).filter((m) => !existing.has(m.id));
});

function memberName(partyMemberId: string) {
  return members.value?.find((m) => m.id === partyMemberId)?.name ?? "Unknown";
}

// ── Add ───────────────────────────────────────────────────────────────────────
const showForm = ref(false);
const newMemberId = ref("");
const newRelType = ref<NpcRelationshipType>("contact");
const newText = ref<string | null>(null);

function cancelAdd() {
  showForm.value = false;
  newMemberId.value = "";
  newRelType.value = "contact";
  newText.value = null;
}

async function addNote() {
  if (!newMemberId.value || !newText.value) return;
  await upsertMut.mutateAsync({ partyMemberId: newMemberId.value, relationshipType: newRelType.value, notes: newText.value });
  cancelAdd();
}

// ── Edit ──────────────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const editText = ref<string | null>(null);
const editRelType = ref<NpcRelationshipType>("contact");

function startEdit(note: NpcPcNote) {
  editingId.value = note.id;
  editText.value = note.notes;
  editRelType.value = note.relationship_type;
}

function cancelEdit() {
  editingId.value = null;
  editText.value = null;
}

async function saveEdit(note: NpcPcNote) {
  if (!editText.value) return;
  await upsertMut.mutateAsync({ partyMemberId: note.party_member_id, relationshipType: editRelType.value, notes: editText.value });
  cancelEdit();
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function remove(id: string) {
  await deleteMut.mutateAsync(id);
}
</script>
