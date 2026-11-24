<template>
  <div v-if="isAiEnabled" class="flex flex-col gap-2" :data-testid="`canon-suggest-fold-${part}`">
    <div class="flex justify-end">
      <AppButton
        variant="ghost"
        size="sm"
        :icon="IconGenerate"
        icon-size="xs"
        :label="open ? 'Hide suggestions' : 'Suggest…'"
        :aria-expanded="open"
        :aria-controls="panelId"
        @click="toggle"
      />
    </div>
    <!-- Hidden, not removed: a suggestion being drafted or waiting to be accepted survives the fold being shut. -->
    <div v-show="open" :id="panelId">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One quiet "Suggest…" button in place of a part's helper (#1258 item 19): the helper reads as a second list's worth of
 * chrome on every part, and most visits to a part are not to draft something. Closed until opened, and whether it is open
 * is remembered for the part in the page's store. Hidden with the helper when AI is off for the campaign.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useCanonUiStore } from "@/stores/ui/canon";

const { part } = defineProps<{
  /** The part's helper (`truths`, `premise`, `lore`, ...): the key its open state is kept under. */
  part: string;
}>();

const campaign = useCampaignStore();
const store = useCanonUiStore();
const isAiEnabled = computed(() => campaign.isAiEnabled);
const open = computed(() => store.suggestOpen[part] === true);
const panelId = `canon-suggest-panel-${part}`;

function toggle() {
  store.suggestOpen[part] = !open.value;
}
</script>
