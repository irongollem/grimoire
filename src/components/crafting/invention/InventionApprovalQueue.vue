<template>
  <section
    v-if="pending.length > 0"
    class="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    aria-labelledby="invention-queue-title"
    data-testid="invention-queue"
  >
    <header class="flex flex-col gap-1">
      <h2 id="invention-queue-title" class="text-heading-sm font-semibold text-foreground">
        Inventions waiting for you
        <span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground" data-testid="invention-count">{{
          pending.length
        }}</span>
      </h2>
      <p class="text-caption text-muted-foreground">
        A player's invention only becomes a recipe once you approve it. Nothing here is in your world yet.
      </p>
    </header>

    <InventionDraftCard
      v-for="entry in pending"
      :key="entry.invention.id"
      :invention="entry.invention"
      :character-name="entry.characterName"
      viewer="dm"
      data-testid="invention-card"
    >
      <template #note>
        <div v-if="noteFor === entry.invention.id" class="flex flex-col gap-2">
          <label :for="`invention-note-${entry.invention.id}`" class="text-label-lg font-semibold text-foreground">
            Note for {{ entry.characterName }}
          </label>
          <!-- Native on purpose: the note is model input on the player's next revision (invent-recipe), so rich text would reach the model as markup. -->
          <textarea
            :id="`invention-note-${entry.invention.id}`"
            v-model="noteText"
            data-hand
            rows="3"
            :maxlength="INVENTION_NOTE_MAX"
            placeholder="What should change before you approve it?"
            class="w-full resize-y rounded-md border border-border bg-muted/40 px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-caption text-muted-foreground">{{ noteText.length }} / {{ INVENTION_NOTE_MAX }}</span>
            <div class="flex gap-2">
              <AppButton variant="subtle" size="sm" label="Cancel" :disabled="busyId !== null" @click="closeNote" />
              <AppButton
                variant="primary"
                size="sm"
                label="Send back"
                :loading="busyId === entry.invention.id && busyAction === 'return'"
                :disabled="busyId !== null || noteText.trim().length === 0"
                @click="sendBack(entry)"
              />
            </div>
          </div>
        </div>
      </template>
      <template #actions>
        <AppButton
          variant="destructive"
          size="sm"
          label="Discard"
          :loading="busyId === entry.invention.id && busyAction === 'discard'"
          :disabled="busyId !== null"
          @click="discard(entry)"
        />
        <AppButton
          v-if="noteFor !== entry.invention.id"
          variant="subtle"
          size="sm"
          label="Send back with a note"
          :disabled="busyId !== null"
          @click="openNote(entry.invention.id)"
        />
        <AppButton
          variant="primary"
          size="sm"
          label="Approve"
          :loading="busyId === entry.invention.id && busyAction === 'approve'"
          :disabled="busyId !== null"
          @click="approve(entry)"
        />
      </template>
    </InventionDraftCard>

    <p class="text-caption text-muted-foreground">
      Players can invent only while the AI invention rule is on.
      <AppButton to="/campaign/settings?tab=rules" variant="link" size="inline-caption" label="Open the Rules tab" />
    </p>
  </section>
</template>

<script setup lang="ts">
/*
  The DM's gate for AI inventions (#1103). Every invention a player sends waits here until the
  DM approves it, sends it back with a note, or discards it; there is no automatic path. It is a
  queue, not a form, so a decision never navigates: the doorbell ring refetches and the card
  leaves the list.
*/
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import InventionDraftCard from "@/components/crafting/invention/InventionDraftCard.vue";
import {
  INVENTION_NOTE_MAX,
  inventionDecisionErrorMessage,
  useDecideInvention,
  useDiscardInvention,
  usePendingInventions,
  type PendingInvention,
} from "@/composables/crafting/useInventionQueue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";

const campaign = useCampaignStore();
const queue = usePendingInventions(() => campaign.activeCampaignId);
const { approve: approveInvention, returnWithNote } = useDecideInvention();
const discardInvention = useDiscardInvention();
const { confirm } = useConfirm();
const toast = useToast();

const pending = computed(() => queue.data.value ?? []);

/** The draft a decision is running for; its buttons load and every other one waits. */
const busyId = ref<string | null>(null);
const busyAction = ref<"approve" | "return" | "discard" | null>(null);
const noteFor = ref<string | null>(null);
const noteText = ref("");

function openNote(id: string) {
  noteFor.value = id;
  noteText.value = "";
}

function closeNote() {
  noteFor.value = null;
  noteText.value = "";
}

async function run(entry: PendingInvention, action: "approve" | "return" | "discard", work: () => Promise<void>) {
  if (busyId.value !== null) return;
  busyId.value = entry.invention.id;
  busyAction.value = action;
  try {
    await work();
  } catch (error) {
    toast.error(inventionDecisionErrorMessage(error));
  } finally {
    busyId.value = null;
    busyAction.value = null;
  }
}

function approve(entry: PendingInvention) {
  return run(entry, "approve", async () => {
    const { chatNotice } = await approveInvention(entry.invention, entry.characterName);
    toast.success(`Approved: ${entry.invention.draft.recipe.name} is in ${entry.characterName}'s recipes.`);
    if (chatNotice) toast.info(chatNotice);
  });
}

function sendBack(entry: PendingInvention) {
  return run(entry, "return", async () => {
    await returnWithNote(entry.invention, noteText.value);
    closeNote();
    toast.success(`Sent back to ${entry.characterName} with your note.`);
  });
}

async function discard(entry: PendingInvention) {
  const ok = await confirm(
    `Discard "${entry.invention.draft.item.name}"? ${entry.characterName} loses the draft and cannot get it back.`,
    { title: "Discard invention", confirmLabel: "Discard", danger: true },
  );
  if (!ok) return;
  await run(entry, "discard", async () => {
    await discardInvention.mutateAsync(entry.invention.id);
    if (noteFor.value === entry.invention.id) closeNote();
    toast.success("Draft discarded.");
  });
}
</script>
