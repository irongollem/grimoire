<template>
  <div class="flex items-center gap-1">
    <button
      class="h-6 flex items-center gap-1 px-1.5 rounded border border-border font-cinzel text-[9px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
      title="Short Rest"
      :disabled="resting"
      @click="restDialog = 'short'"
    ><Moon class="h-3 w-3" /> Rest</button>
    <button
      class="h-6 flex items-center gap-1 px-1.5 rounded bg-primary/10 border border-primary/30 font-cinzel text-[9px] text-primary hover:bg-primary/20 transition-colors tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
      title="Long Rest"
      :disabled="resting"
      @click="restDialog = 'long'"
    ><Sun class="h-3 w-3" /> Sleep</button>
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
import { Moon, Sun } from "lucide-vue-next";
import RestDialog from "@/components/player/RestDialog.vue";
import { useUpdatePartyMember } from "@/composables/useParty";
import { getCasterType, getDefaultSpellSlots } from "@/types/spell.types";
import type { SpellSlotEntry, PartyMember, PartyMemberUpdate } from "@/types/party.types";

const props = defineProps<{ member: PartyMember }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();
const resting = ref(false);
const restDialog = ref<"short" | "long" | null>(null);

const casterType = computed(() => getCasterType(props.member.class));
const effectiveSpellSlots = computed<SpellSlotEntry[]>(() => {
  if (casterType.value === "none") return [];
  if (props.member.spell_slots?.length) return props.member.spell_slots;
  return getDefaultSpellSlots(props.member.class, props.member.level);
});

async function onRestConfirm(update: PartyMemberUpdate) {
  restDialog.value = null;
  resting.value = true;
  try {
    await updateMember({ id: props.member.id, update });
  } finally {
    resting.value = false;
  }
}
</script>
