<template>
  <!-- The AI table is released to chosen accounts only (#1021): this gives it to, or takes it from, one account.
       Granted reads as a filled chip, like Freeze beside it. A child account cannot use AI at all, so none is offered. -->
  <AppButton
    v-if="!isChild"
    size="xs"
    :variant="has ? 'tinted' : 'subtle'"
    :tone="has ? 'success' : undefined"
    :emphasis="has ? 'outline' : undefined"
    :label="has ? 'AI table: on' : 'AI table: off'"
    :tooltip="has ? 'This account can use the AI table in the campaigns it owns. Click to take it away.' : 'Let this account use the AI table in the campaigns it owns.'"
    :disabled="saving || !loaded"
    data-testid="admin-table-grant"
    @click="toggle"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useTableGrants } from "@/composables/admin/useFeatureGrants";
import { useToast } from "@/composables/useToast";

const { userId, isChild = false } = defineProps<{ userId: string; isChild?: boolean }>();

const { granted, setGrant, saving, loaded } = useTableGrants();
const toast = useToast();
const has = computed(() => granted.value.has(userId));

async function toggle(): Promise<void> {
  try {
    await setGrant({ userId, on: !has.value });
  } catch (error) {
    toast.error(toast.fromError(error, "That could not be saved."));
  }
}
</script>
