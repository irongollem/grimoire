<script setup lang="ts">
import { ref } from "vue";
import { useGrantDowntime } from "@/composables/useDowntime";

const { partyMemberId, partyMemberName } = defineProps<{
  partyMemberId: string;
  partyMemberName: string;
}>();

const open = ref(false);
const amount = ref(1);
const reason = ref("");
const errorMessage = ref<string | null>(null);

const grant = useGrantDowntime();

function reset() {
  open.value = false;
  amount.value = 1;
  reason.value = "";
  errorMessage.value = null;
}

async function submit() {
  errorMessage.value = null;
  if (amount.value < 1) {
    errorMessage.value = "Grant at least one draw.";
    return;
  }
  try {
    await grant.mutateAsync({
      party_member_id: partyMemberId,
      amount: amount.value,
      // An empty reason is genuinely absent, not an empty string.
      reason: reason.value.trim() === "" ? null : reason.value.trim(),
    });
    reset();
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Could not grant downtime.";
  }
}
</script>

<template>
  <div class="relative inline-block">
    <button
      type="button"
      class="inline-flex items-center rounded border border-border bg-card px-2 py-0.5 font-cinzel text-2xs hover:bg-muted"
      @click="open = !open"
    >
      Grant downtime
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-border bg-card p-3 shadow-lg"
    >
      <p class="text-2xs text-muted-foreground">
        Give <span class="font-medium text-foreground">{{ partyMemberName }}</span> a quiet
        interlude. Each draw is one turn of the deck.
      </p>

      <label class="mt-3 block text-2xs font-medium">
        Draws
        <input
          v-model.number="amount"
          type="number"
          min="1"
          max="10"
          class="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </label>

      <label class="mt-2 block text-2xs font-medium">
        Reason <span class="font-normal text-muted-foreground">(optional)</span>
        <input
          v-model="reason"
          type="text"
          placeholder="The party winters in Neverwinter"
          class="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </label>

      <p v-if="errorMessage" class="mt-2 text-2xs text-destructive">{{ errorMessage }}</p>

      <div class="mt-3 flex justify-end gap-2">
        <button type="button" class="px-2 py-1 text-2xs text-muted-foreground" @click="reset">
          Cancel
        </button>
        <button
          type="button"
          :disabled="grant.isPending.value"
          class="rounded bg-primary px-2 py-1 text-2xs text-primary-foreground disabled:opacity-50"
          @click="submit"
        >
          {{ grant.isPending.value ? "Granting…" : "Grant" }}
        </button>
      </div>
    </div>
  </div>
</template>
