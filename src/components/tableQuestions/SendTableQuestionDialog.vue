<template>
  <AppModal :open="open" size="md" @close="emit('close')">
    <ModalHeader title="Ask the table" :subtitle="table.name" :icon="IconSend" closeable @close="emit('close')" />

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
      <label class="block space-y-1">
        <span class="text-eyebrow text-muted-foreground">Question</span>
        <AppInput v-model="prompt" block placeholder="Which road do we take?" />
      </label>

      <div class="space-y-1.5">
        <span class="text-eyebrow text-muted-foreground">How do they answer?</span>
        <SegmentedControl v-model="mode" :options="MODE_OPTIONS" block wrap />
        <p class="text-caption text-muted-foreground">{{ MODE_HINT[mode] }}</p>
      </div>

      <div v-if="mode === 'pick'" class="flex items-center justify-between gap-3">
        <span class="text-body">Only one of each</span>
        <ToggleSwitch v-model="exclusive" aria-label="Only one of each at this table" />
      </div>
      <div v-else-if="mode === 'vote'" class="flex items-center justify-between gap-3">
        <span class="text-body">Hide votes until I close it</span>
        <ToggleSwitch v-model="hidden" aria-label="Hide votes until I close it" />
      </div>

      <div class="space-y-1.5">
        <span class="text-eyebrow text-muted-foreground">
          {{ options.length }} {{ options.length === 1 ? "option" : "options" }}
        </span>
        <p v-if="options.length === 0" class="text-caption text-muted-foreground italic">
          This table has no entries with a name yet.
        </p>
        <ul v-else class="flex max-h-48 flex-col gap-1 overflow-y-auto">
          <li v-for="o in options" :key="o.id" class="flex items-center gap-2 text-body">
            <!-- FocalImage fills its parent, so the parent sets the size. -->
            <div v-if="o.image_url" class="size-7 shrink-0 overflow-hidden rounded">
              <FocalImage :src="o.image_url" :alt="o.label" format="square" :focal-point="o.focal" />
            </div>
            <span v-else class="size-7 shrink-0 rounded bg-muted" aria-hidden="true" />
            <span class="min-w-0 truncate">{{ o.label }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="subtle" size="md" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconSend"
        label="Send to the table"
        :disabled="!sendable"
        :loading="send.isPending.value"
        @click="onSend"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The DM sends a roll table to the table as a question (#1212): each picks
 * their own, the table votes, or each rolls. The options are a snapshot built
 * here, because players never read `roll_tables`. A global table (no campaign)
 * can still be sent into the active campaign; `roll_table_id` stays valid.
 */
import { computed, ref, watch } from "vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useEntryPictures } from "@/composables/tableQuestions/useEntryPictures";
import { useSendTableQuestion } from "@/composables/tableQuestions/useTableQuestions";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { IconSend } from "@/lib/icons";
import { buildQuestionOptions } from "@/lib/tableQuestions/options";
import { buildSendPayload, canSend } from "@/lib/tableQuestions/send";
import type { RollTable } from "@/types/rollTable.types";
import type { TableQuestion, TableQuestionMode } from "@/types/tableQuestion.types";

const { table, open } = defineProps<{ table: RollTable; open: boolean }>();
const emit = defineEmits<{
  close: [];
  sent: [question: TableQuestion];
}>();

const MODE_OPTIONS: SegmentedOption<TableQuestionMode>[] = [
  { value: "pick", label: "Each picks their own" },
  { value: "vote", label: "The table votes" },
  { value: "roll", label: "Each rolls" },
];
const MODE_HINT: Record<TableQuestionMode, string> = {
  pick: "Every player chooses for their own character, like a pet or a trinket.",
  vote: "You see the tally and close the vote when you choose.",
  roll: "Each player rolls the table from their own screen.",
};

const campaign = useCampaignStore();
const toast = useToast();
const send = useSendTableQuestion();

const prompt = ref(table.name);
const mode = ref<TableQuestionMode>("pick");
const exclusive = ref(false);
const hidden = ref(true);

// A reopened dialog starts from the table again, never from the last send.
watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    prompt.value = table.name;
    mode.value = "pick";
    exclusive.value = false;
    hidden.value = true;
  },
);

const pictures = useEntryPictures(() => table.entries.flatMap((e) => (e.ref ? [e.ref] : [])), { npcs: true });
const options = computed(() => buildQuestionOptions(table.entries, pictures.value));
const sendable = computed(() => canSend(prompt.value, options.value) && campaign.activeCampaignId !== null);

async function onSend() {
  const campaignId = campaign.activeCampaignId;
  if (campaignId === null || !sendable.value) return;
  try {
    const question = await send.mutateAsync(
      buildSendPayload({
        campaignId,
        table,
        prompt: prompt.value,
        mode: mode.value,
        exclusive: exclusive.value,
        hidden: hidden.value,
        options: options.value,
      }),
    );
    toast.success("Sent to the table.");
    emit("sent", question);
    emit("close");
  } catch (e) {
    toast.error(toast.fromError(e, "Could not send the question."));
  }
}
</script>
