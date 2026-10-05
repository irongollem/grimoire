<template>
  <!--
    One character's row on the NPC page: who they are, whether they can see this
    NPC, when they met, and the connection note they read as "Your connection".
    The row owns the connection's autosave, so each character's note saves
    itself and a blank note is never created.
  -->
  <li class="rounded-lg border border-border bg-card" data-testid="party-row">
    <div class="flex items-start gap-3 p-3">
      <div class="flex min-w-0 flex-1 items-start gap-3" :class="shared ? '' : 'opacity-60'" data-testid="party-row-identity">
        <div class="h-16 w-12 shrink-0 overflow-hidden rounded">
          <FocalImage
            :src="member.portrait_url"
            :focal-point="member.portrait_focal_point"
            format="portrait"
            :placeholder="placeholderUrl('character')"
          />
        </div>
        <div class="min-w-0">
          <p class="truncate text-heading-sm font-bold text-foreground">{{ member.name }}</p>
          <p class="truncate text-caption text-muted-foreground">{{ subtitle }}</p>
          <p class="mt-0.5 text-caption" :class="metAt ? 'text-foreground' : 'italic text-muted-foreground'">
            {{ metLabel }}
          </p>
        </div>
      </div>
      <AppButton
        :variant="shared ? 'tinted' : 'subtle'"
        :tone="shared ? 'success' : undefined"
        :emphasis="shared ? 'soft' : undefined"
        size="xs"
        :label="shared ? 'Shared' : 'Share'"
        :aria-pressed="shared"
        class="shrink-0"
        @click="emit('toggle')"
      />
    </div>

    <div class="border-t border-border px-3 pb-3 pt-2">
      <template v-if="editing">
        <div class="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <AppSelect
            v-model="draft.relationshipType"
            tone="filled"
            size="xs"
            class="font-semibold uppercase text-primary"
            :aria-label="`${firstName}'s relationship to ${npc.name}`"
          >
            <option v-for="[key, label] in typeOptions" :key="key" :value="key">{{ label }}</option>
          </AppSelect>
          <span class="text-caption italic text-muted-foreground">{{ firstName }} reads this</span>
          <AutosaveStatus
            class="ml-auto"
            :status="status"
            :error="saveError"
            paused-label="Saves once you write something"
          />
        </div>
        <RichTextEditor
          :key="revision"
          v-model="draft.notes"
          :placeholder="`How does ${firstName} know them…`"
          size="sm"
          :sticky-toolbar="false"
        />
      </template>
      <AppButton
        v-else
        variant="ghost"
        size="inline-xs"
        :label="`+ ${firstName}'s connection`"
        @click="editing = true"
      />
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AutosaveStatus from "@/components/common/AutosaveStatus.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { useDeleteNpcPcNote, useUpsertNpcPcNote } from "@/composables/npcs/useNpcPcNotes";
import { isBlankNote } from "@/composables/notes/useMyEntityNote";
import { useAutosave } from "@/composables/useAutosave";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { NPC_RELATIONSHIP_TYPE_LABELS } from "@/types/npc.types";
import type { Npc, NpcPcNote, NpcRelationshipType } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";

const { npc, member, shared, metAt = null, note = null } = defineProps<{
  npc: Npc;
  member: PartyMember;
  shared: boolean;
  /** ISO timestamp this character first met the NPC; null when they have not. */
  metAt?: string | null;
  note?: NpcPcNote | null;
}>();

const emit = defineEmits<{ (e: "toggle"): void }>();

const typeOptions = Object.entries(NPC_RELATIONSHIP_TYPE_LABELS) as [NpcRelationshipType, string][];

const firstName = computed(() => member.name.trim().split(/\s+/)[0] ?? member.name);
const subtitle = computed(() => [member.class, `Level ${member.level}`].filter(Boolean).join(" · "));

// ── When they met ─────────────────────────────────────────────────────────────
const metLabel = computed(() => {
  if (!metAt) return "Not met";
  const date = new Date(metAt);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const text = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
  return `Met · ${text}`;
});

// ── The connection, saving itself ─────────────────────────────────────────────
interface ConnectionDraft {
  relationshipType: NpcRelationshipType;
  notes: string | null;
}

const fromNote = (row: NpcPcNote | null): ConnectionDraft => ({
  relationshipType: row?.relationship_type ?? "contact",
  notes: row?.notes ?? null,
});

const draft = reactive<ConnectionDraft>(fromNote(note));
const editing = ref(note !== null);

const upsert = useUpsertNpcPcNote(npc.id);
const remove = useDeleteNpcPcNote(npc.id);

async function save(snapshot: ConnectionDraft) {
  const notes = snapshot.notes;
  if (notes === null || isBlankNote(notes)) {
    // Clearing a note removes the connection; a row that never existed stays unwritten.
    if (note) await remove.mutateAsync(note.id);
    return;
  }
  await upsert.mutateAsync({
    partyMemberId: member.id,
    relationshipType: snapshot.relationshipType,
    notes,
  });
}

const autosave = useAutosave({
  draft,
  initial: () => fromNote(note),
  equal: (a, b) =>
    a.relationshipType === b.relationshipType
    && (a.notes === b.notes || (isBlankNote(a.notes) && isBlankNote(b.notes))),
  save,
  canSave: () => note !== null || !isBlankNote(draft.notes),
  errorMessage: "Could not save the connection",
});
const { status, saveError } = autosave;

// RichTextEditor reads its value once and then only emits, so text replaced from
// here (another device, a refetch) needs a new key to reach it.
const revision = ref(0);
watch(
  () => note,
  (row) => {
    if (autosave.dirty.value || autosave.saving.value) return;
    const next = fromNote(row);
    if (next.notes !== draft.notes) revision.value++;
    autosave.reset(next);
    editing.value = row !== null || editing.value;
  },
);
</script>
