<template>
  <AppButton
    v-if="enabled"
    variant="link"
    size="inline-xs"
    label="Use all awareness"
    :disabled="spend.isPending.value"
    @click="spendAll"
  />
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useAwarenessRolls, useUseAwarenessRolls } from "@/composables/party/useAwarenessRolls";

/** DM only, and only with the awareness rule on: uses every active character's waiting roll at once. */
const { enabled } = useAwarenessRolls();
const { data: party } = useActiveParty();
const spend = useUseAwarenessRolls();

function spendAll() {
  const ids = party.value?.map((m) => m.id);
  if (ids?.length) spend.mutate(ids);
}
</script>
