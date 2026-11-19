<template>
  <!-- Where the campaign's story begins (#1021): one quest is the prologue. Set here, on the quest, because that is
       where its author is standing; kept on the campaign, because a campaign has one beginning. -->
  <div v-if="isOwner" class="flex flex-col gap-1 rounded-lg border border-border bg-card p-3" data-testid="quest-opens-campaign">
    <AppCheckbox
      :model-value="opensHere"
      :disabled="saving"
      size="sm"
      label-role="caption"
      label="The campaign begins with this quest"
      @update:model-value="set"
    />
    <p class="text-caption text-muted-foreground">
      <template v-if="opensHere">The AI table's first sitting starts at this quest's opening beat, at the place that beat is staged.</template>
      <template v-else-if="otherTitle">The campaign begins with {{ otherTitle }}. Ticking this moves the beginning here.</template>
      <template v-else>No quest opens the campaign yet, so the AI table's first sitting starts where the player chooses.</template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useQuests } from "@/composables/quests/useQuests";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";

const { questId } = defineProps<{ questId: string }>();

const campaign = useCampaignStore();
const auth = useAuthStore();
const toast = useToast();
const { data: quests } = useQuests();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

// Only the campaign's owner chooses where it begins; the database refuses anyone else, so nobody else is offered it.
const isOwner = computed(() => !!auth.user && campaign.activeCampaign?.user_id === auth.user.id);
const openingId = computed(() => campaign.activeCampaign?.opening_quest_id ?? null);
const opensHere = computed(() => openingId.value === questId);
// A quest that was deleted leaves its id behind: it names nothing, so it reads as no opening at all.
const otherTitle = computed(() => (opensHere.value ? null : (quests.value?.find((q) => q.id === openingId.value)?.title ?? null)));

const saving = ref(false);
async function set(on: boolean): Promise<void> {
  const id = campaign.activeCampaignId;
  if (id === null || saving.value) return;
  saving.value = true;
  try {
    const updated = await updateCampaign({ id, update: { opening_quest_id: on ? questId : null } });
    // The page reads the campaign from the store, so the tick shows what was saved, not what was clicked.
    if (campaign.activeCampaign && campaign.activeCampaign.id === updated.id) {
      campaign.activeCampaign = { ...campaign.activeCampaign, opening_quest_id: updated.opening_quest_id };
    }
  } catch (e) {
    toast.error(toast.fromError(e, "Where the campaign begins could not be saved."));
  } finally {
    saving.value = false;
  }
}
</script>
