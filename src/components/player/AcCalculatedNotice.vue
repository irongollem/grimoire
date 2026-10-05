<template>
  <CautionNotice v-if="visible" class="flex flex-col gap-3" data-testid="ac-calculated-notice">
    <p>
      Your Armor Class is now worked out from your gear: {{ breakdown.total }} (was {{ previous }}).
      Equip your armor and shield to bring it back.
    </p>
    <AcBreakdownList :breakdown="breakdown" />
    <div class="flex flex-wrap items-center gap-2">
      <AppButton to="/play/inventory" variant="subtle" size="xs" label="Open inventory" />
      <AppButton variant="subtle" size="xs" label="Got it" :loading="clearing" @click="clear" />
    </div>
  </CautionNotice>
</template>

<script setup lang="ts">
/**
 * Armor Class used to be a number a player typed in; it is now worked out from
 * the character and the gear on their paper doll. A character made before that
 * still holds the old number. Where it differs from the calculated one, this
 * says so once, with the working, so the player can equip what they had on;
 * "Got it" clears the old number for good. Where the two already agree there is
 * nothing to tell, so the old number is cleared without a word.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import CautionNotice from "@/components/common/CautionNotice.vue";
import AcBreakdownList from "@/components/player/AcBreakdownList.vue";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();

const toast = useToast();
const { acBreakdownFor, previousAcFor, isReady } = useArmorClass();
const { mutateAsync: updateMember } = useUpdatePartyMember();

const breakdown = computed(() => acBreakdownFor(member));
/**
 * What the sheet used to show: the stored number was only its base, with any
 * equipped shield added on top, so comparing the stored number alone would
 * flag every shield user with a difference that is not there.
 */
const previous = computed(() => (member.ac === null ? null : previousAcFor({ ...member, ac: member.ac })));
const clearing = ref(false);

/** Only once the gear is known: before that every character looks unarmored and the numbers always differ. */
const visible = computed(() => isReady.value && previous.value !== null && previous.value !== breakdown.value.total);

async function clear() {
  if (clearing.value) return;
  clearing.value = true;
  try {
    await updateMember({ id: member.id, update: { ac: null } });
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't dismiss this. Try again."));
  } finally {
    clearing.value = false;
  }
}

watch(
  () => isReady.value && previous.value !== null && previous.value === breakdown.value.total,
  (agrees) => {
    if (!agrees) return;
    void clear();
  },
  { immediate: true },
);
</script>
