<template>
  <div class="flex items-center gap-1">
    <AppButton
      variant="subtle"
      size="toolbar"
      :icon="IconMoon"
      icon-size="xs"
      tooltip="Short Rest"
      aria-label="Rest"
      :disabled="resting"
      @click="restDialog = 'short'"
    >
      <span class="text-label">Rest</span>
    </AppButton>
    <AppButton
      variant="tinted"
      tone="primary"
      emphasis="soft"
      size="toolbar"
      :icon="IconSun"
      icon-size="xs"
      tooltip="Long Rest"
      aria-label="Sleep"
      :disabled="resting"
      @click="restDialog = 'long'"
    >
      <span class="text-label">Sleep</span>
    </AppButton>
  </div>

  <RestDialog
    :member="member"
    :mode="restDialog"
    :effective-spell-slots="effectiveSpellSlots"
    @close="restDialog = null"
    @confirm="onRestConfirm"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconMoon, IconSun } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import RestDialog from "@/components/player/RestDialog.vue";
import { useTakeSpellcastingRest, useUpdatePartyMember } from "@/composables/party/useParty";
import { deriveEffectiveSpellSlots } from "@/rules/spellSlots";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/rules/useCustomClasses";
import type { SpellSlotEntry, PartyMember, PartyMemberUpdate } from "@/types/party.types";
import { useRuleset } from "@/composables/rules/useRuleset";

const props = defineProps<{ member: PartyMember }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();
const { mutateAsync: takeSpellcastingRest } = useTakeSpellcastingRest();
const resting = ref(false);
const restDialog = ref<"short" | "long" | null>(null);

const { ruleset } = useRuleset();
const { data: characterClasses } = useCharacterClasses(computed(() => props.member.id));
const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();

// Stored slots first, since they carry what is spent. Without any, derive the
// maximums from the class rows (none for a classless or non-casting character).
const effectiveSpellSlots = computed<SpellSlotEntry[]>(() => {
  if (props.member.spell_slots?.length) return props.member.spell_slots;
  return deriveEffectiveSpellSlots(props.member, characterClasses.value ?? [], ruleset.value, (row) => {
    const definitions = row.class_definition_kind === "custom" ? customClasses.value : systemClasses.value;
    return definitions?.find((c) => c.id === row.class_definition_id);
  });
});

async function onRestConfirm(update: PartyMemberUpdate) {
  const completedRest = restDialog.value;
  restDialog.value = null;
  resting.value = true;
  try {
    if (completedRest) {
      // spell_slots/class_resources are restored server-side by takeSpellcastingRest,
      // and RestDialog no longer emits them — update carries only non-spell fields.
      await updateMember({ id: props.member.id, update });
      await takeSpellcastingRest({ partyMemberId: props.member.id, rest: completedRest });
    } else {
      await updateMember({ id: props.member.id, update });
    }
  } finally {
    resting.value = false;
  }
}
</script>
