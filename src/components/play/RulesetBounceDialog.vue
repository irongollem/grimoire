<template>
  <AppModal :open="open" size="md" role="alertdialog" @close="dismiss">
    <ModalHeader
      :title="`${campaignName ?? 'This table'} plays the ${campaignRuleset} rules`"
      :subtitle="`${character.name} is built with the ${character.ruleset} rules.`"
      :icon="IconWarning"
      tone="gold"
      closeable
      @close="dismiss"
    />

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 text-body text-foreground">
      <p>
        {{ tableName }} plays {{ rulesetLabel(campaignRuleset) }} and does not take
        {{ rulesetLabel(character.ruleset) }} characters.
      </p>
      <p class="text-muted-foreground">
        You can bring a copy of {{ character.name }} instead. The copy is rebuilt for
        {{ rulesetLabel(campaignRuleset) }} and joins in their place. The original stays exactly as it is in
        your pool, and anything that has no counterpart in the other edition is kept and flagged for you to review.
      </p>
      <p v-if="error" class="text-caption text-destructive" role="alert" data-testid="bounce-error">{{ error }}</p>
    </div>

    <footer class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="ghost" size="sm" label="Cancel" :disabled="working" @click="dismiss" />
      <AppButton
        variant="subtle"
        size="sm"
        label="Choose another character"
        :disabled="working"
        @click="emit('chooseAnother')"
      />
      <AppButton
        variant="primary"
        size="sm"
        label="Convert a copy and join"
        :loading="working"
        :disabled="working"
        @click="convertAndBring"
      />
    </footer>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The offer made when a table refuses a character's edition (#943): a converted
 * copy takes its place, and the original is never touched. The dialog does not
 * know how a character reaches the table, so `bring` is the caller's: the pool
 * attaches, the join page joins through the invite.
 */
import { computed, ref, watch } from "vue";
import AppModal from "@/components/common/AppModal.vue";
import AppButton from "@/components/common/AppButton.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import { IconWarning } from "@/lib/icons";
import { rulesetLabel, useConvertCharacterCopy } from "@/composables/party/useCharacterRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

const { open, character, campaignRuleset, campaignName, bring } = defineProps<{
  open: boolean;
  character: { id: string; name: string; ruleset: RulesetKey };
  campaignRuleset: RulesetKey;
  /** Null when the caller cannot know it, as on the join page. */
  campaignName: string | null;
  /** Gets an admissible character to the table: an attach from the pool, a join from the invite page. */
  bring: (partyMemberId: string) => Promise<void>;
}>();

const emit = defineEmits<{
  close: [];
  chooseAnother: [];
  joined: [partyMemberId: string];
}>();

const { mutateAsync: convertCopy } = useConvertCharacterCopy();

const working = ref(false);
const error = ref("");

const tableName = computed(() => campaignName ?? "This table");

// A reopened dialog never shows the last attempt's failure.
watch(
  () => open,
  (isOpen) => {
    if (isOpen) error.value = "";
  },
);

function dismiss() {
  if (working.value) return;
  emit("close");
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") return e.message;
  return "Something went wrong.";
}

async function convertAndBring() {
  working.value = true;
  error.value = "";
  let copyId: string;
  try {
    copyId = await convertCopy({ partyMemberId: character.id, ruleset: campaignRuleset });
  } catch (e) {
    error.value = `The copy could not be made. ${messageOf(e)}`;
    working.value = false;
    return;
  }
  try {
    await bring(copyId);
  } catch (e) {
    error.value = `The copy of ${character.name} was made and is in your pool, but it could not join. ${messageOf(e)}`;
    working.value = false;
    return;
  }
  working.value = false;
  emit("joined", copyId);
}
</script>
