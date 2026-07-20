<template>
  <div class="flex items-center gap-1">
    <button
      class="h-6 flex items-center gap-1 px-1.5 rounded border border-border font-cinzel text-2xs md:text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
      title="Short Rest"
      :disabled="resting"
      @click="restDialog = 'short'"
    ><IconMoon class="h-3 w-3" /> Rest</button>
    <button
      class="h-6 flex items-center gap-1 px-1.5 rounded bg-primary/10 border border-primary/30 font-cinzel text-2xs md:text-sm text-primary hover:bg-primary/20 transition-colors tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
      title="Long Rest"
      :disabled="resting"
      @click="restDialog = 'long'"
    ><IconSun class="h-3 w-3" /> Sleep</button>
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
import RestDialog from "@/components/player/RestDialog.vue";
import { useRecordSorcererRest, useUpdatePartyMember } from "@/composables/useParty";
import { getCasterType, getDefaultSpellSlots } from "@/types/spell.types";
import { useClassByName } from "@/composables/useCustomClasses";
import type { SpellSlotEntry, PartyMember, PartyMemberUpdate } from "@/types/party.types";
import { useRuleset } from "@/composables/useRuleset";
import { useOpenSpellChangeWindows } from "@/composables/useCharacterSpells";

const props = defineProps<{ member: PartyMember }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();
const { mutateAsync: recordSorcererRest } = useRecordSorcererRest();
const { mutateAsync: openSpellWindows } = useOpenSpellChangeWindows();
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
    await updateMember({ id: props.member.id, update });
    if (completedRest) {
      await recordSorcererRest({ partyMemberId: props.member.id, rest: completedRest });
    }
    if (completedRest === "long") {
      await openSpellWindows({ partyMemberId: props.member.id, timing: "long_rest" });
    }
  } finally {
    resting.value = false;
  }
}
</script>
