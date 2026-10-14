<template>
  <AppModal :open="open" size="md" @close="emit('close')">
    <ModalHeader
      :title="`Ask someone to look after ${member.name}`"
      subtitle="They play them for this session. They can't level them up or rebuild them."
      :icon="IconParty"
      tone="primary"
      closeable
      @close="emit('close')"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-1.5" role="radiogroup" :aria-label="`Who looks after ${member.name}`">
      <ListSkeleton v-if="isPending" variant="rows" :count="3" />
      <p v-else-if="!candidates?.length" class="text-body text-muted-foreground italic">
        There is nobody else at this table to ask.
      </p>
      <AppButton
        v-for="candidate in candidates"
        :key="candidate.user_id"
        role="radio"
        :aria-checked="candidate.user_id === chosenUserId"
        variant="menu"
        size="body"
        block
        :active="candidate.user_id === chosenUserId"
        @click="chosenUserId = candidate.user_id"
      >
        <span class="min-w-0 flex-1 truncate text-left">{{ nameOf(candidate) }}</span>
        <span v-if="candidate.role === 'dm'" class="shrink-0 text-label text-muted-foreground">DM</span>
      </AppButton>
    </div>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="sm"
        :label="confirmLabel"
        :loading="handingOver"
        :disabled="!chosen || handingOver"
        @click="confirm"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * Hand a character to another member for a session (#1059). Shared by the
 * owner's sheet and the DM's Members tab. Lists every member of the table
 * except the character's owner, DMs included, and confirms with
 * `useHandOverCharacter`; the server checks who may hand over.
 *
 * Contract: `open` + `close` as every dialog here; `handed-over` after the
 * write succeeded (the caller does not need to close it again).
 */
import { computed, ref, watch } from "vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import { IconParty } from "@/lib/icons";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useHandOverCharacter } from "@/composables/party/useCharacterCaretakers";
import { useToast } from "@/composables/useToast";
import type { PartyMember } from "@/types/party.types";
import type { CampaignMember } from "@/types/campaign.types";

const { member, campaignId, open } = defineProps<{
  member: PartyMember;
  campaignId: string;
  open: boolean;
}>();
const emit = defineEmits<{ close: []; "handed-over": [] }>();

const toast = useToast();
const { data: members, isPending } = useCampaignMembers();
const { mutateAsync: handOver, isPending: handingOver } = useHandOverCharacter();

const chosenUserId = ref<string | null>(null);
watch(() => open, (isOpen) => { if (isOpen) chosenUserId.value = null; });

const candidates = computed(() => members.value?.filter(m => m.user_id !== member.owner_user_id) ?? null);
const chosen = computed(() => candidates.value?.find(m => m.user_id === chosenUserId.value) ?? null);

function nameOf(m: CampaignMember): string {
  return m.display_name ?? "Unnamed player";
}

const confirmLabel = computed(() =>
  chosen.value ? `Hand ${member.name} to ${nameOf(chosen.value)}` : `Hand ${member.name} over`,
);

async function confirm() {
  const person = chosen.value;
  if (!person) return;
  try {
    await handOver({ campaign_id: campaignId, party_member_id: member.id, caretaker_user_id: person.user_id });
    toast.success(`${nameOf(person)} is looking after ${member.name}.`);
    emit("handed-over");
    emit("close");
  } catch (e) {
    toast.error(toast.fromError(e, `Couldn't hand ${member.name} over.`));
  }
}
</script>
