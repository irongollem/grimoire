<template>
  <AppButton
    as="span"
    variant="tinted"
    :tone="TONES[recap]"
    emphasis="soft"
    size="xs"
    :label="LABELS[recap]"
    class="pointer-events-none shrink-0"
  />
</template>

<script setup lang="ts">
import type { SessionRecap } from "@/lib/sessions/sessionLog";
import AppButton from "@/components/common/AppButton.vue";

/** The status a log row wears: the running one in oxblood, a written recap in
 *  success, a gap in caution. A label, not a control, so it takes no pointer. */
defineProps<{ recap: SessionRecap }>();

const TONES = { running: "danger", recap: "success", none: "caution" } as const;
const LABELS = { running: "Running", recap: "Recap written", none: "No notes yet" } as const;
</script>
