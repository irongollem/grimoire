<template>
  <AppButton
    v-if="canAsk"
    variant="ghost"
    size="sm"
    :icon="IconGenerate"
    icon-size="xs"
    :label="label"
    data-testid="canon-suggest"
    @click="ask.openPanel(request, { send: false })"
  />
</template>

<script setup lang="ts">
/**
 * The Canon's one AI affordance: a button that opens the Familiar (Ask Grimoire) with a written request, where the
 * DM reads the answer and keeps what they like. The Canon has no AI panel of its own. Absent when this user may not ask
 * (a player's lens, AI switched off, a child account), so no page shows a button that leads nowhere.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCanAsk } from "@/composables/ask/useCanAsk";
import { IconGenerate } from "@/lib/icons";
import { useAskUiStore } from "@/stores/ui/ask";

const { request, label = "Suggest" } = defineProps<{ request: string; label?: string }>();
const canAsk = useCanAsk();
const ask = useAskUiStore();
</script>
