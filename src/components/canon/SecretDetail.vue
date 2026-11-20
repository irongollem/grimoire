<template>
  <section class="flex min-w-0 flex-col gap-4 border border-border bg-card p-4" aria-label="A secret" data-testid="secret-detail">
    <div class="flex flex-col gap-1">
      <span class="flex items-center justify-between gap-2 text-eyebrow text-muted-foreground">
        Secret
        <span class="inline-flex items-center gap-1.5 text-label font-bold text-foreground" data-testid="secret-state">
          <span aria-hidden="true">{{ SECRET_STATE_MARK[state] }}</span>
          {{ SECRET_STATE_LABEL[state] }}
        </span>
      </span>
      <AppInput :key="revision" v-model.lazy="text" size="body" tone="filled" aria-label="The secret" placeholder="What the world is keeping back…" />
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-eyebrow text-muted-foreground">Clues · {{ clueTally(clues) }}</span>
      <ul v-if="clues.length > 0" class="flex flex-col gap-1.5">
        <ClueRow
          v-for="clue in clues"
          :key="clue.id"
          :clue="clue"
          :where="whereOf(clue)"
          @found="(found) => setFound(clue, found)"
          @rename="(title) => updateClue({ id: clue.id, patch: { title } })"
          @remove="removeClue(clue)"
        />
      </ul>
      <p v-if="clues.length < CLUES_WANTED" class="text-caption text-muted-foreground" data-testid="clues-wanted">
        A secret wants {{ CLUES_WANTED }} clues, so the party can miss two and still find it.
      </p>
      <CanonSuggestions mode="clues" :entries="NO_ENTRIES" :secret-id="entry.id" />
      <ClueForm v-if="adding" :saving="creating" @submit="addClue" @cancel="adding = false" />
      <AppButton v-else variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="Add a clue" class="self-start" @click="adding = true" />
    </div>

    <div class="flex flex-col gap-1.5">
      <AppButton
        v-if="entry.revealed_at === null"
        variant="primary"
        size="sm"
        label="Reveal to the party"
        class="self-start"
        data-testid="reveal"
        @click="reveal"
      />
      <AppButton v-else variant="outline" size="sm" label="Hide again" class="self-start" data-testid="hide" @click="hide" />
      <p class="text-caption text-muted-foreground">
        <template v-if="entry.revealed_at === null">Finding every clue never reveals it by itself: revealing it to the players is your button.</template>
        <template v-else>The party can read this secret. Hiding it again takes it off their screens.</template>
      </p>
    </div>

    <ConnectionsSection :subject="subject" :subject-name="entry.title" />

    <AppButton variant="destructive" size="sm" :icon="IconDelete" icon-size="xs" label="Delete this secret" class="self-start" @click="emit('delete')" />
  </section>
</template>

<script setup lang="ts">
/**
 * The selected secret (frame 05): its statement, its clues with the Found tick, and the DM's Reveal button. The state
 * is read off the clues, never stored; revealing shares the secret with every party member and stamps the time.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import ClueForm from "./ClueForm.vue";
import ClueRow from "./ClueRow.vue";
import { CLUES_WANTED, SECRET_STATE_LABEL, SECRET_STATE_MARK, clueTally, secretState } from "@/lib/canon/canonSecrets";
import { useCreateCanonClue, useCanonClues, useDeleteCanonClue, useSetClueFound, useUpdateCanonClue, type ClueKind } from "@/composables/canon/useCanonClues";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { useClueWhere } from "@/composables/canon/useClueWhere";
import { useParty } from "@/composables/party/useParty";
import { useConfirm } from "@/composables/useConfirm";
import { IconAdd, IconDelete } from "@/lib/icons";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import type { WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: [] }>();

// The clues mode counts the secret's own clues; it takes no entries.
const NO_ENTRIES: readonly CanonEntry[] = [];

const subject = computed<WorldRef>(() => ({ kind: "canon", id: entry.id }));

const { data: allClues } = useCanonClues();
const clues = computed(() => (allClues.value ?? []).filter((c) => c.secret_id === entry.id));
const state = computed(() => secretState(entry, clues.value));
const whereOf = useClueWhere();

const { mutate: update } = useUpdateCanonEntry();
const { mutate: updateClue } = useUpdateCanonClue();
const { mutateAsync: createClue, isPending: creating } = useCreateCanonClue();
const { mutateAsync: destroyClue } = useDeleteCanonClue();
const setFound = useSetClueFound();
const { data: party } = useParty();
const { confirm } = useConfirm();

const { text, revision } = useCommittedText(() => entry.title, (next) => update({ id: entry.id, patch: { title: next } }));

const adding = ref(false);
watch(() => entry.id, () => { adding.value = false; });

async function addClue(input: { title: string; where: { kind: ClueKind; id: string } | null }) {
  const base = { secret_id: entry.id, title: input.title, sort_order: clues.value.length };
  try {
    if (input.where === null) await createClue(base);
    else if (input.where.kind === "location") await createClue({ ...base, location_id: input.where.id });
    else if (input.where.kind === "npc") await createClue({ ...base, npc_id: input.where.id });
    else await createClue({ ...base, quest_beat_id: input.where.id });
    adding.value = false;
  } catch {
    // The mutation has already told the DM (toast); the form stays open to try again.
  }
}

async function removeClue(clue: CanonClue) {
  if (!(await confirm(`Remove this clue? "${clue.title}" is deleted.`, { title: "Remove this clue", confirmLabel: "Remove" }))) return;
  try {
    await destroyClue(clue.id);
  } catch {
    // The mutation has already told the DM (toast).
  }
}

async function reveal() {
  // Revealing to a party that has not loaded yet would share it with nobody, silently: wait for it.
  const members = party.value;
  if (!members) return;
  const ok = await confirm(`Reveal this secret to the party? "${entry.title}" shows on every player's screen.`, {
    title: "Reveal to the party",
    confirmLabel: "Reveal",
    danger: false,
  });
  if (!ok) return;
  update({ id: entry.id, patch: { revealed_at: new Date().toISOString(), player_visible_to: members.map((m) => m.id) } });
}

function hide() {
  update({ id: entry.id, patch: { revealed_at: null } });
}
</script>
