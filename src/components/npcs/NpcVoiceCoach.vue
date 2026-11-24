<template>
  <div class="flex flex-col gap-4">
    <p class="text-body text-muted-foreground">
      Stuck for a reply? Describe what's happening and get a few in-character lines you can read straight off the screen. Only the lines you mark as said are remembered.
    </p>
    <AppButton
      v-if="isAiEnabled"
      variant="primary"
      size="md"
      block
      :icon="IconGenerate"
      label="Suggest lines"
      @click="suggest"
    />
    <AiOffNotice v-else />
  </div>
</template>

<script setup lang="ts">
/**
 * The Voice tab: what it is for and the button that opens the lines' card in the Familiar (#1270). The situation, the
 * price, the lines and "Said it" all live in the card (`npcVoiceAskAdapter`), which files what was said to the Memory
 * tab; the tab keeps no copy of any of it.
 */
import { computed } from "vue";
import { IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useOpenGenerator } from "@/composables/ask/useOpenGenerator";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import AppButton from "@/components/common/controls/AppButton.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import type { Npc } from "@/types/npc.types";

const { npc } = defineProps<{ npc: Npc }>();

const campaign = useCampaignStore();
const isAiEnabled = computed(() => campaign.isAiEnabled);
const { open } = useOpenGenerator();

function suggest() {
  open("npc_voice", { target: { type: "npc", id: npc.id, name: getNpcDisplayName(npc) ?? npc.name } });
}
</script>
