<template>
  <HearthSection
    v-if="away && headline && (!activeOnly || away.active)"
    :title="away.active ? 'While you\'re away' : 'While you were away'"
  >
    <div class="flex flex-col gap-2">
      <!-- While it runs, the notice above the Hearth already says who has the character. -->
      <p v-if="!away.active" class="text-body font-semibold">{{ headline }}</p>
      <ListSkeleton v-if="isPending && !isError" variant="text" :count="2" />
      <p v-else-if="isError" class="text-body italic text-muted-foreground" role="alert">
        What was done for {{ member.name }} did not load.
      </p>
      <p v-else-if="!summary || summary.lines === 0" class="text-body italic text-muted-foreground">
        Nothing was rolled for {{ member.name }}.
      </p>
      <template v-else>
        <p v-if="sentences" class="text-body">{{ sentences }}</p>
        <ul v-if="summary.notable.length" class="flex flex-col gap-1">
          <li v-for="line in summary.notable" :key="line.id" class="text-caption italic text-muted-foreground">
            {{ line.text }}
          </li>
        </ul>
      </template>
    </div>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import HearthSection from "@/components/player/hearth/HearthSection.vue";
import { useWhileAway } from "@/composables/player/useWhileAway";
import { summarySentences } from "@/lib/hearth/whileAway";
import { useCampaignStore } from "@/stores/campaign";
import type { PartyMember } from "@/types/party.types";

/**
 * What happened to the owner's character while someone else played it (#1059):
 * who had it and when, the tally, and the few lines worth reading. Shown to the
 * character's owner only, while the hand-over is in force and for a week after.
 * `activeOnly` is the at-the-table stack: only while it is in force.
 * "Take back" is on the notice at the top of the Hearth and the sheet, which
 * also says who has the character while it runs; HP and slots are on the
 * character card.
 */
const { member, activeOnly = false } = defineProps<{ member: PartyMember; activeOnly?: boolean }>();
const campaign = useCampaignStore();
const { away, headline, summary, isError, isPending } = useWhileAway(
  () => campaign.activeCampaignId,
  () => member,
);
const sentences = computed(() => (summary.value ? summarySentences(summary.value, member.name) : null));
</script>
