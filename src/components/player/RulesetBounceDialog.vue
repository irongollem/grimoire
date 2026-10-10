<template>
  <AppModal open size="md" role="alertdialog" @close="dismiss">
    <ModalHeader
      :title="`This table plays the ${rulesetRules(campaignRuleset)}`"
      :subtitle="`${character.name} is built with the ${rulesetRules(character.ruleset)}.`"
      :icon="IconWarning"
      tone="gold"
      closeable
      @close="dismiss"
    />

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 text-body text-foreground">
      <p>
        {{ tableName }} plays the {{ rulesetRules(campaignRuleset) }} and does not take characters built with the
        {{ rulesetRules(character.ruleset) }}.
      </p>
      <p class="text-muted-foreground">
        You can bring a copy of {{ character.name }} instead. The copy is rebuilt for
        the {{ rulesetRules(campaignRuleset) }} and joins in their place. The original stays exactly as it is in
        your pool, and anything that has no counterpart in the other edition is kept and flagged for you to review.
      </p>
      <p v-if="error" class="text-caption text-destructive" role="alert" data-testid="bounce-error">{{ error }}</p>
    </div>

    <footer class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
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
 *
 * The title states the fact and never the campaign's name: a long name pushed
 * "plays the 2014 rules" past the header's truncation, which left a warning
 * that named a table and said nothing about it. The body names the table.
 * Two actions, not three: the close control already cancels, and a third button
 * wrapped the footer onto a second row.
 */
import { computed, ref } from "vue";
import AppModal from "@/components/common/AppModal.vue";
import AppButton from "@/components/common/AppButton.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import { IconWarning } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { rulesetRules, useConvertCharacterCopy } from "@/composables/party/useCharacterRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

const { character, campaignRuleset, campaignName, bring } = defineProps<{
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

// Errors stay inline in the dialog, but read through the same helper every other surface uses.
const { fromError } = useToast();
const { mutateAsync: convertCopy } = useConvertCharacterCopy();

const working = ref(false);
const error = ref("");

const tableName = computed(() => campaignName ?? "This table");

// Callers render the dialog behind a `v-if`, so each opening is a fresh mount
// and never shows the last attempt's failure.

function dismiss() {
  if (working.value) return;
  emit("close");
}

async function convertAndBring() {
  working.value = true;
  error.value = "";
  let copyId: string;
  try {
    copyId = await convertCopy({ partyMemberId: character.id, ruleset: campaignRuleset });
  } catch (e) {
    error.value = `The copy could not be made. ${fromError(e)}`;
    working.value = false;
    return;
  }
  try {
    await bring(copyId);
  } catch (e) {
    error.value = `The copy of ${character.name} was made and is in your pool, but it could not join. ${fromError(e)}`;
    working.value = false;
    return;
  }
  working.value = false;
  emit("joined", copyId);
}
</script>
