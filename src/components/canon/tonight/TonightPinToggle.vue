<template>
  <AppButton
    variant="ghost"
    size="xs"
    :icon="IconPin"
    :active="pinned"
    :aria-pressed="pinned"
    :label="pinned ? 'Pinned' : 'Pin for next session'"
    data-testid="tonight-pin"
    @click="emit('toggle')"
  />
</template>

<script setup lang="ts">
/** The small toggle on a Tonight row that puts it in (or takes it out of) the Planned block. */
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconPin } from "@/lib/icons";

defineProps<{ pinned: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>
