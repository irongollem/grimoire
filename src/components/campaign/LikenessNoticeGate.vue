<template>
  <AiNoticeDialog v-if="mounted" v-model="open" kind="likeness" @confirm="confirm" @cancel="cancel" />
</template>

<script setup lang="ts">
/**
 * Renders the singleton likeness dialog opened by `useLikenessGate`'s
 * `ensureLikenessAck` — mirrors `AiUseNoticeGate`'s structure exactly.
 * Mounted once in each of the DM shell (DefaultLayout) and the player shell
 * (PlayerLayout) so whichever role triggers a portrait-bearing generation
 * first gets the dialog. See
 * context/compliance/provenance-architecture.md §3.
 *
 * Confirming records the acknowledgement (handled inside AiNoticeDialog) and
 * resolves the caller's `ensureLikenessAck()` promise true; cancelling
 * resolves it false. Both are wired straight through to the shared gate
 * state — no local dismissal tracking, unlike AiUseNoticeGate: a declined
 * likeness ack must keep prompting on the next portrait-bearing attempt, not
 * just for the rest of the session.
 */
import AiNoticeDialog from "@/components/campaign/AiNoticeDialog.vue";
import { useLazyMount } from "@/composables/useLazyMount";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";

const { open, confirm, cancel } = useLikenessGate();
const mounted = useLazyMount(open);
</script>
