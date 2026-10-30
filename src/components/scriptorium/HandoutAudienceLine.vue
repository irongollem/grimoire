<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-body" data-testid="audience-line">
    <span>
      <template v-if="holderNames.length">
        <span class="font-semibold text-foreground">With {{ describeHolders(holderNames, party.length) }}</span>
      </template>
      <span v-else class="text-muted-foreground">Not given yet</span>
    </span>
    <template v-if="hiddenText">
      <span class="ml-auto text-destructive">{{ hiddenText }}</span>
      <AppButton variant="link" size="sm" label="Reveal" @click="open = true" />
    </template>
  </div>
  <HandoutShareDialog :open="open" :handout="handout" @close="open = false" />
</template>

<script setup lang="ts">
/**
 * "With Pip and Wren" under the handout editor's header (#1115, frame 10): who
 * holds the handout, and, when a linked entry would still be hidden from them,
 * which one, with a Reveal link that opens the Give dialog on the same holders.
 * Never reveals on its own. It replaces the old pending-reveal banner.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import HandoutShareDialog from "@/components/scriptorium/HandoutShareDialog.vue";
import { useParty } from "@/composables/party/useParty";
import { usePendingHandoutReveals, type ShareableHandout } from "@/composables/scriptorium/useHandoutShare";
import { describeHiddenFromHolders, describeHolders } from "@/lib/scriptorium/handoutShareSummary";

const { handout } = defineProps<{ handout: ShareableHandout }>();

const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const holderNames = computed(() =>
  party.value.filter((m) => handout.player_visible_to.includes(m.id)).map((m) => m.name),
);

const { hiddenNames } = usePendingHandoutReveals(computed(() => handout));
const hiddenText = computed(() => describeHiddenFromHolders(hiddenNames.value));
const open = ref(false);
</script>
