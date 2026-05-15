<template>
  <div
    class="rounded-lg border overflow-hidden"
    :class="localActive ? 'border-red-500/50 bg-red-500/5' : 'border-border bg-card'"
  >
    <div
      class="px-4 py-2.5 border-b flex items-center justify-between"
      :class="localActive ? 'border-red-500/30' : 'border-border'"
    >
      <p class="font-cinzel text-xs font-semibold tracking-wider" :class="localActive ? 'text-red-600' : 'text-muted-foreground'">
        Rage
      </p>
      <span class="font-cinzel text-2xs tracking-wider" :class="localActive ? 'text-red-600' : 'text-muted-foreground'">
        {{ rageUsesCurrent }} / {{ rageUsesMax }} uses
      </span>
    </div>

    <!-- Active rage -->
    <div v-if="localActive" class="px-4 py-3 space-y-2">
      <div class="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 space-y-1">
        <p class="font-cinzel text-xs font-semibold text-red-600">Raging</p>
        <p class="font-fell text-sm text-foreground">+{{ rageBonus }} melee damage (STR-based)</p>
        <p class="font-fell text-sm text-muted-foreground">Resistance: bludgeoning, piercing, slashing</p>
        <p class="font-fell text-sm text-muted-foreground">Advantage on STR checks and saving throws</p>
      </div>
      <button
        class="font-cinzel text-2xs tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        @click="endRage"
      >End Rage</button>
    </div>

    <!-- Not raging -->
    <div v-else class="px-4 py-2.5">
      <button
        class="font-cinzel text-2xs tracking-wider px-3 py-1 rounded bg-red-500/15 border border-red-500/30 text-red-600 hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="rageUsesCurrent <= 0"
        @click="enterRage"
      >Enter Rage</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useUpdatePartyMember } from "@/composables/useParty";
import type { PartyMember } from "@/types/party.types";

const { member, barbarianLevel, rageUsesCurrent } = defineProps<{
  member: PartyMember;
  barbarianLevel: number;
  rageUsesCurrent: number;
  rageUsesMax: number;
}>();

const emit = defineEmits<{
  (e: "spend-use"): void;
}>();

const { mutate: updateMember } = useUpdatePartyMember();

const localActive = ref(member.rage_active ?? false);
watch(
  () => [member.id, member.updated_at],
  () => { localActive.value = member.rage_active ?? false; },
  { immediate: true },
);

const rageBonus = computed(() => {
  if (barbarianLevel >= 16) return 4;
  if (barbarianLevel >= 9) return 3;
  return 2;
});

function enterRage() {
  if (rageUsesCurrent <= 0) return;
  emit("spend-use");
  localActive.value = true;
  updateMember({ id: member.id, update: { rage_active: true } });
}

function endRage() {
  localActive.value = false;
  updateMember({ id: member.id, update: { rage_active: false } });
}

/** Called by parent on long rest to sync rage off without emitting spend. */
defineExpose({ deactivate: () => { localActive.value = false; } });
</script>
