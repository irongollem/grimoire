<template>
  <CanonEntryPane kind="Secret" delete-label="Delete this secret" close-label="Close this secret" data-testid="secret-detail" @close="emit('close')" @delete="emit('delete')">
    <template #title>
      <AppInput :key="revision" v-model.lazy="text" wrap size="body" tone="filled" aria-label="The secret" placeholder="What the world is keeping back…" />
    </template>

    <template #who>
      <span class="inline-flex items-center gap-1.5 text-label font-bold text-foreground" data-testid="secret-state">
        <span aria-hidden="true">{{ SECRET_STATE_MARK[state] }}</span>
        {{ SECRET_STATE_LABEL[state] }}
      </span>
      <AppButton v-if="entry.revealed_at === null" variant="primary" size="sm" label="Reveal to the party" data-testid="reveal" @click="reveal" />
      <AppButton v-if="entry.revealed_at === null && !choosingWho" variant="outline" size="sm" label="Reveal to…" data-testid="reveal-some" @click="choosingWho = true" />
      <AppButton v-if="entry.revealed_at !== null" variant="outline" size="sm" label="Hide again" data-testid="hide" @click="hide" />
      <EntryArcPicker :entry="entry" />
      <PassageTellSome v-if="entry.revealed_at === null && choosingWho" class="basis-full" :members="party ?? []" tell-label="Reveal" @tell="revealChosen" @cancel="choosingWho = false" />
      <p class="m-0 basis-full text-caption text-muted-foreground">
        <template v-if="entry.revealed_at === null">Finding every clue never reveals it by itself: revealing it to the players is your button.</template>
        <template v-else>The party can read this secret. Hiding it again takes it off their screens.</template>
      </p>
    </template>

    <CanonEntryNotes
      :key="entry.id"
      :entry="entry"
      label="More about it"
      help="Players read this once you reveal the secret. Put what only you should see in a DM-only block."
      placeholder="What is really going on, and how it comes out…"
    />

    <CanonBlock title="Clues" :suggest="clueRequest">
      <span class="text-label text-muted-foreground" data-testid="clue-tally">{{ clueTally(clues) }}</span>
      <ul v-if="clues.length > 0" class="flex flex-col gap-1.5">
        <ClueRow
          v-for="clue in clues"
          :key="clue.id"
          :clue="clue"
          :where="whereOf(clue)"
          :passage="passageOf(clue)"
          @found="(found) => setFound(clue, found)"
          @rename="(title) => updateClue({ id: clue.id, patch: { title } })"
          @remove="removeClue(clue)"
        />
      </ul>
      <p v-if="clues.length < CLUES_WANTED" class="m-0 text-caption text-muted-foreground" data-testid="clues-wanted">
        A secret wants {{ CLUES_WANTED }} clues, so the party can miss two and still find it.
      </p>
      <ClueForm v-if="adding" :saving="creating" @submit="addClue" @cancel="adding = false" />
      <AppButton v-else variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="Add a clue" class="self-start" @click="adding = true" />
    </CanonBlock>

    <p v-if="entry.revealed_at !== null && entry.became_entry_id !== null" class="m-0 text-body text-foreground" data-testid="secret-became">
      <RouterLink :to="{ path: '/canon', query: { entry: entry.became_entry_id } }" class="underline">
        {{ became ? `Now a truth: ${became.title}` : "Now a truth" }}
      </RouterLink>
    </p>
    <AppButton v-else-if="entry.revealed_at !== null" variant="outline" size="sm" label="Make it a truth" class="self-start" :loading="making" data-testid="make-truth" @click="makeTruth" />

    <SecretOutlets :entry="entry" :clues="clues" />

    <EntryStoryLinks :entry="entry" />

    <template #connections>
      <ConnectionsSection :subject="subject" :subject-name="entry.title" />
    </template>
  </CanonEntryPane>
</template>

<script setup lang="ts">
/**
 * The open secret, in the chapter's entry pane: its statement, who it is revealed to (the DM's Reveal buttons), its clues with the Found tick. The state
 * is read off the clues, never stored; revealing shares the secret with every party member (or only those chosen under "Reveal to…") and stamps the time and the open session.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import CanonEntryPane from "./kit/CanonEntryPane.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import EntryStoryLinks from "./EntryStoryLinks.vue";
import PassageTellSome from "./PassageTellSome.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";
import ClueForm from "./ClueForm.vue";
import ClueRow from "./ClueRow.vue";
import SecretOutlets from "./SecretOutlets.vue";
import { CLUES_WANTED, SECRET_STATE_LABEL, SECRET_STATE_MARK, clueTally, secretState } from "@/lib/canon/canonSecrets";
import { cluePlacement, useCreateCanonClue, useCanonClues, useDeleteCanonClue, useSetClueFound, useUpdateCanonClue, type ClueKind } from "@/composables/canon/useCanonClues";
import { useCanonEntries, useCreateCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useLinkBecame } from "@/composables/canon/useLinkBecame";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useClueWhere } from "@/composables/canon/useClueWhere";
import { useRevealSecret } from "@/composables/canon/useRevealSecret";
import { useParty } from "@/composables/party/useParty";
import { useConfirm } from "@/composables/useConfirm";
import { IconAdd } from "@/lib/icons";
import { toast } from "@/lib/toast";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import type { WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: []; close: [] }>();

const subject = computed<WorldRef>(() => ({ kind: "canon", id: entry.id }));
const linkBecame = useLinkBecame();
// The written request the Clues block's Suggest hands the Familiar.
const clueRequest = computed(() => `Suggest clues for the secret "${entry.title}".`);

const { data: allClues } = useCanonClues();
const clues = computed(() => (allClues.value ?? []).filter((c) => c.secret_id === entry.id));
const state = computed(() => secretState(entry, clues.value));
const whereOf = useClueWhere();
// A clue that is a lore passage names the passage, with a link to its entry.
const { data: allPassages } = useCanonPassages();
function passageOf(clue: CanonClue) {
  const passage = clue.passage_id === null ? undefined : (allPassages.value ?? []).find((p) => p.id === clue.passage_id);
  return passage ? { title: passage.title, entryId: passage.entry_id } : null;
}

const { mutate: update, mutateAsync: updateAsync } = useUpdateCanonEntry();
const { mutateAsync: createEntry } = useCreateCanonEntry();
const { data: allEntries } = useCanonEntries();
// The truth this secret became, while it still exists (deleting it clears the pointer).
const became = computed(() => (entry.became_entry_id === null ? undefined : (allEntries.value ?? []).find((e) => e.id === entry.became_entry_id)));
const { mutate: updateClue } = useUpdateCanonClue();
const { mutateAsync: createClue, isPending: creating } = useCreateCanonClue();
const { mutateAsync: destroyClue } = useDeleteCanonClue();
const setFound = useSetClueFound();
const { ready: partyReady, revealSecret } = useRevealSecret();
const { confirm } = useConfirm();

const { text, revision } = useCommittedText(() => entry.title, (next) => update({ id: entry.id, patch: { title: next } }));

const adding = ref(false);
const choosingWho = ref(false);
watch(() => entry.id, () => { adding.value = false; choosingWho.value = false; });
const { data: party } = useParty();

async function addClue(input: { title: string; where: { kind: ClueKind; id: string } | null }) {
  const base = { secret_id: entry.id, title: input.title, sort_order: clues.value.length };
  try {
    // One column per kind (cluePlacement), so an item or a handout never lands in another kind's column.
    await createClue(input.where === null ? base : { ...base, ...cluePlacement(input.where) });
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
  if (!partyReady.value) return;
  const ok = await confirm(`Reveal this secret to the party? "${entry.title}" shows on every player's screen.`, {
    title: "Reveal to the party",
    confirmLabel: "Reveal",
    danger: false,
  });
  if (!ok) return;
  revealSecret(entry.id);
}

/** "Reveal to…": only the characters ticked read it, and the picker's Reveal is the DM's act, so it asks nothing more. */
function revealChosen(ids: string[]) {
  choosingWho.value = false;
  revealSecret(entry.id, ids);
}

const making = ref(false);

/** A revealed secret becomes a truth known to all, with its words and notes; the secret stays, still revealed. A failed pointer never deletes the truth. */
async function makeTruth() {
  if (entry.revealed_at === null || making.value) return;
  making.value = true;
  try {
    let truth: CanonEntry;
    try {
      truth = await createEntry({ part: "truth", knowledge: "all", title: entry.title, body: entry.body });
    } catch {
      return; // The mutation has already told the DM (toast).
    }
    try {
      await updateAsync({ id: entry.id, patch: { became_entry_id: truth.id } });
    } catch {
      toast.error("The truth was made, but this secret could not be pointed at it.");
      return;
    }
    // Every "becomes" also says so as a canon link, so the web and the Connections block show where it led.
    await linkBecame(entry, truth);
  } finally {
    making.value = false;
  }
}

/** Hiding a secret that became a truth leaves the truth known to all, so it asks first (#1258 item 13). */
async function hide() {
  if (entry.became_entry_id !== null) {
    const ok = await confirm("The truth it became stays known to all. Hide the secret anyway?", { title: "Hide again", confirmLabel: "Hide the secret" });
    if (!ok) return;
  }
  // A session with no reveal time is refused by the table, so hiding clears both.
  update({ id: entry.id, patch: { revealed_at: null, revealed_session_id: null } });
}
</script>
