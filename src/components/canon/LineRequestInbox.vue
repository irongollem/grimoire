<template>
  <div v-if="open.length > 0" class="flex flex-col gap-2" data-testid="line-requests">
    <div>
      <h4 class="text-eyebrow text-muted-foreground">Asked for by the players ({{ open.length }})</h4>
      <p class="text-caption text-muted-foreground">Add one to your lines and veils, or let it be. A request names a character only when the player signed it.</p>
    </div>
    <ul class="flex flex-col border border-border bg-card">
      <li v-for="request in open" :key="request.id" class="flex min-w-0 flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3" data-testid="line-request-row">
        <p class="min-w-0 flex-1 text-body text-foreground">
          <span class="text-label font-semibold text-muted-foreground" data-testid="line-request-kind">{{ request.kind === "line" ? "Line" : "Veil" }}</span>
          {{ request.body }}
          <span v-if="askedBy(request)" class="text-label italic text-muted-foreground" data-testid="line-request-by"> · {{ askedBy(request) }}</span>
        </p>
        <span class="inline-flex items-center gap-2">
          <AppButton variant="outline" size="sm" :label="`Add as a ${request.kind}`" :loading="adopting.has(request.id)" data-testid="line-request-add" @click="adopt(request, sortOrder)" />
          <AppButton variant="ghost" size="sm" label="Let it be" data-testid="line-request-let-be" @click="letBe(request)" />
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * The lines and veils the players asked for in private (#1279 item 29), above the premise's lines and veils: each is added
 * as a line or veil made of the player's words, or let be. Shown only while some are waiting. Mirrors the wonders inbox.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { isOpenLineRequest, useCampaignLineRequests, useLineRequestActions } from "@/composables/canon/useCanonLineRequests";
import { useParty } from "@/composables/party/useParty";
import type { CanonLineRequest } from "@/types/canon.types";

const { sortOrder } = defineProps<{
  /** Where a line or veil added goes in the list: after the ones already there. */
  sortOrder: number;
}>();

const { data: requests } = useCampaignLineRequests();
const { data: party } = useParty();
const { adopt, adopting, letBe } = useLineRequestActions();
const open = computed(() => (requests.value ?? []).filter(isOpenLineRequest));
/** The character, only when the player signed it. */
const askedBy = (r: CanonLineRequest) => (r.asked_by === null ? null : ((party.value ?? []).find((m) => m.id === r.asked_by)?.name ?? null));
</script>
