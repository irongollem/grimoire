<template>
  <div v-if="open.length > 0" class="flex flex-col gap-2" data-testid="player-wonders">
    <div>
      <h4 class="text-eyebrow text-muted-foreground">The players wonder</h4>
      <p class="text-caption text-muted-foreground">Take one up to keep it open on purpose, or let it be.</p>
    </div>
    <ul class="flex flex-col border border-border bg-card">
      <li v-for="wonder in open" :key="wonder.id" class="flex min-w-0 flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3" data-testid="wonder-row">
        <p class="min-w-0 flex-1 text-body text-foreground">
          {{ wonder.body }}
          <span v-if="askedBy(wonder)" class="text-label italic text-muted-foreground" data-testid="wonder-by"> · {{ askedBy(wonder) }}</span>
        </p>
        <span class="inline-flex items-center gap-2">
          <AppButton variant="outline" size="sm" label="Take it up" data-testid="wonder-take-up" @click="takeUp(wonder, sortOrder)" />
          <AppButton variant="ghost" size="sm" label="Let it be" data-testid="wonder-let-be" @click="letBe(wonder)" />
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * The players' own questions about the world (#1258 item 24), above the open questions: each is taken up as an open
 * question made of the player's words, or let be. Shown only while some are waiting.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { isOpenWonder, useCampaignWonders, useWonderActions } from "@/composables/canon/useCanonWonders";
import { useParty } from "@/composables/party/useParty";
import type { CanonWonder } from "@/types/canon.types";

const { sortOrder } = defineProps<{
  /** Where a question taken up goes in the list: after the ones already there. */
  sortOrder: number;
}>();

const { data: wonders } = useCampaignWonders();
const { data: party } = useParty();
const { takeUp, letBe } = useWonderActions();
const open = computed(() => (wonders.value ?? []).filter(isOpenWonder));
const askedBy = (w: CanonWonder) => (party.value ?? []).find((m) => m.id === w.party_member_id)?.name ?? null;
</script>
