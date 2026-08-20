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
      <span class="text-label md:text-sm">Rest</span>
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
      <span class="text-label md:text-sm">Sleep</span>
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
import { useTakeSpellcastingRest, useUpdatePartyMember } from "@/composables/useParty";
import { getCasterType, getDefaultSpellSlots } from "@/types/spell.types";
import { useClassByName } from "@/composables/useCustomClasses";
import type { SpellSlotEntry, PartyMember, PartyMemberUpdate } from "@/types/party.types";
import { useRuleset } from "@/composables/useRuleset";

const props = defineProps<{ member: PartyMember }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();
const { mutateAsync: takeSpellcastingRest } = useTakeSpellcastingRest();
const resting = ref(false);
const restDialog = ref<"short" | "long" | null>(null);

const memberClassRef = computed(() => props.member.class ?? "");
const classData = useClassByName(memberClassRef);
const { ruleset } = useRuleset();
const casterType = computed(() => classData.value?.caster_type ?? getCasterType(props.member.class));
const effectiveSpellSlots = computed<SpellSlotEntry[]>(() => {
  // Honor stored slots FIRST: a multiclass caster with a non-caster legacy class
  // (e.g. Rogue 3/Wizard 2, class "Rogue") has casterType "none" from the legacy
  // field but real persisted slots — checking casterType first wiped them on rest.
  if (props.member.spell_slots?.length) return props.member.spell_slots;
  if (casterType.value === "none") return [];
  return getDefaultSpellSlots(props.member.class, props.member.level, ruleset.value);
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
