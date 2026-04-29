<template>
  <div class="flex items-center gap-3 p-2 rounded bg-destructive/10 border border-destructive/20">
    <span class="font-cinzel text-[10px] font-bold text-destructive tracking-wider">DEATH SAVES</span>
    <div class="flex items-center gap-1">
      <span class="font-cinzel text-[10px] text-green-500">✓</span>
      <div class="flex gap-1">
        <button
          v-for="i in 3"
          :key="`s${i}`"
          type="button"
          class="w-4 h-4 rounded-full border transition-colors"
          :class="i <= member.death_save_successes ? 'bg-green-500 border-green-500' : 'border-muted-foreground/40'"
          @click="toggleDeathSave('success')"
        />
      </div>
    </div>
    <div class="flex items-center gap-1">
      <span class="font-cinzel text-[10px] text-destructive">✗</span>
      <div class="flex gap-1">
        <button
          v-for="i in 3"
          :key="`f${i}`"
          type="button"
          class="w-4 h-4 rounded-full border transition-colors"
          :class="i <= member.death_save_failures ? 'bg-destructive border-destructive' : 'border-muted-foreground/40'"
          @click="toggleDeathSave('failure')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUpdatePartyMember } from "@/composables/useParty";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();
const { mutateAsync: updateMember } = useUpdatePartyMember();

async function toggleDeathSave(type: "success" | "failure") {
  if (type === "success") {
    const n = member.death_save_successes >= 3 ? 0 : member.death_save_successes + 1;
    await updateMember({ id: member.id, update: { death_save_successes: n } });
  } else {
    const n = member.death_save_failures >= 3 ? 0 : member.death_save_failures + 1;
    await updateMember({ id: member.id, update: { death_save_failures: n } });
  }
}
</script>
