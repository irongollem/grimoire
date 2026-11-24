<template>
  <CanonBlock title="The world">
    <AppInput
      id="canon-world-name"
      aria-label="The world"
      v-model.lazy="world"
      list="canon-world-names"
      tone="filled"
      size="body"
      placeholder="Forgotten Realms, Eberron, Homebrew…"
    />
    <datalist id="canon-world-names">
      <option v-for="name in WORLD_NAMES" :key="name" :value="name" />
    </datalist>
  </CanonBlock>
</template>

<script setup lang="ts">
/**
 * Which world this is: the premise's first line. It lives on the campaign row (the calendar and the defaults key
 * off it) and is edited here now, not in the Details tab.
 */
import { ref, watch } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import { WORLD_NAMES } from "@/lib/canon/canonParts";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import type { Campaign } from "@/types/campaign.types";

const { campaign } = defineProps<{ campaign: Campaign }>();

const campaignStore = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const world = ref(campaign.setting ?? "");
watch(() => campaign.setting, (next) => { world.value = next ?? ""; });
// `.lazy` commits on blur or Enter, so this runs once per finished edit.
watch(world, async (next) => {
  const setting = next.trim() === "" ? null : next.trim();
  if (setting === campaign.setting) return;
  try {
    campaignStore.switchToCampaign(await updateCampaign({ id: campaign.id, update: { setting } }));
  } catch (e) {
    world.value = campaign.setting ?? "";
    toast.error(toast.fromError(e));
  }
});
</script>
