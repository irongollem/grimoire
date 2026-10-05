<template>
  <div v-if="status === 'dead'" class="flex flex-wrap items-center gap-3 p-2 rounded bg-destructive/10 border border-destructive/40" role="status">
    <span class="text-label font-bold text-destructive">Dead</span>
    <span class="text-caption text-muted-foreground">Three failed death saves.</span>
    <AppButton variant="tinted" tone="danger" emphasis="soft" size="sm" label="Revive" class="ml-auto" @click="revive" />
  </div>
  <div v-else-if="status === 'stable'" class="flex flex-wrap items-center gap-3 p-2 rounded bg-muted/30 border border-border" role="status">
    <span class="text-label font-bold text-foreground">Stable</span>
    <span class="text-caption text-muted-foreground">At 0 HP and unconscious. Healing wakes them.</span>
  </div>
  <div v-else class="flex items-center gap-3 p-2 rounded bg-destructive/10 border border-destructive/20">
    <span class="text-label font-bold text-destructive">Death saves</span>
    <div class="flex items-center gap-1">
      <span class="text-label text-ink-success">✓</span>
      <div class="flex gap-1">
        <button
          v-for="i in 3"
          :key="`s${i}`"
          type="button"
          class="w-4 h-4 rounded-full border transition-colors"
          :class="i <= member.death_save_successes ? 'bg-tone-success border-tone-success' : 'border-muted-foreground/40'"
          @click="toggleDeathSave('success')"
        />
      </div>
    </div>
    <div class="flex items-center gap-1">
      <span class="text-label text-destructive">✗</span>
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
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { dyingStatus, reviveOutcome } from "@/rules/dying";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { confirm } = useConfirm();
const toast = useToast();

const status = computed(() =>
  dyingStatus(member.current_hp, { successes: member.death_save_successes, failures: member.death_save_failures }),
);

async function revive() {
  if (!(await confirm(`Bring ${member.name} back at 1 HP with their death saves cleared?`, {
    title: "Revive character?",
    confirmLabel: "Revive",
  }))) return;
  const r = reviveOutcome(member.conditions ?? []);
  try {
    await updateMember({
      id: member.id,
      update: {
        current_hp: r.current_hp,
        death_save_successes: r.saves.successes,
        death_save_failures: r.saves.failures,
        conditions: r.conditions,
      },
    });
    toast.success(`${member.name} is back at 1 HP.`);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't revive the character."));
  }
}

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
