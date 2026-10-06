<template>
  <div class="flex items-center gap-3 rounded-lg border border-primary/50 bg-primary/10 px-4 py-3">
    <span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none" aria-hidden="true" />
    <RouterLink :to="`/sessions/${session.id}`" class="min-w-0 flex-1">
      <p class="truncate font-cinzel text-label-lg font-bold uppercase tracking-widest text-primary">
        {{ sessionLabel(session) }}
      </p>
      <p class="text-caption text-muted-foreground">Running for {{ elapsed }}</p>
    </RouterLink>
    <AppButton variant="outline" size="sm" label="End" :disabled="pending" @click="emit('end')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useIntervalFn, useNow } from "@vueuse/core";
import AppButton from "@/components/common/AppButton.vue";
import { formatSessionElapsed } from "@/composables/campaign/useCampaignSession";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import type { CampaignSession } from "@/types/session.types";

/** The session in progress, as a card of its own on a phone, where its row in the
 *  log has no room for an End button beside its status. */
const { session, pending = false } = defineProps<{ session: CampaignSession; pending?: boolean }>();
const emit = defineEmits<{ end: [] }>();

// To the minute is all an elapsed clock needs.
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 60_000) });
const elapsed = computed(() => formatSessionElapsed(session.started_at, now.value.getTime()));
</script>
