<template>
  <div class="flex flex-wrap items-baseline gap-x-2">
    <p v-if="session.number !== null" class="log-rubric">Session {{ session.number }}</p>
    <p v-else class="text-label-lg italic text-muted-foreground">No number</p>
    <p class="text-caption text-muted-foreground">{{ sessionShortDate(session) }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The head of a session in the log, shared by `SessionLogRow` and
 * `SessionLogCard`: the "Session 12" rubric (or "No number") over its short
 * date. The parent adds layout through `class` (the row goes block at md).
 */
import { sessionShortDate } from "@/lib/sessions/sessionLog";
import type { CampaignSession } from "@/types/session.types";

defineProps<{ session: CampaignSession }>();
</script>

<style scoped>
/* Cinzel by name, as the Hearth rubric does: Vellum repaints font-cinzel as
   Alegreya, and a rubric is display type. */
.log-rubric {
  margin: 0;
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--live-ink, var(--primary));
}
</style>
