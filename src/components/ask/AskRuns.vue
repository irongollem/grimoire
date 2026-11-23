<template>
  <template v-for="(run, i) in runs" :key="i"
    ><strong v-if="run.bold">{{ run.text }}</strong
    ><em v-else-if="run.italic">{{ run.text }}</em
    ><template v-else>{{ run.text }}</template></template
  >
</template>

<script setup lang="ts">
/** One line of an Ask reply: its text runs, with bold and italic as elements and everything else as plain text. */
import type { AskLine } from "@/lib/ask/askMarkdown";

defineProps<{ runs: AskLine }>();
</script>
