<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { useGrantDowntime } from "@/composables/downtime/useDowntime";

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
    <AppButton
      variant="outline"
      surface="card"
      fill="muted"
      size="xs"
      label="Grant downtime"
      @click="open = !open"
    />

    <div
      v-if="open"
      class="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-border bg-card p-3 shadow-lg"
    >
      <p class="text-caption-sm text-muted-foreground">
        Give <span class="font-medium text-foreground">{{ partyMemberName }}</span> a quiet
        interlude. Each draw is one turn of the deck.
      </p>

      <label class="mt-3 block text-eyebrow font-medium">
        Draws
        <AppInput v-model.number="amount" type="number" min="1" max="10" size="body" class="mt-1" />
      </label>

      <label class="mt-2 block text-eyebrow font-medium">
        Reason <span class="font-normal text-muted-foreground">(optional)</span>
        <AppInput
          v-model="reason"
          placeholder="The party winters in Neverwinter"
          size="body"
          class="mt-1"
        />
      </label>

      <p v-if="errorMessage" class="mt-2 text-caption-sm text-destructive">{{ errorMessage }}</p>

      <div class="mt-3 flex justify-end gap-2">
        <AppButton variant="ghost" size="caption" label="Cancel" @click="reset" />
        <AppButton
          variant="primary"
          size="caption"
          :disabled="grant.isPending.value"
          :label="grant.isPending.value ? 'Granting…' : 'Grant'"
          @click="submit"
        />
      </div>
    </div>
  </div>
</template>
