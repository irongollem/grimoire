<template>
  <li class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
    <div class="flex flex-wrap items-baseline gap-2">
      <h3 class="min-w-0 flex-1 text-heading-xs font-bold text-foreground">{{ item.note.title || "Untitled Note" }}</h3>
      <span class="rounded bg-muted px-2 py-0.5 text-label-lg font-semibold text-muted-foreground">
        Was {{ item.was === "lore" ? "a lore note" : "a session note" }}
      </span>
    </div>

    <p v-if="excerpt" class="line-clamp-3 text-caption italic text-muted-foreground">{{ excerpt }}</p>

    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">Send it to</span>
        <AppSelect v-model="kind" size="md" aria-label="Where this note goes">
          <option v-for="k in KINDS" :key="k" :value="k">{{ SORT_KIND_LABELS[k] }}</option>
        </AppSelect>
      </label>

      <NoteSessionPicker v-if="kind === 'session'" v-model="sessionId" :own-note-id="item.note.id" />

      <label v-else-if="kind === 'backstory' || kind === 'dm-note'" class="flex items-center gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">Character</span>
        <div class="w-60 max-w-full">
          <EntityCombobox v-model="memberId" :options="memberOptions" placeholder="Pick a character…" />
        </div>
      </label>

      <AppButton
        class="ml-auto"
        variant="primary"
        size="md"
        label="Sort"
        :loading="sorting"
        :disabled="!choice"
        @click="sort"
      />
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import NoteSessionPicker from "@/components/notes/NoteSessionPicker.vue";
import { useSortNote } from "@/composables/notes/useNoteSorting";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import {
  SORT_KIND_LABELS,
  SortStepError,
  sortFailureMessage,
  suggestedKind,
  type SortChoice,
  type SortKind,
} from "@/lib/notes/noteSorting";
import type { NoteToSort } from "@/lib/notes/noteSortingWrites";
import { extractTiptapText } from "@/lib/utils";

const { item } = defineProps<{ item: NoteToSort }>();

const KINDS: SortKind[] = ["lore", "session", "backstory", "dm-note", "keep"];

const toast = useToast();
const { data: party } = useParty();
const { mutateAsync: sortIt, isPending: sorting } = useSortNote();

const excerpt = computed(() => extractTiptapText(item.note.content, 200));
const kind = ref<SortKind>(suggestedKind(item.was));
const sessionId = ref<string | null>(null);
const memberId = ref("");

const memberOptions = computed(() => (party.value ?? []).map((m) => ({ id: m.id, name: m.name })));

/** The choice as the picker stands, or null while a destination still needs picking. */
const choice = computed<SortChoice | null>(() => {
  if (kind.value === "lore" || kind.value === "keep") return { kind: kind.value };
  if (kind.value === "session") return sessionId.value ? { kind: "session", sessionId: sessionId.value } : null;
  return memberId.value ? { kind: kind.value, partyMemberId: memberId.value } : null;
});

async function sort() {
  if (!choice.value) return;
  try {
    await sortIt({ note: item.note, choice: choice.value });
  } catch (cause) {
    if (cause instanceof SortStepError) toast.error(sortFailureMessage(item.note.title, cause));
    else toast.error(toast.fromError(cause));
  }
}
</script>
